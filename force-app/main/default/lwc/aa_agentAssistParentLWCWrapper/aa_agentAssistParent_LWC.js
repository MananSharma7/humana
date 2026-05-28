import { LightningElement, wire, track, api } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import hasAgentAssistPermission from '@salesforce/customPermission/MarketPoint_Agent_Assist_Custom';
import { publish, subscribe, unsubscribe, APPLICATION_SCOPE, MessageContext } from 'lightning/messageService';
import UTILITY_POPOUT_CHANNEL from '@salesforce/messageChannel/UtilityPopoutMessageChannel__c';
import { EnclosingUtilityId, getAllUtilityInfo, updateUtility } from 'lightning/platformUtilityBarApi';
import VOICE_CALL_CHANNEL from '@salesforce/messageChannel/LWCToUiConnectorMessengerMs__c';
import { AgentAssistLabels, AgentAssistEvents, AgentAssistSplunkLoggingUtils } from 'c/aa_UtilsHum';
import AgentAssistWebsocket from 'c/aa_UtilsHum';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';
import USER_RECORD_ID from '@salesforce/user/Id';
import USER_ID from '@salesforce/schema/User.Id';
import USER_EMAIL from '@salesforce/schema/User.Email';
import USER_NETWORK_ID from '@salesforce/schema/User.Humana_ID__c';
import getSSOAccessToken from '@salesforce/apex/AA_AzureOAuthGraphCallout.getSSOAccessToken';
import getAzureCallout from '@salesforce/apex/AA_AzureOAuthGraphCallout.getAzureCallout';
import revokeAccess from '@salesforce/apex/AA_AzureOAuthGraphCallout.revokeAccess';
import hasSSOTokenPermission from '@salesforce/customPermission/MarketPoint_Agent_Assist_SSO';

export default class Aa_agentAssistParentLWCWrapper extends NavigationMixin(LightningElement) {
	// hasRendered=sessionStorage.getItem('windowOpened');

	hasRendered = false;
	receivedMessage;
	agentAssistLMSSubscription = null;
	childWindow;
	pollInterval;

	@wire(MessageContext)
	messageContext;
	isWindowOpen = false;

	@wire(EnclosingUtilityId)
	utilityId;

	utilityCount;
	channel;

	errorMessage = null;
	socketIo;
	websocket = new AgentAssistWebsocket();
	accessToken = null;
	popupRef;
	status = '';
	error = '';

	userSalesforceId = null;
	userEmail = null;
	userNetworkId = null;

	memberID;
	sdrPersonId;
	custId;
	memberType;
	genesysInteractionId;
	callOutcome;
	callReason;
	disconnectReason;
	relatedRecordId;
	voiceCallId;
	interactingAboutMemberId = null;
	aaSessionId;

	genesysData;
	_recordId;
	//sso variables
	objSSOCallout = null;
	@track ssoMessage = '';
	@track showSSOMessage = false;
	isRecoverableError = true;
	authretrycount = 0;
	autherrornotificationmessage = '';
	currentmemeberenterpriseid = null;
	currentmembertype = null;
	isRefresh = false;
	correlationId = '';
	authWindow = null;
	tokenretrycount = 0;
	stoppolling = false;
	isTokenRefreshRequired = false;

	showError(message) {
		this.errorMessage = message;
	}

	@wire(getRecord, { recordId: USER_RECORD_ID, fields: [USER_ID, USER_EMAIL, USER_NETWORK_ID] })
	wiredUser({ error, data }) {
		if (data) {
			try {
				this.userSalesforceId = getFieldValue(data, USER_ID);
				this.userEmail = getFieldValue(data, USER_EMAIL);
				this.userNetworkId = getFieldValue(data, USER_NETWORK_ID);
				this.websocket.setAgentSalesforceId(this.userSalesforceId);
				console.log(
					'User Salesforce Id: ' +
						this.userSalesforceId +
						' | User Email: ' +
						this.userEmail +
						' | User Network Id: ' +
						this.userNetworkId
				);
			} catch (e) {
				console.log(
					'aa_agentAssistParent_LWCWrapper|wiredUser|An error occured when handling the retrieved user record data'
				);
				this.showError('Agent Assist has been disabled while we investigate an error: ' + e.message);
			}
		} else if (error) {
			console.log(
				'aa_agentAssistParent_LWCWrapper|An error occured when retrieving the user record data: ' +
					JSON.stringify(error)
			);
			this.showError('Agent Assist has been disabled while we investigate an error: ' + error.message);
		}
	}

