/*
LWC Name        : aa_UtilsHum
Function        : LWC to interact with Agent Assist, initialize web socket io connection.

Modification Log:
* Developer Name                  Date                         Description
*-----------------------------------------------------------------------------------------------------------------------------
  Manimozhi D.                    03/12/2026                    Gcp WebSocket Integration with Azure Entra SSO Token Authentication
*****************************************************************************************************************************/

import { publish, unsubscribe, APPLICATION_SCOPE, createMessageContext } from 'lightning/messageService';
import { subscribe, onError } from 'lightning/empApi';
import hasAgentAssistPermission from '@salesforce/customPermission/MarketPoint_Agent_Assist_Custom';
import hasInteraction360Permission from '@salesforce/customPermission/MarketPoint_Agent_Assist_Interaction360_Custom';
import hasKnowledgeCardPermission from '@salesforce/customPermission/MarketPoint_Agent_Assist_Knowledge_Card_Custom';
import { loadScript } from 'lightning/platformResourceLoader';
import SOCKETIO from '@salesforce/resourceUrl/socketio';
import VOICE_CALL_CHANNEL from '@salesforce/messageChannel/LWCToUiConnectorMessengerMs__c';
import LWCLogger from '@salesforce/apex/LoggerLWC.LogFromLWC';
import GetWebsocketConfig from '@salesforce/apex/AA_WebSocketConfig.getAA_WebSocketConfig';
import hasSSOTokenPermission from '@salesforce/customPermission/MarketPoint_Agent_Assist_SSO';
import hasLiveTranscriptionPermission from '@salesforce/customPermission/MarketPoint_Agent_Assist_Live_Transcription';
import isFeatureEnabled from '@salesforce/apex/AA_Utility.isFeatureEnabled';
import LWCSplunkLogger from '@salesforce/apex/AA_LWCSplunkLogging.LWCSplunkLogging';

export default class AgentAssistWebsocket {
	websocket;
	interactionId;
	eventQueue = [];
	customerName;
	agentSalesforceId;
	showComponent = hasAgentAssistPermission;
	interaction360Permission = hasInteraction360Permission;
	knowledgeCardPermission = hasKnowledgeCardPermission;
	connectionretrycount = 0;

