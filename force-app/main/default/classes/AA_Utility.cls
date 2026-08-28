/**************************************************************************************************************************************************
Apex class Name    :  AA_Utility
Version            :  1.0
Function           :  AA_Utility class to be used across the application

   Modification Log:

 *   Developer                   Code Review             Date               Description
 * -------------------------------------------------------------------------------------------------------------------------------------------------
 *  Ananya Ray         		                 		 01/29/2026          Original Version
 *	Brian Johnston									 05/12/2026			 Added getAASessionIdFromVoiceCall method
 *
************************************************************************************************************************************************* */
public without sharing class AA_Utility {
	@AuraEnabled(cacheable=true)
	public static Boolean isFeatureEnabled (String featureName){
		Feature_Flag__mdt flag = Feature_Flag__mdt.getInstance(featureName);
		return flag != null && flag.IsEnabled__c;
	}


@AuraEnabled
	public static Boolean hasNoVoiceCall(String loggedinUserId){
		return true;
	}

}
