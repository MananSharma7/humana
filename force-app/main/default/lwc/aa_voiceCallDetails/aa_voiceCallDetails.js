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
import hasAgentAssistPermission from '@salesforce/customPermission/MarketPoint_Agent_Assist_Custom';

export default class Aa_voiceCallDetails extends LightningElement {

    @api recordId;

    @wire(MessageContext)
    messageContext;

    isInteractionSent;
    isInteractionEnd;
    previousRelatedRecordId = null;
    aa_Permission = hasAgentAssistPermission;

    
    connectedCallback() {
        
        this.previousRelatedRecordId =localStorage.getItem('agentAssistPreviousRelatedRecordId') || null;
        
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

        if (error) {
            console.error('aa_voiceCallDetails | wiredVoiceCall | VoiceCall Error:', JSON.stringify(error));
            return;
        }

        if (!data) {
            return;
        }
        
        if(!this.aa_Permission){
            return;
        }


        const callDisposition = getFieldValue(data, CALL_STATUS_FIELD);
        const relatedRecordId = getFieldValue(data, RELATED_RECORD_ID_FIELD);
        const callOutcome = getFieldValue(data, CALL_OUTCOME_FIELD);
        const callReason = getFieldValue(data, CALL_REASON_FIELD);
        const createdById = getFieldValue(data, CALL_CREATEDBYID_FIELD);
        const interactionId = getFieldValue(data, CALL_INTERACTIONID_FIELD);
        this.isInteractionEnd = getFieldValue(data, CALL_INTERACTIONEND_FIELD);
        this.isInteractionSent = getFieldValue(data, CALL_INTERACTIONSENT_FIELD);
        
        if (callDisposition === 'in-progress' && !this.isInteractionSent )
            {
                const payload = this.createPayload(
                    AgentAssistLabels.SET_INTERACTION_CONTEXT,
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

        if ( callDisposition === 'in-progress' && relatedRecordId && this.previousRelatedRecordId !== relatedRecordId && this.isInteractionSent) 
        {
            const payload = this.createPayload(
                AgentAssistLabels.SET_CUSTOMER_CONTEXT,
                interactionId,
                createdById,
                relatedRecordId,
                callDisposition
            );

            this.publishMessage(payload);

            this.previousRelatedRecordId = relatedRecordId;

            localStorage.setItem('agentAssistPreviousRelatedRecordId',relatedRecordId);

        }

        if ( callDisposition === 'completed' && callOutcome && callReason && !this.isInteractionEnd )
        {   
            const payload = this.createPayload(
                AgentAssistLabels.END_INTERACTION,
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
            'aa_voiceCallDetails | publishMessage | Published Payload => ',
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
            console.log('aa_voiceCallDetails | updateVoiceCall | VoiceCall updated ', record);
        })
        .catch((error) => {
            console.error('aa_voiceCallDetails | updateVoiceCall | VoiceCall update failed ', error);
        });
    }
}
