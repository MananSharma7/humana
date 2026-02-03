public with sharing class AA_setSessionIdInVoiceCall {
	@AuraEnabled
	public static void SetVoiceCall(VoiceCall voiceCall, string sessionId) {
		// To set the session id in voice call record
		string className = 'Aa_setSessionIdInVoiceCall.updateVoiceCallRecords';
		String affectedId = 'VoiceCallId=' + voiceCall.Id;
		Logger logger = new Logger();
		logger.log(className, affectedId, sessionId, System.LoggingLevel.INFO);
		// Fetch Voice calls
		/*() Map<Id, VoiceCall > voiceCallMap = new Map<Id, VoiceCall>(
            [SELECT Id, AgentAssist_Session_ID__c FROM VoiceCall WHERE Id = :voiceCallId]
        );

        // Set session id for voice call
        for (VoiceCall voiceCall: voiceCallMap.values()) {*/
		voiceCall.AgentAssist_Session_ID__c = sessionId;
		//}
		update voiceCall;
		// Update voice call record
		//updateVoiceCallRecords(new List<VoiceCall>{voiceCall});
	}

	private static void updateVoiceCallRecords(List<VoiceCall> voiceCalls) {
		try {
			update voiceCalls;
		} catch (DmlException e) {
			string className = 'Aa_setSessionIdInVoiceCall.updateVoiceCallRecords';
			String affectedId = 'VoiceCallId=' + voiceCalls[0].Id;
			String errorMessage = e.getMessage();
			Logger logger = new Logger();
			logger.log(className, affectedId, errorMessage, System.LoggingLevel.ERROR);
			System.debug(e.getMessage());
		}
	}
}
