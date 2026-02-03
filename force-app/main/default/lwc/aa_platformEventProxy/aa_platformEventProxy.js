import { LightningElement, wire } from 'lwc';
import { publish, MessageContext } from 'lightning/messageService';
import PUB_CHANNEL from '@salesforce/messageChannel/AgentAssistLWCMessengerMs__c';
import { subscribe as empSubscribe, unsubscribe as empUnsubscribe, onError as empOnError } from 'lightning/empApi';

export default class Aa_platformEventProxy extends LightningElement {
	subscription = {};
	CHANNEL_NAME = '/event/VoiceCall__e';
	eventQueue = [];

	@wire(MessageContext)
	messageContext;

	connectedCallback() {
		console.log('Proxy Component Initialized');
		this.handleSubscribe();
		this.registerErrorListener();
	}

	disconnectedCallback() {
		this.handleUnsubscribe();
	}

	handleSubscribe() {
		const messageCallback = (response) => {
			console.log('Proxy: New Platform Event Received: ', JSON.stringify(response));
			publish(this.messageContext, PUB_CHANNEL, response);
			console.log('Proxy: Published event to LMS');
		};

		empSubscribe(this.CHANNEL_NAME, -1, messageCallback).then((response) => {
			console.log('Proxy: Successfully subscribed to channel: ', JSON.stringify(response.channel));
			this.subscription = response;
		});
	}

	registerErrorListener() {
		empOnError((error) => {
			console.error('Proxy: Received error from server: ', JSON.stringify(error));
		});
	}

	handleUnsubscribe() {
		if (this.subscription && this.subscription.subscription) {
			empUnsubscribe(this.subscription, (response) => {
				console.log('Proxy: unsubscribe() response: ', JSON.stringify(response));
				this.subscription = null;
			});
		} else {
			console.log('Proxy: No active subscription to unsubscribe.');
		}
	}
}
