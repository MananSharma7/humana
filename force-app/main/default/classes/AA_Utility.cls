public with sharing class AA_Utility {
	public static void AA_Utility() {
	}
	public static void SetVoiceCall(String voiceCallId, String sessionId) {
		// To set the session id in voice call record

		// Fetch Voice calls
		Map<Id, VoiceCall> voiceCallMap = new Map<Id, VoiceCall>(
			[SELECT Id, AgentAssist_Session_ID__c FROM VoiceCall WHERE Id = :voiceCallId]
		);

		// Set session id for voice call
		for (VoiceCall voiceCall : voiceCallMap.values()) {
			voiceCall.AgentAssist_Session_ID__c = sessionId;
		}

		// Update voice call record
		updateVoiceCallRecords(voiceCallMap.values());
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
	public static AA_interactionContext getInteractionContext(String userId) {
		// Fetch Users
		List<User> userList = [SELECT Id, Email, Humana_ID__c FROM User WHERE Id = :userId];

		DateTime midnightToday = DateTime.newInstance(Date.today(), Time.newInstance(0, 0, 0, 0));
		//currently in progress call for an user in the last 24 hours
		List<VoiceCall> voiceCallList = [
			SELECT
				Id,
				Interaction_Id__c,
				UserId,
				CallQueuedDateTime,
				CallStartDateTime,
				CallAcceptDateTime,
				CallConnectDateTime,
				CallEndDateTime,
				CreatedById,
				CallDisposition
			FROM VoiceCall
			WHERE CreatedById = :userId AND CreatedDate >= :midnightToday AND CallDisposition = 'in-progress'
			ORDER BY createddate DESC NULLS LAST
			LIMIT 1
		];

		// Permission set API names to check
		Set<String> allowedPermissionSets = new Set<String>{
			'MarketPoint_Agent_Assist',
			'MarketPoint_Agent_Assist_Interaction360',
			'MarketPoint_Agent_Assist_Knowledge_Card'
		};

		// Find users who have any of the required permission sets
		Set<Id> allowedUsers = new Set<Id>();
		for (PermissionSetAssignment psa : [
			SELECT AssigneeId, PermissionSet.Name
			FROM PermissionSetAssignment
			WHERE AssigneeId = :userId
		]) {
			if (allowedPermissionSets.contains(psa.PermissionSet.Name)) {
				allowedUsers.add(psa.AssigneeId);
			}
		}
		System.debug('>>> Allowed Users: ' + allowedUsers);

		if (allowedUsers.contains(voiceCallList[0].UserId)) {
			AA_InteractionContext interactionObject = new AA_InteractionContext();
			interactionObject.interaction_id = voiceCallList[0].Interaction_Id__c;
			interactionObject.interaction_id_type = 'voice';
			interactionObject.token = 'jwt-token';
			interactionObject.user_network_id = userList[0].Humana_ID__c;
			interactionObject.user_email = userList[0].Email;
			interactionObject.salesforce_user_id = userList[0].Id;

			System.debug(interactionObject);
			return interactionObject;
		} else {
			System.debug('User not allowed');
			return null;
		}
	}
}
