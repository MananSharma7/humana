import { LightningElement, wire, track, api } from 'lwc';
import hasAgentAssistPermission from '@salesforce/customPermission/MarketPoint_Agent_Assist_Custom';
import hasInteraction360Permission from '@salesforce/customPermission/MarketPoint_Agent_Assist_Interaction360_Custom';
import hasKnowledgeCardPermission from '@salesforce/customPermission/MarketPoint_Agent_Assist_Knowledge_Card_Custom';
import { publish, subscribe, APPLICATION_SCOPE, MessageContext } from 'lightning/messageService';
import AgentAssistWebsocket from 'c/aa_UtilsHum';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';
import { AgentAssistLabels, AgentAssistEvents , AgentAssistSplunkLoggingUtils } from 'c/aa_UtilsHum';
import USER_RECORD_ID from '@salesforce/user/Id';
import USER_ID from '@salesforce/schema/User.Id';
import USER_EMAIL from '@salesforce/schema/User.Email';
import USER_NETWORK_ID from '@salesforce/schema/User.Humana_ID__c';
import getAccessToken from '@salesforce/apex/AA_AzureOAuthGraphCallout.getAccessToken';
import VOICE_CALL_CHANNEL from '@salesforce/messageChannel/LWCToUiConnectorMessengerMs__c';
import getRelatedRecord from '@salesforce/apex/AA_FetchRelatedRecordDetails.getRecordDetails';
import runVoiceCallSessionFlow from '@salesforce/apex/AA_VoiceCallFlowInvoker.runVoiceCallSessionFlow';
import LWCLogger from '@salesforce/apex/LoggerLWC.LogFromLWC';
import { EnclosingUtilityId, updateUtility, open, getInfo ,onUtilityClick} from 'lightning/platformUtilityBarApi';
import hasSSOTokenPermission from '@salesforce/customPermission/MarketPoint_Agent_Assist_SSO';
import { AgentAssist_Labels, AuthErrorClass } from './layoutConfig';
import getSSOAccessToken from '@salesforce/apex/AA_AzureOAuthGraphCallout.getSSOAccessToken';
import getAzureCallout from '@salesforce/apex/AA_AzureOAuthGraphCallout.getAzureCallout';
import revokeAccess from '@salesforce/apex/AA_AzureOAuthGraphCallout.revokeAccess';
import isFeatureEnabled from '@salesforce/apex/AA_Utility.isFeatureEnabled';
import LWCSplunkLogger from '@salesforce/apex/AA_LWCSplunkLogging.LWCSplunkLogging';
import hasLiveTranscriptPermission from '@salesforce/customPermission/MarketPoint_Agent_Assist_Live_Transcription';
import userId from '@salesforce/user/Id';
import hasNoVoiceCall from '@salesforce/apex/AA_Utility.hasNoVoiceCall';

let isSessionRequestPending = false;

export default class Aa_agentAssistParent_LWC extends LightningElement {
	agentAssistLMSSubscription = null;
	genesysLMSSubscription = null;
	errorMessage = null;
	isErrorFrameworkEnabled = false;
	isIntContextError = false;
	intContErrorMessage = null;
	isCustContextError = false;
	custContErrorMessage = null;
	isLiveTranscriptEnabled = false;
	isMemberSnapshotEnabled = false;

	@wire(MessageContext) messageContext;

	@wire(EnclosingUtilityId)
    utilityId;

	socketIo;
	websocket = new AgentAssistWebsocket();
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
	genesysInteractionId = null;
	callOutcome;
	callReason;
	disconnectReason;
	relatedRecordId;
	voiceCallId;
	interactingAboutMemberId = null;
	aaSessionId;

	genesysData;
	_recordId;

	utilityVisibleState = null;     
	utilityPollingInterval = null;   
	isTabHidden = false; 

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

	@track snapshotData;

	get isCustomerContextActive() {
		return !!this.snapshotData || !!this.memberID;
	}

	handleEndSession() {
		publish(this.messageContext, VOICE_CALL_CHANNEL, {
			type: AgentAssistLabels.END_INTERACTION,
			data: { interactionId : this.genesysInteractionId }
		});
		this.endInteraction(this.genesysInteractionId);
	}

	//nontelephonic
	isNonTelephonic;
	interactionIdType;
	interactionId;
	isEventPublished;
	utilityClickUnsubscribe;

	@api
	get recordId() {
		return this._recordId;
	}
	set recordId(value) {
		this._recordId = value;
		if (this._recordId) {
			try {
				localStorage.setItem('agentAssistVoiceCallId', this._recordId);
				console.log('aa_agentAssistParent_LWC:VoiceCall ID saved to localStorage via setter:', this._recordId);
			} catch (e) {
				console.error('aa_agentAssistParent_LWC:Error saving VoiceCall ID to localStorage via setter', e);
			}
		}
	}

	@track data;
	@track loading = false;

	isLoading = false;
	showComponent = hasAgentAssistPermission;
	interaction360Permission = hasInteraction360Permission;
	knowledgeCardPermission = hasKnowledgeCardPermission;
	proxyLMSSubscription = null;
	accessToken = null;
	@track showTranscript = false;

