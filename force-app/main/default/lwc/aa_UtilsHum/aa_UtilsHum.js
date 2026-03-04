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

export default class AgentAssistWebsocket {
	websocket;
	interactionId;
	eventQueue = [];
	customerName;
	agentSalesforceId;
	showComponent = hasAgentAssistPermission;
	interaction360Permission = hasInteraction360Permission;
	knowledgeCardPermission = hasKnowledgeCardPermission;

	async setupWebSocketIoClient(token) {
		const messageContext = createMessageContext();
		console.log('hasAgentAssistPermission: ' + this.showComponent);
		console.log('interaction360Permission: ' + this.interaction360Permission);
		console.log('knowledgeCardPermission: ' + this.knowledgeCardPermission);
		const websocketConfig = await GetWebsocketConfig();
		console.log('websocketconfig:' + JSON.stringify(websocketConfig));

		if (
			this.websocket == undefined ||
			this.websocket == null ||
			(!this.websocket?.connected && this.showComponent)
		) {
			try {
				console.log('agentAssistUtils | createWebSocketIoClient | before loadScript');
				this.subscribeToVoicecallEvent();
				loadScript(this, SOCKETIO).then(() => {
					this.websocket = io(websocketConfig.endpoint, {
						path: websocketConfig.path,
						transports: ['websocket'],

						reconnection: websocketConfig.properties.reconnection,
						reconnectionAttempts: websocketConfig.properties.reconnectionAttempts,
						reconnectionDelay: websocketConfig.properties.reconnectionDelay,
						auth: {
							token: token
						}
					});

					this.websocket.on('connect', async (data) => {
						console.log('agentAssistUtils | createWebSocketIoClient | on connect @', this.websocket.id);
						LWCLogger({
							messageText: 'agentAssistUtils connected',
							source: 'createWebSocketIoClient',
							level: 'info'
						});

						while (this.eventQueue.length > 0) {
							const bufferedEvent = this.eventQueue.shift();
							console.log(
								'agentAssistUtils | setupWebSocketIoClient | emitting buffered event:',
								bufferedEvent?.eventType
							);
							this.emitEvent(bufferedEvent.eventType, bufferedEvent.eventData);
							await new Promise((resolve) => setTimeout(resolve, 1000));
						}
						console.log('agentAssistUtils | createWebSocketIoClient | on connect data', data);
					});

					this.websocket.on('disconnect', (data) => {
						console.log('agentAssistUtils | createWebSocketIoClient | on disconnect :', data);
						LWCLogger({
							messageText: 'disconnect data: ' + JSON.stringify(data),
							source: 'createWebSocketIoClient',
							level: 'warn'
						});
					});

					// Catch ANY incoming event (custom or built-in that is dispatched)
					this.websocket.onAny((event, ...args) => {
						console.log("'agentAssistUtils | createWebSocketIoClient | socket[onAny]", event, ...args);
						LWCLogger({ messageText: 'onAny: ' + event, source: 'createWebSocketIoClient', level: 'info' });
					});

					if (this.interaction360Permission && websocketConfig.featureFlag.i360) {
						this.websocket.on(AgentAssistLabels.HISTORICAL_INTERACTION_SUMMARY, (data, ack) => {
							try {
								console.log(
									'agentAssistUtils | createWebSocketIoClient | Received historical_interaction_summary'
								);
								let message = AgentAssistEvents.aa_lms_event(
									AgentAssistLabels.HISTORICAL_INTERACTION_SUMMARY,
									data
								);
								console.log(
									'agentAssistUtils | createWebSocketIoClient | historical_interaction_summary: ' +
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
									'agentAssistUtils | createWebSocketIoClient | historical_interaction_summary error:',
									err
								);
								LWCLogger({
									messageText: 'On historical_interaction_summary error',
									source: 'createWebSocketIoClient',
									level: 'error'
								});
							}
						});
					}

					if (this.knowledgeCardPermission && websocketConfig.featureFlag.knowledge) {
						this.websocket.on(AgentAssistLabels.KNOWLEDGE_CARD, (data, ack) => {
							try {
								console.log('agentAssistUtils | createWebSocketIoClient | Received knowledge_card');
								console.log(
									'agentAssistUtils | createWebSocketIoClient | knowledge_card data',
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
									source: 'createWebSocketIoClient',
									level: 'error'
								});
							}
						});
					}

					this.websocket.on('connect_error', (data) => {
						console.log('agentAssistUtils | createWebSocketIoClient | Received connect_error');
						console.log(
							'agentAssistUtils | createWebSocketIoClient | connect_error data',
							JSON.stringify(data)
						);
						LWCLogger({
							messageText: 'connect_error data: ' + JSON.stringify(data),
							source: 'createWebSocketIoClient',
							level: 'error'
						});
						let message = AgentAssistEvents.aa_lms_event(AgentAssistLabels.ERROR, data);
						const messageContext = createMessageContext();
						publish(messageContext, VOICE_CALL_CHANNEL, message);
					});

					this.websocket.on('agent_assist_error', (data) => {
						console.log('agentAssistUtils | createWebSocketIoClient | Received agent_assist_error');
						console.log(
							'agentAssistUtils | createWebSocketIoClient | agent_assist_error data',
							JSON.stringify(data)
						);
						LWCLogger({
							messageText: 'agent_assist_error data: ' + JSON.stringify(data),
							source: 'createWebSocketIoClient',
							level: 'error'
						});
						let message = AgentAssistEvents.aa_lms_event(AgentAssistLabels.ERROR, data);
						const messageContext = createMessageContext();
						publish(messageContext, VOICE_CALL_CHANNEL, message);
					});

					if (websocketConfig.featureFlag.ama) {
						this.websocket.on(AgentAssistLabels.ASK_ME_ANYTHING_RESPONSE, (data, ack) => {
							try {
								console.log(
									'agentAssistUtils | createWebSocketIoClient | Received ask_me_anything_response'
								);
								console.log(
									'agentAssistUtils | createWebSocketIoClient | ask_me_anything_response: ' +
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
									source: 'createWebSocketIoClient',
									level: 'error'
								});
							}
						});
					}

					this.websocket.on(AgentAssistLabels.SET_CUSTOMER_CONTEXT, (data) => {
						console.log('agentAssistUtils | createWebSocketIoClient | Received set_customer_context');
						data = JSON.parse(data);
						console.log(
							'agentAssistUtils | createWebSocketIoClient | set_customer_context: ' + JSON.stringify(data)
						);
					});

					this.websocket.on(AgentAssistLabels.SET_INTERACTION_RESPONSE, (data, ack) => {
						try {
							console.log(
								'agentAssistUtils | createWebSocketIoClient | Received SET_INTERACTION_CONTEXT'
							);
							console.log(
								'agentAssistUtils | createWebSocketIoClient | set_customer_context: ' +
									JSON.stringify(data)
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
						} catch (err) {
							console.error('SET_INTERACTION_CONTEXT handler error', err);
						}
					});
					this.websocket.on(AgentAssistLabels.POST_CALL_SUMMARY, (data, ack) => {
						try {
							console.log('agentAssistUtils | WebSocketIoClientOn | Received POST_CALL_SUMMARY');
							console.log(
								'agentAssistUtils | WebSocketIoClientOn | transcript_summary: ' + JSON.stringify(data)
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
						}
					});

					this.websocket.on(AgentAssistLabels.Set_Interaction_Context_Notification, (data) => {
						try {
							console.log(
								'agentAssistUtils | WebSocketIoClientOn | Received Set_Interaction_Context_Notification'
							);
							console.log(
								'agentAssistUtils | WebSocketIoClientOn | Set_Interaction_Context_Notification: ' +
									JSON.stringify(data)
							);
							const messageContext = createMessageContext();
							publish(messageContext, VOICE_CALL_CHANNEL, {
								type: AgentAssistLabels.Set_Interaction_Context_Notification,
								data: data
							});
							// ✅ Send ACK back to server (include whatever the server expects)
							// if (typeof ack === 'function') {
							//     ack(true); // if server expects a boolean
							// }
						} catch (err) {
							console.error('Set_Interaction_Context_Notification error', err);
						}
					});

					this.websocket.on(AgentAssistLabels.Set_Customer_Context_Notification, (data) => {
						try {
							console.log(
								'agentAssistUtils | WebSocketIoClientOn | Received Set_Customer_Context_Notification'
							);
							console.log(
								'agentAssistUtils | WebSocketIoClientOn | Set_Customer_Context_Notification: ' +
									JSON.stringify(data)
							);
							const messageContext = createMessageContext();
							publish(messageContext, VOICE_CALL_CHANNEL, {
								type: AgentAssistLabels.Set_Customer_Context_Notification,
								data: data
							});
							// ✅ Send ACK back to server (include whatever the server expects)
							// if (typeof ack === 'function') {
							//     ack(true); // if server expects a boolean
							// }
							LWCLogger({
								messageText:
									'Customer Context Ack returned; Interaction ID: ' +
									localStorage.getItem('agentAssistGenesysInteractionId') +
									'; Agent Assist Session ID: ' +
									localStorage.getItem('agentAssistVoiceCallId'),
								source: 'setupWebSocketIoClient | Ask Me Anything',
								level: 'info'
							});
						} catch (err) {
							console.error('Set_Customer_Context_Notification error', err);
						}
					});

					this.websocket.on(AgentAssistLabels.Activity_Status_Indicator, (data, ack) => {
						try {
							console.log('agentAssistUtils | WebSocketIoClientOn | Received Activity_Status_Indicator');
							console.log(
								'agentAssistUtils | WebSocketIoClientOn | Activity_Status_Indicator: ' +
									JSON.stringify(data)
							);
							const messageContext = createMessageContext();
							publish(messageContext, VOICE_CALL_CHANNEL, {
								type: AgentAssistLabels.Activity_Status_Indicator,
								data: data
							});
							// ✅ Send ACK back to server (include whatever the server expects)
							if (typeof ack === 'function') {
								ack(true); // if server expects a boolean
							}
						} catch (err) {
							console.error('Activity_Status_Indicator handler error', err);
						}
					});
				});
				console.log('agentAssistUtils | createWebSocketIoClient | after loadScript');
			} catch (error) {
				LWCLogger({
					messageText: 'Error connecting websocket: ' + error,
					source: 'createWebSocketIoClient',
					level: 'error'
				});
				console.log('Error connecting websocket: ' + error);
			}
		} else console.log('Websocket already connected.');
	}

