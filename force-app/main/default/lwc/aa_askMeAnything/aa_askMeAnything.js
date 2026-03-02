import { LightningElement, api, wire, track } from 'lwc';
import { publish, MessageContext } from 'lightning/messageService';
import AGENTASSISTLMS from '@salesforce/messageChannel/LWCToUiConnectorMessengerMs__c';
import { AgentAssistLabels, AgentAssistEvents } from 'c/aa_UtilsHum';
import LWCLogger from '@salesforce/apex/LoggerLWC.LogFromLWC';

export default class Aa_askMeAnything extends LightningElement {
	message = '';
	lstUUIDs = [];
	@track knowledgeCards = [];
	_replyCard = {};
	@api isLoading;
	errorMessage;
	subcription;
	voiceErrorSubscription;
	replyMessage = '';

	@wire(MessageContext)
	messageContext;

	@api
	get replyCard() {
		return this._replyCard;
	}
	set replyCard(value) {
		this._replyCard = value || {};
		this.replyMessage = this._replyCard?.header ?? '';
	}

	get isActive() {
		return Boolean(this.message);
	}

	handleInputChange(event) {
		this.message = event.target.value;
	}

	handleReplyInput(event) {
		this.replyMessage = event.target.value;
	}

	removeReplyCard() {
		this._replyCard = {};
		this.replyMessage = '';
		this.dispatchEvent(new CustomEvent('replyclosed'));
	}

	handleKeyDown(event) {
		if (event.key === 'Enter') {
			event.preventDefault();
			this.askQuery();
		}
	}

	generateUUID() {
		let suuid = window.crypto.randomUUID();
		if (this.lstUUIDs.indexOf(suuid) === -1) this.lstUUIDs.push(suuid);
		else suuid = this.genrateUUID();
		return suuid;
	}
	get error() {
		return this.errorMessage ? true : false;
	}

	askQuery() {
		try {
			console.log('inside - askQuery');
			const textarea = this.template.querySelector('textarea.main-input');
			if (textarea) textarea.value = '';
			let text = this.message;
			if (!text) return;
			this.message = '';

			// generate event payload
			let reply = false;
			let replycardids = [];

			if (this.replyCard && this.replyCard.card_id) {
				reply = true;
				replycardids.push(this.replyCard.card_id);
			}

			console.log('askQuery: reply boolean:', reply);
			console.log('askQuery: replycardids:', JSON.stringify(replycardids));

			let uuid = this.generateUUID();
			let data = AgentAssistEvents.ask_me_anything_query(text, uuid, reply, replycardids);

			LWCLogger({
				messageText:
					'AMA Card surfaced; Interaction ID: ' +
					data?.data?.card_metadata?.interaction_id +
					'; Agent Assist Session ID: ' +
					localStorage.getItem('agentAssistVoiceCallId') +
					'; AMA Card Title: ' +
					data?.data?.content?.query?.text +
					'; AMA Query ID: ' +
					data?.data?.card_metadata?.query_id,
				source: 'askQuery | Ask Me Anything',
				level: 'info'
			});

			console.log('Data => ' + JSON.stringify(data, null, 2));

			publish(
				this.messageContext,
				AGENTASSISTLMS,
				AgentAssistEvents.aa_lms_event(AgentAssistLabels.ASK_ME_ANYTHING_QUERY, data)
			);
			this.replyMessage = '';
			this._replyCard = {};
		} catch (err) {
			console.log(err);
			this.showError('We are unable to retrieve AMA suggestions at this time');
		}
	}

	renderedCallback() {
		console.log(JSON.stringify(this._replyCard));
	}

	showError(message) {
		this.errorMessage = message;
	}
}
