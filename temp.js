import { LightningElement, track, wire } from 'lwc';
import { publish, subscribe, unsubscribe, APPLICATION_SCOPE, MessageContext } from 'lightning/messageService';
import hasIntercation from '@salesforce/customPermission/MarketPoint_Agent_Assist_Interaction360_Custom';
import VOICE_CALL_CHANNEL from '@salesforce/messageChannel/LWCToUiConnectorMessengerMs__c';
import LWCLogger from '@salesforce/apex/LoggerLWC.LogFromLWC';
import { AgentAssistLabels, AgentAssistEvents } from 'c/aa_UtilsHum';
import getVoiceCallDetails from '@salesforce/apex/AA_FetchRelatedRecordDetails.getVoiceCallDetails';

export default class Aa_interaction360 extends LightningElement {
	isExpanded = false;
	showInteraction = hasIntercation;
	agentAssistLMSSubscription = null;
	@track callHistories = [];
	@track errorMessage = null;
	@track statusMessage = '';
	customerInteractionId;

	//polling
	//pollingIntervalId = null;
	//pollingIntervalMs = 5000;
	STORAGE_KEY = 'AA_INTERACTION_360_CACHE';
	//polling

	@wire(MessageContext)
	messageContext;

	messageTimeout;
	connectedCallback() {
		console.log('message=> consturctor called 1');
		this.restoreInteractionFromStorage();
		this.subscribeToAgentAssistMessageChannel();
		console.log('message=> consturctor called 2');
		//this.startPolling();
	}

	disconnectedCallback() {
		console.log('Disconnected from webhook!! I360');
		unsubscribe(this.agentAssistLMSSubscription);
		this.agentAssistLMSSubscription = null;
		//this.stopPolling();
	}

	subscribeToAgentAssistMessageChannel() {
		try {
			if (!this.agentAssistLMSSubscription) {
				this.agentAssistLMSSubscription = subscribe(
					this.messageContext,
					VOICE_CALL_CHANNEL,
					(message) => {
						this.handleInitialization();
						console.log('Ui Connector message => ' + JSON.stringify(message, null, 2));
						this.handleAgentAssistMessage(message);
					},
					{
						scope: APPLICATION_SCOPE
					}
				);
				console.log('Connected LMS subscribe => ' + this.agentAssistLMSSubscription);
			} else {
				//console.log('Error => ' + JSON.stringify(error));
				this.showError('We are unable to retrieve Interaction360 at this time.');
			}
		} catch (error) {
			//console.log('Error => ' + JSON.stringify(error));
			this.showError('We are unable to retrieve Interaction360 at this time.');
		}
	}