	async publishInteractionContext(interactionDetails) {
		console.log('arrived at publish interaction id' + JSON.stringify(interactionDetails));
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
		} catch (error) {
			LWCLogger({
				messageText: 'Error in publishInteractionContext: ' + error,
				source: 'createWebSocketIoClient',
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
		console.log('agentAssistUtils | emitEvent | eventType: ' + eventType + ' begin');
		const maxAttempts = 3;
		const messageContext = createMessageContext();
		//const callout = null;//await getWebSocketCallout();
		const timeout = 10001; //(callout.timeout != null ? parseInt(callout.timeout) : 10001);
		let attempts = 1;
		var result;
		if (this.websocket != null && this.websocket?.connected) {
			while (attempts <= maxAttempts && this.websocket?.connected) {
				try {
					console.log(
						'agentAssistUtils | emitEvent | emitting ',
						eventType + ' @ ',
						new Date().toISOString()
					);
					console.log('agentAssistUtils | emitEvent | eventData: ', JSON.stringify(eventData));
					result = await new Promise((resolve, reject) => {
						this.websocket.timeout(timeout).emit(eventType, eventData, (error, result, data) => {
							if (error) {
								console.log(
									'agentAssistUtils | emitEvent | eventType:' +
										eventType +
										'. Received error or timeout @',
									new Date().toISOString()
								);
								reject(error);
							} else {
								console.log(
									'agentAssistUtils | emitEvent | eventType: ' +
										eventType +
										', Received ack: ' +
										result +
										' @ ',
									new Date().toISOString()
								);
								console.log(
									'agentAssistUtils | emitEvent | eventType: ' + eventType + ', data: ' + data
								);
								if (
									eventType == AgentAssistLabels.SET_INTERACTION_CONTEXT &&
									data &&
									data != null &&
									data != ''
								) {
									console.log('agentAssistUtils | emitEvent | Publishing update_interaction');
									console.log(
										'agentAssistUtils | emitEvent | ' + eventType + ' data:' + JSON.stringify(data)
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
						'agentAssistUtils | emitEvent | ' +
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
					'agentAssistUtils Panel | emitEvent | Failed to send ' +
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
			console.log('agentAssistUtils | emitEvent | websocket not connected, queuing event: ' + eventType);
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
	Set_Interaction_Context_Notification: 'set_interaction_context_notification',
	Set_Customer_Context_Notification: 'set_customer_context_notification'
};

export const AgentAssistEvents = {
	aa_lms_event: (type, data) => ({
		type: type,
		data: data
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
