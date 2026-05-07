import { LightningElement, wire, track, api } from 'lwc';
import hasAgentAssistPermission from '@salesforce/customPermission/MarketPoint_Agent_Assist_Custom';
import hasInteraction360Permission from '@salesforce/customPermission/MarketPoint_Agent_Assist_Interaction360_Custom';
import hasKnowledgeCardPermission from '@salesforce/customPermission/MarketPoint_Agent_Assist_Knowledge_Card_Custom';
import { publish, subscribe, APPLICATION_SCOPE, MessageContext } from 'lightning/messageService';
import AgentAssistWebsocket from 'c/aa_UtilsHum';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';
import { AgentAssistLabels, AgentAssistEvents, AgentAssistSplunkLoggingUtils } from 'c/aa_UtilsHum';
import MessageChannel from '@salesforce/messageChannel/mp_ConsumerSearch_MessageChannel__c';
import USER_RECORD_ID from '@salesforce/user/Id';
import USER_ID from '@salesforce/schema/User.Id';
import USER_EMAIL from '@salesforce/schema/User.Email';
import USER_NETWORK_ID from '@salesforce/schema/User.Humana_ID__c';
import getAccessToken from '@salesforce/apex/AA_AzureOAuthGraphCallout.getAccessToken';
import VOICE_CALL_CHANNEL from '@salesforce/messageChannel/LWCToUiConnectorMessengerMs__c';
import getRelatedRecord from '@salesforce/apex/AA_FetchRelatedRecordDetails.getRecordDetails';
import runVoiceCallSessionFlow from '@salesforce/apex/AA_VoiceCallFlowInvoker.runVoiceCallSessionFlow';
import PROXY_CHANNEL from '@salesforce/messageChannel/AgentAssistLWCMessengerMs__c';
import LWCLogger from '@salesforce/apex/LoggerLWC.LogFromLWC';
import { EnclosingUtilityId, updateUtility, open } from 'lightning/platformUtilityBarApi';
import hasSSOTokenPermission from '@salesforce/customPermission/MarketPoint_Agent_Assist_SSO';
import { AgentAssist_Labels, AuthErrorClass } from './layoutConfig';
import getSSOAccessToken from '@salesforce/apex/AA_AzureOAuthGraphCallout.getSSOAccessToken';
import getAzureCallout from '@salesforce/apex/AA_AzureOAuthGraphCallout.getAzureCallout';
import revokeAccess from '@salesforce/apex/AA_AzureOAuthGraphCallout.revokeAccess';
import isFeatureEnabled from '@salesforce/apex/AA_Utility.isFeatureEnabled';
import LWCSplunkLogger from '@salesforce/apex/AA_LWCSplunkLogging.LWCSplunkLogging';

export default class Aa_agentAssistParent_LWC extends LightningElement {
	agentAssistLMSSubscription = null;
	genesysLMSSubscription = null;
	consumerSearchLMSSubscription = null;
	errorMessage = null;
	isErrorFrameworkEnabled = false;
	isIntContextError = false;
	intContErrorMessage = null;
	isCustContextError = false;
	custContErrorMessage = null;

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
	genesysInteractionId;
	callOutcome;
	callReason;
	disconnectReason;
	relatedRecordId;
	voiceCallId;
	interactingAboutMemberId = null;

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

	@wire(isFeatureEnabled, { featureName: 'AA_Error_Framework' })
	wired({ error, data }) {
		if (data) {
			this.isErrorFrameworkEnabled = data;
		} else if (error) {
			console.error(error);
		}
	}

	showError(message) {
		this.errorMessage = message;
	}

	@track isPopoutMode = false;

	get outerContainerClass() {
		return this.isPopoutMode && this.showTranscript ? 'outer-container popout-split' : 'outer-container';
	}

	get transcriptPanelClass() {
		return this.showTranscript ? 'transcript-panel' : 'transcript-panel transcript-panel-hidden';
	}

