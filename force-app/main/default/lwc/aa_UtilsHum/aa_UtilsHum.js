import { publish, subscribe, unsubscribe, APPLICATION_SCOPE, createMessageContext } from 'lightning/messageService';
import AAUiConnectorToLWC from '@salesforce/messageChannel/UiConnectorToLWCMessengerMs__c';
import { loadScript } from 'lightning/platformResourceLoader';
import SOCKETIO from '@salesforce/resourceUrl/socketio';
import hasSSOTokenPermission from '@salesforce/customPermission/MarketPoint_Agent_Assist_SSO';

connectionretrycount = 0;
export async function setupWebSocketIoClient(websocket, token) {
	this.connectionretrycount = 0;
	const messageContext = createMessageContext();
	if (hasSSOTokenPermission) tokenobj['enforce_expiry'] = true;
	if (websocket == undefined || websocket == null || !websocket.connected) {
		try {
			console.log('agentAssistUtils | createWebSocketIoClient | before loadScript');
			loadScript(this, SOCKETIO).then(() => {
				//const auth_data = AgentAssistEvents.authenticate_websocket(token);

				websocket = io('wss://dev-agentassist.humana.com', {
					//websocket = io('wss://dev-agentassist.humana.com/Gcp30SsAiaaUiConnector/socket.io', {
					//websocket = io('ws://localhost:8765', {
					path: '/Gcp30SsAiaaUiConnector/socket.io/', //localhost doesn't require path - wss over network does
					transports: ['websocket'],
					reconnection: false,
					auth: {
						token: token
					}
				});

				websocket.on('connect', (data) => {
					console.log('agentAssistUtils | createWebSocketIoClient | on connect @', websocket.id);
					//emitEvent(websocket, AgentAssistLabels.ASK_ME_ANYTHING_QUERY, AgentAssistEvents.ask_me_anything_query("Hello world?", "123456", false, []));
					//emitEvent(websocket, AgentAssistLabels.SET_CUSTOMER_CONTEXT, AgentAssistEvents.set_customer_context("Member", "member_123", "member_123", true, "987654321"));
					emitEvent(
						websocket,
						AgentAssistLabels.SET_INTERACTION_CONTEXT,
						AgentAssistEvents.set_interaction_context(
							'986753462',
							'123456543',
							'member_123',
							'test@test.com',
							'member_123'
						)
					);

					// while(eventQueue.length > 0) {
					//     const bufferedEvent = eventQueue.shift();
					//     console.log('agentAssistUtils | createWebSocketIoClient | emitting buffered event:', bufferedEvent.eventType);
					//     emitEvent(websocket, eventQueue, bufferedEvent.eventType, bufferedEvent.eventData);
					// }
					console.log('agentAssistUtils | createWebSocketIoClient | on connect data', data);
				});

				// websocket.emit('set_customer_context', AgentAssistEvents.set_customer_context("Member", "987654321", "987654321", true), (ack, result) => {

				//                 console.log('Received set_customer_context ack: ' + ack + ', result: ' + result);

				//         });
				// websocket.emit('ask_me_anything_query', AgentAssistEvents.ask_me_anything_query("Hello world?", "123456", false, []), (ack, result) => {

				//         //console.log('Received ask_me_anything_query ack: ' + ack + ', result: ' + result);

				// });

				websocket.on('disconnect', (data) => {
					console.log('agentAssistUtils | createWebSocketIoClient | on disconnect :', data);
					//TODO Add Error Logging here
				});

				websocket.on(AgentAssistLabels.HISTORICAL_INTERACTION_SUMMARY, (data) => {
					console.log('agentAssistUtils | createWebSocketIoClient | Received historical_interaction_summary');
					data = JSON.parse(data);
					let message = AgentAssistEvents.aa_lms_event(
						AgentAssistLabels.HISTORICAL_INTERACTION_SUMMARY,
						data
					);
					console.log(
						'agentAssistUtils | createWebSocketIoClient | historical_interaction_summary: ' +
							JSON.stringify(data)
					);
					publish(messageContext, AAUiConnectorToLWC, message);
				});

				websocket.on(AgentAssistLabels.KNOWLEDGE_CARD, (data) => {
					console.log('agentAssistUtils | createWebSocketIoClient | Received knowledge_card');
					data = JSON.parse(data);
					console.log(
						'agentAssistUtils | createWebSocketIoClient | knowledge_card data',
						JSON.stringify(data)
					);
					//let message = AgentAssistEvents.aa_lms_event(AgentAssistLabels.KNOWLEDGE_CARD, data);
					//publish(messageContext, AGENTASSISTLMS, { carddetails: data }); //TODO REMOVE
					const messageContext = createMessageContext();
					//publish(messageContext, AAUiConnectorToLWC, data); //TODO USE ME
				});

				// websocket.on('knowledge_card', (data) => {
				//         console.log('knowledge_card', 'data: ' + data);
				//         data = JSON.parse(data);
				//         this.message = JSON.stringify(data); // this is a string representation of the JSON
				//        // console.log(this.message);
				//         publish(this.messageContext, AAUiConnectorToLWC, { carddetails: data });
				//     });

				websocket.on(AgentAssistLabels.ASK_ME_ANYTHING_RESPONSE, (data) => {
					console.log('agentAssistUtils | createWebSocketIoClient | Received ask_me_anything_response');
					data = JSON.parse(data);
					console.log(
						'agentAssistUtils | createWebSocketIoClient | ask_me_anything_response: ' + JSON.stringify(data)
					);
					//let message = AgentAssistEvents.aa_lms_event(AgentAssistLabels.ASK_ME_ANYTHING_RESPONSE, data);
					//const messageContext = createMessageContext()
					// publish(messageContext, AAUiConnectorToLWC, message);
				});

				websocket.on(AgentAssistLabels.SET_CUSTOMER_CONTEXT, (data) => {
					console.log('agentAssistUtils | createWebSocketIoClient | Received set_customer_context');
					data = JSON.parse(data);
					console.log(
						'agentAssistUtils | createWebSocketIoClient | set_customer_context: ' + JSON.stringify(data)
					);
				});

				websocket.on(AgentAssistLabels.SET_INTERACTION_CONTEXT, (data) => {
					console.log('agentAssistUtils | createWebSocketIoClient | Received SET_INTERACTION_CONTEXT');
					data = JSON.parse(data);
					console.log(
						'agentAssistUtils | createWebSocketIoClient | set_customer_context: ' + JSON.stringify(data)
					);
				});
			});
			console.log('agentAssistUtils | createWebSocketIoClient | after loadScript');
		} catch (error) {
			console.log('Error connecting websocket: ' + error);
			//TODO Add Error Logging here
		}
	} else console.log('Websocket already connected.');

	return websocket;
}

