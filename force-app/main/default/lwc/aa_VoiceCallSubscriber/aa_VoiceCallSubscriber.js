import { LightningElement, wire } from 'lwc';
import { subscribe, unsubscribe, onError } from 'lightning/empApi';
import { publish, MessageContext } from 'lightning/messageService';
import VOICE_CALL_CHANNEL from '@salesforce/messageChannel/LWCToUiConnectorMessengerMs__c';

export default class VoiceCallSubscriber extends LightningElement {
    
    channelName = '/event/VoiceCall__e';
    subscription = {};
    eventType = 'InteractionStart';

    @wire(MessageContext)
    messageContext;

    connectedCallback() {
        console.log("voiceCallSubReached");
        this.subscribeToVoicecallEvent();

        // const messageCallback = (event) => {
        //     this.handleEvent(event);
        // };

        // subscribe(this.channelName, -1, messageCallback).then(response => {
        //     console.log('Subscribed to: ', response.channel);
        //     this.subscription = response;
        // });

        // onError(error => {
        //     console.error('EMP API error:', JSON.stringify(error));
        // });
    }

    async subscribeToVoicecallEvent() {
        // Callback invoked whenever a new event message is received
        const messageCallback = (response) => {
            console.log('New message received: ', JSON.stringify(response));
            //interactionId = response.data.payload.InteractionId__c;
            //this.publishInteractionContext(response);
            //emitEvent(websocket, AgentAssistLabels.SET_INTERACTION_CONTEXT, AgentAssistEvents.set_interaction_context(interactionId, "123456543", userNetworkIdSet, userEmailSet, userSalesforceIdSet));
            // Response contains the payload of the new message received
        };

        // Invoke subscribe method of empApi. Pass reference to messageCallback
        subscribe('/event/VoiceCall__e', -1, messageCallback).then((response) => {
            // Response contains the subscription information on subscribe call
            console.log(
                'Subscription request sent to: ',
                JSON.stringify(response.channel)
            );
        });
        // onError(error => {
        //     console.error('EMP API error:', error);
        // });
    }

    handleEvent(event) {
        const payload = event.data.payload;
        console.log("Platform Event payload:", JSON.stringify(payload));
        console.log("arrived at voice channel LSM");

        // Publish to Lightning Message Channel
        publish(this.messageContext, VOICE_CALL_CHANNEL, {
            eventType: this.eventType,
            interactionId: payload.InteractionId__c,
            voiceCallId: payload.Voice_Call__c
        });
    }

    disconnectedCallback() {
        if (this.subscription && this.subscription.id) {
            unsubscribe(this.subscription, response => {
                console.log('Unsubscribed from channel: ', response.channel);
            });
        }
    }
}