	async setupWebSocketIoClient(token) {
		this.connectionretrycount = 0;
		const messageContext = createMessageContext();
		console.log('hasAgentAssistPermission: ' + this.showComponent);
		console.log('interaction360Permission: ' + this.interaction360Permission);
		console.log('knowledgeCardPermission: ' + this.knowledgeCardPermission);
		const websocketConfig = await GetWebsocketConfig();
		console.log('setupWebSocketIoClient | websocketconfig:' + JSON.stringify(websocketConfig));
		const isLiveTranscriptionEnabled = await isFeatureEnabled({ featureName: 'AA_Live_Transcription' });

		const isEmpty = (v) => !v || v.trim().length === 0;

		if (isEmpty(token)) {
			console.log('aa_UtilsHum | setupWebSocketIoClient|Token missing');
			publish(
				messageContext,
				VOICE_CALL_CHANNEL,
				AgentAssistEvents.aa_lms_event(AgentAssistLabels.TOKEN_EXPIRED, data)
			);
			return;
		}
		let tokenObj = { token: token };
		if (hasSSOTokenPermission) tokenObj['enforce_expiry'] = true;
		if (
			this.websocket == undefined ||
			this.websocket == null ||
			(!this.websocket?.connected && this.showComponent)
		) {
			try {
				this.subscribeToVoicecallEvent();
				console.log('aa_UtilsHum | setupWebSocketIoClient | before loadScript');
				loadScript(this, SOCKETIO).then(() => {
					this.websocket = io(websocketConfig.endpoint, {
						path: websocketConfig.path,
						transports: ['websocket'],
						reconnection: websocketConfig.properties.reconnection,
						reconnectionAttempts: websocketConfig.properties.reconnectionAttempts,
						reconnectionDelay: websocketConfig.properties.reconnectionDelay,
						auth: tokenObj
					});

					this.websocket.on('connect', async (data) => {
						console.log('aa_UtilsHum | setupWebSocketIoClient | on connect @', this.websocket.id);
						LWCLogger({
							messageText: 'aa_UtilsHum connected',
							source: 'setupWebSocketIoClient',
							level: 'info'
						});
						while (this.eventQueue.length > 0) {
							const bufferedEvent = this.eventQueue.shift();
							console.log(
								'aa_UtilsHum | setupWebSocketIoClient | emitting buffered event:',
								bufferedEvent?.eventType
							);
							this.emitEvent(bufferedEvent.eventType, bufferedEvent.eventData);
							await new Promise((resolve) => setTimeout(resolve, 1000));
						}
						console.log('aa_UtilsHum | setupWebSocketIoClient | on connect data', data);
						let splunkJsonString = JSON.stringify(
							AgentAssistSplunkLoggingUtils.splunk_logging_context(
								'INFO',
								'aa_UtilsHum.js',
								'websocket.on connect',
								'Websocket Connected',
								this.websocket.id,
								AgentAssistSplunkLoggingUtils.splunk_session_message(this.websocket.id)
							)
						);
						LWCSplunkLogger({ jsonString: splunkJsonString, eventName: 'WebsocketEvent' });
						publish(
							messageContext,
							VOICE_CALL_CHANNEL,
							AgentAssistEvents.aa_lms_event(
								AgentAssistLabels.CONNECT_NOTIFICATION,
								"{messageText: 'aa_UtilsHum connected', source: 'setupWebSocketIoClient', level: 'info'}"
							)
						);
					});
					this.websocket.on(AgentAssistLabels.CONNECT_NOTIFICATION, async (data, ack) => {
						// ✅ Send ACK back to server
						if (typeof ack === 'function') {
							ack(true); // if server expects a boolean
						}
						publish(
							messageContext,
							VOICE_CALL_CHANNEL,
							AgentAssistEvents.aa_lms_event(AgentAssistLabels.CONNECT_NOTIFICATION, data)
						);
					});
					this.websocket.on(AgentAssistLabels.REFRESH_TOKEN_NOTIFICATION, async (data, ack) => {
						if (hasSSOTokenPermission) {
							// ✅ Send ACK back to server (include whatever the server expects)
							if (typeof ack === 'function') {
								ack(true); // if server expects a boolean
							}
							publish(
								messageContext,
								VOICE_CALL_CHANNEL,
								AgentAssistEvents.aa_lms_event(AgentAssistLabels.REFRESH_TOKEN_NOTIFICATION, data)
							);
						}
					});
					this.websocket.on(AgentAssistLabels.TOKEN_REFRESH_REQUIRED, async (data, ack) => {
						if (hasSSOTokenPermission) {
							// ✅ Send ACK back to server (include whatever the server expects)
							if (typeof ack === 'function') {
								ack(true); // if server expects a boolean
							}
							publish(
								messageContext,
								VOICE_CALL_CHANNEL,
								AgentAssistEvents.aa_lms_event(AgentAssistLabels.TOKEN_REFRESH_REQUIRED, data)
							);
						}
					});
					this.websocket.on(AgentAssistLabels.TOKEN_EXPIRED, async (data, ack) => {
						if (hasSSOTokenPermission) {
							// ✅ Send ACK back to server (include whatever the server expects)
							if (typeof ack === 'function') {
								ack(true); // if server expects a boolean
							}
							publish(
								messageContext,
								VOICE_CALL_CHANNEL,
								AgentAssistEvents.aa_lms_event(AgentAssistLabels.TOKEN_EXPIRED, data)
							);
						}
					});
					this.websocket.on('disconnect', (data) => {
						console.log('aa_UtilsHum | setupWebSocketIoClient | on disconnect :', data);
						LWCLogger({
							messageText: 'disconnect data: ' + JSON.stringify(data),
							source: 'setupWebSocketIoClient',
							level: 'warn'
						});
						let splunkJsonString = JSON.stringify(
							AgentAssistSplunkLoggingUtils.splunk_logging_context(
								'INFO',
								'aa_UtilsHum.js',
								'websocket.on disconnect',
								'Websocket Disconnected',
								this.websocket.id,
								AgentAssistSplunkLoggingUtils.splunk_session_message(this.websocket.id)
							)
						);
						LWCSplunkLogger({ jsonString: splunkJsonString, eventName: 'WebsocketEvent' });
						let message = AgentAssistEvents.aa_lms_event(AgentAssistLabels.CONNECTION_END, {
							messageText: 'agentAssistUtils disconnected',
							source: 'createWebSocketIoClient',
							level: 'info'
						});
						publish(messageContext, VOICE_CALL_CHANNEL, message);
					});

					// Catch ANY incoming event (custom or built-in that is dispatched)
					this.websocket.onAny((event, ...args) => {
						console.log('aa_UtilsHum | setupWebSocketIoClient | socket[onAny]', event, ...args);
						LWCLogger({ messageText: 'onAny: ' + event, source: 'setupWebSocketIoClient', level: 'info' });
					});

					if (this.interaction360Permission && websocketConfig.featureFlag.i360) {
						this.websocket.on(AgentAssistLabels.HISTORICAL_INTERACTION_SUMMARY, (data, ack) => {
							try {
								console.log(
									'aa_UtilsHum | setupWebSocketIoClient | Received historical_interaction_summary'
								);
								let message = AgentAssistEvents.aa_lms_event(
									AgentAssistLabels.HISTORICAL_INTERACTION_SUMMARY,
									data
								);
								console.log(
									'aa_UtilsHum | setupWebSocketIoClient | historical_interaction_summary: ' +
										JSON.stringify(data)
								);
								publish(messageContext, VOICE_CALL_CHANNEL, message);
								// ✅ Send ACK back to server (include whatever the server expects)
								if (typeof ack === 'function') {
									ack(true); // if server expects a boolean
								}

								LWCLogger({
									messageText:
										'I360 returned; Interaction ID: ' +
										localStorage.getItem('agentAssistGenesysInteractionId') +
										'; Agent Assist Session ID: ' +
										localStorage.getItem('agentAssistVoiceCallId'),
									source: 'setupWebsocketIoClient | Interaction360',
									level: 'info'
								});
							} catch (err) {
								console.error(
									'aa_UtilsHum | setupWebSocketIoClient | historical_interaction_summary error:',
									err
								);
								LWCLogger({
									messageText: 'On historical_interaction_summary error',
									source: 'setupWebSocketIoClient',
									level: 'error'
								});
							}
						});
					}

					if (this.knowledgeCardPermission && websocketConfig.featureFlag.knowledge) {
						this.websocket.on(AgentAssistLabels.KNOWLEDGE_CARD, (data, ack) => {
							try {
								console.log(
									'aa_UtilsHum | setupWebSocketIoClient | Received knowledge_card data',
									JSON.stringify(data)
								);

								// Build and publish your LMS message first (or after ack—up to your contract)
								const message = AgentAssistEvents.aa_lms_event(AgentAssistLabels.KNOWLEDGE_CARD, data);
								const messageContext = createMessageContext();
								const interactionId = data?.data?.card_metadata?.interaction_id;
								LWCLogger({
									messageText:
										'Knowledge Card Surfaced; Interaction ID: ' +
										localStorage.getItem('agentAssistGenesysInteractionId') +
										'; Agent Assist Session ID: ' +
										localStorage.getItem('agentAssistVoiceCallId') +
										'; Card Title: ' +
										data?.data?.content?.header +
										'; Card ID: ' +
										data?.data?.card_metadata?.card_id,
									source: 'setupWebSocketIoClient | Knowledge Cards',
									level: 'info'
								});
								publish(messageContext, VOICE_CALL_CHANNEL, message);

								// ✅ Send ACK back to server (include whatever the server expects)
								if (typeof ack === 'function') {
									ack(true); // if server expects a boolean
								}
							} catch (err) {
								console.error('knowledge_card handler error', err);
								LWCLogger({
									messageText: 'On knowledge_card error',
									source: 'setupWebSocketIoClient',
									level: 'error'
								});
							}
						});
					}

					this.websocket.on('connect_error', (data) => {
						console.log(
							'aa_UtilsHum | setupWebSocketIoClient |Received connect_error data',
							JSON.stringify(data)
						);
						LWCLogger({
							messageText: 'connect_error data: ' + JSON.stringify(data),
							source: 'setupWebSocketIoClient',
							level: 'error'
						});
						let message = AgentAssistEvents.aa_lms_event(AgentAssistLabels.CONNECTION_ERROR, data);
						if (hasSSOTokenPermission) {
							this.connectionretrycount = this.connectionretrycount + 1;
							if (this.connectionretrycount >= 3) {
								publish(messageContext, VOICE_CALL_CHANNEL, message);
							}
						} else {
							publish(messageContext, VOICE_CALL_CHANNEL, message);
						}
						let splunkJsonString = JSON.stringify(
							AgentAssistSplunkLoggingUtils.splunk_logging_context(
								'INFO',
								'aa_UtilsHum.js',
								'websocket.on connect_error',
								'WebSocket Connection Error',
								this.websocket.id,
								AgentAssistSplunkLoggingUtils.splunk_session_message(this.websocket.id)
							)
						);
						LWCSplunkLogger({ jsonString: splunkJsonString, eventName: 'WebsocketEvent' });
					});

					this.websocket.on('agent_assist_error', (data) => {
						console.log('aa_UtilsHum | setupWebSocketIoClient | Received agent_assist_error');
						console.log(
							'aa_UtilsHum | setupWebSocketIoClient | agent_assist_error data',
							JSON.stringify(data)
						);
						LWCLogger({
							messageText: 'agent_assist_error data: ' + JSON.stringify(data),
							source: 'setupWebSocketIoClient',
							level: 'error'
						});
						let message = AgentAssistEvents.aa_lms_event(AgentAssistLabels.ERROR, data);
						const messageContext = createMessageContext();
						publish(messageContext, VOICE_CALL_CHANNEL, message);
					});

					if (websocketConfig.featureFlag.ama) {
						this.websocket.on(AgentAssistLabels.ASK_ME_ANYTHING_RESPONSE, (data, ack) => {
							try {
								console.log('aa_UtilsHum | setupWebSocketIoClient | Received ask_me_anything_response');
								console.log(
									'aa_UtilsHum | setupWebSocketIoClient | ask_me_anything_response: ' +
										JSON.stringify(data)
								);
								let message = AgentAssistEvents.aa_lms_event(
									AgentAssistLabels.ASK_ME_ANYTHING_RESPONSE,
									data
								);
								const messageContext = createMessageContext();
								const interactionId = data?.data?.card_metadata?.interaction_id;
								publish(messageContext, VOICE_CALL_CHANNEL, message);
								// ✅ Send ACK back to server (include whatever the server expects)
								if (typeof ack === 'function') {
									ack(true); // if server expects a boolean
								}
								LWCLogger({
									messageText:
										'Ask Me Anything ACK received; Interaction ID: ' +
										localStorage.getItem('agentAssistGenesysInteractionId') +
										'; Agent Assist Session ID: ' +
										localStorage.getItem('agentAssistVoiceCallId') +
										'; Card Title: ' +
										data?.data?.content?.header,
									source: 'setupWebSocketIoClient | Ask Me Anything',
									level: 'info'
								});
							} catch (err) {
								console.error('Ask me anything response handler error', err);
								LWCLogger({
									messageText: 'On ask_me_anything_response error',
									source: 'setupWebSocketIoClient',
									level: 'error'
								});
							}
						});
					}

					this.websocket.on(AgentAssistLabels.SET_CUSTOMER_CONTEXT, (data) => {
						console.log('aa_UtilsHum | setupWebSocketIoClient | Received set_customer_context');
						data = JSON.parse(data);
						console.log(
							'aa_UtilsHum | setupWebSocketIoClient | set_customer_context: ' + JSON.stringify(data)
						);
					});

					this.websocket.on(AgentAssistLabels.SET_INTERACTION_RESPONSE, (data, ack) => {
						try {
							console.log('aa_UtilsHum | setupWebSocketIoClient | Received SET_INTERACTION_CONTEXT');
							console.log(
								'aa_UtilsHum | setupWebSocketIoClient | set_customer_context: ' + JSON.stringify(data)
							);
							const messageContext = createMessageContext();
							publish(messageContext, VOICE_CALL_CHANNEL, {
								type: AgentAssistLabels.SET_INTERACTION_RESPONSE,
								data: data
							});
							// ✅ Send ACK back to server (include whatever the server expects)
							if (typeof ack === 'function') {
								ack(true); // if server expects a boolean
							}
							LWCLogger({
								messageText:
									'Interaction Context Ack returned; Interaction ID: ' +
									localStorage.getItem('agentAssistGenesysInteractionId') +
									'; Agent Assist Session ID: ' +
									localStorage.getItem('agentAssistVoiceCallId'),
								source: 'setupWebSocketIoClient | Interaction Context Returned',
								level: 'info'
							});
							let splunkJsonString = JSON.stringify(
								AgentAssistSplunkLoggingUtils.splunk_logging_context(
									'INFO',
									'aa_UtilsHum.js',
									'websocket.on SET_INTERACTION_RESPONSE',
									'Interaction Context Set',
									localStorage.getItem('agentAssistGenesysInteractionId'),
									AgentAssistSplunkLoggingUtils.splunk_interaction_session_message(
										localStorage.getItem('agentAssistGenesysInteractionId'),
										this.websocket.id
									)
								)
							);
							LWCSplunkLogger({ jsonString: splunkJsonString, eventName: 'WebsocketEvent' });
						} catch (err) {
							console.error('SET_INTERACTION_CONTEXT handler error', err);
						}
					});
					this.websocket.on(AgentAssistLabels.POST_CALL_SUMMARY, (data, ack) => {
						try {
							console.log('aa_UtilsHum | WebSocketIoClientOn | Received POST_CALL_SUMMARY');
							console.log(
								'aa_UtilsHum | WebSocketIoClientOn | transcript_summary: ' + JSON.stringify(data)
							);
							const messageContext = createMessageContext();
							publish(messageContext, VOICE_CALL_CHANNEL, {
								type: AgentAssistLabels.POST_CALL_SUMMARY,
								data: data
							});
							// ✅ Send ACK back to server (include whatever the server expects)
							if (typeof ack === 'function') {
								ack(true); // if server expects a boolean
							}
						} catch (err) {
							console.error('POST_CALL_SUMMARY handler error', err);
							LWCLogger({
								messageText:
									'POST_CALL_SUMMARY error; Interaction ID: ' +
									localStorage.getItem('agentAssistGenesysInteractionId') +
									' Error ' +
									JSON.stringify(err),
								source: ' aa_UtilsHum | setupWebSocketIoClient | POST_CALL_SUMMARY',
								level: 'error'
							});
						}
					});

					this.websocket.on(AgentAssistLabels.Activity_Status_Indicator, (data, ack) => {
						try {
							const messageContext = createMessageContext();
							publish(messageContext, VOICE_CALL_CHANNEL, {
								type: AgentAssistLabels.Activity_Status_Indicator,
								data: data
							});
							// ✅ Send ACK back to server (include whatever the server expects)
							if (typeof ack === 'function') {
								ack(true); // if server expects a boolean
							}
							LWCLogger({
								messageText:
									'Activity_Status_Indicator published; Interaction ID: ' +
									localStorage.getItem('agentAssistGenesysInteractionId') +
									'; Agent Assist Session ID: ' +
									localStorage.getItem('agentAssistVoiceCallId'),
								source: 'setupWebSocketIoClient | Activity_Status_Indicator',
								level: 'info'
							});
						} catch (err) {
							console.error('Activity_Status_Indicator handler error', err);
							LWCLogger({
								messageText:
									'Activity_Status_Indicator error; Interaction ID: ' +
									localStorage.getItem('agentAssistGenesysInteractionId') +
									' Error ' +
									JSON.stringify(err),
								source: ' aa_UtilsHum | setupWebSocketIoClient | Activity_Status_Indicator',
								level: 'error'
							});
						}
					});

					this.websocket.on(AgentAssistLabels.SET_INTERACTION_CONTEXT_NOTIFICATION, (data, ack) => {
						try {
							const messageContext = createMessageContext();
							publish(messageContext, VOICE_CALL_CHANNEL, {
								type: AgentAssistLabels.SET_INTERACTION_CONTEXT_NOTIFICATION,
								data: data
							});
							// ✅ Send ACK back to server (include whatever the server expects)
							if (typeof ack === 'function') {
								ack(true); // if server expects a boolean
							}
							LWCLogger({
								messageText:
									'set_interaction_context_notification Ack returned; Interaction ID: ' +
									localStorage.getItem('agentAssistGenesysInteractionId') +
									' Payload ' +
									JSON.stringify(data),
								source: ' aa_UtilsHum | setupWebSocketIoClient | set_interaction_context_notification',
								level: 'info'
							});
						} catch (err) {
							console.error('set_interaction_context_notification error', err);
							LWCLogger({
								messageText:
									'set_interaction_context_notification error; Interaction ID: ' +
									localStorage.getItem('agentAssistGenesysInteractionId') +
									' Error ' +
									JSON.stringify(err),
								source: ' aa_UtilsHum | setupWebSocketIoClient | set_interaction_context_notification',
								level: 'error'
							});
						}
					});

					this.websocket.on(AgentAssistLabels.SET_CUSTOMER_CONTEXT_NOTIFICATION, (data, ack) => {
						try {
							const messageContext = createMessageContext();
							publish(messageContext, VOICE_CALL_CHANNEL, {
								type: AgentAssistLabels.SET_CUSTOMER_CONTEXT_NOTIFICATION,
								data: data
							});
							// ✅ Send ACK back to server (include whatever the server expects)
							if (typeof ack === 'function') {
								ack(true); // if server expects a boolean
							}
							LWCLogger({
								messageText:
									'set_customer_context_notification Ack returned; Interaction ID: ' +
									localStorage.getItem('agentAssistGenesysInteractionId') +
									' Payload ' +
									JSON.stringify(data),
								source: ' aa_UtilsHum | setupWebSocketIoClient | set_customer_context_notification',
								level: 'info'
							});
						} catch (err) {
							console.error('set_customer_context_notification error', err);
							LWCLogger({
								messageText:
									'set_customer_context_notification error; Interaction ID: ' +
									localStorage.getItem('agentAssistGenesysInteractionId') +
									' Error ' +
									JSON.stringify(err),
								source: ' aa_UtilsHum | setupWebSocketIoClient | set_customer_context_notification',
								level: 'error'
							});
						}
					});

					if (isLiveTranscriptionEnabled && hasLiveTranscriptionPermission) {
						this.websocket.on(AgentAssistLabels.LIVE_TRANSCRIPTION, (data, ack) => {
							try {
								const messageContext = createMessageContext();
								publish(messageContext, VOICE_CALL_CHANNEL, {
									type: AgentAssistLabels.LIVE_TRANSCRIPTION,
									data: data
								});
								// ✅ Send ACK back to server (include whatever the server expects)
								if (typeof ack === 'function') {
									ack(true); // if server expects a boolean
								}
							} catch (err) {
								console.error('live_transcription error', err);
								LWCLogger({
									messageText:
										'live_transcription error; Interaction ID: ' +
										localStorage.getItem('agentAssistGenesysInteractionId') +
										' Error ' +
										JSON.stringify(err),
									source: ' aa_UtilsHum | setupWebSocketIoClient | live_transcription',
									level: 'error'
								});
							}
						});
					}
				});
				console.log('aa_UtilsHum | setupWebSocketIoClient | after loadScript');
			} catch (error) {
				LWCLogger({
					messageText: 'Error connecting websocket: ' + error,
					source: 'setupWebSocketIoClient',
					level: 'error'
				});
				console.log('Error connecting websocket: ' + error);
			}
		} else console.log('aa_UtilsHum | setupWebSocketIoClient |Websocket already connected.');
	}