export async function emitEventWithoutACK(websocket, eventType) {
	console.log('agentAssistUtils | emitEventWithoutACK | eventType: ' + eventType + ' begin');
	const maxAttempts = 3;
	let attempts = 1;
	if (websocket != null && websocket.connected) {
		while (attempts <= maxAttempts && websocket.connected) {
			try {
				console.log(
					'agentAssistUtils | emitEventWithoutACK | emitting ',
					eventType + ' @ ',
					new Date().toISOString()
				);
				const result = await new Promise((resolve, reject) => {
					websocket.timeout(10000).emit(eventType, (error, result, data) => {
						if (error) {
							console.log(
								'agentAssistUtils | emitEventWithoutACK | eventType: ' +
									eventType +
									', Received error or timeout @',
								new Date().toISOString()
							);
							//console.log(JSON.stringify(error));
							reject(error);
						} else {
							console.log(
								'agentAssistUtils | emitEventWithoutACK | eventType: ' +
									eventType +
									', Received ack: ' +
									result +
									'@ ',
								new Date().toISOString()
							);
							//console.log(JSON.stringify(data));
							resolve(result);
						}
					});
				});
				return result;
			} catch (error) {
				console.log(
					'agentAssistUtils | emitEventWithoutACK | ' +
						eventType +
						' | Attempt #' +
						attempts +
						' | Error occurred attempting to emit eventType event: ' +
						error
				);
				attempts++;
			}
		}
		if (attempts > maxAttempts) {
			console.log(
				'agentAssistUtils Panel | emitEventWithoutACK | Failed to send ' +
					eventType +
					' event after ' +
					maxAttempts +
					' attempts.'
			);
			//TODO Log Errors here
			if (eventType == AgentAssistLabels.AGENT_FEEDBACK) {
				const messageContext = createMessageContext();
				publish(
					messageContext,
					AGENTASSISTLMS,
					AgentAssistEvents.aa_lms_event(AgentAssistLabels.AGENT_FEEDBACK_ERROR, { foo: 'bar' })
				);
			}
		}
	} else {
		//eventQueue.push({ eventType: eventType });
		console.log('agentAssistUtils | emitEventWithoutACK | Queueing event: ' + eventType);
	}
}

