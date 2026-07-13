public with sharing class AA_VoiceCallFlowInvoker {
    @AuraEnabled
    public static void runVoiceCallSessionFlow(String recordId, String sessionId) {
        // Set up input variables for the Flow
        Map<String, Object> inputs = new Map<String, Object>();
        inputs.put('recordId', recordId);
        inputs.put('sessionId', sessionId);

        Flow.Interview.AA_setSessionIdOnVoiceCall flow = new Flow.Interview.AA_setSessionIdOnVoiceCall(inputs);
        flow.start();
    }
}
