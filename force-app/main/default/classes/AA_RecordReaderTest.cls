@isTest
public class AA_RecordReaderTest {
	@isTest
	static void testGetRecordById_success() {
		// Build Contact (Simpler than Opportunity, avoids Opp triggers)
		Contact con = new Contact(LastName = 'Test Contact');
		insert con;

		// Fields to query
		List<String> fields = new List<String>{ 'Id', 'LastName' };

		// Execute the method under test
		SObject result = AA_RecordReader.getRecordById(con.Id, 'Contact', fields);

		// Assertions
		System.assertNotEquals(null, result, 'Result should not be null');
		System.assertEquals(con.Id, result.get('Id'));
		System.assertEquals('Test Contact', result.get('LastName'));
	}

	@isTest
	static void testGetRecordById_missingParams() {
		List<String> fields = new List<String>{ 'Id', 'LastName' };

		// Missing recordId
		Boolean threw1 = false;
		try {
			AA_RecordReader.getRecordById(null, 'Contact', fields);
		} catch (Exception e) {
			threw1 = true;
		}
		System.assert(threw1, 'Expected an exception for missing recordId');

		// Missing objectApiName
		Boolean threw2 = false;
		try {
			AA_RecordReader.getRecordById('003000000000001AAA', '', fields); // 003 is Contact prefix
		} catch (Exception e) {
			threw2 = true;
		}
		System.assert(threw2, 'Expected an exception for missing objectApiName');

		// Missing fields
		Boolean threw3 = false;
		try {
			AA_RecordReader.getRecordById('003000000000001AAA', 'Contact', new List<String>());
		} catch (Exception e) {
			threw3 = true;
		}
		System.assert(threw3, 'Expected an exception for empty field list');
	}

	@isTest
	static void testGetRecordById_Security() {
		// Create a record to test with
		Contact con = new Contact(LastName = 'SecTest Contact');
		insert con;

		List<String> fields = new List<String>{ 'Id' };

		Boolean exceptionThrown = false;
		try {
			// Pass an invalid object name that is definitely not valid SOQL (special chars)
			AA_RecordReader.getRecordById(con.Id, 'Contact!Invalid', fields);
		} catch (Exception e) {
			exceptionThrown = true;
		}
		System.assert(exceptionThrown, 'Should throw exception for invalid object name');
	}
}
