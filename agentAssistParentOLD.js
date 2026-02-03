import { LightningElement, wire, track, api } from 'lwc';
import hasAgentAssistPermission from '@salesforce/customPermission/MarketPoint_Agent_Assist_Custom';
import hasInteraction360Permission from '@salesforce/customPermission/MarketPoint_Agent_Assist_Interaction360_Custom';
import hasKnowledgeCardPermission from '@salesforce/customPermission/MarketPoint_Agent_Assist_Knowledge_Card_Custom';
import { publish, subscribe, APPLICATION_SCOPE, MessageContext } from 'lightning/messageService';
import AgentAssistWebsocket from 'c/aa_UtilsHum';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';
import { AgentAssistLabels, AgentAssistEvents } from 'c/aa_UtilsHum';
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

export default class Aa_agentAssistParent_LWC extends LightningElement {
	agentAssistLMSSubscription = null;
	genesysLMSSubscription = null;
	consumerSearchLMSSubscription = null;

	@wire(MessageContext) messageContext;

	socketIo;
	websocket = new AgentAssistWebsocket();

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
	@api
	get recordId() {
		return this._recordId;
	}
	set recordId(value) {
		this._recordId = value;
		if (this._recordId) {
			try {
				sessionStorage.setItem('agentAssistVoiceCallId', this._recordId);
				console.log('VoiceCall ID saved to sessionStorage via setter:', this._recordId);
			} catch (e) {
				console.error('Error saving VoiceCall ID to sessionStorage via setter', e);
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
	// subscription = {};
	// CHANNEL_NAME = '/event/VoiceCall__e'; // Updated to User's Event Name
	// eventQueue = [];
	accessToken = null;

	get error() {
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
				console.log('An error occured when handling the retrieved user record data');
				this.showError('Agent Assist has been disabled while we investigate an error: ' + e.message);
			}
		} else if (error) {
			console.log('An error occured when retrieving the user record data: ' + JSON.stringify(error));
			this.showError('Agent Assist has been disabled while we investigate an error: ' + error.message);
		}
	}

	@wire(getRecord, {
		recordId: '$recordId',
		fields: [
			'VoiceCall.RelatedRecordId',
			'VoiceCall.Interaction_Id__c',
			'VoiceCall.DisconnectReason',
			'VoiceCall.Call_Reason__c',
			'VoiceCall.Call_Outcome__c',
			'VoiceCall.CallStatus'
		]
	})
	wiredRecord({ error, data }) {
		if (data) {
			try {
				console.log('VOICE CALL RECORD for end interaction: ' + JSON.stringify(data));
				if (this.relatedRecordId != getFieldValue(data, 'VoiceCall.RelatedRecordId')) {
					this.relatedRecordId = getFieldValue(data, 'VoiceCall.RelatedRecordId');
					console.log('related record ID:' + this.relatedRecordId);
					this.getRelatedRecordDetails(this.relatedRecordId);
				}
				this.callReason = getFieldValue(data, 'VoiceCall.Call_Reason__c');
				this.callOutcome = getFieldValue(data, 'VoiceCall.Call_Outcome__c');
				const callStatus = getFieldValue(data, 'VoiceCall.CallStatus');
				console.log('call outcomes' + this.callOutcome + this.callReason + ' status: ' + callStatus);

				if ((this.callOutcome != null && this.callReason != null) || callStatus === 'COMPLETED') {
					console.log('Parent LWC Ending interaction');
					const interactionId = getFieldValue(data, 'VoiceCall.Interaction_Id__c');
					this.websocket.endInteraction(interactionId);

					if (this.websocket && this.websocket.websocket) {
						this.websocket.websocket.disconnect();
						console.log('Parent LWC: Websocket disconnected manually via direct access.');
					}

					const endMsg = {
						type: AgentAssistLabels.END_INTERACTION,
						data: {
							interactionId: interactionId,
							interactingId: interactionId
						}
					};
					publish(this.messageContext, VOICE_CALL_CHANNEL, endMsg);
					console.log('Parent LWC published END_INTERACTION to children WIRE');
				}
			} catch (e) {
				console.log('An error occured when handling the retrieved user record data:' + e.message);
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

	async connectedCallback() {
		console.log('connectedCallback before setupWebSocketIoClient');

		if (!this.recordId) {
			const storedId = sessionStorage.getItem('agentAssistVoiceCallId');
			if (storedId) {
				this.recordId = storedId;
			}
		}

		const storedInteractionId = sessionStorage.getItem('agentAssistGenesysInteractionId');
		if (storedInteractionId) {
			this.genesysInteractionId = storedInteractionId;
			console.log('Restored Genesys Interaction ID from sessionStorage:', this.genesysInteractionId);
		}

		const storedMemberId = sessionStorage.getItem('agentAssistInteractingMemberId');
		if (storedMemberId) {
			this.interactingAboutMemberId = storedMemberId;
			console.log('Restored Interacting About Member ID from sessionStorage:', this.interactingAboutMemberId);
		}

		// Removed polling logic
		// if (this.recordId) {
		// 	this.startPolling();
		// }

		this.accessToken = await getAccessToken();
		if (Array.isArray(this.accessToken)) {
			this.accessToken = this.accessToken[0];
		}
		console.log(JSON.stringify(this.accessToken, null, 2));
		this.subscribeToAgentAssistMessageChannel();
		this.subscribeToConsumerSearchMessageChannel();
		this.websocket.setupWebSocketIoClient(this.accessToken);

		// Subscribe to Proxy LMS instead of Platform Event directly
		this.subscribeToProxyMessageChannel();
		// this.handleSubscribe();
		// this.registerErrorListener();

		console.log('connectedCallback after setupWebSocketIoClient');
	}

	disconnectedCallback() {
		// Removed polling cleanup
		// if (this.pollingInterval) {
		// 	clearInterval(this.pollingInterval);
		// 	this.pollingInterval = null;
		// }
		// Unsubscribe from Platform Event
		// this.handleUnsubscribe();
	}

	// Removed polling methods
	// startPolling() {
	// 	console.log('Starting polling for VoiceCall updates...');
	// 	// Execute immediately
	// 	this.pollVoiceCallRecord();

	// 	this.pollingInterval = setInterval(() => {
	// 		this.pollVoiceCallRecord();
	// 	}, 5000); // eslint-disable-line @lwc/lwc/no-async-operation
	// }

	// pollVoiceCallRecord() {
	// 	console.log('Pollvoice call started=> ' + this.recordId);
	// 	// eslint-disable-next-line @lwc/lwc/no-async-operation
	// 	if (!this.recordId) return;

	// 	const fields = [
	// 		'RelatedRecordId',
	// 		'Interaction_Id__c',
	// 		'DisconnectReason',
	// 		'Call_Reason__c',
	// 		'Call_Outcome__c',
	// 		'CallDisposition'
	// 	];

	// 	getRecordById({
	// 		recordId: this.recordId,
	// 		objectApiName: 'VoiceCall',
	// 		fieldApiNames: fields
	// 	})
	// 		.then((data) => {
	// 			if (data) {
	// 				// 1. Check for Related Record changes
	// 				const newRelatedId = data.RelatedRecordId;
	// 				if (newRelatedId && this.relatedRecordId !== newRelatedId) {
	// 					console.log('Polling detected RelatedRecordId change:', newRelatedId);
	// 					this.relatedRecordId = newRelatedId;
	// 					this.getRelatedRecordDetails(this.relatedRecordId);
	// 				}

	// 				// 2. Check and Restore Interaction ID (Critical for Pop-out)
	// 				const interactionId = data.Interaction_Id__c;
	// 				if (interactionId && !this.genesysInteractionId) {
	// 					this.genesysInteractionId = 'a' + interactionId;
	// 					sessionStorage.setItem('agentAssistGenesysInteractionId', this.genesysInteractionId);
	// 					console.log('Restored Genesys Interaction ID from polling:', this.genesysInteractionId);
	// 				}

	// 				// 3. Check for Call End conditions
	// 				const newOutcome = data.Call_Outcome__c;
	// 				const newReason = data.Call_Reason__c;
	// 				const callDisposition = data.CallDisposition;

	// 				this.callOutcome = newOutcome;
	// 				this.callReason = newReason;
	// 				console.log(
	// 					'CallOutcome=> ' +
	// 						this.newOutcome +
	// 						' callreason=> ' +
	// 						this.newReason +
	// 						' callDisposition=> ' +
	// 						callDisposition
	// 				);

	// 				if (
	// 					(newOutcome != null && newReason != null) ||
	// 					(callDisposition && callDisposition.toLowerCase() === 'completed')
	// 				) {
	// 					console.log('Parent LWC Ending interaction (POLLING)');
	// 					this.websocket.endInteraction(interactionId);

	// 					if (this.websocket && this.websocket.websocket) {
	// 						this.websocket.websocket.disconnect();
	// 						console.log('Parent LWC: Websocket disconnected manually via direct access.');
	// 					}

	// 					const endMsg = {
	// 						type: AgentAssistLabels.END_INTERACTION,
	// 						data: {
	// 							interactionId: interactionId,
	// 							interactingId: interactionId
	// 						}
	// 					};
	// 					publish(this.messageContext, VOICE_CALL_CHANNEL, endMsg);
	// 					console.log('Parent LWC published END_INTERACTION to children');
	// 				}
	// 			}
	// 		})
	// 		.catch((error) => {
	// 			console.error('Error polling VoiceCall record:', error);
	// 		});
	// }

	// Proxy LMS Subscription Logic
	subscribeToProxyMessageChannel() {
		if (!this.proxyLMSSubscription) {
			console.log('Subscribing to Proxy LMS Channel...');
			this.proxyLMSSubscription = subscribe(
				this.messageContext,
				PROXY_CHANNEL,
				(message) => {
					console.log('Proxy LMS Message Received:', JSON.stringify(message));
					this.handlePlatformEvent(message);
				},
				{ scope: APPLICATION_SCOPE }
			);
		}
	}

	async handlePlatformEvent(response) {
		const payload = response.data.payload;
		console.log('Inside handle platform event 1');
		const eventRecordId = payload.Voice_Call__c;
		console.log('Inside handle platform event 2 ', eventRecordId + ' ' + this.recordId);
		if (
			eventRecordId &&
			(eventRecordId === this.recordId ||
				(this.recordId && eventRecordId.includes(this.recordId)) ||
				(this.recordId && this.recordId.includes(eventRecordId)))
		) {
			console.log('Event matches current recordId.');

			const callDisposition = payload.Call_Disposition__c;
			const interactionId = payload.InteractionId__c;
			console.log(
				'Inside handle platform event 3: callDisposition ' +
					callDisposition +
					' interactionid : ' +
					interactionId
			);
			if (callDisposition && callDisposition.toLowerCase() === 'completed') {
				console.log('Parent LWC Ending interaction (PLATFORM EVENT)');
				this.websocket.endInteraction(interactionId);

				if (this.websocket && this.websocket.websocket) {
					this.websocket.websocket.disconnect();
					console.log('Parent LWC: Websocket disconnected manually via direct access.');
				}

				const endMsg = {
					type: AgentAssistLabels.END_INTERACTION,
					data: {
						interactionId: interactionId,
						interactingId: interactionId
					}
				};
				publish(this.messageContext, VOICE_CALL_CHANNEL, endMsg);
				console.log('Parent LWC published END_INTERACTION to children PLATFORM EVENT');
			}
		}
	}

	subscribeToAgentAssistMessageChannel() {
		if (!this.agentAssistLMSSubscription) {
			console.log('Received a message in AgentAssistMessageChannel');
			this.agentAssistLMSSubscription = subscribe(
				this.messageContext,
				VOICE_CALL_CHANNEL,
				(event) => {
					console.log('VoiceCall Message arrived');
					this.handleAgentAssistMessage(event);
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
		console.log('agentAssistUtility Panel | handleAgentAssistMessage | ', message?.type, ' : ', message?.data);
		if (message?.type) {
			switch (message.type) {
				case AgentAssistLabels.SET_INTERACTION_CONTEXT:
					console.log('agentAssistUtility Panel | handleAgentAssistMessage | set_interaction_context');
					this.sendInteractionContext(message.data);
					break;
				case AgentAssistLabels.SET_CUSTOMER_CONTEXT:
					console.log('PLWC agentAssistUtility Panel | handleAgentAssistMessage | set_customer_context ');
					this.sendCustomerContext(message.data);
					break;
				case AgentAssistLabels.AGENT_FEEDBACK:
					console.log('agentAssistUtility Panel | handleAgentAssistMessage | agent_feedback');
					this.sendKnowledgeCardFeedback(message.data);
					break;
				case AgentAssistLabels.SET_INTERACTION_RESPONSE:
					console.log('agentAssistUtility Panel | handleAgentAssistMessage | SET_INTERACTION_RESPONSE');
					console.log('voiceCallId: ' + this.voiceCallId);
					console.log('message.data: ' + JSON.stringify(message.data));
					try {
						if (this.voiceCallId != null) {
							this.updateVoiceCallSessionId(message.data);
						}
					} catch (e) {
						console.log(
							'agentAssistUtilityPanel | handleAgentAssistMessage | setVoiceCallSessionId | error: ' + e
						);
						this.showError('Agent Assist has been disabled while we investigate an error: ' + e.message);
					}
					break;
				case AgentAssistLabels.ASK_ME_ANYTHING_QUERY:
					console.log('agentAssistUtility Panel | handleAgentAssistMessage | ask_me_anything_query');
					this.sendAMAQuery(message.data);
					break;
				case AgentAssistLabels.GET_INTERACTION_CONTEXT:
					//TODO Remove entire case - only used for testing/validation of LMS
					console.log(
						'agentAssistUtility Panel | handleAgentAssistMessage | get_interaction_context' + message.data
					);
					break;
				case AgentAssistLabels.ERROR:
					console.log('agentAssistUtility Panel | handleAgentAssistMessage | AGENT_FEEDBACK_ERROR');
					this.showError('Failed to connect, please log out and back in. ' + message.data);
					break;
				case AgentAssistLabels.UPDATE_INTERACTION:
					console.log('agentAssistUtility Panel | handleAgentAssistMessage | update_interaction');
					//Update CRM Interaction__c with Agent Assist ID in data
					this.agentAssistId = message.data?.agent_assist_session_id;
					if (
						this.recentInteractionData &&
						this.recentInteractionData?.Interaction_Record_ID__c != this.interactionRecordId
					) {
						console.log(
							'agentAssistUtility Panel | handleAgentAssistMessage | update_interaction1>>' +
								this.recentInteractionData
						);
						this.updateInteraction(this.recentInteractionData);
					}
					break;
				case AgentAssistLabels.END_INTERACTION:
					console.log('agentAssistUtility Panel | handleAgentAssistMessage | end_interaction');
					this.endInteraction(message.data.interactingId);
					break;
				case AgentAssistLabels.ANY_ACKNOWLEDGEMENT:
					console.log('agentAssistUtility Panel | handleAgentAssistMessage | acknowledgement');
					this.sendAcknowledgement(message.data.interactingId);
					break;
				default:
			}
		}
	}

	endInteraction(interactionId) {
		console.log('agentAssistUtilityPanel | endInteraction | data: ' + JSON.stringify(interactionId));
		try {
			if ('a' + interactionId == this.genesysInteractionId) {
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
				sessionStorage.removeItem('agentAssistVoiceCallId');
				sessionStorage.removeItem('agentAssistGenesysInteractionId');
				sessionStorage.removeItem('agentAssistInteractingMemberId');
				console.log('Parent LWC: Cleared all session storage keys.');
			}
		} catch (e) {
			console.log('agentAssistUtilityPanel | endInteraction | error: ' + e);
			this.showError('Agent Assist has been disabled while we investigate an error: ' + e.message);
		}
	}

	sendInteractionContext(interactionDetails) {
		console.log('agentAssistUtilityPanel | sendInteractionContext | data: ' + JSON.stringify(interactionDetails));
		try {
			this.voiceCallId = interactionDetails.Voice_Call__c;
			this.recordId = interactionDetails.Voice_Call__c;
			this.genesysInteractionId = 'a' + interactionDetails.InteractionId__c;
			sessionStorage.setItem('agentAssistGenesysInteractionId', this.genesysInteractionId);
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
					var data = {
						type: AgentAssistLabels.SET_CUSTOMER_CONTEXT,
						data: {
							interactionId: this.genesysInteractionId,
							sdrPersonId: result.sdrID,
							custId: result.custID,
							memberId: result.memberID
						}
					};
					console.log('setCustomerContextData:' + JSON.stringify(data));
					//sending this to ourselves so all other LWCs can also see this message
					publish(this.messageContext, VOICE_CALL_CHANNEL, data);
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

	async sendCustomerContext(data) {
		console.log(
			'PLW inside sendcustomer agentAssistUtilityPanel | sendCustomerContext | data: ' + JSON.stringify(data)
		);

		try {
			this.memberId = data?.memberId ? String(data.memberId) : null;
			this.custId = data?.custId ? data.custId : null;
			this.sdrPersonId = data?.sdrPersonId ? data.sdrPersonId : null;
			this.memberType = 'Member';
			this.interactingAboutMemberId = data.sdrPersonId;
			sessionStorage.setItem('agentAssistInteractingMemberId', this.interactingAboutMemberId);

			console.log('agentAssistUtilityPanel | sendCustomerContext | memberId: ' + this.memberId);
			console.log('agentAssistUtilityPanel | sendCustomerContext | memberType: ' + this.memberType);
			console.log(
				'agentAssistUtilityPanel | sendCustomerContext | genesysInteractionId: ' + this.genesysInteractionId
			);

			if (
				this.memberId != null &&
				this.memberType != null &&
				this.genesysInteractionId != null &&
				this.sdrPersonId != null
			) {
				this.websocket.emitEvent(
					AgentAssistLabels.SET_CUSTOMER_CONTEXT,
					AgentAssistEvents.set_customer_context(
						this.memberType,
						this.sdrPersonId,
						this.memberId,
						this.genesysInteractionId,
						true
					)
				);
			}
		} catch (e) {
			this.showError('Agent Assist has been disabled while we investigate an error: ' + e.message);
			console.log('agentAssistUtilityPanel | sendCustomerContext | error: ' + e);
		}
	}

	async updateVoiceCallSessionId(data) {
		console.log(
			'agentAssistUtilityPanel | UpdateVoiceCallSessionId | before runVoiceCallSessionFlow | Session ID:' +
				data.agent_assist_session_id
		);
		try {
			await runVoiceCallSessionFlow({ recordId: this.recordId, sessionId: data.agent_assist_session_id });
		} catch (error) {
			console.log(
				'agentAssistUtilityPanel | setVoiceCallSessionId | runVoiceCallSessionFlow | error: ' +
					JSON.stringify(error)
			);
		}

		console.log('agentAssistUtilityPanel | setVoiceCallSessionId |  Session ID:' + data.agent_assist_session_id);
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
		let isReply = data?.data?.card_metadata?.reply ? data?.data?.card_metadata?.reply : false;
		let reply_card_ids = [];

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
	}
	handleExpand() {
		setTimeout(() => {
			this.scrollToUtilityBarBottom();
		}, 300);
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
	async sendAcknowledgement(data) {
		console.log('agentAssistUtilityPanel | sendAcknowledgement | data: ' + JSON.stringify(data));
		console.log('agentAssistUtilityPanel | sendAcknowledgement | websocket.active ' + this.socketIo?.connected);
		console.log(
			'agentAssistUtilityPanel | sendAcknowledgement | genesysInteractionId: ' + this.genesysInteractionId
		);
		if (this.genesysInteractionId) {
			this.websocket.emitEvent(
				AgentAssistLabels.Any_acknowledgement,
				AgentAssistEvents.any_acknowledgement(this.genesysInteractionId)
			);
		}
	}
}
