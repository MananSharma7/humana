import { LightningElement, track, wire, api } from 'lwc';
import { subscribe, unsubscribe, APPLICATION_SCOPE, MessageContext } from 'lightning/messageService';
import hasIntercation from '@salesforce/customPermission/MarketPoint_Agent_Assist_Interaction360_Custom';
import VOICE_CALL_CHANNEL from '@salesforce/messageChannel/LWCToUiConnectorMessengerMs__c';
import LWCLogger from '@salesforce/apex/LoggerLWC.LogFromLWC';
import { AgentAssistLabels, AgentAssistSplunkLoggingUtils } from 'c/aa_UtilsHum';
import isFeatureEnabled from '@salesforce/apex/AA_Utility.isFeatureEnabled';
import userId from '@salesforce/user/Id';
import LWCSplunkLogger from '@salesforce/apex/AA_LWCSplunkLogging.LWCSplunkLogging';

export default class Aa_interaction360 extends LightningElement {
	@api recordId;
	isExpanded = false;
	showInteraction = hasIntercation;
	agentAssistLMSSubscription = null;
	@track callHistories = [];
	@track errorMessage = null;
	@track statusMessage = '';
	customerInteractionId;
	isI360Enabled = false;

	i360Logged = false;

	@wire(MessageContext)
	messageContext;
	connectedCallback() {
		this.subscribeToAgentAssistMessageChannel();
		this.handleStateLoad();
		this.handleInitialization();
	}

	handleStateLoad() {
		try {
			const cachedHistories = localStorage.getItem('aa_interaction_history_cache');
			const cachedInteractionId = localStorage.getItem('aa_interaction_customer_id');

			console.log('Interaction360 handleStateLoad: Cached Histories found: ', !!cachedHistories);
			console.log('Interaction360 handleStateLoad: Cached Customer ID: ', cachedInteractionId);

			if (cachedHistories) {
				this.callHistories = JSON.parse(cachedHistories);
				if (!Array.isArray(this.callHistories)) {
					this.callHistories = [];
				}
				if (this.callHistories.length > 0) {
					this.errorMessage = '';
					this.updateStatusMessage(false, false);
				}
				console.log(
					'Interaction360 handleStateLoad: Restored ' + this.callHistories.length + ' history items.'
				);
			}
			if (cachedInteractionId) {
				this.customerInteractionId = cachedInteractionId;
				console.log(
					'Interaction360 handleStateLoad: Restored Customer Interaction ID: ' + this.customerInteractionId
				);
			}

			const cachedExpanded = localStorage.getItem('aa_interaction_is_expanded');

			if (cachedExpanded !== null) {
				this.isExpanded = JSON.parse(cachedExpanded);
			}

		} catch (e) {
			console.error('Error loading interaction state', e);
		}
	}

	saveState() {
		try {
			console.log(
				'Interaction360 saveState: Saving ' +
				this.callHistories.length +
				' items. CustomerID: ' +
				this.customerInteractionId
			);
			localStorage.setItem('aa_interaction_history_cache', JSON.stringify(this.callHistories));
			if (this.customerInteractionId) {
				localStorage.setItem('aa_interaction_customer_id', this.customerInteractionId);
			}
			localStorage.setItem('aa_interaction_is_expanded', JSON.stringify(this.isExpanded));
		} catch (e) {
			console.error('Error saving interaction state', e);
		}
	}

	disconnectedCallback() {
		console.log('Disconnected from webhook!!');
		if (this.agentAssistLMSSubscription) {
			unsubscribe(this.agentAssistLMSSubscription);
			this.agentAssistLMSSubscription = null;
		}
	}

	subscribeToAgentAssistMessageChannel() {
		try {
			if (!this.agentAssistLMSSubscription) {
				this.agentAssistLMSSubscription = subscribe(
					this.messageContext,
					VOICE_CALL_CHANNEL,
					(message) => {
						this.handleInitialization();
						this.handleAgentAssistMessage(message);
					},
					{
						scope: APPLICATION_SCOPE
					}
				);
			}
		} catch (error) {
			console.error('Interaction360 Error:', error);
			this.showError('We are unable to retrieve Interaction360 at this time.');
		}
	}

