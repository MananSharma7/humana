public with sharing class AA_FetchRelatedRecordDetails {
	@AuraEnabled(cacheable=true)
	public static Map<String, Object> getRecordDetails(String relatedRecordId) {
		if (String.isBlank(relatedRecordId)) {
			throw new AuraHandledException('Record Id is required.');
		}
		String prefix = relatedRecordId.substring(0, 3);
		Map<String, Object> response = new Map<String, Object>();
		if (prefix == '00Q') {
			Lead ld = [
				SELECT Id, CUST_ID__c, Member_ID__c, SDR_Person_ID__c
				FROM Lead
				WHERE Id = :relatedRecordId
				LIMIT 1
			];
			response.put('type', 'Lead');
			response.put('custID', ld.CUST_ID__c);
			response.put('memberID', ld.Member_ID__c);
			response.put('sdrID', ld.SDR_Person_ID__c);
		} else if (prefix == '001') {
			Account acc = [
				SELECT Id, CUST_ID__c, Member_ID__c, SDR_Person_ID__c
				FROM Account
				WHERE Id = :relatedRecordId
				LIMIT 1
			];
			response.put('type', 'Lead');
			response.put('custID', acc.CUST_ID__c);
			response.put('memberID', acc.Member_ID__c);
			response.put('sdrID', acc.SDR_Person_ID__c);
		} else if (prefix == '006') {
			Opportunity opp = [
				SELECT Id, Name, Account.Id, Account.CUST_ID__c, Account.Member_ID__c, Account.SDR_Person_ID__c
				FROM Opportunity
				WHERE Id = :relatedRecordId
				LIMIT 1
			];
			Account acc = opp.Account;
			response.put('type', 'Lead');
			response.put('custID', acc != null ? acc.CUST_ID__c : null);
			response.put('memberID', acc != null ? acc.Member_ID__c : null);
			response.put('sdrID', acc != null ? acc.SDR_Person_ID__c : null);
		} else {
			throw new AuraHandledException('Different object type: ' + prefix);
		}
		return response;
	}
	@AuraEnabled(cacheable=true)
	public static VoiceCall getVoiceCallDetails(String voiceCallId) {
		if (String.isBlank(voiceCallId)) {
			return null;
		}
		try {
			return [
				SELECT Id, RelatedRecordId, Interaction_Id__c, DisconnectReason, Call_Reason__c, Call_Outcome__c
				FROM VoiceCall
				WHERE Id = :voiceCallId
				LIMIT 1
			];
		} catch (Exception e) {
			throw new AuraHandledException('Error fetching VoiceCall details: ' + e.getMessage());
		}
	}
}
