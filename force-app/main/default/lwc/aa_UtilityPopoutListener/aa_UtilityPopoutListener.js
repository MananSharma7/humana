import { LightningElement, wire } from 'lwc';
import { subscribe, MessageContext } from 'lightning/messageService';
import { EnclosingUtilityId, getUtilityInfo } from 'lightning/platformUtilityBarApi';
import UTILITY_POP_CHANNEL from '@salesforce/messageChannel/UtilityPopoutMessageChannel__c';


export default class Aa_UtilityPopoutListener extends LightningElement {
subscription = null;
    @wire(EnclosingUtilityId) utilityId;
    @wire(MessageContext)
    messageContext;

    connectedCallback() {
        this.checkPopoutStatus();
        this.subscription = subscribe(
            this.messageContext,
            UTILITY_POP_CHANNEL,
            (message) => this.handleMessage(message)
        );
    }

    handleMessage(message) {
        if (message.status === 'poppedOut') {
            console.log('Utility was popped out!');
            // Add your custom logic here
        }
    }
    
checkPopoutStatus() {
        if (!this.utilityId) return;
        getUtilityInfo(this.utilityId).then(info => {
            console.log('Popout status:', info.isPopout);
            if (info.isPopout) {
                // Notify your component logic here
                this.dispatchEvent(new CustomEvent('utilitypoppedout'));
            }
        });

}
}