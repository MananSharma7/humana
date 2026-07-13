import { LightningElement, wire, api } from 'lwc';
import { getRecord, getFieldValue, updateRecord } from 'lightning/uiRecordApi';
import { publish, MessageContext } from 'lightning/messageService';
import VOICE_CALL_CHANNEL from '@salesforce/messageChannel/LWCToUiConnectorMessengerMs__c';

import CALL_STATUS_FIELD from '@salesforce/schema/VoiceCall.CallDisposition';
import RELATED_RECORD_ID_FIELD from '@salesforce/schema/VoiceCall.RelatedRecordId';
import CALL_OUTCOME_FIELD from '@salesforce/schema/VoiceCall.Call_Outcome__c';
import CALL_REASON_FIELD from '@salesforce/schema/VoiceCall.Call_Reason__c';
import CALL_CREATEDBYID_FIELD from '@salesforce/schema/VoiceCall.OwnerId';
import CALL_INTERACTIONID_FIELD from '@salesforce/schema/VoiceCall.Interaction_Id__c';
import CALL_INTERACTIONSENT_FIELD from '@salesforce/schema/VoiceCall.Voice_Call_Event_Created__c';
import CALL_INTERACTIONEND_FIELD from '@salesforce/schema/VoiceCall.Interaction_Ended__c';
import { AgentAssistLabels } from 'c/aa_UtilsHum';

export default class Aa_voiceCallDetails extends LightningElement {

    @api recordId;

    @wire(MessageContext)
    messageContext;

    isInteractionSent;
    isInteractionEnd;
    previousRelatedRecordId = null;

    
    connectedCallback() {
        this.previousRelatedRecordId =localStorage.getItem('agentAssistPreviousRelatedRecordId') || null;
        console.log('PreviousRelatedRecordId Restored ', this.previousRelatedRecordId)
    }

    @wire(getRecord, {
        recordId: '$recordId',
        fields: [
            CALL_STATUS_FIELD,
            RELATED_RECORD_ID_FIELD,
            CALL_OUTCOME_FIELD,
            CALL_REASON_FIELD,
            CALL_CREATEDBYID_FIELD,
            CALL_INTERACTIONID_FIELD,
            CALL_INTERACTIONSENT_FIELD,
            CALL_INTERACTIONEND_FIELD
        ]
    })
    wiredVoiceCall({ data, error }) {
         console.log('wiredVoiceCall invoked');
        console.log('wire recordId =>', this.recordId);

        if (error) {
            console.error('VoiceCall Error:', JSON.stringify(error));
            return;
        }

        if (!data) {
            return;
        }

        console.log('VoiceCall Record Data aa_voiceCallDetails:', JSON.stringify(data));

        const callDisposition = getFieldValue(data, CALL_STATUS_FIELD);
        const relatedRecordId = getFieldValue(data, RELATED_RECORD_ID_FIELD);
        const callOutcome = getFieldValue(data, CALL_OUTCOME_FIELD);
        const callReason = getFieldValue(data, CALL_REASON_FIELD);
        const createdById = getFieldValue(data, CALL_CREATEDBYID_FIELD);
        const interactionId = getFieldValue(data, CALL_INTERACTIONID_FIELD);
        this.isInteractionEnd = getFieldValue(data, CALL_INTERACTIONEND_FIELD);
        this.isInteractionSent = getFieldValue(data, CALL_INTERACTIONSENT_FIELD);
        console.log('Interaction sent : ',this.isInteractionSent,'Endinteraction send : ',this.isInteractionEnd );
        
        //Call Started
        if (callDisposition === 'in-progress' && !this.isInteractionSent )
            {
                const payload = this.createPayload(
                    AgentAssistLabels.CALL_STARTED,
                    interactionId,
                    createdById,
                    relatedRecordId,
                    callDisposition
                );

                this.publishMessage(payload);

                this.isInteractionSent = true;                
                this.updateVoiceCall({
                    Voice_Call_Event_Created__c: true
                });
                localStorage.setItem('agentAssistPreviousRelatedRecordId',null);
                this.previousRelatedRecordId = null;

        }
        console.log("Before customercontext voice call details ",relatedRecordId ," this.previousRelatedRecordId ", this.previousRelatedRecordId);
        // Send Customer Context
        if ( callDisposition === 'in-progress' && relatedRecordId && this.previousRelatedRecordId !== relatedRecordId && this.isInteractionSent) 
        {
            console.log("After customercontext voice call details ",relatedRecordId ," this.previousRelatedRecordId ", this.previousRelatedRecordId);

            const payload = this.createPayload(
                AgentAssistLabels.SET_CUSTOMER_CONTEXT_WIRE,
                interactionId,
                createdById,
                relatedRecordId,
                callDisposition
            );

            this.publishMessage(payload);

            this.previousRelatedRecordId = relatedRecordId;

            localStorage.setItem('agentAssistPreviousRelatedRecordId',relatedRecordId);

        }

        // End Interaction
        if ( callDisposition === 'completed' && callOutcome && callReason && !this.isInteractionEnd )
        {   
            console.log('Call Ended inside aavoice call details outcome : ' ,callOutcome,'Reason : ',
            callReason,'Discomposition : ', callDisposition,'InteractionId : ', this.isInteractionEnd );
            const payload = this.createPayload(
                AgentAssistLabels.END_INTERACTION_WIRE,
                interactionId,
                createdById,
                relatedRecordId,
                callDisposition
            );

            this.publishMessage(payload);
                        
            if (this.previousRelatedRecordId) {
                localStorage.removeItem('agentAssistPreviousRelatedRecordId');
                this.previousRelatedRecordId = null;
            }

            this.isInteractionEnd = true;
            this.updateVoiceCall({
                Interaction_Ended__c: true
            });

            
        }

    }

    publishMessage(payload) {
        publish(this.messageContext, VOICE_CALL_CHANNEL, payload);

        console.log(
            'Published Payload aa_voiceCallDetails => ',
            JSON.stringify(payload)
        );
    }

    
    createPayload(type, interactionId, createdById, relatedRecordId, callDisposition )
    {
        return {
            recordId: this.recordId,
            type,
            VoiceCallData: {
                Interaction_Id__c: interactionId,
                CreatedById : createdById,
                RelatedRecordId: relatedRecordId,
                CallDisposition: callDisposition
            }
        };
    }


    updateVoiceCall(fields) {
        updateRecord({
            fields: {
                Id: this.recordId,
                ...fields
            }
        })
        .then((record) => {
            console.log('VoiceCall updated', record);
        })
        .catch((error) => {
            console.error('VoiceCall update failed', error);
        });
    }
}
