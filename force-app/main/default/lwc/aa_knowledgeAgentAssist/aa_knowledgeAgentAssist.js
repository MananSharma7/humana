import { LightningElement, track, wire } from 'lwc';
import hasknowledge from '@salesforce/customPermission/MarketPoint_Agent_Assist_Knowledge_Card_Custom';
import hasAMAPermission from '@salesforce/customPermission/AA_AskMeAnything';
import isFeatureEnabled from '@salesforce/apex/AA_Utility.isFeatureEnabled';
import { subscribe, unsubscribe, APPLICATION_SCOPE, MessageContext } from 'lightning/messageService';
import VOICE_CALL_CHANNEL from '@salesforce/messageChannel/LWCToUiConnectorMessengerMs__c';
import { AgentAssistLabels } from 'c/aa_UtilsHum';

export default class Aa_knowledgeAgentAssist extends LightningElement {
	showknowledge = hasknowledge;
	showAMA = hasAMAPermission;
	showAgentAssist = true;
	@track replyCard = {};
	isJumpInPresentVisible = false;
	@track isLoading = false;
	isFeatureEnabled = false;
	isKnowledgeCardEnabled = false;
	isAMAEnabled = false;

	@track orchestrationStatus = '';
	@track isOrchestrating = false;
	subscription = null;

	@wire(MessageContext)
	messageContext;

	connectedCallback() {
		this.subscribeToMessageChannel();
		this.handleStateLoad();
	}

	disconnectedCallback() {
		if (this.subscription) {
			unsubscribe(this.subscription);
			this.subscription = null;
		}
	}

	subscribeToMessageChannel() {
		if (!this.subscription) {
			this.subscription = subscribe(
				this.messageContext,
				VOICE_CALL_CHANNEL,
				(message) => this.handleMessage(message),
				{ scope: APPLICATION_SCOPE }
			);
		}
	}

	handleStateLoad() {
		try {
			const cachedOrchestrationStatus = localStorage.getItem('aa_orchestration_status');
			const cachedIsOrchestrating = localStorage.getItem('aa_is_orchestrating');

			if (cachedIsOrchestrating === 'true') {
				this.isOrchestrating = true;
				this.orchestrationStatus = cachedOrchestrationStatus || '';
			} else {
				this.isOrchestrating = false;
				this.orchestrationStatus = '';
			}
		} catch (e) {
			console.error('Error loading state', e);
		}
	}

	saveState() {
		try {
			localStorage.setItem('aa_orchestration_status', this.orchestrationStatus || '');
			localStorage.setItem('aa_is_orchestrating', this.isOrchestrating);
		} catch (e) {
			console.error('Error saving state', e);
		}
	}

	handleMessage(message) {
		if (message && message.type === AgentAssistLabels.Activity_Status_Indicator) {
			const data = message.data?.data || message.data;
			let statusText = '';
			if (data && data.message) {
				statusText = data.message;
			} else if (data && data.content && data.content.text) {
				statusText = data.content.text;
			} else if (data && data.status) {
				statusText = data.status;
			}

			if (statusText) {
				this.orchestrationStatus = statusText;
				this.isOrchestrating = true;
			} else {
				// If no status text is provided, we can hide it or clear it
				this.isOrchestrating = false;
				this.orchestrationStatus = '';
			}
			this.saveState();
		} else if (message && message.type === AgentAssistLabels.END_INTERACTION) {
			this.isOrchestrating = false;
			this.orchestrationStatus = '';
			this.saveState();
		}
	}

	handleReplyCard(event) {
		this.replyCard = event.detail;
	}

	handleScroll(event) {
		const target = event.target;
		const scrollTop = target.scrollTop;
		const clientHeight = target.clientHeight;
		const scrollHeight = target.scrollHeight;

		if (scrollHeight - (scrollTop + clientHeight) <= 50) {
			this.isJumpInPresentVisible = false;
		} else {
			this.isJumpInPresentVisible = true;
		}
	}

	handleBottom() {
		this.refs.container.scrollTo({
			top: this.refs.container.scrollHeight,
			behavior: 'smooth'
		});
	}

	handleLoading(event) {
		console.log('EVENT=> ' + event);
		this.isLoading = event.detail.isLoading;
	}

	handleReplyClosed() {
		this.replyCard = {};
	}

	@wire(isFeatureEnabled, { featureName: 'MP_AskMeAnything' })
	wiredAMAEnabled({ error, data }) {
		if (data) {
			this.isAMAEnabled = data;
		} else if (error) {
			console.error(error);
		}
	}

	@wire(isFeatureEnabled, { featureName: 'MP_Knowledge_Cards' })
	wiredKCEnabled({ error, data }) {
		if (data) {
			this.isKnowledgeCardEnabled = data;
		} else if (error) {
			console.error(error);
		}
	}

	get isKnowledgeCards() {
		return this.isKnowledgeCardEnabled && this.showknowledge;
	}

	get isShowAMA() {
		return this.isAMAEnabled && this.showAMA;
	}
}
