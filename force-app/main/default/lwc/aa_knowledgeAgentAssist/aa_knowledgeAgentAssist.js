import { LightningElement, track, wire } from 'lwc';
import hasknowledge from '@salesforce/customPermission/MarketPoint_Agent_Assist_Knowledge_Card_Custom';
import hasAMAPermission from '@salesforce/customPermission/AA_AskMeAnything';
import isFeatureEnabled from '@salesforce/apex/AA_Utility.isFeatureEnabled';

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
