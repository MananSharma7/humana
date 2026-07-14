/* *********************************************************
Apex Class Name : AA_SplunkService
Created Date :  06-15-2026
@description : The AA_SplunkService class is designed to send a HTTP request to an external system using the 
Promise class extension. It takes a JSON payload and an event name as parameters, 
and it uses the Integration_Callout_Setting__mdt object to retrieve the configuration information for the 
external callout. It was modeled after the MP_EASSplunkService class, with a small modification to the way the data is sent.
 
Modification Log: Salesforce
Ver Date Author Modification
1.0 04-01-2025 name Initial Version ********************************************************* */
public with sharing class AA_SplunkService extends Promise {
  string jsonString;
  string eventName;

  @testvisible
  Integration_Callout_Setting__mdt calloutSetting;

  public AA_SplunkService(String jsonString, String eventName) {
    this.jsonString = jsonString;
    this.eventName = eventName;
  }

  public override void execute() {
    /* The execute method is responsible for sending an HTTP request to the * API to log events. 
    It first retrieves the configuration information for the * integration from the
     Integration_Callout_Setting__mdt object and extracts the necessary headers and request configuration. 
     It then creates an HttpRequest object with the appropriate endpoint, method, content type, and headers.
      The request body is set to the jsonString variable, which contains the event data in JSON format.
      Lastly, the method uses the MP_ApexCommonUtils class to get the name of the running organization and retrieve the appropriate configuration 
      from the Integration_Callout_Setting__mdt object. This ensures that the correct configuration is used for the
       current organization, allowing the method to work seamlessly across different environments.*/
    try {
      MP_CalloutSettingMetadataSelector metadataSelector = new MP_CalloutSettingMetadataSelector(
        'Splunk_Integration'
      );
      Integration_Callout_Setting__mdt calloutSetting = MP_CalloutSettingMetadataSingleton.getInstance()
        .settings[0];
      Map<String, Object> configuration = (Map<String, Object>) (((Map<String, Object>) (JSON.deserializeUntyped(
          calloutSetting.HTTP_Request_Configuration_JSON__c
        )))
        .get(MP_ApexCommonUtils.runningOrgName));
      Map<String, Object> headerMap = new Map<String, Object>();
      Map<String, Object> fieldsJsonData = (Map<String, Object>) (JSON.deserializeUntyped(jsonString));
      for (
        String authKey : ((Map<String, Object>) configuration.get('headers'))
          .keySet()
      ) {
        headerMap.put(
          authKey,
          ((Map<String, Object>) configuration.get('headers')).get(authKey)
        );
      }
      Map<String, Object> data = new Map<String, Object>();
      data.put('eventName', eventName);
      data.put('Fields', fieldsJsonData);
      data.put('Environment', MP_ApexCommonUtils.runningOrgName);
      Map<String, Object> payload = new Map<String, Object>();
      payload.put('event', data);
      HTTPResponse res = (HTTPResponse) IntegrationUtil.processCallout(
        String.valueOf(configuration.get('endpoint')),
        IntegrationUtil.ValidHTTPMethods.valueOf(
          'HTTP_' + String.valueOf(configuration.get('method'))
        ),
        headerMap,
        JSON.serialize(payload),
        120000,
        true
      );
    } catch (exception e) {
      LogService.error(e.getMessage(), 'AA_SplunkService');
    }
  }
}