	async publishInteractionContext(interactionDetails) {
		try {
			if (
				this.agentSalesforceId == interactionDetails.data.payload.CreatedById &&
				this.interactionId != interactionDetails.data.payload.InteractionId__c &&
				!interactionDetails.data.payload.Call_Disposition__c != 'completed' &&
				interactionDetails.data.payload.InteractionId__c != this.lastinteractionId
			) {
				this.interactionId = interactionDetails.data.payload.InteractionId__c;
				const messageContext = createMessageContext();
				console.log('interaction ID:' + interactionDetails.data.payload.InteractionId__c);
				publish(messageContext, VOICE_CALL_CHANNEL, {
					type: AgentAssistLabels.SET_INTERACTION_CONTEXT,
					data: interactionDetails.data.payload
				});
			}
		} catch (error) {
			LWCLogger({
				messageText: 'Error in publishInteractionContext: ' + error,
				source: 'createWebSocketIoClient',
				level: 'error'
			});
			console.log('Error in publishInteractionContext: ' + error);
		}
	}

	async endInteraction(interactionId) {
		try {
			console.log('Call ended: interaction ID: ' + this.interactionId);
			this.lastinteractionId = this.interactionId;
			let message = AgentAssistEvents.aa_lms_event(AgentAssistLabels.END_INTERACTION, {
				interactionId: interactionId
			});
			this.interactionId = null;
			const messageContext = createMessageContext();
			publish(messageContext, VOICE_CALL_CHANNEL, message);
			LWCLogger({
				messageText:
					'end_interaction published; Interaction ID: ' +
					localStorage.getItem('agentAssistGenesysInteractionId'),
				source: ' aa_UtilsHum | endInteraction | end_interaction_event',
				level: 'info'
			});
			let splunkJsonString = JSON.stringify(
				AgentAssistSplunkLoggingUtils.splunk_logging_context(
					'INFO',
					'aa_UtilsHum.js',
					'endInteraction',
					'Call Ended',
					localStorage.getItem('agentAssistGenesysInteractionId'),
					AgentAssistSplunkLoggingUtils.splunk_interaction_session_message(
						localStorage.getItem('agentAssistGenesysInteractionId'),
						this.websocket.id
					)
				)
			);
			LWCSplunkLogger({ jsonString: splunkJsonString, eventName: 'WebsocketEvent' });
		} catch (error) {
			LWCLogger({
				messageText: 'Error in publishInteractionContext: ' + error,
				source: 'setupWebSocketIoClient',
				level: 'error'
			});
			console.log('Error in publishInteractionContext: ' + error);
		}
	}