	async connectedCallback() {
		console.log('aa_agentAssistParent_LWC:connectedCallback before setupWebSocketIoClient');
		this.isPopoutMode = window.location.href.includes('popout') || window.location.search.includes('windowed');
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
		console.log('aa_agentAssistParent_LWC:hasSSOTokenPermission:', hasSSOTokenPermission);
		if (hasSSOTokenPermission) {
			const azureConfig = await getAzureCallout();
			console.log(
				'aa_agentAssistParent_LWC|connectedCallback before revokeAccessAndFecthNewToken authProviderUrl:',
				azureConfig.authProviderUrl
			);
			this.objSSOCallout = {};
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
		this.subscribeToConsumerSearchMessageChannel();
		this.websocket.setupWebSocketIoClient(this.accessToken);

		this.subscribeToProxyMessageChannel();
		this.handleContextError();
	}

	subscribeToProxyMessageChannel() {
		if (!this.proxyLMSSubscription) {
			console.log('aa_agentAssistParent_LWC:Subscribing to Proxy LMS Channel...');
			this.proxyLMSSubscription = subscribe(
				this.messageContext,
				PROXY_CHANNEL,
				(message) => {
					console.log('aa_agentAssistParent_LWC:Proxy LMS Message Received:', JSON.stringify(message));
					//Check this
					if (
						message &&
						message.data &&
						message.data.payload &&
						this.userSalesforceId == message.data.payload.CreatedById
					) {
						const payload = message.data.payload;
						const enrichedPayload = { ...payload };

						if (!enrichedPayload.sdrPersonId) {
							const storedMemberId = localStorage.getItem('agentAssistInteractingMemberId');
							if (storedMemberId) {
								enrichedPayload.sdrPersonId = storedMemberId;
								enrichedPayload.memberId = storedMemberId;
							}
						}

						if (!enrichedPayload.genesysInteractionId) {
							const storedGenesysId = localStorage.getItem('agentAssistGenesysInteractionId');
							if (storedGenesysId) {
								enrichedPayload.genesysInteractionId = storedGenesysId;
							}
						}
						console.log(
							'aa_agentAssistParent_LWC:Proxy LMS Message Before sendCustomerContext:',
							JSON.stringify(enrichedPayload)
						);
						if (
							enrichedPayload.RelatedRecordId__c != null &&
							USER_RECORD_ID == enrichedPayload.CreatedById
						) {
							console.log(
								'aa_agentAssistParent_LWC:Before Related record called from proxy lms: ',
								enrichedPayload.RelatedRecordId__c
							);
							this.getRelatedRecordDetails(enrichedPayload.RelatedRecordId__c);
							console.log('aa_agentAssistParent_LWC:After Related record called from proxy lms');
						}
					}

					this.handlePlatformEvent(message);
				},
				{ scope: APPLICATION_SCOPE }
			);
		}
	}

	async handlePlatformEvent(response) {
		const payload = response.data.payload;
		console.log('aa_agentAssistParent_LWC:Inside handle platform event 1', JSON.stringify(payload));
		const eventRecordId = payload.Voice_Call__c;
		console.log('aa_agentAssistParent_LWC:Inside handle platform event 2 ', eventRecordId + ' ' + this.recordId);
		if (
			eventRecordId &&
			(eventRecordId === this.recordId ||
				(this.recordId && eventRecordId.includes(this.recordId)) ||
				(this.recordId && this.recordId.includes(eventRecordId)))
		) {
			console.log('aa_agentAssistParent_LWC:Inside handle platformEvent matches current recordId.');

			const callDisposition = payload.Call_Disposition__c;
			const interactionId = payload.InteractionId__c;
			console.log(
				'aa_agentAssistParent_LWC:Inside handle platform event 3: callDisposition ' +
					callDisposition +
					' interactionid : ' +
					interactionId
			);
			if (callDisposition && callDisposition.toLowerCase() === 'completed') {
				console.log('aa_agentAssistParent_LWC:Parent LWC Ending interaction (PLATFORM EVENT)');
				this.websocket.endInteraction(interactionId);

				const endMsg = {
					type: AgentAssistLabels.END_INTERACTION,
					data: {
						interactionId: interactionId,
						interactingId: interactionId
					}
				};
				publish(this.messageContext, VOICE_CALL_CHANNEL, endMsg);
				console.log('aa_agentAssistParent_LWC:Parent LWC published END_INTERACTION to children PLATFORM EVENT');
			}
		}
	}

	subscribeToAgentAssistMessageChannel() {
		if (!this.agentAssistLMSSubscription) {
			console.log('aa_agentAssistParent_LWC:Received a message in AgentAssistMessageChannel');
			this.agentAssistLMSSubscription = subscribe(
				this.messageContext,
				VOICE_CALL_CHANNEL,
				(event) => {
					console.log('VoiceCall Message arrived');
					this.handleAgentAssistMessage(event);
					console.log('aa_agentAssistParent_LWC:Received a messageevent => ' + JSON.stringify(event));
				},
				{ scope: APPLICATION_SCOPE }
			);
		}
	}

	subscribeToConsumerSearchMessageChannel() {
		if (!this.consumerSearchLMSSubscription) {
			console.log('Received a message in ConsumerSearchMessageChannel');
			this.consumerSearchLMSSubscription = subscribe(
				this.messageContext,
				MessageChannel,
				(event) => {
					console.log('Consumer search messenge arrived: ' + JSON.stringify(event));
					this.handleConsumerCallback(event);
				},
				{ scope: APPLICATION_SCOPE }
			);
		}
	}

	async handleConsumerCallback(message) {
		console.log(message);
	}
	async handleAgentAssistMessage(message) {
		console.log('aa_agentAssistParent_LWC | handleAgentAssistMessage | ', message?.type, ' : ', message?.data);
		if (message?.type) {
			switch (message.type) {
				case AgentAssistLabels.SET_INTERACTION_CONTEXT:
					console.log('aa_agentAssistParent_LWC | handleAgentAssistMessage | set_interaction_context');
					this.sendInteractionContext(message.data);
					break;
				case AgentAssistLabels.SET_CUSTOMER_CONTEXT:
					break;
				case AgentAssistLabels.AGENT_FEEDBACK:
					console.log('aa_agentAssistParent_LWC | handleAgentAssistMessage | agent_feedback');
					this.sendKnowledgeCardFeedback(message.data);
					break;
				case AgentAssistLabels.SET_INTERACTION_RESPONSE:
					console.log('aa_agentAssistParent_LWC | handleAgentAssistMessage | SET_INTERACTION_RESPONSE');
					console.log('voiceCallId: ' + this.voiceCallId);
					console.log('message.data: ' + JSON.stringify(message.data));
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
				case AgentAssistLabels.UPDATE_INTERACTION:
					console.log('aa_agentAssistParent_LWC | handleAgentAssistMessage | update_interaction');
					//Update CRM Interaction__c with Agent Assist ID in data
					this.agentAssistId = message.data?.agent_assist_session_id;
					if (
						this.recentInteractionData &&
						this.recentInteractionData?.Interaction_Record_ID__c != this.interactionRecordId
					) {
						console.log(
							'aa_agentAssistParent_LWC | handleAgentAssistMessage | update_interaction1>>' +
								this.recentInteractionData
						);
						this.updateInteraction(this.recentInteractionData);
					}
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
					this.endInteraction(message.data.interactingId);
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
				default:
			}
		}
	}

	endInteraction(interactionId) {
		console.log('agentAssistUtilityPanel | endInteraction | data: ' + JSON.stringify(interactionId));
		try {
			if ('a' + interactionId == this.genesysInteractionId) {
				this.lastgenesysInteractionId = this.genesysInteractionId;
				this.websocket.emitEvent(
					AgentAssistLabels.END_INTERACTION,
					AgentAssistEvents.end_interaction(this.genesysInteractionId)
				);
				this.memberID = null;
				this.sdrPersonId = null;
				this.custId = null;
				this.memberType = null;
				this.genesysInteractionId = null;
				this.voiceCallId = null;
				this.interactingAboutMemberId = null;
				this.callOutcome = null;
				this.callReason = null;
				this.recordId = null;
				this.relatedRecordId = null;

				// Clear Session Storage
				localStorage.removeItem('agentAssistVoiceCallId');
				localStorage.removeItem('agentAssistGenesysInteractionId');
				localStorage.removeItem('agentAssistInteractingMemberId');
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
	async sendInteractionContext(interactionDetails) {
		console.log(
			'lwc-agentAssistUtilityPanel | sendInteractionContext | data: ' + JSON.stringify(interactionDetails)
		);
		try {
			this.voiceCallId = interactionDetails.Voice_Call__c;
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

				if (interactionDetails.Call_Disposition__c !== 'completed') {
					this.handleOpenAAUtility();
					//splunk logging
					let splunkJsonString = JSON.stringify(
						AgentAssistSplunkLoggingUtils.splunk_logging_context(
							'INFO',
							'aa_agentAssistParentLWC',
							'sendInteractionContext',
							'AA Auto Open',
							this.genesysInteractionId,
							AgentAssistSplunkLoggingUtils.splunk_agentAssistAutoOpen_message(
								this.voiceCallId,
								this.genesysInteractionId
							)
						)
					);
					LWCSplunkLogger({ jsonString: splunkJsonString, eventName: 'AgentAssistUsageEvent' });
					console.log('AA_autoOpen splunk log');
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

				if (interactionDetails.Call_Disposition__c !== 'completed') {
					this.handleOpenAAUtility();
					//splunk logging
					let splunkJsonString = JSON.stringify(
						AgentAssistSplunkLoggingUtils.splunk_logging_context(
							'INFO',
							'aa_agentAssistParentLWC',
							'sendInteractionContext',
							'AA Auto Open',
							this.genesysInteractionId,
							AgentAssistSplunkLoggingUtils.splunk_agentAssistAutoOpen_message(
								this.voiceCallId,
								this.genesysInteractionId
							)
						)
					);
					LWCSplunkLogger({ jsonString: splunkJsonString, eventName: 'AgentAssistUsageEvent' });
					console.log('AA_autoOpen splunk log');
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
		console.log('arrived at getRelatedRecordDetails');
		await getRelatedRecord({ relatedRecordId: relatedRecordId })
			.then((result) => {
				console.log(
					'agentAssistUtilityPanel | sendCustomerContext | getEnterpriseId | result: ' +
						JSON.stringify(result)
				);
				try {
					this.memberID = result.memberID;
					this.sdrPersonId = result.sdrID;
					this.custId = result.custID;
					this.memberType = result.type;
					localStorage.setItem('agentAssistInteractingMemberId', this.memberID);
					console.log('Before websocket emit for set customer context in P-lwc');
					if (this.isNotEmpty(this.sdrPersonId) || this.isNotEmpty(this.custId)) {
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
						console.log('Customer context sent');
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
						console.log('Cust id or Sdr member id is null');
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
				console.log('aa_agentAssistParent_LWC|fetchUserToken after getSSOAccessToken:', stoken);
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
	async sendCustomerContext(data) {
		console.log(
			'PLW inside sendcustomer agentAssistUtilityPanel | sendCustomerContext | data: ' + JSON.stringify(data)
		);

		try {
			if (
				this.lastgenesysInteractionId != this.genesysInteractionId &&
				this.genesysInteractionId != null &&
				this.Call_Disposition__c != 'completed'
			) {
				if (
					data != null &&
					data.memberId != null &&
					data.sdrPersonId != null &&
					data.memberId !== undefined &&
					data.sdrPersonId !== undefined
				) {
					this.memberId = data.memberId;
					this.sdrPersonId = this.currentmemeberenterpriseid = data.sdrPersonId;
					this.memberType = this.currentmembertype = data.memberType;
					this.custId = data.custId;
					localStorage.setItem('agentAssistInteractingMemberId', this.memberId);

					console.log('aa_agentAssistParent_LWC | before websocket emit from send customer context in plwc');
					if (this.isNotEmpty(this.sdrPersonId) && this.isNotEmpty(this.custId)) {
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
						console.log('aa_agentAssistParent_LWC |Customer context sent');
						return;
					} else {
						console.log('aa_agentAssistParent_LWC |Cust id or Sdr member id is null');
					}
				} else if (data.RelatedRecordId__c != null && data.RelatedRecordId__c != this.relatedRecordId) {
					this.relatedRecordId = data.RelatedRecordId__c;
					console.log('aa_agentAssistParent_LWC |sendCustomerContext: Using Related Record ID.');
					this.getRelatedRecordDetails(data.RelatedRecordId__c);
					return;
				} else {
					console.log(
						'aa_agentAssistParent_LWC |sendCustomerContext: No explicit data provided. ' +
							JSON.stringify(data)
					);
				}
				console.log('aa_sendCustomerContext|END: Using provided explicit data.');
				return;
			}
		} catch (e) {
			this.showError(
				'aa_agentAssistParent_LWC | sendCustomerContext | Agent Assist has been disabled while we investigate an error: ' +
					e.message
			);
			console.log('aa_agentAssistParent_LWC | sendCustomerContext | error: ' + e);
		}
	}

	isNotEmpty(value) {
		return value !== null && value !== undefined && value !== '' && value.trim() !== '';
	}

	async updateVoiceCallSessionId(data) {
		let agentAssistSessionId = this.isErrorFrameworkEnabled
			? data?.data?.agent_assist_session_id
			: data.agent_assist_session_id;
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

		let datum = data?.data;
		let feedback_value = data?.data?.feedback?.rating;
		let feedback_text = data?.data?.feedback?.feedback_text;
		let card_id = data?.data?.card_metadata?.card_id;

		console.log('agentAssistUtilityPanel | sendKnowledgeCardFeedback | datum: ' + datum);
		console.log('agentAssistUtilityPanel | sendKnowledgeCardFeedback | feedback_value: ' + feedback_value);
		console.log('agentAssistUtilityPanel | sendKnowledgeCardFeedback | feedback_text: ' + feedback_text);
		console.log('agentAssistUtilityPanel | sendKnowledgeCardFeedback | card_id: ' + card_id);

		if (feedback_value && feedback_text && card_id && this.genesysInteractionId) {
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
				enterprise_person_id
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
				} else {
					window.resizeBy(-450, 0);
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
				e
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
		//Use to open AA utility Automatically

		if (!this.utilityId) {
			return;
		}
		await open(this.utilityId, { autoFocus: true });
	}
}