	handleAgentAssistMessage(message) {
		console.log('Interaction360 subscribeToAgentAssistMessageChannel: Record ID = ' + this.recordId);
		console.log(
			'Interaction360 subscribeToAgentAssistMessageChannel: Message = ' + JSON.stringify(message, null, 2)
		);
		if (!this.showInteraction) return;
		if (message?.type) {
			switch (message.type) {
				case AgentAssistLabels.SET_INTERACTION_CONTEXT:
					this.checkAndSetInteractionContext(message.VoiceCallData.Interaction_Id__c);
					break;
				case AgentAssistLabels.HISTORICAL_INTERACTION_SUMMARY:
					this.prepareIntHistoryDataLayout(message);
					this.i360Logged = true;
					break;
				case AgentAssistLabels.ERROR:
					this.showError('We are unable to retrieve Interaction360');
					break;
				case AgentAssistLabels.END_INTERACTION:
					this.clearInteraction(message);
					break;
				default:
					break;
			}
		}
	}

	formatInteractionDate(dateString) {
		if (!dateString) return 'Unknown Date';

		// Extract just the date part from the string
		const [year, month, day] = dateString.split('T')[0].split('-').map(Number);

		// Create a date object using only the date part (no time zone shift)
		const inputDate = new Date(year, month - 1, day);

		const today = new Date();
		const yesterday = new Date();
		yesterday.setDate(today.getDate() - 1);

		const isSameDay = (d1, d2) =>
			d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();

		if (isSameDay(inputDate, today)) {
			return 'TODAY';
		}
		if (isSameDay(inputDate, yesterday)) {
			return 'YESTERDAY';
		}
		return inputDate.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: '2-digit'
		});
	}

	prepareIntHistoryDataLayout(message) {
		try {
			const messageData = message?.data?.data;
			if (!messageData || !Array.isArray(messageData.content)) {
				console.warn('Invalid interaction history data structure', JSON.stringify(message));
				return;
			}
			const { content } = messageData;

			const formattedData = content.map(({ header, body }, index) => {
				const dateRaw = header.date || '';
				const title = header.summary_title || '';
				const summary = body?.summary?.text || '';

				const dateLabel = this.formatInteractionDate(dateRaw);

				const actionsList = (body?.actions_taken || [])
					.flatMap((item) => (item.text || '').split('\n'))
					.map((text) => text.trim())
					.filter((text) => text !== '');
				const hasActions = actionsList.length > 0;

				// Extract outcomes (handle array of objects from updated schema)
				const outcomeList = (body?.outcome || [])
					.flatMap((item) => (item.text || '').split('\n'))
					.map((text) => text.trim())
					.filter((text) => text !== '');
				const hasOutcome = outcomeList.length > 0;

				return {
					id: index,
					date: dateLabel,
					title: typeof title === 'object' ? title.text || '' : title,
					summary: typeof title === 'object' ? title.description || '' : summary,
					details: [
						{
							title: 'Action Taken',
							hasData: hasActions,
							list: actionsList
						},
						{
							title: 'Outcomes',
							hasData: hasOutcome,
							list: outcomeList
						}
					]
				};
			});
			this.callHistories = formattedData;
			this.saveState();
			if (this.callHistories.length > 0) {
				this.errorMessage = '';
				this.updateStatusMessage(false, false);
				this.isExpanded = true;
			}
		} catch (error) {
			console.error('Interaction360 History Error:', error);
			this.showError(
				'Customer interaction history could not be loaded. Please refresh or contact support if the issue persists.'
			);
		}
	}

	updateStatusMessage(noCall, awaitingNewMessage) {
		if (noCall) {
			this.statusMessage = 'No previous interactions found';
			this.isExpanded = true;
		} else if (awaitingNewMessage) {
			this.statusMessage = 'Awaiting new interaction';
			this.isExpanded = true;
		} else {
			this.statusMessage = '';
		}
	}


	checkAndSetInteractionContext(newInteractionId) {
		if (newInteractionId && this.customerInteractionId && this.customerInteractionId !== newInteractionId) {

			this.callHistories = [];
			this.errorMessage = '';
			localStorage.removeItem('aa_interaction_history_cache');

		}
		this.customerInteractionId = newInteractionId;
		this.saveState();
	}

	clearInteraction(message) {
		console.log(
			'Interaction360 clearInteraction: Received END_INTERACTION. Current CustomerID: ' +
			this.customerInteractionId
		);

		if (this.customerInteractionId && message?.VoiceCallData && this.customerInteractionId !== message.VoiceCallData.Interaction_Id__c) {
			console.log(
				'Interaction360 clearInteraction: Mismatch in Customer Interaction ID, SKIPPING CLEAR. ' +
				this.customerInteractionId +
				' vs ' +
				message.VoiceCallData.Interaction_Id__c
			);
			return;
		}
		console.log('Interaction360 clearInteraction: CLEARING DATA NOW.');
		this.callHistories = [];
		this.customerInteractionId = null;

		if (!this.i360Logged) {
			let splunkJsonString = JSON.stringify(AgentAssistSplunkLoggingUtils.splunk_outer_context(
				'aa_interaction360.js',
				localStorage.getItem('agentAssistGenesysInteractionId'),
				userId,
				'INFO',
				AgentAssistSplunkLoggingUtils.splunk_inner_context(
					localStorage.getItem('agentAssistVoiceCallId')
				),
				'Interaction360NoDataToDisplay'
			));
			LWCSplunkLogger({ jsonString: splunkJsonString, eventName: 'AgentAssistUsageEvent' });
		}

		localStorage.removeItem('aa_interaction_history_cache');
		localStorage.removeItem('aa_interaction_customer_id');
		localStorage.removeItem('aa_interaction_is_expanded');
		this.saveState();
		this.updateStatusMessage(false, true);
	}

	showError(message) {
		this.errorMessage = message;
		this.isExpanded = true;
		if (this.errorMessage) {
			LWCLogger({ messageText: this.errorMessage, source: 'Interaction360 LWC comp', level: 'error' });
		}
	}
	handleInitialization() {
		this.errorMessage = '';
		if (this.callHistories.length === 0) {
			this.updateStatusMessage(true, false);
		}

	}
	get error() {
		return this.errorMessage ? true : false;
	}

	get callHistoryLabel() {
		return `Interaction 360 (${this.callHistories.length})`;
	}

	get hasHistory() {
		return this.callHistories.length > 0;
	}

	get tabClass() {
		return this.isExpanded ? 'slds-tabs_default__item slds-is-active' : 'slds-tabs_default__item';
	}

	handleTabClick(event) {
		event.preventDefault();
		this.isExpanded = !this.isExpanded;
		this.saveState();
	}

	toggleExpanded(event) {
		event.preventDefault();
		this.isExpanded = !this.isExpanded;
		this.saveState();
		if (this.isExpanded) {
			event.target.iconName = 'utility:minimize_window';
			event.target.alternativeText = 'minimize_window';
			event.target.ariaExpanded = 'true';
			event.target.title = 'minimize_window';
			event.target.style.translate = '50% -70%';
			// Dispatch a custom event to notify the parent to scroll interaction360
			this.dispatchEvent(new CustomEvent('expand', { bubbles: true, composed: true }));
		} else {
			event.target.iconName = 'utility:expand_alt';
			event.target.alternativeText = 'expand_alt';
			event.target.ariaExpanded = 'false';
			event.target.title = 'expand_alt';
			event.target.style.translate = '50% -50%';
		}
	}

	toggleSummaryExpanded(event) {
		const number = Number(event.currentTarget.dataset.id);

		if (isNaN(number)) return;

		this.callHistories[number].isExpanded = !this.callHistories[number].isExpanded;

		let splunkJsonString = JSON.stringify(AgentAssistSplunkLoggingUtils.splunk_outer_context(
			'aa_interaction360.js',
			localStorage.getItem('agentAssistGenesysInteractionId'),
			userId,
			'INFO',
			AgentAssistSplunkLoggingUtils.splunk_inner_context(
				localStorage.getItem('agentAssistVoiceCallId')
			),
			'Interaction360ChevronClicked'
		));
		LWCSplunkLogger({ jsonString: splunkJsonString, eventName: 'AgentAssistUsageEvent' });
	}

	@wire(isFeatureEnabled, { featureName: 'MP_Interaction_360' })
	wiredFeatureEnabled({ error, data }) {
		if (data) {
			this.isI360Enabled = data;
		} else if (error) {
			console.error(error);
		}
	}

	get showI360() {
		return this.isI360Enabled && this.showInteraction;
	}

	handleCopyInteraction360() {
		let splunkJsonString = JSON.stringify(AgentAssistSplunkLoggingUtils.splunk_outer_context(
			'aa_interaction360.js',
			localStorage.getItem('agentAssistGenesysInteractionId'),
			userId,
			'INFO',
			AgentAssistSplunkLoggingUtils.splunk_inner_context(
				localStorage.getItem('agentAssistVoiceCallId')
			),
			'Interaction360_Copied'
		));
		LWCSplunkLogger({ jsonString: splunkJsonString, eventName: 'AgentAssistUsageEvent' });
	}

}
