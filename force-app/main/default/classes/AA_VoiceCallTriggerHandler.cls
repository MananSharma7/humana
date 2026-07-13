public with sharing class AA_VoiceCallTriggerHandler {
    
    public static void afterInsert(List<VoiceCall> newRecords) {
        System.debug('>>> Entered AA_VoiceCallTriggerHandler.afterInsert');
        System.debug('>>> VoiceCall records received: ' + newRecords);

        Set<Id> userIds = new Set<Id>();
        for (VoiceCall vc : newRecords) {
            if (vc.UserId != null) {
                userIds.add(vc.UserId);
            }
        }
        System.debug('>>> UserIds collected: ' + userIds);

        // Fetch Users
        Map<Id, User> userMap = new Map<Id, User>(
            [SELECT Id, Email, Humana_ID__c FROM User WHERE Id IN :userIds]
        );
        System.debug('>>> Users fetched: ' + userMap.keySet());

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
            WHERE AssigneeId IN :userIds
        ]) {
            if (allowedPermissionSets.contains(psa.PermissionSet.Name)) {
                allowedUsers.add(psa.AssigneeId);
            }
        }
        System.debug('>>> Allowed Users: ' + allowedUsers);


        // Publish Platform Event with individual fields
        List<VoiceCall__e> eventsToPublish = new List<VoiceCall__e>();
        for (VoiceCall vc : newRecords) {
            if (allowedUsers.contains(vc.UserId)) {
                User u = userMap.get(vc.UserId);

                eventsToPublish.add(new VoiceCall__e(
                    InteractionId__c       = vc.Interaction_Id__c,
                    Voice_Call__c          = vc.Id
                ));
            }
        }
        System.debug('>>> Events to publish: ' + eventsToPublish);

        if (!eventsToPublish.isEmpty()) {
            Database.SaveResult[] results = EventBus.publish(eventsToPublish);
            System.debug('Published ' + results.size() + ' VoiceCall__e events');
        }
    }
}
