/* ********************************************************* 
Apex Class Name : AA_CheckUserPermission 
Created Date :  8/29/2025
@description :The AA_CheckUserPermission class is used to check the user's access who is associated to voice call record
in order to match with Agent Assist required access.
********************************************************* */
public with sharing class AA_CheckUserPermission {
	public class Result {
		@InvocableVariable(label='Has Permission')
		public Boolean hasPermission;

		public Result(Boolean hasPermission) {
			this.hasPermission = hasPermission;
		}
	}

	@InvocableMethod(label='Check if User has Required Permission Set')
	public static List<Result> checkUserPermission(List<VoiceCall> voiceCalls) {
		List<Result> results = new List<Result>();

		if (voiceCalls == null || voiceCalls.isEmpty()) {
			results.add(new Result(false));
			return results;
		}

		VoiceCall vc = voiceCalls[0];

		if (vc == null || vc.UserId == null) {
			results.add(new Result(false));
			return results;
		}

		Id userId = vc.UserId;

		Set<String> allowedPermissionSets = new Set<String>{
			'MarketPoint_Agent_Assist',
			'MarketPoint_Agent_Assist_Interaction360',
			'MarketPoint_Agent_Assist_Knowledge_Card'
		};

		Boolean hasPermission = false;

		for (PermissionSetAssignment psa : [
			SELECT PermissionSet.Name
			FROM PermissionSetAssignment
			WHERE AssigneeId = :userId
		]) {
			if (allowedPermissionSets.contains(psa.PermissionSet.Name)) {
				hasPermission = true;
				break;
			}
		}

		results.add(new Result(hasPermission));
		return results;
	}
}