	get error() {
		console.log('getter errorMessage: ' + this.errorMessage);
		return this.errorMessage ? true : false;
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
					'aa_agentAssistParent_LWC|wiredUser|An error occured when handling the retrieved user record data'
				);
				this.showError('Agent Assist has been disabled while we investigate an error: ' + e.message);
			}
		} else if (error) {
			console.log('An error occured when retrieving the user record data: ' + JSON.stringify(error));
			this.showError('Agent Assist has been disabled while we investigate an error: ' + error.message);
		}
	}

	showError(message) {
		this.errorMessage = message;
	}

	@wire(isFeatureEnabled, { featureName: 'AA_Member_Snapshot_Card' })
	wiredSnapshot({ error, data }) {
		if (data) {
			this.isMemberSnapshotEnabled = data;
		} else if (error) {
			console.error(error);
		}
	}

	get showMemberSnapshot(){
		return this.isMemberSnapshotEnabled;
	}

	@track isPopoutMode = false;

	get outerContainerClass() {
		return this.isPopoutMode && this.showTranscript ? 'outer-container popout-split' : 'outer-container';
	}

	get transcriptPanelClass() {
		return this.showTranscript ? 'transcript-panel' : 'transcript-panel transcript-panel-hidden';
	}

	async connectedCallback() {
	try{
		console.log('aa_agentAssistParent_LWC:connectedCallback before setupWebSocketIoClient');
		isSessionRequestPending = false;
		
		this.isErrorFrameworkEnabled = await isFeatureEnabled({ featureName: 'AA_Error_Framework' });
		this.isNonTelephonic = await hasNoVoiceCall({ loggedinUserId : userId });
		if (this.utilityId && this.isNonTelephonic) {
			this.utilityClickUnsubscribe = onUtilityClick(
				this.utilityId,
				this.handleUtilityClick
			);
		}
		this.isPopoutMode = window.location.href.includes('popout') || window.location.search.includes('windowed');
		if(this.isPopoutMode){
			this.popedOutSplunkLog();
			//localStorage.setItem('aa_poppedOut','true');
		}
		if (localStorage.getItem('agentAssistGenesysInteractionId')) {
			this.startUtilityMonitor();
		}		
		this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
		document.addEventListener('visibilitychange', this.handleVisibilityChange);
		this.handleWindowClose = this.handleWindowClose.bind(this);
		window.addEventListener('beforeunload', this.handleWindowClose);
		window.addEventListener('pagehide',this.handleWindowClose);

		this.updateStatus('default');
		if (!this.recordId) {
			const storedId = localStorage.getItem('agentAssistVoiceCallId');
			if (storedId) {
				this.recordId = storedId;
			}
		}

		const storedInteractionId = localStorage.getItem('agentAssistGenesysInteractionId');
		if (storedInteractionId) {
			this.genesysInteractionId = storedInteractionId;
			console.log(
				'aa_agentAssistParent_LWC:Restored Genesys Interaction ID from localStorage:',
				this.genesysInteractionId
			);
		}

		const storedMemberId = localStorage.getItem('agentAssistInteractingMemberId');
		if (storedMemberId) {
			this.interactingAboutMemberId = storedMemberId;
			console.log(
				'aa_agentAssistParent_LWC:Restored Interacting About Member ID from localStorage:',
				this.interactingAboutMemberId
			);
		}
		
		const storedRelatedRecordId = localStorage.getItem('agentAssistRelatedRecordId');
		if (storedRelatedRecordId) {
			this.relatedRecordId =
				storedRelatedRecordId;
			await getRelatedRecord({ relatedRecordId: this.relatedRecordId })
			.then((result) => {
				console.log(
					'aa_agentAssistParent_LWC | getRelatedRecord |  ' +
						JSON.stringify(result)
				);
				try {
					
					this.snapshotData = {
						recordType: result.type,
						callerName: result.callerName,
						preferredName: result.preferredName,
						dob: result.dob,
						veteran: result.veteran,
						applicationStatus: result.applicationStatus
					};
					
				} catch (e) {
					console.log('error ' + e);
				}
			})
			.catch((error) => {
				console.log(
					'aa_agentAssistParent_LWC | connectedCallback | getRelatedRecord | error: ' + JSON.stringify(error)
				);
			});
		}


		console.log('aa_agentAssistParent_LWC:hasSSOTokenPermission:', hasSSOTokenPermission);
		if (hasSSOTokenPermission) {
			const azureConfig = await getAzureCallout();
			console.log(
				'aa_agentAssistParent_LWC|connectedCallback before revokeAccessAndFecthNewToken authProviderUrl:',
				azureConfig.authProviderUrl
			);
			this.objSSOCallout =  {};
			this.objSSOCallout['url'] = azureConfig.authProviderUrl;
			this.objSSOCallout['contenttype'] = azureConfig.loginContent;
            this.revokeAccessAndFecthNewToken();
		} else {
			this.accessToken = await getAccessToken();
            }
		if (Array.isArray(this.accessToken)) {
			this.accessToken = this.accessToken[0];
		}
		if (this.accessToken && this.accessToken.length > 0) {
			console.log(
				'aa_agentAssistParent_LWC|connectedCallback after Access Token:received with length',
				this.accessToken.length
			);
		} else {
			console.log('aa_agentAssistParent_LWC|connectedCallback after Access Token:received without length');
		}

		this.subscribeToAgentAssistMessageChannel();

		this.websocket.setupWebSocketIoClient(this.accessToken);

		this.handleContextError();
		}
		catch(e){
			console.error('aa_agentAssistParent_LWC | connectedCallback | Error in connctedCallback '+e?.message);
		}

	}

	subscribeToAgentAssistMessageChannel() {
		if (!this.agentAssistLMSSubscription) {
			this.agentAssistLMSSubscription = subscribe(
				this.messageContext,
				VOICE_CALL_CHANNEL,
				(event) => {
					this.handleAgentAssistMessage(event);
					console.log('aa_agentAssistParent_LWC | subscribeToAgentAssistMessageChannel |Received a MessageEvent => ' + JSON.stringify(event));
				},
				{ scope: APPLICATION_SCOPE }
			);
		}
	}

	async handleAgentAssistMessage(message) {
		console.log('aa_agentAssistParent_LWC | handleAgentAssistMessage | ', message?.type, ' : ', message?.data);
		if (message?.type) {
			switch (message.type) {
				case AgentAssistLabels.SET_INTERACTION_CONTEXT:
					console.log('aa_agentAssistParent_LWC | handleAgentAssistMessage | set_interaction_context');
					this.sendInteractionContext(message);
					let splunkJsonString = JSON.stringify(AgentAssistSplunkLoggingUtils.splunk_logging_context(
						'INFO',
						'aa_agentAssistParent_LWC.js',
						'handleAgentAssistMessage(SET_INTERACTION_CONTEXT)',
						'Interaction Context Set',
						undefined,
						AgentAssistSplunkLoggingUtils.splunk_interaction_callid_message(
							localStorage.getItem('agentAssistGenesysInteractionId'),
							localStorage.getItem('agentAssistVoiceCallId')
						),
						USER_RECORD_ID
					));
					LWCSplunkLogger({ jsonString: splunkJsonString, eventName: "AgentAssistUsageEvent"});
					this.handlePopOutLogCall();
					break;
				case AgentAssistLabels.SET_CUSTOMER_CONTEXT:
					console.log('aa_agentAssistParent_LWC | handleAgentAssistMessage | SET_CUSTOMER_CONTEXT');
					if(message?.VoiceCallData?.RelatedRecordId && this.userSalesforceId === message?.VoiceCallData?.CreatedById){
						this.getRelatedRecordDetails(message.VoiceCallData.RelatedRecordId);
					}
					break;
				case AgentAssistLabels.AGENT_FEEDBACK:
					console.log('aa_agentAssistParent_LWC | handleAgentAssistMessage | agent_feedback');
					this.sendKnowledgeCardFeedback(message.data);
					break;
				case AgentAssistLabels.SET_INTERACTION_RESPONSE:
					console.log('aa_agentAssistParent_LWC | handleAgentAssistMessage | SET_INTERACTION_RESPONSE');
					if (!this.isErrorFrameworkEnabled) {
					try {
						if (this.voiceCallId != null) {
							this.updateVoiceCallSessionId(message.data);
						}
					} catch (e) {
						console.log(
								'agentAssistUtilityPanel | handleAgentAssistMessage | setVoiceCallSessionId | error: ' +
									e
							);
							this.showError(
								'Agent Assist has been disabled while we investigate an error: ' + e.message
						);
					}
					}
					break;
				case AgentAssistLabels.ASK_ME_ANYTHING_QUERY:
					console.log('aa_agentAssistParent_LWC | handleAgentAssistMessage | ask_me_anything_query');
					this.sendAMAQuery(message.data);
					break;
				case AgentAssistLabels.ERROR:
					console.log('aa_agentAssistParent_LWC | handleAgentAssistMessage | AGENT_FEEDBACK_ERROR');
					this.showError('Failed to connect, please log out and back in. ' + message.data);
					this.updateStatus('disconnected');
					break;
				case AgentAssistLabels.END_INTERACTION:
					console.log('aa_agentAssistParent_LWC | handleAgentAssistMessage | end_interaction');
					this.isIntContextError = false;
					this.intContErrorMessage = '';
					this.isCustContextError = false;
					this.custContErrorMessage = '';
					localStorage.removeItem('int_context_error');
					localStorage.removeItem('int_context_error_message');
					localStorage.removeItem('cust_context_error');
					localStorage.removeItem('cust_context_error_message');
					if(this.interactionIdType === 'non-telephonic'){
						//this.endInteraction(this.genesysInteractionId);
						//do nothing
					}else if (this.interactionIdType === 'voice') {
						this.endInteraction('a'+ message.VoiceCallData.Interaction_Id__c);
					}
					break;
				case AgentAssistLabels.CONNECTION_END:
					this.updateStatus('disconnected');
					break;
				case AgentAssistLabels.CONNECTION_ERROR:
					this.handleSocketConnectionError();
					break;
				case AgentAssistLabels.CONNECT_NOTIFICATION:
						this.updateStatus('connected');
					this.handleConnectNotification(message.data, 'connect');
						break;
				case AgentAssistLabels.TOKEN_EXPIRED:
					this.handleTokenExpired();
					break;
				case AgentAssistLabels.REFRESH_TOKEN_NOTIFICATION:
					this.handleConnectNotification(message.data, 'refresh');
					break;
				case AgentAssistLabels.TOKEN_REFRESH_REQUIRED:
					this.handleRefreshRequired(message.data);
					break;
				case AgentAssistLabels.SET_INTERACTION_CONTEXT_NOTIFICATION:
					this.isIntContextError = false;
					this.intContErrorMessage = '';
					this.isCustContextError = false;
					this.custContErrorMessage = '';
					localStorage.removeItem('int_context_error');
					localStorage.removeItem('int_context_error_message');
					localStorage.removeItem('cust_context_error');
					localStorage.removeItem('cust_context_error_message');
					localStorage.removeItem('live_transcript_splunk_logged');
					if (this.isErrorFrameworkEnabled) {
						this.handleSetInteractionContextNotification(message.data);
						try {
							if (this.voiceCallId != null) {
								this.updateVoiceCallSessionId(message.data);
							}
						} catch (e) {
							console.log(
								'aa_agentAssistParent_LWC | handleAgentAssistMessage | updateVoiceCallSessionId | error: ' +
									e
							);
							this.showError(
								'Agent Assist has been disabled while we investigate an error: ' + e.message
							);
						}
					}
					break;
				case AgentAssistLabels.SET_CUSTOMER_CONTEXT_NOTIFICATION:
					if (this.isErrorFrameworkEnabled) {
						this.handleSetCustomerContextNotification(message.data);
					}
					break;
				case AgentAssistLabels.NON_TELEPHONIC_CUSTOMER_CONTEXT:
					console.log('aa_agentAssistParent_LWC | handleAgentAssistMessage | SET_CUSTOMER_CONTEXT | NON_TELEPHONIC_CUSTOMER_CONTEXT');
					this.getRelatedRecordDetails(message?.id);
					break;
				default:
			}
		}
	}

	endInteraction(interactionId) {
		console.log('aa_agentAssistParent_LWC | endInteraction | data: ' + JSON.stringify(interactionId));
		try {
			if ( interactionId == this.genesysInteractionId) {
				this.lastgenesysInteractionId = this.genesysInteractionId;
				this.websocket.emitEvent(
					AgentAssistLabels.END_INTERACTION,
					AgentAssistEvents.end_interaction(this.genesysInteractionId,this.interactionIdType)
				);
				this.memberID = null;
				this.sdrPersonId = null;
				this.custId = null;
				this.memberType = null;
				//this.genesysInteractionId = null;
				this.voiceCallId = null;
				this.interactingAboutMemberId = null;
				this.callOutcome = null;
				this.callReason = null;
				this.recordId = null;
				this.relatedRecordId = null;
				this.snapshotData = null;
				this.stopUtilityMonitor();
				//isSessionRequestPending = false;
				localStorage.removeItem('agentAssistVoiceCallId');
				localStorage.removeItem('agentAssistGenesysInteractionId');
				localStorage.removeItem('agentAssistInteractingMemberId');
				localStorage.removeItem('agentAssistRelatedRecordId');
				localStorage.removeItem('aa_interactionIdType');
				localStorage.removeItem("aa_nonTelephonicEventPublished");
				localStorage.removeItem("aa_sessionId");
				console.log('aa_agentAssistParent_LWC | endInteraction |  Cleared all session storage keys.');
			}
		} catch (e) {
			console.log('agentAssistUtilityPanel | endInteraction | error: ' + e);
			this.showError('Agent Assist has been disabled while we investigate an error: ' + e.message);
		}
	}
	handleSocketConnectionError() {
		let serr = `Websocket connection error for user : "${this.userSalesforceId}" at "${new Date()}"`;
		let errobj = new AuthErrorClass().generaterrorobject(
			false,
			false,
			AgentAssist_Labels.AA_ERROR,
			'handleSocketConnectionError',
			serr,
			0,
			0
		);
		this.displayAuthError(errobj);
	}

	handleTokenExpired() {
		this.websocket.disconnect();
		this.isTokenRefreshRequired = true;
		this.fetchUserToken();
	}

	handleConnectNotification() {
		let data = arguments[0];
		if (arguments[1] == 'refresh' || arguments[1] == 'connect') {
			if (data && data.error?.error_status) {
				this.websocket.disconnect();
				if (data.error?.code == 'AA-UIConnector-Auth-106' || data.error?.code == 'AA-UIConnector-Auth-204') {
					let serr = `Security violation received for user : "${this.userSalesforceId}" at "${new Date()}" and AA message is "${data.error?.message}"`;
					let errobj = new AuthErrorClass().generaterrorobject(
						false,
						false,
						AgentAssist_Labels.AA_ERROR,
						'handleConnectNotification',
						serr,
						0,
						0
					);
					this.displayAuthError(errobj);
				} else {
					this.authretrycount++;
					if (this.authretrycount < 3) {
						this.autherrornotificationmessage += `${data.error?.message} `;
						this.isTokenRefreshRequired = true;
						this.fetchUserToken();
					} else {
						let serr = `Connection nofication error received for user : "${this.userSalesforceId}" at "${new Date()}" and AA message is "${this.autherrornotificationmessage}"`;
						let errobj = new AuthErrorClass().generaterrorobject(
							false,
							true,
							AgentAssist_Labels.AA_ERROR,
							'handleConnectNotification',
							serr,
							0,
							0
						);
						this.displayAuthError(errobj);
						this.autherrornotificationmessage = '';
						this.authretrycount = 0;
					}
				}
			}
		}
	}

	handleRefreshRequired() {
		this.isRefresh = true;
		this.isTokenRefreshRequired = true;
		this.fetchUserToken();
	}

	async revokeAccessAndFecthNewToken() {
		let lst = [];
		this.tokenretrycount = 0;
		lst.push(this.userSalesforceId);
		await revokeAccess({ lstUserIds: lst });
		this.fetchUserToken();
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
			stoken = await getSSOAccessToken({ isRefresh: this.isTokenRefreshRequired });
			if (stoken && stoken.length > 0) {
				_this.resetAAParams();
				_this.initializeWebsocketAfterTokenRetrieval(stoken);
			} else {
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
			console.log('error in getAccessToken----', JSON.parse(JSON.stringify(error)));
			let sMessage = `Error occurred in fetchUserToken for Genesys Interaction id : ${this.genesysInteractionId} and  error message is : ${error.message}`;
			logError({
				sMessage: sMessage,
				sClass: 'AgentAssistUtilityPanel',
				sMethod: 'fetchUserToken',
				sExceptionType: 'Component Error',
				sErrorType: 'AgentAssistError'
			});
		}
	}

	pollpopup() {
		if (this.stoppolling) return;
		if (!this.authWindow) return;
		if (this.authWindow.closed) {
			this.authWindow = null;
			this.stoppolling = true;
			this.fetchUserToken();
			return;
		}
		setTimeout(this.pollpopup.bind(this), 3000);
	}

	resetAAParams() {
		this.ssoMessage = '';
		this.showSSOMessage = false;
		this.tokenretrycount = 0;
		this.showAgentAssist = true;
		this.errorMessage = '';
		this.stoppolling = true;
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

	async sendInteractionContext(interactionDetails) {

		/*this.isNonTelephonic = await hasNoVoiceCall({ loggedinUserId : userId });
		this.interactionIdType = this.isNonTelephonic ?  'non-telephonic' : 'voice';
		console.log('sendInteractionContext isNonTelephonic-->',this.isNonTelephonic);
		console.log('sendInteractionContext interactionIdType-->',this.interactionIdType);*/
		this.isNonTelephonic = false;
		this.interactionIdType = 'voice';
		localStorage.setItem('aa_interactionIdType',this.interactionIdType);

		if(interactionDetails.VoiceCallData.RelatedRecordId !== null){
            return;
        }

		if(this.userSalesforceId !==interactionDetails?.VoiceCallData?.CreatedById){	
			return;
		}

		try {
            const newInteractionId = interactionDetails.VoiceCallData.Interaction_Id__c;
            const previousInteractionId = localStorage.getItem('agentAssistGenesysInteractionId')
            const newInteractionIdCheck = 'a' + newInteractionId;
            if (

                previousInteractionId &&
                previousInteractionId !== newInteractionIdCheck

            ) { 
                // Send end-interaction context for the previous interaction
                if(this.userSalesforceId===interactionDetails.VoiceCallData.CreatedById){
					
					this.endInteraction(previousInteractionId);
					
				}
                   
				
            }
        } catch(error) {

            LWCLogger({messageText: 'Error in publishInteractionContext: '+error, source: 'createWebSocketIoClient', level: 'error'});

        }


		try {
			this.voiceCallId = interactionDetails.recordId;
			this.recordId = interactionDetails.recordId;
			this.genesysInteractionId = 'a' + interactionDetails.VoiceCallData.Interaction_Id__c;
			localStorage.setItem('agentAssistGenesysInteractionId', this.genesysInteractionId);
			if (hasSSOTokenPermission) {
				this.websocket.emitEvent(
					AgentAssistLabels.SET_INTERACTION_CONTEXT,
					AgentAssistEvents.set_interaction_context(
						this.genesysInteractionId,
						'',
						this.userNetworkId,
						'',
						this.userSalesforceId,
						this.interactionIdType
					)
				);

				// Notify children to reset state for new interaction
				publish(this.messageContext, VOICE_CALL_CHANNEL, {
					type: AgentAssistLabels.UPDATE_INTERACTION,
					data: { genesysInteractionId: this.genesysInteractionId }
				});

				if(interactionDetails.VoiceCallData.CallDisposition!== 'completed')
				{	
					this.handleOpenAAUtility();
				}
			} else {
			this.websocket.emitEvent(
				AgentAssistLabels.SET_INTERACTION_CONTEXT,
				AgentAssistEvents.set_interaction_context(
					this.genesysInteractionId,
					this.accessToken,
					this.userNetworkId,
					this.userEmail,
					this.userSalesforceId,
					this.interactionIdType
					)
				);

				// Notify children to reset state for new interaction
				publish(this.messageContext, VOICE_CALL_CHANNEL, {
					type: AgentAssistLabels.UPDATE_INTERACTION,
					data: { genesysInteractionId: this.genesysInteractionId }
				});

				if(interactionDetails.VoiceCallData.CallDisposition!== 'completed')
				{	
					this.handleOpenAAUtility();
				}
			}
			LWCLogger({
				messageText: 'Interaction Context set; Interaction ID: ' + this.genesysInteractionId,
				source: 'sendInteractionContext | Send Interaction Context',
				level: 'info'
			});
			
		} catch (e) {
			console.log('agentAssistUtilityPanel | sendInteractionContext | error: ' + e);
			this.showError('Agent Assist has been disabled while we investigate an error: ' + e.message);
		}
	}

	async getRelatedRecordDetails(relatedRecordId) {

        this.interactionIdType = localStorage.getItem('aa_interactionIdType');

		await getRelatedRecord({ relatedRecordId: relatedRecordId })
			.then((result) => {
				console.log(
					'aa_agentAssistParent_LWC | getRelatedRecordDetails | getEnterpriseId | result: ' +
						JSON.stringify(result)
				);
				try {
					this.memberID = result.memberID;
					this.sdrPersonId = result.sdrID;
					this.custId = result.custID;
					this.memberType = result.type;
					
					this.snapshotData = {
						recordType: result.type,
						callerName: result.callerName,
						preferredName: result.preferredName,
						dob: result.dob,
						veteran: result.veteran,
						applicationStatus: result.applicationStatus
					};
					
					this.relatedRecordId = relatedRecordId;

					localStorage.setItem(
						'agentAssistRelatedRecordId',
						relatedRecordId
					);
										
					localStorage.setItem('agentAssistInteractingMemberId', this.memberID);
					if (this.isNotEmpty(this.sdrPersonId) || this.isNotEmpty(this.custId)) {
						this.websocket.emitEvent(
							AgentAssistLabels.SET_CUSTOMER_CONTEXT,
							AgentAssistEvents.set_customer_context(
								this.memberType,
								this.sdrPersonId,
								this.custId,
								this.genesysInteractionId,
								true,
								this.interactionIdType
							)
						);
						LWCLogger({
							messageText:
								'Customer context sent; Interaction ID: ' +
								this.genesysInteractionId +
								'; Agent Assist Session ID: ' +
								localStorage.getItem('agentAssistVoiceCallId'),
							source: 'sendCustomerContext | Send Customer Context',
							level: 'info'
						});
					} else {
						LWCLogger({
							messageText:
								'Customer context not set, Customer ID or SDR Member ID was null; Interaction ID: ' +
								this.genesysInteractionId +
								'; Agent Assist Session ID: ' +
								localStorage.getItem('agentAssistVoiceCallId'),
							source: 'sendCustomerContext | Send Customer Context',
							level: 'error'
						});
						}
					console.log(
						'setCustomerContextData:' +
							this.memberType +
							' ' +
							this.custId +
							' ' +
							this.genesysInteractionId +
							' ' +
							this.sdrPersonId
					);
				} catch (e) {
					console.log('error publishing to VOICE_CALL_CHANNEL: ' + e);
				}
			})
			.catch((error) => {
				console.log(
					'agentAssistUtilityPanel | sendCustomerContext | getEnterpriseId | error: ' + JSON.stringify(error)
				);
			});
	}

	handleSocketConnectionError() {
        let serr = `Websocket connection error for user : "${this.userSalesforceId}" at "${new Date()}"`;
		let errobj = new AuthErrorClass().generaterrorobject(
			false,
			false,
			AgentAssist_Labels.AA_ERROR,
			'handleSocketConnectionError',
			serr,
			0,
			0
		);
        this.displayAuthError(errobj);
    }

    handleTokenExpired() {
        this.websocket.disconnect();
        this.isTokenRefreshRequired = true;
        this.fetchUserToken();
    }

    handleConnectNotification() {
        let data = arguments[0];
		if (arguments[1] == 'refresh' || arguments[1] == 'connect') {
			if (data && data.error?.error_status) {
                this.websocket.disconnect();
				if (data.error?.code == 'AA-UIConnector-Auth-106' || data.error?.code == 'AA-UIConnector-Auth-204') {
                    let serr = `Security violation received for user : "${this.userSalesforceId}" at "${new Date()}" and AA message is "${data.error?.message}"`;
					let errobj = new AuthErrorClass().generaterrorobject(
						false,
						false,
						AgentAssist_Labels.AA_ERROR,
						'handleConnectNotification',
						serr,
						0,
						0
					);
                    this.displayAuthError(errobj);
				} else {
                    this.authretrycount++;
					if (this.authretrycount < 3) {
                        this.autherrornotificationmessage += `${data.error?.message} `;
                        this.isTokenRefreshRequired = true;
                        this.fetchUserToken();
					} else {
                        let serr = `Connection nofication error received for user : "${this.userSalesforceId}" at "${new Date()}" and AA message is "${this.autherrornotificationmessage}"`;
						let errobj = new AuthErrorClass().generaterrorobject(
							false,
							true,
							AgentAssist_Labels.AA_ERROR,
							'handleConnectNotification',
							serr,
							0,
							0
						);
                        this.displayAuthError(errobj);
                        this.autherrornotificationmessage = '';
                        this.authretrycount = 0;
                    }
                }
            }
        }
    }

    handleRefreshRequired() {
        this.isRefresh = true;
        this.isTokenRefreshRequired = true;
        this.fetchUserToken();
    }

    async revokeAccessAndFecthNewToken() {
        let lstUserIds = [];
        this.tokenretrycount = 0;
        lstUserIds.push(this.userSalesforceId);
		console.log('aa_agentAssistParent_LWC|revokeAccessAndFecthNewToken lstUserIds:', lstUserIds[0]);
		await revokeAccess({ lstUserIds: lstUserIds });
		console.log('aa_agentAssistParent_LWC|After rovokeAccess And before FecthNewToken');
        this.fetchUserToken();
    }

    startLoginFlow() {
		if (this.authWindow && !this.authWindow.closed) {
			LWCLogger({
				messageText: 'Auth Window already open. Interaction ID: ' + this.genesysInteractionId,
				source: 'Aa_agentAssistParent_LWC | StartLoginFlow ',
				level: 'info'
			});
            return;
        }
        this.tokenretrycount++;
        //Display an info message on UI.
        this.ssoMessage = AgentAssist_Labels.SSO_Verification;
        this.showSSOMessage = true;
        this.stoppolling = false;

		let starturl = this.objSSOCallout.contenttype ? encodeURIComponent(this.objSSOCallout.contenttype) : '';
		if (this.objSSOCallout.url && starturl) {
			console.log('aa_agentAssistParent_LWC|startLoginFlow starturl:', starturl);
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

    pollpopup() {
		if (this.stoppolling) return;
		if (!this.authWindow) return;
		if (this.authWindow.closed) {
            this.authWindow = null;
            this.stoppolling = true;
            this.fetchUserToken();
            return;
        }
        setTimeout(this.pollpopup.bind(this), 3000);
    }

    resetAAParams() {
        this.ssoMessage = '';
        this.showSSOMessage = false;
        this.tokenretrycount = 0;
        this.showAgentAssist = true;
        this.errorMessage = '';
        this.stoppolling = true;
    }

    displayAuthError() {
        let objError = arguments[0];
		LWCLogger({ messageText: 'AuthError occurred; Salesforce User Id: ' + this.userSalesforceId + 'User Network Id: ' + this.userNetworkId + '; \n' + JSON.stringify(objError), source: 'aa_agentAssistParentLWC', level: "error"});
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
									this.memberType,
									this.sdrPersonId,
									this.custId,
									this.genesysInteractionId,
									true
							)
						);
                    }
                }
            }
		} catch (error) {}
    }
		
	isNotEmpty(value) {
		return value !== null && value !== undefined && value !== '' && value.trim() !== '';
	}

	async updateVoiceCallSessionId(data) {
		let agentAssistSessionId = this.isErrorFrameworkEnabled
			? data?.data?.agent_assist_session_id
			: data.agent_assist_session_id;
		this.aaSessionId = agentAssistSessionId;
		console.log(
			'aa_agentAssistParent_LWC | UpdateVoiceCallSessionId | before runVoiceCallSessionFlow | Session ID:' +
				data.agent_assist_session_id +
				' agentAssistSessionId: ' +
				agentAssistSessionId
		);
		try {
			await runVoiceCallSessionFlow({ recordId: this.recordId, sessionId: agentAssistSessionId });
		} catch (error) {
			console.log(
				'aa_agentAssistParent_LWC | updateVoiceCallSessionId | runVoiceCallSessionFlow | error: ' +
					JSON.stringify(error)
			);
		}
	}

	sendKnowledgeCardFeedback(data) {
		console.log('agentAssistUtilityPanel | sendKnowledgeCardFeedback | data: ' + data);

		if (data && data.event_type === 'pcs_feedback_event') {
			this.websocket.emitEvent('pcs_feedback_event', data);
			return;
		}

		let datum = data?.data;
		let feedback_value = data?.data?.feedback?.rating;
		let feedback_text = data?.data?.feedback?.feedback_text;
		let card_id = data?.data?.card_metadata?.card_id;

		console.log('agentAssistUtilityPanel | sendKnowledgeCardFeedback | datum: ' + datum);
		console.log('agentAssistUtilityPanel | sendKnowledgeCardFeedback | feedback_value: ' + feedback_value);
		console.log('agentAssistUtilityPanel | sendKnowledgeCardFeedback | feedback_text: ' + feedback_text);
		console.log('agentAssistUtilityPanel | sendKnowledgeCardFeedback | card_id: ' + card_id);

		if (feedback_value !== undefined && feedback_value !== null && feedback_text && card_id && this.genesysInteractionId) {
			this.websocket.emitEvent(
				AgentAssistLabels.AGENT_FEEDBACK,
				AgentAssistEvents.agent_feedback(feedback_value, feedback_text, card_id, this.genesysInteractionId)
			);
		}
	}

	sendAMAQuery(data) {
		console.log('agentAssistUtilityPanel | sendAMAQuery | data: ' + JSON.stringify(data));
		console.log('agentAssistUtilityPanel | sendAMAQuery | websocket.active ' + this.socketIo?.connected);
		console.log('agentAssistUtilityPanel | sendAMAQuery | genesysInteractionId: ' + this.genesysInteractionId);
		console.log(
			'agentAssistUtilityPanel | sendAMAQuery | interactingAboutMemberId: ' + this.interactingAboutMemberId
		);

		let query_text = data?.data?.content?.query?.text;
		let query_id = data?.data?.card_metadata?.query_id;
		let isReply = data?.data?.card_metadata?.reply || false;
		let reply_card_ids = data?.data?.card_metadata?.reply_card_ids || [];

		console.log('sendAMAQuery: extracted isReply:', isReply);
		console.log('sendAMAQuery: extracted reply_card_ids:', JSON.stringify(reply_card_ids));

		let interaction_id = this.genesysInteractionId;
		let enterprise_person_id = this.interactingAboutMemberId;

		this.websocket.emitEvent(
			AgentAssistLabels.ASK_ME_ANYTHING_QUERY,
			AgentAssistEvents.ask_me_anything_query(
				query_text,
				query_id,
				isReply,
				reply_card_ids,
				interaction_id,
				enterprise_person_id,
				this.interactionIdType
			)
		);
		LWCLogger({
			messageText:
				'AMA Request sent; Interaction ID: ' +
				this.genesysInteractionId +
				'; Agent Assist Session ID: ' +
				localStorage.getItem('agentAssistVoiceCallId') +
				'; AMA Question: ' +
				data?.data?.content?.query?.text,
			source: 'sendAMAQuery | Ask Me Anything',
			level: 'info'
		});

		let splunkJsonString = JSON.stringify(AgentAssistSplunkLoggingUtils.splunk_outer_context(
			'aa_agentAssistParent_LWC.js',
			localStorage.getItem('agentAssistGenesysInteractionId'),
			USER_RECORD_ID,
			'INFO',
			AgentAssistSplunkLoggingUtils.splunk_inner_context(
				localStorage.getItem('agentAssistVoiceCallId'),
				undefined,
				undefined,
				undefined,
				isReply
			),
			'AskMeAnythingRequestSubmitted'
		));
		LWCSplunkLogger({ jsonString: splunkJsonString, eventName: "AgentAssistUsageEvent"});
	}
	handleExpand() {
		setTimeout(() => {
			this.scrollToUtilityBarBottom();
		}, 300);
	}

	handleToggleTranscript() {
		this.showTranscript = !this.showTranscript;
		if (this.isPopoutMode) {
			try {
				if (this.showTranscript) {
					window.resizeBy(450, 0);
					let splunkJsonString = JSON.stringify(AgentAssistSplunkLoggingUtils.splunk_outer_context(
						'aa_agentAssistParent_LWC.js',
						localStorage.getItem('agentAssistGenesysInteractionId'),
						USER_RECORD_ID,
						'INFO',
						AgentAssistSplunkLoggingUtils.splunk_inner_context(
							localStorage.getItem('agentAssistVoiceCallId')
						),
						'LiveTranscriptExpanded'
					));
					LWCSplunkLogger({ jsonString: splunkJsonString, eventName: 'AgentAssistUsageEvent' });
				} else {
					window.resizeBy(-450, 0);
					let splunkJsonString = JSON.stringify(AgentAssistSplunkLoggingUtils.splunk_outer_context(
						'aa_agentAssistParent_LWC.js',
						localStorage.getItem('agentAssistGenesysInteractionId'),
						USER_RECORD_ID,
						'INFO',
						AgentAssistSplunkLoggingUtils.splunk_inner_context(
							localStorage.getItem('agentAssistVoiceCallId')
						),
						'LiveTranscriptCollapsed'
					));
					LWCSplunkLogger({ jsonString: splunkJsonString, eventName: 'AgentAssistUsageEvent' });
				}
			} catch (e) {
				console.error('Failed to resize window: ', e);
			}
		}
	}

	scrollToUtilityBarBottom() {
		let element = this.template.host;
		while (element) {
			if (element.scrollHeight > element.clientHeight && getComputedStyle(element).overflowY !== 'visible') {
				element.scrollTo({
					top: element.scrollHeight,
					behavior: 'smooth'
				});
				return;
			}
			element = element.parentElement || (element.getRootNode && element.getRootNode().host);
		}

		window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
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
	
	handleSetInteractionContextNotification(message) {
		try {
			console.log('reached handleSetInteractionContextNotification');
			let intContNotError = '';
			if (message?.error?.error_status) {
				localStorage.setItem('int_context_error', message?.error?.error_status || '');
				localStorage.setItem('int_context_error_message', message?.error?.user_message || '');
				this.isIntContextError = true;
				intContNotError = message?.error?.user_message;
				this.intContErrorMessage = intContNotError;
				LWCLogger({
					messageText:
						'set_interaction_context_notification error message received; Interaction ID: ' +
						this.genesysInteractionId +
						' Payload: ' +
						JSON.stringify(message),
					source: ' aa_agentAssistParent_LWC | handleSetInteractionContextNotification ',
					level: 'info'
				});
			} else {
				//set variables for non-telephonic on receive of setInteractionContextNotification success event
				if(localStorage.getItem('aa_interactionIdType') === 'non-telephonic'){
					let agentAssistSessionId = message?.data?.agent_assist_session_id;							
					localStorage.setItem('aa_sessionId',agentAssistSessionId);
					//Using same variable name for non-telephonic to make sure existing code works everywhere with same variable name
					this.genesysInteractionId = message?.data?.interaction_id;	
					localStorage.setItem('agentAssistGenesysInteractionId', this.genesysInteractionId);
	
				}
				localStorage.setItem('int_context_error', '');
				localStorage.setItem('int_context_error_message', '');
				this.isIntContextError = false;
				this.intContErrorMessage = '';
				LWCLogger({
					messageText:
						'set_interaction_context_notification success message received; Interaction ID: ' +
						this.genesysInteractionId +
						' Payload: ' +
						JSON.stringify(message),
					source: ' aa_agentAssistParent_LWC | handleSetInteractionContextNotification ',
					level: 'info'
				});
			}
		} catch (e) {
			console.error(
				'aa_agentAssistParent_LWC | handleSetInteractionContextNotification | Error in handleSetInteractionContextNotification',
				e?.message
			);
		}
	}
	handleSetCustomerContextNotification(message) {
		try {
			let custContNotError = '';
			if (message?.error?.error_status) {
				localStorage.setItem('cust_context_error', message?.error?.error_status || '');
				localStorage.setItem('cust_context_error_message', message?.error?.user_message || '');
				this.isCustContextError = true;
                custContNotError = message?.error?.user_message;
				this.custContErrorMessage = custContNotError;
				LWCLogger({
					messageText:
						'set_customer_context_notification error message received; Interaction ID: ' +
						this.genesysInteractionId +
						' Payload: ' +
						JSON.stringify(message),
					source: ' aa_agentAssistParent_LWC | handleSetCustomerContextNotification ',
					level: 'info'
				});
			} else {
				localStorage.setItem('cust_context_error', '');
				localStorage.setItem('cust_context_error_message', '');
				this.isCustContextError = false;
				this.custContErrorMessage = '';
				LWCLogger({
					messageText:
						'set_customer_context_notification success message received, Interaction ID: ' +
						this.genesysInteractionId +
						' Payload: ' +
						JSON.stringify(message),
					source: ' aa_agentAssistParent_LWC | handleSetCustomerContextNotification ',
					level: 'info'
				});
            }
		} catch (e) {
			console.error(
				'aa_agentAssistParent_LWC | handleSetCustomerContextNotification | Error in handleSetCustomerContextNotification',
				e
			);
		}
    }

	handleContextError() {
		try {
			const cachedIntErrorStatus = localStorage.getItem('int_context_error');
			const cachedIntErrorMsg = localStorage.getItem('int_context_error_message');
			const cachedCustErrorStatus = localStorage.getItem('cust_context_error');
			const cachedCustErrorMsg = localStorage.getItem('cust_context_error_message');
			if (cachedIntErrorStatus) {
				this.isIntContextError = this.sanitize(cachedIntErrorStatus);
				this.intContErrorMessage = this.sanitize(cachedIntErrorMsg);
			} else {
				this.isIntContextError = false;
				this.intContErrorMessage = '';
			}
			if (cachedCustErrorStatus) {
				this.isCustContextError = this.sanitize(cachedCustErrorStatus);
				this.custContErrorMessage = this.sanitize(cachedCustErrorMsg);
			} else {
				this.isCustContextError = false;
				this.custContErrorMessage = '';
			}
		} catch (e) {
			console.error('aa_agentAssistParent_LWC | handleContextError | Error loading sessionStorage', e);
		}
	}

	sanitize(str) {
        // Only allow alphabets and spaces
        return str.replace(/[^a-z\s]/gi, '');
	}

	async handleOpenAAUtility() {
		
		if (!this.utilityId) {
			return;
		}

		try {
			await open(this.utilityId, { autoFocus: true });
			const interactionId = localStorage.getItem('agentAssistGenesysInteractionId');
			const voiceCallId = localStorage.getItem('agentAssistVoiceCallId');
			let splunkJsonString = JSON.stringify(
				AgentAssistSplunkLoggingUtils.splunk_outer_context(
					'aa_agentAssistParentLWC.js',
					interactionId,
					userId,
					'INFO',
					AgentAssistSplunkLoggingUtils.splunk_inner_context(
						voiceCallId
					),
					'AA_AutoOpen'
				)
			);

			LWCSplunkLogger({
				jsonString: splunkJsonString,
				eventName: 'AgentAssistUsageEvent'
			}); 
			this.startUtilityMonitor();

		} catch (error) {
			console.error('Error logging AA_PopedOutMode', error);
		}
		
	}

	@wire(isFeatureEnabled, { featureName: 'AA_Live_Transcription' })
	wired({ error, data }) {
		if (data) {
			this.isLiveTranscriptEnabled = data;
		} else if (error) {
			console.error(error);
		}
	}

	get showTranscriptButton(){
		return !this.isNonTelephonic && this.isLiveTranscriptEnabled && hasLiveTranscriptPermission;
	}
	

	popedOutSplunkLog(){
		
		try {
			const interactionId = localStorage.getItem('agentAssistGenesysInteractionId');
			const voiceCallId = localStorage.getItem('agentAssistVoiceCallId');
			let splunkJsonString = JSON.stringify(
				AgentAssistSplunkLoggingUtils.splunk_outer_context(
					'aa_agentAssistParentLWC.js',
					interactionId,
					userId,
					'INFO',
					AgentAssistSplunkLoggingUtils.splunk_inner_context(
						voiceCallId
					),
					'AA_PopedOut'
				)
			);

			LWCSplunkLogger({
				jsonString: splunkJsonString,
				eventName: 'AgentAssistUsageEvent'
			}); 
			

		} catch (error) {
			console.error('Error logging AA_PopedOutMode', error);
		}
	}
	
	async handlePopOutLogCall() {
        try {
            if (!this.utilityId) {
                return;
            }
            const utilityInfo = await getInfo(this.utilityId);
            if(utilityInfo.utilityPoppedOut){
				this.popedOutSplunkLog();
			}
        }
        catch (error) {
            console.error('Error handlePopOutLogCall', error);
		}
	}

	
	startUtilityMonitor() {
		
		if (this.utilityPollingInterval || !this.utilityId) {
			return;
		}
		
		const interactionId = localStorage.getItem('agentAssistGenesysInteractionId');

		if (!interactionId) {
			console.log(' No active interaction → skipping polling');
			return;
		}

		this.utilityPollingInterval = setInterval(() => {
			this.checkUtilityVisibility();
		}, 3000); 
	}

	async checkUtilityVisibility() {
		try {
			const utilityInfo = await getInfo(this.utilityId);
			const currentState = utilityInfo?.utilityVisible;

			if ( !this.isTabHidden && 
				this.utilityVisibleState !== null &&
				this.utilityVisibleState === true &&
				currentState === false
			) {
				this.logAAMinimized('AA_Minimized');
			}

			this.utilityVisibleState = currentState;

		} catch (error) {
			console.error('Error checking utility visibility', error);
		}
	}

	disconnectedCallback() {		
		this.stopUtilityMonitor();
				
		document.removeEventListener(
			'visibilitychange',
			this.handleVisibilityChange
		);

		window.removeEventListener(
			'beforeunload',
			this.handleWindowClose
		);

		window.removeEventListener(
			'pagehide',
			this.handleWindowClose
		);

		if (this.utilityClickUnsubscribe) {
            this.utilityClickUnsubscribe = null;
        }
		
		//isSessionRequestPending = false;
		
	}
	
	stopUtilityMonitor() {
		if (this.utilityPollingInterval) {
			clearInterval(this.utilityPollingInterval);
			this.utilityPollingInterval = null;
		}
	}

	logAAMinimized(reason ) {
		try {	
			const interactionId = localStorage.getItem('agentAssistGenesysInteractionId');
			const voiceCallId = localStorage.getItem('agentAssistVoiceCallId');

			let splunkJsonString = JSON.stringify(
				AgentAssistSplunkLoggingUtils.splunk_outer_context(
					'aa_agentAssistParentLWC.js',
					interactionId,
					userId,
					'INFO',
					AgentAssistSplunkLoggingUtils.splunk_inner_context(
						voiceCallId
					),
					reason
				)
			);
			
			LWCSplunkLogger({
				jsonString: splunkJsonString,
				eventName: 'AgentAssistUsageEvent'
			}); 

		} catch (e) {
			console.error(e);
		}
	}

	handleVisibilityChange() {
		if (document.hidden && this.isPopoutMode) {
			this.isTabHidden = true;
			this.logAAMinimized('AA_Minimized');
		}
		else {
				this.isTabHidden = false;
			}

	}
	handleWindowClose() {
	try{
		if(this.isPopoutMode){		
			if(localStorage.getItem("aa_interactionIdType") === 'non-telephonic'){
				localStorage.setItem('aa_window_close_fired', 'true');
				localStorage.setItem('aa_window_close_time', new Date().toString());
			
				//publish event to clear cards
				publish(this.messageContext, VOICE_CALL_CHANNEL, {
					type: AgentAssistLabels.END_INTERACTION,
					data: { interactionId : this.genesysInteractionId }
				});
				
				//emit event to end agent assist session
				this.websocket.emitEvent(
					AgentAssistLabels.END_INTERACTION,
					AgentAssistEvents.end_interaction(this.genesysInteractionId,this.interactionIdType)
				);
				const hasInteractionEnded = localStorage.getItem('aa_endInteractionEmitted') !== null;
				if(hasInteractionEnded){
					this.memberID = null;
					this.sdrPersonId = null;
					this.custId = null;
					this.memberType = null;
					//this.genesysInteractionId = null;
					this.voiceCallId = null;
					this.interactingAboutMemberId = null;
					this.callOutcome = null;
					this.callReason = null;
					this.recordId = null;
					this.relatedRecordId = null;
					this.snapshotData = null;
					this.stopUtilityMonitor();
				
					localStorage.removeItem('agentAssistVoiceCallId');
					localStorage.removeItem('agentAssistGenesysInteractionId');
					localStorage.removeItem('agentAssistInteractingMemberId');
					localStorage.removeItem('agentAssistRelatedRecordId');
					localStorage.removeItem('aa_interactionIdType');
					localStorage.removeItem("aa_nonTelephonicEventPublished");
					localStorage.removeItem("aa_sessionId");
					localStorage.removeItem("aa_endInteractionEmitted");
				}
				
			}
			this.logAAMinimized('AA_WINDOW_CLOSE');
		}
		}catch(e){
			console.error('aa_agentAssistParent_LWC | handleWindowClose | Error happened in window close '+e?.message);
		}	
	}
	

    handleUtilityClick = async () => {
        try {
			console.log('handleUtilityClick invoked');

			const utilityInfo = await getInfo(this.utilityId);
			const isVisible = utilityInfo?.utilityVisible;
			console.log('aa_nonTelephonicEventPublished->',localStorage.getItem('aa_nonTelephonicEventPublished'));
            const hasEventPublished = localStorage.getItem('aa_nonTelephonicEventPublished') === 'true';
			const hasSessionId = localStorage.getItem('aa_sessionId') !== null;
			this.isNonTelephonic = await hasNoVoiceCall({ loggedinUserId : userId });
			this.interactionIdType = this.isNonTelephonic ?  'non-telephonic' : 'voice';
		
			localStorage.setItem('aa_interactionIdType',this.interactionIdType);
			console.log('isVisible-->',isVisible);
			console.log('!hasSessionId->',!hasSessionId);
			console.log('isNonTelephonic->',this.isNonTelephonic);
			console.log('!hasEventPublished->',!hasEventPublished);
			console.log('isSessionRequestPending->',isSessionRequestPending);
			
			/*const wasPoppedOut = localStorage.getItem('aa_poppedOut');

			if(wasPoppedOut === 'true'){
				localStorage.removeItem('aa_poppedOut');
				return;
			}else{
				 if (hasAgentAssistPermission && isVisible && !hasEventPublished && !hasSessionId && this.isNonTelephonic) {
					localStorage.setItem('aa_nonTelephonicEventPublished', 'true');
					this.sendInteractionContextNonTelephonic();
					console.log('Utility clicked ');
            	}
			}*/
		//event is already active
		if(hasEventPublished) return;
		//Prevent rapid fire SF internal call at the same time
		if(isSessionRequestPending) return;
		//If SF is firing the event internally on utility dock-in,reject it
		if(!isVisible) return;
		//do not execute code for voice call
		if(!this.isNonTelephonic) return;
		//non-telephonic session exitsts
		if(hasSessionId) return;
	
		//set memory lock 
		isSessionRequestPending = true;
				
        if (hasAgentAssistPermission && !hasEventPublished &&  this.isNonTelephonic) {
				this.sendInteractionContextNonTelephonic();
				console.log('Utility clicked ');
            }
        } catch (error) {
            console.error('aa_agentAssistParent_LWC | handleUtilityClick | Error handling utility click:', error?.message);
        }
    }

	sendInteractionContextNonTelephonic(){
		try {
			console.log('sendInteractionContextNonTelephonic reached');
			localStorage.setItem('aa_nonTelephonicEventPublished', 'true');

			if (hasSSOTokenPermission) {
				this.websocket.emitEvent(
					AgentAssistLabels.SET_INTERACTION_CONTEXT,
					AgentAssistEvents.set_interaction_context(
						'',
						'',
						this.userNetworkId,
						'',
						this.userSalesforceId,
						this.interactionIdType
					)
				);
				console.log('set_interaction_context non-telephonic published-->'+new Date().toString());
			} else {
			this.websocket.emitEvent(
				AgentAssistLabels.SET_INTERACTION_CONTEXT,
				AgentAssistEvents.set_interaction_context(
					'',
					this.accessToken,
					this.userNetworkId,
					this.userEmail,
					this.userSalesforceId,
					this.interactionIdType
					)
				);
				console.log('set_interaction_context non-telephonic published-->'+new Date().toString());
			}
			
			if (this.userSalesforceId) {
				LWCLogger({
					messageText: 'Non Telephonic Interaction Context set; User ID: ' + this.userSalesforceId,
					source: 'aa_agentAssistParent_LWC | sendInteractionContextNonTelephonic',
					level: 'info'
				});
			}
			
		} catch (e) {
			console.log('aa_agentAssistParent_LWC | sendInteractionContextNonTelephonic | error: ' + e?.message);
			this.showError('Agent Assist has been disabled while we investigate an error: ' + e?.message);
		}
	}

}