	//code to suibscribe to platform events
	async subscribeToVoicecallEvent() {
		// Callback invoked whenever a new event message is received
		const messageCallback = (response) => {
			console.log('New message received: ', JSON.stringify(response));
			this.publishInteractionContext(response);
		};

		// Invoke subscribe method of empApi. Pass reference to messageCallback
		subscribe('/event/VoiceCall__e', -1, messageCallback).then((response) => {
			// Response contains the subscription information on subscribe call
			console.log('Subscription request sent to: ', JSON.stringify(response.channel));
		});
	}

	async setAgentSalesforceId(agentSalesforceId) {
		console.log('agentSalesforceID:' + agentSalesforceId);
		this.agentSalesforceId = agentSalesforceId;
	}

	async emitEvent(eventType, eventData) {
		console.log('aa_UtilsHum | emitEvent | eventType: ' + eventType + ' begin');
		const maxAttempts = 3;
		const messageContext = createMessageContext();
		//const callout = null;//await getWebSocketCallout();
		const timeout = 10001; //(callout.timeout != null ? parseInt(callout.timeout) : 10001);
		let attempts = 1;
		var result;
		if (this.websocket != null && this.websocket?.connected) {
			while (attempts <= maxAttempts && this.websocket?.connected) {
				try {
					console.log('aa_UtilsHum | emitEvent | emitting ', eventType + ' @ ', new Date().toISOString());
					console.log('aa_UtilsHum | emitEvent | eventData: ', JSON.stringify(eventData));
					result = await new Promise((resolve, reject) => {
						this.websocket.timeout(timeout).emit(eventType, eventData, (error, result, data) => {
							if (error) {
								console.log(
									'aa_UtilsHum | emitEvent | eventType:' +
										eventType +
										'. Received error or timeout @',
									new Date().toISOString()
								);
								reject(error);
							} else {
								console.log(
									'aa_UtilsHum | emitEvent | eventType: ' +
										eventType +
										', Received ack: ' +
										result +
										' @ ',
									new Date().toISOString()
								);
								console.log('aa_UtilsHum | emitEvent | eventType: ' + eventType + ', data: ' + data);
								if (
									eventType == AgentAssistLabels.SET_INTERACTION_CONTEXT &&
									data &&
									data != null &&
									data != ''
								) {
									console.log('aa_UtilsHum | emitEvent | Publishing update_interaction');
									console.log(
										'aa_UtilsHum | emitEvent | ' + eventType + ' data:' + JSON.stringify(data)
									);
									publish(
										messageContext,
										VOICE_CALL_CHANNEL,
										AgentAssistEvents.aa_lms_event(AgentAssistLabels.UPDATE_INTERACTION, data)
									);
								}
								resolve(result);
							}
						});
					});
					return result;
				} catch (error) {
					console.log(
						'aa_UtilsHum | emitEvent | ' +
							eventType +
							' | Attempt #' +
							attempts +
							' | Error occurred attempting to emit eventType event: ' +
							error
					);
					if (!this.websocket?.connected) {
						attempts = maxAttempts;
					}
					attempts++;
				}
			}
			if (attempts > maxAttempts) {
				console.log(
					'aa_UtilsHum Panel | emitEvent | Failed to send ' +
						eventType +
						' event after ' +
						maxAttempts +
						' attempts.'
				);
				const emsg =
					'User ' +
					Id +
					' experienced an error: ' +
					JSON.stringify(result) +
					' agent_assist_id: ' +
					this.agentAssistId;
			}
		} else {
			console.log('aa_UtilsHum | emitEvent | websocket not connected, queuing event: ' + eventType);
			if (eventType == AgentAssistLabels.SET_INTERACTION_CONTEXT) {
				this.eventQueue.unshift({ eventType: eventType, eventData: eventData });
			} else if (eventType == AgentAssistLabels.SET_CUSTOMER_CONTEXT) {
				// Customer Context needs to be sent only after SET_INTERACTION_CONTEXT, so enqueue it behind if SET_INTERACTION_CONTEXT is queued
				const index = this.eventQueue.findIndex(
					(item) => item.eventType == AgentAssistLabels.SET_INTERACTION_CONTEXT
				);
				if (index > -1) {
					this.eventQueue.splice(index + 1, 0, { eventType: eventType, eventData: eventData });
				} else {
					this.eventQueue.push({ eventType: eventType, eventData: eventData });
				}
			} else {
				this.eventQueue.push({ eventType: eventType, eventData: eventData });
			}
		}
	}
	disconnect() {
		if (this.websocket?.connected) {
			this.websocket.disconnect();
		}
	}
}
export const AgentAssistLabels = {
	ASK_ME_ANYTHING_QUERY: 'ask_me_anything_query',
	ASK_ME_ANYTHING_RESPONSE: 'ask_me_anything_response',
	KNOWLEDGE_CARD: 'knowledge_card',
	HISTORICAL_INTERACTION_SUMMARY: 'historical_interaction_summary',
	POST_CALL_SUMMARY: 'transcript_summary',
	GET_INTERACTION_CONTEXT: 'get_interaction_context',
	SET_INTERACTION_CONTEXT: 'set_interaction_context',
	UPDATE_INTERACTION: 'update_interaction',
	SET_CUSTOMER_CONTEXT: 'set_customer_context',
	AGENT_FEEDBACK: 'agent_feedback',
	END_INTERACTION: 'end_interaction_event',
	ERROR: 'agent_assist_error',
	SET_INTERACTION_RESPONSE: 'set_interaction_context_ack',
	Activity_Status_Indicator: 'activity_status_indicator',
	TOKEN_REFRESH_REQUIRED: 'token_refresh_required',
	TOKEN_EXPIRED: 'token_expired',
	CONNECTION_ERROR: 'connection_error',
	CONNECT_NOTIFICATION: 'connect_notification',
	REFRESH_TOKEN_NOTIFICATION: 'refresh_token_notification',
	REFRESH_TOKEN: 'refresh_token',
	CONNECTION_END: 'connection_end',
	SET_INTERACTION_CONTEXT_NOTIFICATION: 'set_interaction_context_notification',
	SET_CUSTOMER_CONTEXT_NOTIFICATION: 'set_customer_context_notification',
	LIVE_TRANSCRIPTION: 'live_transcription'
};

