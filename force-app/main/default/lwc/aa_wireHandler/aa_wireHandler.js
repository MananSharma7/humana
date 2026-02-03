import { LightningElement, wire, track, api} from 'lwc';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';
import VOICE_CALL_CHANNEL from '@salesforce/messageChannel/LWCToUiConnectorMessengerMs__c';

export default class aa_wireHandler extends LightningElement {

    @api recordId;
    @track relatedRecordId;
    @track callReason;
    @track callOutcome;
    @track websocket;

        //Wire that gets all updates to voicecalls
        @wire(getRecord, { recordId: "$recordId", fields: ["VoiceCall.RelatedRecordId", "VoiceCall.Interaction_Id__c","VoiceCall.DisconnectReason","VoiceCall.Call_Reason__c","VoiceCall.Call_Outcome__c"]})
        wiredRecord({error, data}) {
            if (data) {
                try {
                    console.log("VOICE CALL RECORD: "+ JSON.stringify(data));
                    if(this.relatedRecordId != getFieldValue(data, "VoiceCall.RelatedRecordId")){
                        this.relatedRecordId = getFieldValue(data, "VoiceCall.RelatedRecordId");
                        console.log("related record ID:" + this.relatedRecordId);
                        this.getRelatedRecordDetails(this.relatedRecordId);       
                    }
                    this.callReason = getFieldValue(data, "VoiceCall.Call_Reason__c");
                    this.callOutcome = getFieldValue(data, "VoiceCall.Call_Outcome__c");
                    console.log("call outcomes" + this.callOutcome + this.callReason);
                    
                    if(this.callOutcome != null && this.callReason != null){
                        console.log("Parent LWC Ending interaction");
                        this.websocket.endInteraction(getFieldValue(data, "VoiceCall.Interaction_Id__c"));
                    }
    
                }catch(e) {
                    console.log('An error occured when handling the retrieved user record data:' + e.message);
                    this.showError('Agent Assist has been disabled while we investigate an error: ' + e.message);
                }
            }
            else if (error) {
                console.log('An error occured when retrieving the user record data: ' + JSON.stringify(error));
                this.showError('Agent Assist has been disabled while we investigate an error: '+ error.message);
            }
        }
        showError(message) {
            this.errorMessage = message;
        }

        async connectedConstruct(){
            console.log("arrived at wire handler");
            this.subscribeToAgentAssistMessageChannel();

        }

        subscribeToAgentAssistMessageChannel() {
            if (!this.agentAssistLMSSubscription) {
                    this.agentAssistLMSSubscription =
                    subscribe(this.messageContext, VOICE_CALL_CHANNEL, (event) => {
                        console.log("arrived at messenger");
                        //this.handleAgentAssistMessage(event);
                            },
                            { scope: APPLICATION_SCOPE }
                        );
            }
        }




}