	handleAgentAssistMessage(message) {
		console.log('message=> Received message type:', message.type);
		if (!this.showInteraction) return;
		if (message?.type) {
			switch (message.type) {
				case AgentAssistLabels.SET_INTERACTION_CONTEXT:
					if (this.customerInteractionId === message.data.InteractionId__c) return;
					this.customerInteractionId = message.data.InteractionId__c;
					//this.startPolling();
					console.log(
						'message=> 1 this.customerInteractionId => ' +
							this.customerInteractionId +
							' ' +
							JSON.stringify(message, null, 2)
					);
					break;
				case AgentAssistLabels.HISTORICAL_INTERACTION_SUMMARY:
					console.log(
						'message=> 2 Interaction : ' +
							this.customerInteractionId +
							'  ' +
							JSON.stringify(message, null, 2)
					);
					this.prepareIntHistoryDataLayout(message);
					break;
				case AgentAssistLabels.ERROR:
					this.showError('We are unable to retrieve Interaction360');
					break;
				case AgentAssistLabels.END_INTERACTION:
					console.log('END_INTERACTION called');
					console.log('message=> 3 ' + JSON.stringify(message, null, 2));
					this.clearInteraction(message);
					console.log('clear 5');
					//this.stopPolling();
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
		} else if (isSameDay(inputDate, yesterday)) {
			return 'YESTERDAY';
		} else {
			return inputDate.toLocaleDateString('en-US', {
				year: 'numeric',
				month: 'short',
				day: '2-digit'
			});
		}
	}

	prepareIntHistoryDataLayout(message) {
		console.log('message=>Inside prepare card1');
		try {
			const { content } = message.data.data;
			console.log('Inside prepare card new');
			// throw new Error('Card not prepared');
			const formattedData = content.map(({ header, body }, index) => {
				const dateRaw = header.date || '';
				const title = header.summary_title || '';
				const summary = body?.summary?.text || '';
				//const dateLabel = formatInteractionDate(dateRaw);
				const dateLabel = this.formatInteractionDate(dateRaw);

				// Extract actions taken
				const actionsText = body?.actions_taken?.[0]?.text || '';
				const actionsList = actionsText ? actionsText.split('\n').filter((item) => item.trim() !== '') : [];
				const hasActions = actionsList.length > 0;

				// Extract outcomes
				const outcomeText = body?.outcome?.[0]?.text || '';
				const outcomeList = outcomeText ? outcomeText.split('\n').filter((item) => item.trim() !== '') : [];
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

			sessionStorage.setItem(
				this.STORAGE_KEY,
				JSON.stringify({
					interactionId: this.customerInteractionId,
					callHistories: formattedData
				})
			);
			if (this.callHistories != '') {
				this.errorMessage = '';
				this.updateStatusMessage(false, false);
				this.isExpanded = true;
			}
		} catch (error) {
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

	handleButtonClick() {
		// Your JS method logic here
		console.log('Button was clicked!');
		this.callHistories = [];
		this.customerInteractionId = null;
		//this.stopPolling();

		//  Clear persisted data

		sessionStorage.removeItem(this.STORAGE_KEY);
		console.log('clear button click clear2');
		// Add additional actions as needed
	}
	clearInteraction(message) {
		const endedId = message?.data?.interactionId;
		//||
		// message?.data?.InteractionId__c;
		console.log('END_INTERACTION clear1');
		console.log('customerInteractionId: ' + this.customerInteractionId + ' endedId: ' + endedId);

		if (this.customerInteractionId !== endedId) return;

		this.callHistories = [];
		this.customerInteractionId = null;
		//this.stopPolling();

		//  Clear persisted data
		console.log('END_INTERACTION clear2');
		sessionStorage.removeItem(this.STORAGE_KEY);
		console.log('END_INTERACTION clear3');

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
		if (this.callHistories == '') {
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
	/*
    startPolling() {
        if (this.pollingIntervalId) return;

        console.log('Interaction360: Polling started');
        this.pollingIntervalId = setInterval(() => {
            this.pollInteraction();
        }, this.pollingIntervalMs);
    }

    stopPolling() {
        if (this.pollingIntervalId) {
            clearInterval(this.pollingIntervalId);
            this.pollingIntervalId = null;
            console.log('Interaction360: Polling stopped');
        }
    }


    async pollInteraction() {
        if (!this.customerInteractionId) return;

        try {
            const voiceCall = await getVoiceCallDetails({
                voiceCallId: this.customerInteractionId
            });

            if (!voiceCall) return;

            // Stop polling when interaction ends
            if (voiceCall.Call_Outcome__c && voiceCall.Call_Reason__c) {
                this.stopPolling();
                return;
            }

            // Optional: refresh UI if LMS missed updates
            if (!this.callHistories || this.callHistories.length === 0) {
                this.updateStatusMessage(false, true);
            }

        } catch (error) {
            console.error('Polling error', error);
        }
    }*/

	restoreInteractionFromStorage() {
		console.log('Message=> restore1');
		try {
			console.log('Message=> restore2');
			const cached = sessionStorage.getItem(this.STORAGE_KEY);
			if (!cached) return;
			console.log('Message=> restore2');
			const parsed = JSON.parse(cached);

			this.customerInteractionId = parsed.interactionId;
			console.log('Message=> restore3 Interactionid: ' + this.customerInteractionId);
			this.callHistories = parsed.callHistories;
			this.isExpanded = true;
			this.errorMessage = null;
			this.statusMessage = '';

			// Resume polling for lifecycle
			// this.startPolling();

			console.log('Interaction360 restored from storage = customerInteractionId: ' + this.customerInteractionId);
		} catch (e) {
			console.error('Failed to restore Interaction360', e);
			sessionStorage.removeItem(this.STORAGE_KEY);
		}
	}
}
