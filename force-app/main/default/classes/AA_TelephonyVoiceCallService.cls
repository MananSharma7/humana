public with sharing class AA_TelephonyVoiceCallService {
	@TestVisible
	private static final String RELATIVE = '/services/data/v61.0/telephony/v1/voiceCalls'; // pin your API version

	public class VoiceCallRequest {
		public String CallType;
		public String VendorType;
		public String ToPhoneNumber;
		public String FromPhoneNumber;
		public String initiationMethod; // 'inbound' | 'outbound' | 'transfer'
	}
	public class VoiceCallResponse {
		public Id voiceCallId; // VoiceCall Id returned by API
		public String vendorCallKey;
		public String status; // 'created'
	}

	public static VoiceCallResponse create(VoiceCallRequest req) {
		HttpRequest r = new HttpRequest();
		r.setMethod('POST');
		r.setEndpoint('https://humana-b2c--' + MP_ApexCommonUtils.runningOrgName + '.my.salesforce.com' + RELATIVE);
		r.setHeader('Content-Type', 'application/json');
		r.setHeader('Telephony-Provider-Name', 'Amazon Connect'); // or your provider
		r.setBody(JSON.serialize(req));

		Http h = new Http();
		HttpResponse res = h.send(r);

		if (res.getStatusCode() >= 200 && res.getStatusCode() < 300) {
			return (VoiceCallResponse) JSON.deserialize(res.getBody(), VoiceCallResponse.class);
		}
		// Provide a clean error message for LWC/Aura and logs
		throw new AuraHandledException('VoiceCall creation failed: ' + res.getBody());
	}
}