	async revokeAccessAndFecthNewToken() {
		let lst = [];
		this.tokenretrycount = 0;
		lst.push(this.userSalesforceId);
		await revokeAccess({ lstUserIds: lst });
		this.fetchUserToken();
	}

	resetAAParams() {
		this.ssoMessage = '';
		this.showSSOMessage = false;
		this.tokenretrycount = 0;
		this.showAgentAssist = true;
		this.errorMessage = '';
		this.stoppolling = true;
	}

	startLoginFlow() {
		if (this.authWindow && !this.authWindow.closed) {
			return;
		}
		this.tokenretrycount++;
		//Display an info message on UI.
		this.ssoMessage = AgentAssist_Labels.SSO_Verification;
		this.showSSOMessage = true;
		this.stoppolling = false;
		//Fetch user sso based token
		let starturl = this.objSSOCallout?.contenttype ? encodeURIComponent(this.objSSOCallout.contenttype) : '';
		if (this.objSSOCallout?.url && starturl) {
			this.authWindow = window.open(
				`${this.objSSOCallout.url}?prompt=none&startURL=${starturl}`,
				'_blank',
				AgentAssist_Labels.POPUP_OPTIONS
			);
			this.pollpopup();
		}
	}

	async fetchUserToken() {
		let _this = this;
		let stoken;
		try {
			console.log('aa_agentAssistParent_LWC|fetchUserToken before getSSOAccessToken');
			stoken = await getSSOAccessToken({ isRefresh: this.isTokenRefreshRequired });
			if (stoken && stoken.length > 0) {
				console.log('aa_agentAssistParent_LWC|fetchUserToken after getSSOAccessToken length:', stoken.length);
				_this.resetAAParams();
				//_this.accessToken = stoken;
				_this.initializeWebsocketAfterTokenRetrieval(stoken);
			} else {
				LWCLogger({
					messageText:
						'getSSOAccessToken(...) returned null because the current user hasn’t authorized with this Auth Provider yet.',
					source: 'aa_agentAssistParent_LWC: fetchUserToken',
					level: 'info'
				});
				if (this.tokenretrycount < 3) {
					this.startLoginFlow();
				} else {
					this.resetAAParams();
					let serr = `Token retrieval failed for user : "${this.userSalesforceId}" at "${new Date()}"`;
					let errobj = new AuthErrorClass().generaterrorobject(
						false,
						false,
						AgentAssist_Labels.AA_ERROR,
						'fetchUserToken',
						serr,
						0,
						0
					);
					this.displayAuthError(errobj);
				}
			}
		} catch (error) {
			console.log('aa_agentAssistParent_LWC | error in getAccessToken----', JSON.parse(JSON.stringify(error)));
			let sMessage = `Error occurred in fetchUserToken for Genesys Interaction id : ${this.genesysInteractionId} and  error message is : ${error.message}`;
			LWCLogger({ messageText: sMessage, source: 'aa_agentAssistParent_LWC: fetchUserToken', level: 'info' });
		}
	}

	displayAuthError() {
		let objError = arguments[0];
		this.ssoMessage = objError.ssomessage;
		this.showSSOMessage = objError.showssomessage;
		this.showAgentAssist = objError.showAgentAssist;
		this.isRecoverableError = objError.isRecoverableError;
		this.errorMessage = objError.sUImessage;
		this.tokenretrycount = objError.tokenretrycount;
		this.authretrycount = objError.tokenauthretrycount;
		if (!this.isRecoverableError) this.unsubscribeToMessageChannel();

		//Log error in CRM Error Log Object
		logError({
			sMessage: objError.errorMessage,
			sClass: objError.class,
			sMethod: objError.smethod,
			sExceptionType: 'Component Error',
			sErrorType: 'AgentAssistError'
		});
		LWCLogger({
			messageText:
				'AuthError occurred; Salesforce User Id: ' +
				this.userSalesforceId +
				'User Network Id: ' +
				this.userNetworkId +
				'; \n' +
				JSON.stringify(objError),
			source: 'aa_agentAssistParentLWC',
			level: 'error'
		});
	}

