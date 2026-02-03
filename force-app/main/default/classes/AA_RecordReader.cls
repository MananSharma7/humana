public with sharing class AA_RecordReader {
	@AuraEnabled(cacheable=true)
	public static SObject getRecordById(Id recordId, String objectApiName, List<String> fieldApiNames) {
		// Build a safe SELECT clause from the incoming fields
		if (recordId == null || String.isBlank(objectApiName) || fieldApiNames == null || fieldApiNames.isEmpty()) {
			throw new AuraHandledException('Missing required parameters.');
		}
		// Sanitize inputs to prevent SOQL Injection
		String sanitizedObjectName = String.escapeSingleQuotes(objectApiName);
		List<String> sanitizedFields = new List<String>();
		for (String field : fieldApiNames) {
			sanitizedFields.add(String.escapeSingleQuotes(field));
		}

		// Create "SELECT Id, Name, Field1, Field2 FROM Object WHERE Id = :recordId LIMIT 1"
		String selectClause =
			'SELECT ' +
			String.join(sanitizedFields, ', ') +
			' FROM ' +
			sanitizedObjectName +
			' WHERE Id = :recordId LIMIT 1';

		System.debug('SELECT CLAUSE: ' + selectClause);
		return Database.query(selectClause);
	}
}
