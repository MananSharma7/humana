import { LightningElement, track, wire, api } from 'lwc';
import { subscribe, unsubscribe, APPLICATION_SCOPE, MessageContext } from 'lightning/messageService';
import hasIntercation from '@salesforce/customPermission/MarketPoint_Agent_Assist_Interaction360_Custom';
import VOICE_CALL_CHANNEL from '@salesforce/messageChannel/LWCToUiConnectorMessengerMs__c';
import LWCLogger from '@salesforce/apex/LoggerLWC.LogFromLWC';
import { AgentAssistLabels } from 'c/aa_UtilsHum';
import isFeatureEnabled from '@salesforce/apex/AA_Utility.isFeatureEnabled';

export default class Aa_interaction360 extends LightningElement {
	@api recordId;
	pollingInterval = null;
	genesysInteractionId;
	isExpanded = false;
	showInteraction = hasIntercation;
	agentAssistLMSSubscription = null;
	@track callHistories = [];
	@track errorMessage = null;
	@track statusMessage = '';
	customerInteractionId;
	isI360Enabled = false;

	@wire(MessageContext)
	messageContext;

	messageTimeout;
	connectedCallback() {
		this.subscribeToAgentAssistMessageChannel();
		this.handleStateLoad();
	}

	handleStateLoad() {
		try {
			// Check if page was reloaded (hard refresh)
			const navEntries = performance.getEntriesByType('navigation');
			const isReload = navEntries.length > 0 && navEntries[0].type === 'reload';
			console.log('Interaction360 handleStateLoad: isReload = ' + isReload);

			// REMOVED CLEAR ON RELOAD

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
					this.isExpanded = true;
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
						//console.log('Ui Connector message => ' + JSON.stringify(message, null, 2));
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
					this.checkAndSetInteractionContext(message.data.InteractionId__c);
					break;
				case AgentAssistLabels.HISTORICAL_INTERACTION_SUMMARY:
					this.prepareIntHistoryDataLayout(message);
					break;
				case AgentAssistLabels.ERROR:
					this.showError('We are unable to retrieve Interaction360');
					break;
				case AgentAssistLabels.END_INTERACTION:
					console.log('Interaction360 END_INTERACTION received. Data:', JSON.stringify(message.data));
					this.clearInteraction(message);
					break;
				case 'live_summary':
					//this.prepareLiveSummaryLayout(message.data);
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
		console.log('Inside prepare card1');
		try {
			const messageData = message?.data?.data;
			if (!messageData || !Array.isArray(messageData.content)) {
				console.warn('Invalid interaction history data structure', JSON.stringify(message));
				return;
			}
			const { content } = messageData;
			console.log('Inside prepare card new');
			// throw new Error('Card not prepared');
			const formattedData = content.map(({ header, body }, index) => {
				const dateRaw = header.date || '';
				const title = header.summary_title || '';
				const summary = body?.summary?.text || '';
				//const dateLabel = formatInteractionDate(dateRaw);
				const dateLabel = this.formatInteractionDate(dateRaw);

				// Extract actions taken (handle array of objects from updated schema)
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
			this.isExpanded = false;
		}
	}

	checkAndSetInteractionContext(newInteractionId) {
		if (newInteractionId && this.customerInteractionId && this.customerInteractionId !== newInteractionId) {
			console.log(
				'Interaction360 checkAndSetInteractionContext: New Interaction ID detected. Clearing old data.'
			);
			this.callHistories = [];
			this.errorMessage = '';
			localStorage.removeItem('aa_interaction_history_cache');
			// We update the ID immediately
		}
		this.customerInteractionId = newInteractionId;
		this.saveState();
	}

	clearInteraction(message) {
		console.log(
			'Interaction360 clearInteraction: Received END_INTERACTION. Current CustomerID: ' +
				this.customerInteractionId
		);
		// Logic to clear data on end interaction has been restored.
		if (this.customerInteractionId && this.customerInteractionId !== message.data.interactionId) {
			console.log(
				'Interaction360 clearInteraction: Mismatch in Customer Interaction ID, SKIPPING CLEAR. ' +
					this.customerInteractionId +
					' vs ' +
					message.data.interactionId
			);
			return;
		}
		console.log('Interaction360 clearInteraction: CLEARING DATA NOW.');
		this.callHistories = [];
		this.customerInteractionId = null; // Clear ID

		localStorage.removeItem('aa_interaction_history_cache');
		localStorage.removeItem('aa_interaction_customer_id');
		this.saveState();
		this.updateStatusMessage(false, true);
	}

	showError(message) {
		this.errorMessage = message;
		this.isExpanded = true;
		LWCLogger({ messageText: this.errorMessage, source: 'Interaction360 LWC comp', level: 'error' });
	}
	handleInitialization() {
		this.errorMessage = '';
		this.isExpanded = true;
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
	}

	toggleExpanded(event) {
		event.preventDefault();
		this.isExpanded = !this.isExpanded;

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
}
