public without sharing class AA_LWCSplunkLogging {
    @AuraEnabled(cacheable=true)
    public static void LWCSplunkLogging( string jsonString, string eventName) {
        System.enqueueJob(new AA_SplunkService(jsonString, eventName));
    }
}