export const AgentAssistEvents = {
	aa_lms_event: (type, data) => ({
		type: type,
		data: data
	}),
	refresh_token: (correlationId, newtoken) => ({
		version: '0.1',
		event_type: 'refresh_token',
		correlation_id: correlationId,
		data: {
			token: newtoken
		}
	}),
	agent_feedback: (feedback_value, feedback_text, card_id, interaction_id) => ({
		version: '1.0',
		event_type: 'agent_feedback_event',
		data: {
			card_metadata: {
				interaction_id: interaction_id,
				card_id: card_id,
				interaction_id_type: 'voice'
			},
			feedback: {
				feedback_text: feedback_text,
				rating: feedback_value
			}
		}
	}),

	ask_me_anything_query: (query_text, query_id, isReply, reply_card_ids, interaction_id, enterprise_person_id) => ({
		version: '0.1',
		event_type: 'ask_me_anything_query',
		data: {
			card_metadata: {
				interaction_id: interaction_id,
				interaction_id_type: 'voice',
				customer_type: 'member',
				enterprise_person_id: enterprise_person_id,
				member_id: enterprise_person_id,
				customer_id: '',
				card_id: '',
				reply: isReply,
				reply_card_ids: reply_card_ids,
				query_id: query_id,
				timestamp: new Date().toISOString(),
				card_status: {
					visible: true,
					value: 'loading'
				},
				transcript_reference: {
					transcript_id: '',
					start_timestamp: '',
					end_timestamp: ''
				}
			},
			content: {
				query: {
					text: query_text
				}
			}
		}
	}),

	authenticate_websocket: (token) => ({
		version: '0.1',
		event_type: 'authenticate_websocket',
		description: 'Schema for authenticate websocket from Salesforce to Agent Assist system.',
		data: {
			card_metadata: {
				type: 'object',
				properties: {
					token: {
						value: token,
						type: 'string',
						description: "Type of customer, e.g., 'member' or 'prospect'"
					},
					user_network_id: {
						value: '',
						type: 'string',
						description: 'Internal ID generated for each person (unique). Used to call other APIs'
					},
					user_email: {
						value: '',
						type: 'string',
						description: "User Network Email. Used to identify the user's AD groups"
					}
				},
				required: ['token', 'user_network_id', 'user_email']
			}
		}
	}),

	end_interaction: (interaction_id) => ({
		version: '1.0',
		event_type: 'end_interaction_event',
		data: {
			card_metadata: {
				interaction_id: interaction_id,
				interaction_id_type: 'voice'
			}
		}
	}),

	set_customer_context: (
		customer_type,
		enterprise_person_id,
		customer_id,
		interaction_id,
		get_historical_interactions_flag
	) => ({
		version: '0.1',
		event_type: 'set_customer_context',
		data: {
			card_metadata: {
				interacting_about: {
					customer_type: customer_type,
					enterprise_person_id: enterprise_person_id == null ? '' : enterprise_person_id,
					customer_id: customer_id == null ? '' : customer_id
				},
				get_historical_interactions:
					get_historical_interactions_flag === true || get_historical_interactions_flag === false
						? get_historical_interactions_flag
						: 'true',
				interaction_id: interaction_id,
				interaction_id_type: 'voice'
			}
		}
	}),

	set_interaction_context: (interaction_id, token, user_network_id, user_email, salesforce_user_id) => ({
		version: '0.1',
		event_type: 'set_interaction_context',
		data: {
			card_metadata: {
				interaction_id: interaction_id,
				interaction_id_type: 'voice',
				token: token,
				user_network_id: user_network_id,
				user_email: user_email,
				salesforce_user_id: salesforce_user_id
			}
		}
	})
};