	async initializeWebsocketAfterTokenRetrieval() {
		try {
			this.isTokenRefreshRequired = false;
			if (this.isRefresh) {
				this.isRefresh = false;
				this.correlationId = `refresh_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
				this.websocket.emitEvent(
					AgentAssistLabels.REFRESH_TOKEN,
					AgentAssistEvents.refresh_token(this.correlationId, arguments[0])
				);
			} else {
				await this.websocket.setupWebSocketIoClient(arguments[0], this);
				if (this.genesysInteractionId != null && this.genesysInteractionId != '') {
					this.websocket.emitEvent(
						AgentAssistLabels.SET_INTERACTION_CONTEXT,
						AgentAssistEvents.set_interaction_context(
							this.genesysInteractionId,
							'',
							this.userNetworkId,
							'',
							this.userSalesforceId
						)
					);
					if (this.currentmemeberenterpriseid && currentmembertype) {
						this.websocket.emitEvent(
							AgentAssistLabels.SET_CUSTOMER_CONTEXT,
							AgentAssistEvents.set_customer_context(
								this.currentmembertype,
								this.currentmemeberenterpriseid,
								this.genesysInteractionId,
								true
							)
						);
					}
				}
			}
		} catch (error) {}
	}

	async connectedCallback() {
		//this.updateStatus('default');
		const isRedirected = sessionStorage.getItem('DISABLE_UTILITY_AUTOLOAD');

		// if( hasAgentAssistPermission && !this.isWindowOpen){
		if (hasAgentAssistPermission && !isRedirected) {
			//sessionStorage.setItem('windowOpened',true);

			const utilityInfo = await getAllUtilityInfo();
			this.utilityCount = utilityInfo.length;
			console.log('utilityInfo--->' + JSON.stringify(utilityInfo));
			console.log('utilityInfo.utilityVisible--->' + utilityInfo[9].utilityVisible);
			this.hasRendered = true;
			this.navigateToTargetInNewWindow();
			/*if (utilityInfo && !utilityInfo[9].utilityVisible) {
                this.isWindowOpen = true;
                this.openWindowAutomatically();
                 console.log('Inside connectedCallback inside if isWindowOpen-->'+this.isWindowOpen);
            } */
			console.log('Inside connectedCallback outside if  isWindowOpen-->' + this.isWindowOpen);
			console.log('Inside connectedCallback hasRendered-->' + this.hasRendered);
		} else {
			this.isWindowOpen = true;
			sessionStorage.removeItem('DISABLE_UTILITY_AUTOLOAD');
		}
		console.log('aa_agentAssistParent_LWCWrapper | connectedCallback');

		this.subscribeToAgentAssistMessageChannel();
		// this.websocket.setupWebSocketIoClient(this.accessToken);

		this.channel = new BroadcastChannel('salesforce_window_channel');
		this.channel.onmessage = (event) => {
			if (event.data.action === 'WINDOW_CLOSED') {
				this.handleTargetWindowClosed();
			}
		};
	}

	handleTargetWindowClosed() {
		this.hasRendered = false;
	}

	subscribeToAgentAssistMessageChannel() {
		if (!this.agentAssistLMSSubscription) {
			console.log('aa_agentAssistParent_LWCWrapper:subscribed to AgentAssistMessageChannel');
			this.agentAssistLMSSubscription = subscribe(
				this.messageContext,
				VOICE_CALL_CHANNEL,
				(event) => {
					console.log('aa_agentAssistParent_LWCWrapper | inside handleAgentAssistMessage event | ');
					this.handleAgentAssistMessage(event);
				},
				{ scope: APPLICATION_SCOPE }
			);
		}
	}

	async handleAgentAssistMessage(message) {
		console.log('aa_agentAssistParent_LWCWrapper | inside handleAgentAssistMessage | ');
		console.log(
			'aa_agentAssistParent_LWCWrapper | handleAgentAssistMessage | ',
			message?.type,
			' : ',
			message?.data
		);
		if (message?.type) {
			switch (message.type) {
				case AgentAssistLabels.SET_INTERACTION_CONTEXT:
					console.log('aa_agentAssistParent_LWCWrapper | handleAgentAssistMessage | set_interaction_context');
					this.sendInteractionContext(message.data);
					break;

				case AgentAssistLabels.ERROR:
					console.log(
						'aa_agentAssistParent_LWCWrapper | handleAgentAssistMessage | AGENT_ASSIST_ERROR disconnected'
					);
					//this.showError('Failed to connect, please log out and back in. ' + message.data);
					//this.updateStatus('disconnected');
					break;

				case AgentAssistLabels.CONNECTION_END:
					console.log('aa_agentAssistParent_LWCWrapper | handleAgentAssistMessage | disconnected');
					//this.updateStatus('disconnected');
					break;

				case AgentAssistLabels.CONNECT_NOTIFICATION:
					console.log('aa_agentAssistParent_LWCWrapper | handleAgentAssistMessage | connected');
					//this.updateStatus('connected');
					//this.handleConnectNotification(message.data, 'connect');
					break;
				default:
			}
		}
	}

	updateStatus(state) {
		let attributes;

		switch (state) {
			case 'connected':
				attributes = {
					label: 'Agent Assist',
					icon: 'success',
					iconVariant: 'success',
					highlighted: false
				};
				break;

			case 'disconnected':
				attributes = {
					label: 'Agent Assist',
					icon: 'ban',
					iconVariant: 'error',
					highlighted: false
				};
				break;

			case 'default':
				attributes = {
					label: 'Agent Assist',
					icon: 'workforce_engagement',
					iconVariant: '',
					highlighted: false
				};
				break;
		}

		if (this.utilityId) {
			updateUtility(this.utilityId, attributes);
		}
	}

	async sendInteractionContext(interactionDetails) {
		console.log(
			'lwc-agentAssistParentLWCWrapper | sendInteractionContext | data: ' + JSON.stringify(interactionDetails)
		);

		try {
			/*this.voiceCallId = interactionDetails.Voice_Call__c;
			this.recordId = interactionDetails.Voice_Call__c;
			this.genesysInteractionId = 'a' + interactionDetails.InteractionId__c;
			localStorage.setItem('agentAssistGenesysInteractionId', this.genesysInteractionId);
			if (hasSSOTokenPermission) {
				this.websocket.emitEvent(
					AgentAssistLabels.SET_INTERACTION_CONTEXT,
					AgentAssistEvents.set_interaction_context(
						this.genesysInteractionId,
						'',
						this.userNetworkId,
						'',
						this.userSalesforceId
					)
				);

				// Notify children to reset state for new interaction
				publish(this.messageContext, VOICE_CALL_CHANNEL, {
					type: AgentAssistLabels.UPDATE_INTERACTION,
					data: { genesysInteractionId: this.genesysInteractionId }
				});

				if(interactionDetails.Call_Disposition__c!== 'completed')
				{	
					//this.handleOpenAAUtility();
				}


			} else {
			this.websocket.emitEvent(
				AgentAssistLabels.SET_INTERACTION_CONTEXT,
				AgentAssistEvents.set_interaction_context(
					this.genesysInteractionId,
					this.accessToken,
					this.userNetworkId,
					this.userEmail,
					this.userSalesforceId
					)
				);

				// Notify children to reset state for new interaction
				publish(this.messageContext, VOICE_CALL_CHANNEL, {
					type: AgentAssistLabels.UPDATE_INTERACTION,
					data: { genesysInteractionId: this.genesysInteractionId }
				});

				if(interactionDetails.Call_Disposition__c!== 'completed')
				{	
					//this.handleOpenAAUtility();
				}

			}
            const isRedirected = sessionStorage.getItem('DISABLE_UTILITY_AUTOLOAD');

			if(hasAgentAssistPermission && !isRedirected){
				this.navigateToTargetInNewWindow();
			}else{
				sessionStorage.removeItem('DISABLE_UTILITY_AUTOLOAD');
			}*/
		} catch (e) {
			console.log('agentAssistUtilityPanel | sendInteractionContext | error: ' + e);
			this.showError('Agent Assist has been disabled while we investigate an error: ' + e.message);
		}
	}

	unsubscribeToAgentAssistMessageMessageChannel() {
		unsubscribe(this.agentAssistLMSSubscription);
		this.agentAssistLMSSubscription = null;
	}

	disconnectedCallback() {
		this.this.unsubscribeToAgentAssistMessageMessageChannel();
		if (this.channel) {
			this.channel.close();
		}
		this.isWindowOpen = false;
		sessionStorage.removeItem('DISABLE_UTILITY_AUTOLOAD');
	}

	openTarget() {
		this[NavigationMixin.Navigate]({
			type: 'standard_component',
			attributes: {
				componentName: 'c__aa_agentAssistParent_LWC_ARC'
			}
		});
	}

	renderedCallback() {
		//this.hasrendered= sessionStorage.getItem('windowOpened');
		/*if(!this.hasRendered && hasAgentAssistPermission){
        //if(hasAgentAssistPermission){
            //sessionStorage.setItem('windowOpened',true);
            //this.openWindowAutomatically();
            //this.navigateToTargetInNewWindow();
             //this.openWindowAutomatically();
             this.hasRendered = true;
             this.openWindowAutomatically();
             console.log('Inside renderedCallback hasRendered-->'+this.hasRendered);
           
        }*/
		//this.navigateToComponent();
		//this.navigateToWebPage();
		// this.openWindowAutomatically();
	}

	navigateToTargetInNewWindow() {
		console.log('lwc-agentAssistParentLWCWrapper | navigateToTargetInNewWindow');
		sessionStorage.setItem('DISABLE_UTILITY_AUTOLOAD', 'true');
		const windowFeatures = 'width=1024,height=768,resizable=yes,scrollbars=yes,status=no,popup=1';
		// 1. Define the PageReference for the target LWC
		const pageReference = {
			type: 'standard__component',
			attributes: {
				componentName: 'c__aa_agentAssistParent_LWC_ARC'
			}
		};

		// 2. Generate the URL and open it in a new window/tab
		this[NavigationMixin.GenerateUrl](pageReference)
			.then((url) => {
				if (url) {
					//window.open(url, '_blank');
					this.childWindow = window.open(url, 'Agent Assist', windowFeatures);
				}
			})
			.catch((error) => {
				console.error('Error generating URL:', error);
			});

		this.pollInterval = setInterval(() => {
			if (this.childWindow && this.childWindow.closed) {
				this.handleWindowClose();
			}
		}, 1000);
	}

	openWindowAutomatically() {
		/*const baseUrl= window.location.origin;
        const targeturl = '${baseUrl}/lightning/cmp/c__aa_agentAssistParent_LWC_ARC';
        window.open(targeturl,'_blank','width=800,height=600,resizable=yes,scrollbars=yes');*/
		const windowFeatures = 'width=1024,height=768,resizable=yes,scrollbars=yes,status=no,popup=1';
		const myUrl =
			'https://humana-b2c--mpdev01.sandbox.lightning.force.com/lightning/cmp/c__aa_agentAssistParent_LWC_ARC';
		this.isWindowOpen = true;
		sessionStorage.setItem('DISABLE_UTILITY_AUTOLOAD', 'true');
		//const myUrl ='https://humana-b2c--mpdev01.sandbox.lightning.force.com/lightning/popout/utility?UtilityInfo[9].windowed=true';
		//this.childWindow = window.open(myUrl, 'Agent Assist','width=800,height=600,resizable=yes,scrollbars=yes');
		this.childWindow = window.open(myUrl, 'Agent Assist', windowFeatures);
		console.log('Inside openWindowAutomatically hasRendered-->' + this.hasRendered);
		console.log('Inside openWindowAutomatically isWindowOpen-->' + this.isWindowOpen);

		this.pollInterval = setInterval(() => {
			if (this.childWindow && this.childWindow.closed) {
				this.handleWindowClose();
			}
		}, 1000);
	}

	handleWindowClose() {
		clearInterval(this.pollInterval);
		this.hasRendered = false;
		this.isWindowOpen = false;
		sessionStorage.removeItem('DISABLE_UTILITY_AUTOLOAD');
		console.log('Inside handleWindowClose hasRendered-->' + this.hasRendered);
		console.log('Inside handleWindowClose isWindowOpen-->' + this.isWindowOpen);
	}

	navigateToWebPage() {
		// Navigate to a URL
		const myUrl =
			'https://humana-b2c--mpdev01.sandbox.lightning.force.com/lightning/popout/utility?0.windowed=true';
		this[NavigationMixin.Navigate](
			{
				type: 'standard__webPage',
				attributes: {
					//url: "http://salesforce.com",
					url: myUrl
				}
			},
			true // Replaces the current page in your browser history with the URL
		);
	}

	navigateToComponent() {
		this[NavigationMixin.Navigate]({
			// Pass in pageReference
			type: 'standard__component',
			attributes: {
				componentName: 'c__aa_agentAssistParent_LWC_ARC'
			}
		});
	}
}
