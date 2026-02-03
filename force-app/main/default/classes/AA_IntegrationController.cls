public with sharing class AA_IntegrationController {
	/*public class String {
        @InvocableVariable(label='received access token' required=true)
        public String oAuth_token;
    
        public String(String oAuth_token) {
            this.oAuth_token = oAuth_token;
        }
    }*/
	@TestVisible
	private static MP_CalloutSettingMetadataSelector tokenMetadataSelector;

	//@AuraEnabled
	@InvocableMethod(label='getAaAzureOauthToken')
	public static List<String> getAaAzureOauthToken() {
		List<String> returnData = new List<String>();
		//Map<String, Object> returnData = new Map<String, Object>();
		try {
			tokenMetadataSelector = new MP_CalloutSettingMetadataSelector(MP_ApexContantsClass.AA_Azure_Auth_Credential_Id);
			Integration_Callout_Setting__mdt calloutSetting = Test.isRunningTest()
				? tokenMetadataSelector.getMetadataSettingsByDeveloperName(MP_ApexContantsClass.AA_Azure_Auth_Credential_Id)[0]
				: MP_CalloutSettingMetadataSingleton.getInstance().settings[0];
			Map<String, Object> configuration = (Map<String, Object>) (((Map<String, Object>) (JSON.deserializeUntyped(
					calloutSetting.HTTP_Request_Configuration_JSON__c
				)))
				.get(MP_ApexCommonUtils.runningOrgName));
			LogService.info(MP_ApexCommonUtils.runningOrgName, 'Org Name: ');
			System.debug('Org Name: ' + MP_ApexCommonUtils.runningOrgName);

			Map<String, Object> headerMap = new Map<String, Object>();

			if (configuration.containsKey('pre-process-attributes')) {
				headerMap.put(
					'Authorization',
					'Basic ' +
					EncodingUtil.base64Encode(
						Blob.valueOf(
							((Map<String, Object>) configuration.get('pre-process-attributes')).get('clientId') +
								':' +
								((Map<String, Object>) configuration.get('pre-process-attributes')).get('clientSecret')
						)
					)
				);
			}

			headerMap.put('Content-Type', 'application/x-www-form-urlencoded');

			String payload = 'grant_type=client_credentials' + '&scope=' + String.valueOf(configuration.get('scope'));

			LogService.info(payload, 'AA_Azure oAuth Request Body:');
			HTTPResponse res = (HTTPResponse) IntegrationUtil.processCallout(
				String.valueOf(configuration.get('endpoint')),
				IntegrationUtil.ValidHTTPMethods.valueOf('HTTP_POST'),
				headerMap,
				payload,
				120000,
				true
			);
			LogService.info(String.valueOf(res.getStatusCode()), 'AA_Azure oAuth Response Status Code:');
			LogService.info(res.getBody(), 'AA_Azure oAuth Response Body:');
			if (res.getStatusCode() == 200) {
				Map<String, Object> responseMap = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
				if (responseMap.containsKey('access_token')) {
					returnData.add((String) responseMap.get('access_token'));
					// returnData.put('access_token', responseMap.get('access_token'));
					//returnData.put('processStatus', 'SUCCESS');
				} else {
					throw new AuraHandledException('Access Token Not Found');
				}
			}
		} catch (Exception e) {
			LogService.error(e, 'Get Aa Azure Oauth Token');
			returnData.add('FAILURE');
			//returnData.put('processStatus', 'FAILURE');
		}
		return returnData;
	}

	// @InvocableMethod(label='GetAa_AzureOauthToken')
	public static List<String> getAa_AzureOauthToken() {
		List<String> returnData = new List<String>();
		//Map<String, Object> returnData = new Map<String, Object>();
		try {
			tokenMetadataSelector = new MP_CalloutSettingMetadataSelector(MP_ApexContantsClass.AA_Azure_Auth_Credential_Id);
			LogService.info(MP_ApexContantsClass.AA_Azure_Auth_Credential_Id, 'AA Config: ');
			System.debug('AA Config: ' + MP_ApexContantsClass.AA_Azure_Auth_Credential_Id);
			Integration_Callout_Setting__mdt calloutSetting = Test.isRunningTest()
				? tokenMetadataSelector.getMetadataSettingsByDeveloperName(MP_ApexContantsClass.AA_Azure_Auth_Credential_Id)[0]
				: MP_CalloutSettingMetadataSingleton.getInstance().settings[0];
			Map<String, Object> configuration = (Map<String, Object>) (((Map<String, Object>) (JSON.deserializeUntyped(
					calloutSetting.HTTP_Request_Configuration_JSON__c
				)))
				.get(MP_ApexCommonUtils.runningOrgName));
			LogService.info(MP_ApexCommonUtils.runningOrgName, 'Org Name: ');
			System.debug('Org Name: ' + MP_ApexCommonUtils.runningOrgName);

			Map<String, Object> headerMap = new Map<String, Object>();

			if (configuration.containsKey('pre-process-attributes')) {
				HttpRequest req = new HttpRequest();
				req.setEndpoint(String.valueOf(configuration.get('endpoint')));
				req.setMethod('POST');
				req.setHeader('Content-Type', 'application/x-www-form-urlencoded');

				String body =
					'grant_type=client_credentials' +
					'&client_id=' +
					String.valueOf(((Map<String, Object>) configuration.get('pre-process-attributes')).get('clientId')) +
					'&client_secret=' +
					String.valueOf(((Map<String, Object>) configuration.get('pre-process-attributes')).get('clientSecret')) +
					'&scope=' +
					String.valueOf(configuration.get('scope'));

				req.setBody(body);

				Http http = new Http();
				HttpResponse res = http.send(req);

				if (res.getStatusCode() == 200) {
					Map<String, Object> responseMap = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
					if (responseMap.containsKey('access_token')) {
						returnData.add((String) responseMap.get('access_token'));
					} else {
						returnData.add('No Token Retrieved');
					}
				}
			}
		} catch (Exception e) {
			LogService.error(e, 'AA_AzureStatusSyncDataProvider');
			returnData.add('FAILURE');
			//returnData.put('processStatus', 'FAILURE');
		}
		return returnData;
	}
}