export const AgentAssistSplunkLoggingUtils = {
	splunk_logging_context: (
		event_type,
		triggering_component,
		subcomponent_name,
		event_title,
		correlation_id,
		requested_data
	) => ({
		LogEventType: event_type,
		DateTime: Date.now() / 1000,
		ComponentName: triggering_component,
		SubComponentName: subcomponent_name,
		TransactionName: event_title,
		CorrelationId: correlation_id,
		Message: requested_data
	}),

	splunk_interacting_member_message: (aa_interacting_member_id) => ({
		InteractingMemberId: aa_interacting_member_id
	}),

	splunk_interaction_message: (genesys_interaction_id) => ({
		GenesysInteractionId: genesys_interaction_id
	}),

	splunk_session_message: (agent_assist_session_id) => ({
		AgentAssistSesionId: agent_assist_session_id
	}),

	splunk_interaction_session_message: (genesys_interaction_id, agent_assist_session_id) => ({
		GenesysInteractionId: genesys_interaction_id,
		AgentAssistSesisonId: agent_assist_session_id
	}),

	splunk_card_message: (
		genesys_interaction_id,
		agent_assist_session_id,
		knowledge_ama_card_title,
		knowledge_ama_card_id
	) => ({
		GenesysInteractionId: genesys_interaction_id,
		AgentAssistSessionId: agent_assist_session_id,
		CardTitle: knowledge_ama_card_title,
		CardId: knowledge_ama_card_id
	}),

	splunk_question_message: (genesys_interaction_id, agent_assist_session_id, ama_question_title) => ({
		GenesysInteractionId: genesys_interaction_id,
		AgentAssistSessionId: agent_assist_session_id,
		AskMeAnythingQuestion: ama_question_title
	}),

	splunk_query_message: (genesys_interaction_id, agent_assist_session_id, ama_query_id) => ({
		GenesysInteractionId: genesys_interaction_id,
		AgentAssistSessionId: agent_assist_session_id,
		AskMeAnythingQueryId: ama_query_id
	})
};
