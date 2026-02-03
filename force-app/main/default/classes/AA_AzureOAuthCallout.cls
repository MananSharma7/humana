public with sharing class AA_AzureOAuthCallout {
	public class Result {
		@InvocableVariable(label='received access token' required=true)
		public String oAuth_token;

		public Result(String oAuth_token) {
			this.oAuth_token = oAuth_token;
		}
	}
	@InvocableMethod(label='GetAccessToken')
	public static List<Result> getAccessToken() {
		HttpRequest req = new HttpRequest();
		req.setEndpoint('callout:AzureAgentAssistOAuth' + '/oauth2/v2.0/token');
		req.setMethod('GET');
		req.setHeader('Content-Type', 'application/json');
		//req.setHeader('Accept', 'application/json');

		Http http = new Http();
		HttpResponse res = http.send(req);
		List<Result> responseData = new List<Result>();

		if (res.getStatusCode() == 200) {
			Map<String, Object> json = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
			responseData.add(new Result((String) json.get('access_token')));
		} else {
			System.debug('Error: ' + res.getStatusCode() + ' - ' + res.getBody());
			responseData.add(new Result(res.getBody()));
		}
		return responseData;
	}
}
