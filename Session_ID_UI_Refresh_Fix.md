# Agent Assist Session ID UI Refresh Fix

## Problem Statement
The AgentAssist_Session_ID__c field on the VoiceCall__c record was being updated at the beginning of the call, but the standard Lightning UI was not reflecting this change in real-time. The Session ID only became visible after manually refreshing the browser page. 

Additionally, the flow AA_setSessionIdOnVoiceCall, which was previously intended to handle this update, had been disabled from the admin panel. As a result, the Apex method runVoiceCallSessionFlow was failing silently.

## Root Cause
The previous implementation relied on a backend Apex callout (runVoiceCallSessionFlow) to update the Session ID. Because this update occurred exclusively on the server side, the Lightning Data Service (LDS) in the browser was unaware of the change. Consequently, the local cache was not invalidated, and the standard record page continued to display stale data until a full page reload occurred.

## Solution Implemented
The solution shifts the record update from the backend Apex call to the frontend Lightning UI API. This ensures the Lightning Data Service is immediately aware of the data change and automatically triggers a UI re-render.

1. Updated Imports
Modified aa_agentAssistParent_LWC.js to import updateRecord from the lightning/uiRecordApi module.

2. Replaced Apex Call with UI API
Refactored the updateVoiceCallSessionId method in aa_agentAssistParent_LWC.js. Instead of calling the deactivated flow via runVoiceCallSessionFlow, the method now constructs a record input object and calls updateRecord.

Previous Code:
```javascript
await runVoiceCallSessionFlow({ recordId: this.recordId, sessionId: agentAssistSessionId });
```

New Code:
```javascript
const fields = {};
fields['Id'] = this.recordId;
fields['AgentAssist_Session_ID__c'] = agentAssistSessionId;

const recordInput = { fields };
await updateRecord(recordInput);
```

By using updateRecord, the local LDS cache is instantly refreshed upon a successful update, causing the standard Voice Call record page to display the new Session ID in real-time without requiring any manual browser refreshes.