export async function emitEvent(websocket, eventType, eventData) {
	console.log('agentAssistUtils | emitEvent | eventType: ' + eventType + ' begin');
	console.log('agentAssistUtils | emitEvent | eventData: ' + eventData);
	const maxAttempts = 3;
	const messageContext = createMessageContext();
	let attempts = 1;
	if (websocket != null && websocket.connected) {
		while (attempts <= maxAttempts && websocket.connected) {
			try {
				console.log('agentAssistUtils | emitEvent | emitting ', eventType + ' @ ', new Date().toISOString());
				console.log('agentAssistUtils | emitEvent | eventData ', JSON.stringify(eventData));
				const result = await new Promise((resolve, reject) => {
					websocket.timeout(10000).emit(eventType, eventData, (error, result, data) => {
						if (error) {
							console.log(
								'agentAssistUtils | emitEvent | eventType: ' +
									eventType +
									', Received error or timeout @',
								new Date().toISOString()
							);
							//console.log(JSON.stringify(error));
							reject(error);
						} else {
							console.log(
								'agentAssistUtils | emitEvent | eventType: ' +
									eventType +
									', Received ack: ' +
									result +
									'@ ',
								new Date().toISOString()
							);
							console.log(
								'agentAssistUtils | emitEvent | eventType: ' +
									eventType +
									', data: ' +
									JSON.stringify(data)
							);
							if (eventType == AgentAssistLabels.SET_INTERACTION_CONTEXT) {
								console.log('agentAssistUtils | emitEvent | Publishing update_interaction');
								//publish(messageContext, AGENTASSISTLMS, AgentAssistEvents.aa_lms_event(AgentAssistLabels.UPDATE_INTERACTION, JSON.parse(data)));
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
			//TODO Log Errors here
			if (eventType == AgentAssistLabels.AGENT_FEEDBACK) {
				publish(
					messageContext,
					AGENTASSISTLMS,
					AgentAssistEvents.aa_lms_event(AgentAssistLabels.AGENT_FEEDBACK_ERROR, eventData)
				);
			}
		}
	} else {
		//eventQueue.push({ eventType: eventType, eventData: eventData });
		console.log('agentAssistUtils | emitEvent | Queueing event: ' + eventType);
	}
}

export const AgentAssistLabels = {
	ASK_ME_ANYTHING_QUERY: 'ask_me_anything_query',
	ASK_ME_ANYTHING_RESPONSE: 'ask_me_anything_response',
	KNOWLEDGE_CARD: 'knowledge_card',
	HISTORICAL_INTERACTION_SUMMARY: 'historical_interaction_summary',
	GET_INTERACTION_CONTEXT: 'get_interaction_context', // Not sent over WebsocketNot sent over Websocket
	SET_INTERACTION_CONTEXT: 'set_interaction_context',
	UPDATE_INTERACTION: 'update_interaction', // Not sent over Websocket
	SET_CUSTOMER_CONTEXT: 'set_customer_context',
	//SEND_KNOWLEDGE_CARD_FEEDBACK: 'send_knowledge_card_feedback', TODO REMOVE
	AGENT_FEEDBACK: 'agent_feedback',
	//AGENT_FEEDBACK_ERROR: 'agent_feedback_error', TODO REMOVE
	END_INTERACTION: 'end_interaction',
	TOKEN_REFRESH_REQUIRED: 'token_refresh_required',
	TOKEN_EXPIRED: 'token_expired',
	CONNECTION_ERROR: 'connection_error',
	CONNECT_NOTIFICATION: 'connect_notification',
	REFRESH_TOKEN_NOTIFICATION: 'refresh_token_notification',
	REFRESH_TOKEN: 'refresh_token'
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
	agent_feedback: (interaction_id, feedback_value, feedback_text, card_id) => ({
		version: '0.1',
		event_type: 'agent_feedback',
		description: 'Schema for agent feedback to go from Salesforce to Agent Assist system.',
		data: {
			card_metadata: {
				type: 'object',
				properties: {
					interaction_id: {
						value: interaction_id,
						interaction_id_type: 'voice',
						type: 'string',
						description:
							'Unique identifier for the interaction, if voice this is genesys_interaction_id, if chat tbd'
					},
					card_id: {
						value: card_id,
						type: 'string',
						description: 'Internal ID of the card'
					}
				},
				required: ['interaction_id', 'card_id']
			},
			feedback: {
				type: 'object',
				properties: {
					feedback_text: {
						text: feedback_text,
						type: 'string',
						description: 'Textual feedback provided by the agent'
					},
					rating: {
						value: feedback_value,
						type: 'boolean',
						description:
							'Rating given by the agent, e.g., true for positive feedback and false for negative feedback'
					}
				}
			}
		}
	}),

	ask_me_anything_query: (query_text, query_id, isReply, reply_card_ids) => ({
		version: '0.1',
		event_type: 'ask_me_anything_query',
		description: 'Schema for ask me anything queries sent from Salesforce to Agent Assist system.',
		data: {
			card_metadata: {
				type: 'object',
				properties: {
					interaction_id: {
						value: 'string',
						interaction_id_type: 'voice',
						type: 'string',
						description:
							'Unique identifier for the interaction, if voice this is genesys_interaction_id, if chat tbd'
					},
					customer_type: {
						value: 'member',
						type: 'string',
						description: "Type of customer, e.g., 'member' or 'prospect'"
					},
					enterprise_person_id: {
						value: 'string',
						type: 'string',
						description: 'Internal ID generated for each person (unique). Used to call other APIs'
					},
					member_id: {
						value: 'string',
						type: 'string',
						description:
							'The ID on an insurers card - there can be multiple members on a single card, so this is not unique to each person'
					},
					customer_id: {
						value: 'string',
						type: 'string',
						description: 'Unique identifier for the customer or prospect'
					},
					card_id: {
						value: 'null',
						type: 'string',
						description: 'Card ID assigned by agent assist system to uniquely identify the card'
					},
					reply: {
						value: isReply,
						type: 'boolean',
						description: 'Indicates whether the query response is a reply to an existing card'
					},
					reply_card_ids: {
						value: reply_card_ids,
						type: 'array',
						description: 'List of card IDs associated with the reply, if applicable'
					},
					query_id: {
						value: query_id,
						type: 'string',
						description: 'Unique identifier for the query, generated by SF'
					},
					timestamp: {
						value: 'string',
						type: 'string',
						description: 'Timestamp indicating when the card was updated'
					},
					card_status: {
						visible: {
							type: 'boolean',
							value: true
						},
						value: {
							type: 'string',
							value: 'loading',
							enum: ['loading', 'completed', 'abandoned']
						},
						description: 'Card status indicating if query is completed/abandoned/loading'
					},
					transcript_reference: {
						transcript_id: 'string',
						start_timestamp: 'string',
						end_timestamp: 'string'
					}
				},
				required: ['genesys_interaction_id', 'card_id', 'reply', 'card_status']
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
		version: '0.1',
		event_type: 'end_interaction_event',
		description: 'Schema for ending session from Salesforce to Agent Assist system.',
		data: {
			card_metadata: {
				type: 'object',
				properties: {
					interaction_id: {
						value: interaction_id,
						interaction_id_type: 'voice',
						type: 'string',
						description:
							'Interaction ID of the interaction, if voice this is genesys_interaction_id, if chat tbd'
					}
				},
				required: ['interaction_id']
			}
		}
	}),

	set_customer_context: (
		customer_type,
		enterprise_person_id,
		customer_id,
		get_historical_interactions_flag,
		interaction_id
	) => ({
		version: '0.1',
		event_type: 'set_customer_context',
		description: 'Schema for setting customer context in Agent Assist from Salesforce.',
		data: {
			card_metadata: {
				type: 'object',
				properties: {
					interaction_id: {
						value: interaction_id,
						interaction_id_type: 'voice',
						type: 'string',
						description:
							'Unique identifier for the interaction, if voice this is genesys_interaction_id, if chat tbd'
					},
					interacting_about: {
						customer_type: customer_type,
						enterprise_person_id: enterprise_person_id,
						customer_id: customer_id
					},
					get_historical_interactions: {
						value: 'true',
						type: 'boolean',
						description: 'Flag to indicate if historical interaction summary should be sent'
					}
				},
				required: ['interaction_id', 'interacting_about']
			}
		}
	}),

	set_interaction_context: (interaction_id, token, user_network_id, user_email, salesforce_user_id) => ({
		version: '0.1',
		event_type: 'set_interaction_context',
		description:
			'Schema for knowledge cards sent to Salesforce from the Agent Assist system, either as a response to a question or a pure knowledge card.',
		data: {
			card_metadata: {
				type: 'object',
				properties: {
					interaction_id: {
						value: interaction_id,
						interaction_id_type: 'voice',
						type: 'string',
						description:
							'Unique identifier for the interaction, if voice this is genesys_interaction_id, if chat tbd'
					},
					token: {
						value: token,
						type: 'string',
						description: 'JWT Token from Salesforce'
					},
					user_network_id: {
						value: user_network_id,
						type: 'string',
						description: 'Internal ID generated for each person (unique). Used to call other APIs'
					},
					user_email: {
						value: user_email,
						type: 'string',
						description: "User Network Email. Used to identify the user's AD groups"
					},
					salesforce_user_id: {
						value: salesforce_user_id,
						type: 'string',
						description: "(Optional) User's Salesforce User ID."
					}
				},
				required: ['token', 'genesys_interaction_id', 'user_network_id']
			}
		}
	})
};
