public with sharing class AA_WebSocketConfig {
    @TestVisible
    private static MP_CalloutSettingMetadataSelector tokenMetadataSelector;
    @AuraEnabled
    public static Map<String, Object> getAA_WebSocketConfig() {
        Map<String, Object> returnData = new Map<String, Object>();
    try {
         MP_CalloutSettingMetadataSelector metadataSelector = new MP_CalloutSettingMetadataSelector(
            MP_ApexContantsClass.AA_Google_WebSocket_Credential
        );
            Integration_Callout_Setting__mdt calloutSetting = Test.isRunningTest()
                ? tokenMetadataSelector.getMetadataSettingsByDeveloperName(
                    MP_ApexContantsClass.AA_Google_WebSocket_Credential
                )[0]
                : MP_CalloutSettingMetadataSingleton.getInstance().settings[0];
            Map<String, Object> configuration = (Map<String, Object>) (((Map<String, Object>) (JSON.deserializeUntyped(
                calloutSetting.HTTP_Request_Configuration_JSON__c
                )))
            .get(MP_ApexCommonUtils.runningOrgName));
            
            LogService.info(MP_ApexCommonUtils.runningOrgName, 'Org Name: ');
            System.debug('Org Name: ' + MP_ApexCommonUtils.runningOrgName);
        if (configuration.containsKey('endpoint')) {
            System.debug('Contains endpoint ' );
            String payload = String.valueOf(configuration.get('endpoint'));
            returnData.put('endpoint', configuration.get('endpoint'));
            LogService.info(payload, 'AA_Google_WebSocket endpoint:');
        }
        if (configuration.containsKey('path')) {
                returnData.put('path', configuration.get('path'));
        }
        if (configuration.containsKey('properties')) {
            returnData.put('properties',  configuration.get('properties'));
            } else {
            throw new AuraHandledException('Properties are Not Found');
            }
            
        if (configuration.containsKey('featureFlag')){
            returnData.put('featureFlag', configuration.get('featureFlag'));
        }
        returnData.put('processStatus', 'SUCCESS');
       
        } catch (Exception e) {
        LogService.error(e, 'AA_WebSocketConfig');
        returnData.put('processStatus', 'FAILURE');
        }
         return returnData;
        }
    }
