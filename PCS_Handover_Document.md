# Agent Assist - Comprehensive Implementation Handover Specification

This document provides a comprehensive technical overview and handover guide for all the implementations completed on the **Agent Assist LWC component suite**. 

It details the functionality, schemas, component modifications, and telemetry logging strategies introduced to support:
1. **Post Call Summary (PCS) Telemetry & Interaction Logging**
2. **Post Call Summary (PCS) Thumbs Up / Thumbs Down Feedback Engine**
3. **Accessibility and Lightning Button Migration**
4. **Live Transcript Feature Controls & Copy Telemetry**
5. **Interaction 360 Enhancements (Copy Tracking & Dynamic State Layouts)**
6. **Telemetry Code Cleanup & Refactoring**

---

## 1. Feature Specifications & Functionality Descriptions

### A. Post Call Summary (PCS) Telemetry & Interaction Logging
To measure agent adoption, engagement quality, and conversion rates of the post-call summaries, an end-to-end logging strategy was implemented using `LWCSplunkLogger` under the `AgentAssistUsageEvent` channel.
* **Granular Interaction Events**:
  1. `PCS_generated`: Logged automatically when a post-call summary card finishes rendering, identifying whether it was a `success` or `failed` card status (based on `card.isSumError`).
  2. `PCS_viewed`: Logged once per unique card session when the agent scrolls the post-call summary card into view. Backed by a browser-native `IntersectionObserver` to avoid duplicate triggers and scroll-listener overhead.
  3. `PCS_copied`: Logged when an agent copies text directly from the PCS card container.
* **Call-Level Summary Event**:
  * Dispatched at the end of the voice call session (inside the LWC's interaction termination callback `clearCards`).
  * Evaluates if at least one successful, error-free post-call summary card was generated at any point during the session. Logs `PostCallSummaryOccurred: "TRUE"` or `"FALSE"`.
* **Standard Context Parameters**:
  * Every telemetry event includes standard tracking identifiers (`GenesysInteractionId`, `voiceCallId` (Salesforce Session ID), `User_Id`, and timestamps).

### B. Post Call Summary (PCS) Feedback Engine
A dynamic feedback system was built into the PCS card footer to gather agent sentiment on the quality of generated summaries, adhering to the requested schema.
* **AC1 - Feedback Options Display**: If a card is a post-call summary (`card.isSummary`), a thumbs-up and thumbs-down option is rendered in the footer.
* **AC2 - Positive Sentiment (Thumbs Up)**:
  * When clicked, instantly constructs a `pcs_feedback_event` JSON payload with `rating: "true"` and `feedback_text: "No feedback_text"`.
  * Publishes it to the Salesforce Message Channel `VOICE_CALL_CHANNEL`.
  * Displays a success toast: *"Thank you for your feedback!"*.
* **AC3 - Negative Sentiment (Thumbs Down & Chip Submissions)**:
  * When clicked, instantly dispatches an initial `pcs_feedback_event` payload with `rating: "false"` and `feedback_text: "No feedback_text"`.
  * Displays a row of three dislike reason chips: **Inaccurate information**, **Missing information**, and **Contains PHI/PFI**.
  * When the agent clicks a chip, a secondary event payload is constructed containing the selected reason as `feedback_text`, with `rating: "false"`.
* **AC4 - Anti-Spam State Locking**:
  * Upon submission of positive or negative feedback, interaction states (`isLiked`, `isDisliked`) are saved, locking out subsequent feedback submissions for that card.
* **Payload WebSocket Interception**:
  * Bypasses the default framework event formatter in the parent component (`aa_agentAssistParent_LWC.js`). Intercepts events labeled as `pcs_feedback_event` and streams the exact pre-formatted JSON directly over the websocket channel, ensuring schema compliance.

### C. Accessibility & Lightning Button Migration
* **Semantic HTML Compliance**: Migrated interactive dislikes reason chips to standard HTML `<button>` elements with explicit `aria-label={reason.text}` and `title={reason.text}` attributes, ensuring screen readers and mobile systems can easily convey the element actions.
* **State & Handling Enhancements**: Modified event parameter access from `event.target` to `event.currentTarget` in LWC to guarantee data-attribute extraction (`data-reason`, `data-id`) is completely safe from LWC shadow-DOM styling wrappers.

### D. Live Transcript Feature Controls & Telemetry
* **Conditional UI Display**: Modified the Live Transcript vertical button to render only if the Custom Permission `MarketPoint_Agent_Assist_Live_Transcription` is assigned to the user **AND** the feature flag Apex property `isLiveTranscriptEnabled` is checked.
* **Transcript Copy Telemetry**: Introduced an `oncopy` hook in the transcription layout to trigger `handleCopyTranscription` which streams copy telemetry to Splunk.

### E. Interaction 360 Enhancements
* **Copy Interaction Telemetry**: Added an `oncopy` trigger to the parent container of the Interaction 360 panel, firing `handleCopyInteraction360` to log user copy behaviors in Splunk.
* **Adaptive Tab & Expansion Layouts**: Updated internal states (`isExpanded`) so the panel expands automatically during critical lifecycle updates (such as history loads, pending interaction waits, and error states), while folding shut once history is loaded successfully.

### F. Telemetry Code Cleanup & Refactoring
* **Scroll Percentage Telemetry**: Refactored the scroll tracking inside `aa_knowledgeAgentAssist.js` to clear duplicate logic. Streamlined the 20% scroll depth event to record once per session, ensuring correct class and log parameters.
* **Memory Safety**: Cleaned up the `IntersectionObserver` references inside LWC lifecycle methods, using `disconnectedCallback` to safely disconnect observers, preventing memory leaks.

---

## 2. Technical Code Architecture & Diffs

### A. Telemetry Schemas in `aa_UtilsHum.js`
* **Path**: [`force-app/main/default/lwc/aa_UtilsHum/aa_UtilsHum.js`](file:///Users/manansharma/agentAssist/force-app/main/default/lwc/aa_UtilsHum/aa_UtilsHum.js)
* **Changes**: Standardized log context formats (removing unused parameters like `log_source`) and added two dedicated schema builders.

```javascript
// Granular event-level interaction formatter
splunk_pcs_interaction_message: (card_id, voiceCallId, genesysInteractionId, userId, actionType, status) => ({
    CardId: card_id,
    voiceCallId: voiceCallId,
    GenesysInteractionId: genesysInteractionId,
    User_Id: userId,
    ActionType: actionType,
    Status: status
}),

// Call-level summary occurrence formatter
splunk_pcs_call_level_message: (voiceCallId, genesysInteractionId, userId, pcsOccurred) => ({
    voiceCallId: voiceCallId,
    GenesysInteractionId: genesysInteractionId,
    User_Id: userId,
    PostCallSummaryOccurred: pcsOccurred ? 'TRUE' : 'FALSE'
})
```

---

### B. Observers & Telemetry Logic in `aa_knowledgeMessage.js`
* **Path**: [`force-app/main/default/lwc/aa_knowledgeMessage/aa_knowledgeMessage.js`](file:///Users/manansharma/agentAssist/force-app/main/default/lwc/aa_knowledgeMessage/aa_knowledgeMessage.js)
* **Changes**: Implemented state-locked observers, generation/copy/session ending triggers, and direct PCS feedback builders.

#### 1. Setup & Disconnect Observers
```javascript
renderedCallback() {
    this.setupPCSIntersectionObserver();
}

setupPCSIntersectionObserver() {
    try {
        const summaryCards = this.cards.filter((c) => c.isSummary && !this.pcsViewedLoggedSet.has(c.card_id));
        if (summaryCards.length === 0) return;

        if (!this.pcsObserver) {
            this.pcsObserver = new IntersectionObserver(
                (entries) => {
                    entries.forEach((entry) => {
                        if (entry.isIntersecting) {
                            const cardId = entry.target.dataset.cardId;
                            const card = this.cards.find((c) => c.card_id == cardId);
                            if (card && card.isSummary && !this.pcsViewedLoggedSet.has(cardId)) {
                                this.pcsViewedLoggedSet.add(cardId);
                                this.pcsObserver.unobserve(entry.target);

                                const statusString = card.isSumError ? 'failed' : 'success';
                                let splunkJsonString = JSON.stringify(
                                    AgentAssistSplunkLoggingUtils.splunk_logging_context(
                                        'INFO',
                                        'aa_knowledgeMessage.js',
                                        'PCS_viewed',
                                        'PCS Interaction Event',
                                        localStorage.getItem('agentAssistGenesysInteractionId'),
                                        AgentAssistSplunkLoggingUtils.splunk_pcs_interaction_message(
                                            cardId,
                                            localStorage.getItem('agentAssistVoiceCallId'),
                                            localStorage.getItem('agentAssistGenesysInteractionId'),
                                            userId,
                                            'PCS_viewed',
                                            statusString
                                        ),
                                        userId
                                    )
                                );
                                LWCSplunkLogger({ jsonString: splunkJsonString, eventName: 'AgentAssistUsageEvent' });
                            }
                        }
                    });
                },
                { threshold: 0.1 }
            );
        }

        summaryCards.forEach((card) => {
            const cardEl = this.template.querySelector(`[data-card-id="${card.card_id}"]`);
            if (cardEl) {
                this.pcsObserver.observe(cardEl);
            }
        });
    } catch (error) {
        console.error('Error in setupPCSIntersectionObserver', error);
    }
}

disconnectedCallback() {
    if (this.pcsObserver) {
        this.pcsObserver.disconnect();
        this.pcsObserver = null;
    }
}
```

#### 2. Call-Level Summary Check on Workspace Clearance
```javascript
clearCards(dataId) {
    // ... verification logic ...
    const pcsOccurred = this.cards.some((c) => c.isSummary && !c.isSumError);
    let callLevelSplunkString = JSON.stringify(
        AgentAssistSplunkLoggingUtils.splunk_logging_context(
            'INFO',
            'aa_knowledgeMessage.js',
            'Call Level Summary Check',
            'PCS Call Level Event',
            localStorage.getItem('agentAssistGenesysInteractionId'),
            AgentAssistSplunkLoggingUtils.splunk_pcs_call_level_message(
                localStorage.getItem('agentAssistVoiceCallId'),
                localStorage.getItem('agentAssistGenesysInteractionId'),
                userId,
                pcsOccurred
            ),
            userId
        )
    );
    LWCSplunkLogger({ jsonString: callLevelSplunkString, eventName: 'AgentAssistUsageEvent' });
    this.cards = [];
    // ...
}
```

#### 3. Custom Feedback Payload Generators
```javascript
handleLike(event) {
    const cardId = event.currentTarget.dataset.id;
    // ... UI visual toggle states ...
    
    let data;
    if (this.cards.find((c) => c.card_id === cardId)?.isSummary) {
        data = {
            version: '1.0',
            event_type: 'pcs_feedback_event',
            data: {
                card_metadata: {
                    interaction_id: this.interactionId,
                    user_network_id: ''
                },
                feedback: {
                    feedback_text: 'No feedback_text',
                    rating: 'true'
                }
            }
        };
    } else {
        data = AgentAssistEvents.agent_feedback(true, 'Liked', cardId, this.interactionId);
    }
    // ... publish logic ...
}

handleDislike(event) {
    const cardId = event.currentTarget.dataset.id;
    // ... UI visual state transformations ...
    
    let data;
    const card = this.cards.find((c) => c.card_id === cardId);
    if (card?.isSummary) {
        data = {
            version: '1.0',
            event_type: 'pcs_feedback_event',
            data: {
                card_metadata: {
                    interaction_id: this.interactionId,
                    user_network_id: ''
                },
                feedback: {
                    feedback_text: 'No feedback_text',
                    rating: 'false'
                }
            }
        };
    }
    // ... publish logic ...
}

selectDislikeReason(event) {
    const cardId = event.currentTarget.dataset.id;
    const selectedReason = event.currentTarget.dataset.reason;
    // ... locks and visual indicators ...

    let data;
    const card = this.cards.find((c) => c.card_id === cardId);
    if (card?.isSummary) {
        data = {
            version: '1.0',
            event_type: 'pcs_feedback_event',
            data: {
                card_metadata: {
                    interaction_id: this.interactionId,
                    user_network_id: ''
                },
                feedback: {
                    feedback_text: selectedReason,
                    rating: 'false'
                }
            }
        };
    }
    // ... publish logic ...
}
```

---

### C. Live Transcript Conditional display
* **Path**: [`force-app/main/default/lwc/aa_agentAssistParent_LWC/aa_agentAssistParent_LWC.js`](file:///Users/manansharma/agentAssist/force-app/main/default/lwc/aa_agentAssistParent_LWC/aa_agentAssistParent_LWC.js)
```javascript
import hasLiveTranscriptPermission from '@salesforce/customPermission/MarketPoint_Agent_Assist_Live_Transcription';

// ... Inside LWC ...
@wire(isFeatureEnabled, { featureName: 'AA_Live_Transcription' })
wired({ error, data }) {
    if (data) {
        this.isLiveTranscriptEnabled = data;
    } else if (error) {
        console.error(error);
    }
}

get showTranscriptButton() {
    return this.isLiveTranscriptEnabled && hasLiveTranscriptPermission;
}
```

---

## 3. Schema Definitions & JSON Payloads (Splunk Outputs)

The following represents the final JSON payload specifications streaming to Splunk under `AgentAssistUsageEvent`:

### A. Granular PCS Interaction Event (`PCS_viewed`, `PCS_generated`, `PCS_copied`)
```json
{
  "LogSeverity": "INFO",
  "SourceClass": "aa_knowledgeMessage.js",
  "Method": "PCS_viewed",
  "EventName": "PCS Interaction Event",
  "GenesysInteractionId": "88a9166f-124b-4b13-8bfe-30e7192a5438",
  "UserId": "00570000001abc3AAA",
  "LogMessage": {
    "CardId": "a0bfe6fa-9ded-449f-a568-24e6293f235b",
    "voiceCallId": "0HR70000000xyz7AAA",
    "GenesysInteractionId": "88a9166f-124b-4b13-8bfe-30e7192a5438",
    "User_Id": "00570000001abc3AAA",
    "ActionType": "PCS_viewed",
    "Status": "success"
  }
}
```

### B. Session Call-Level Cumulative Summary Event
```json
{
  "LogSeverity": "INFO",
  "SourceClass": "aa_knowledgeMessage.js",
  "Method": "Call Level Summary Check",
  "EventName": "PCS Call Level Event",
  "GenesysInteractionId": "88a9166f-124b-4b13-8bfe-30e7192a5438",
  "UserId": "00570000001abc3AAA",
  "LogMessage": {
    "voiceCallId": "0HR70000000xyz7AAA",
    "GenesysInteractionId": "88a9166f-124b-4b13-8bfe-30e7192a5438",
    "User_Id": "00570000001abc3AAA",
    "PostCallSummaryOccurred": "TRUE"
  }
}
```

### C. Client PCS Feedback Event WebSocket Schema (`pcs_feedback_event`)
```json
{
  "version": "1.0",
  "event_type": "pcs_feedback_event",
  "data": {
    "card_metadata": {
      "interaction_id": "88a9166f-124b-4b13-8bfe-30e7192a5438",
      "user_network_id": ""
    },
    "feedback": {
      "feedback_text": "Inaccurate information",
      "rating": "false"
    }
  }
}
```

---

## 4. Verification & Splunk Diagnostics

Telemetry data can be queried on the target Splunk instance using the following standard search formats:

### 1. Granular PCS Interactions
To verify generations, views, and copies, execute:
```splunk
index=* "PCS Interaction Event"
```
* **Filter by interaction types**: Append `LogMessage.ActionType="PCS_generated"`, `PCS_viewed`, or `PCS_copied`.
* **Verify render quality**: Append `LogMessage.Status="success"` or `LogMessage.Status="failed"`.

### 2. Session Adoption Statistics
To find what percentage of calls had successful summaries rendered, execute:
```splunk
index=* "PCS Call Level Event"
```
* Query `LogMessage.PostCallSummaryOccurred="TRUE"` to extract calls that generated summaries.

### 3. General Agent Copy Interactions
To search for copying interactions across Live Transcript, Interaction 360, or Knowledge Cards, execute:
```splunk
index=* "AA Copy"
```

---

## 5. Deployment Guide

To deploy all modifications to target environments (Sandbox / Production / Integration Orgs), perform the steps below:

1. **Deployment using Salesforce CLI (SFDX)**:
   Ensure your local repository is committed and clean, then deploy the affected LWC components using:
   ```bash
   sf project deploy start --source-dir force-app/main/default/lwc/aa_knowledgeMessage force-app/main/default/lwc/aa_UtilsHum force-app/main/default/lwc/aa_agentAssistParent_LWC force-app/main/default/lwc/aa_liveTranscript force-app/main/default/lwc/aa_interaction360 force-app/main/default/lwc/aa_knowledgeAgentAssist
   ```

2. **Verify Client Log Streaming**:
   * Open the Salesforce Service Console.
   * Open Chrome DevTools (`F12` -> `Console` tab).
   * Simulate a voice call sequence to render a Post Call Summary.
   * Verify that `LWCSplunkLogger` log parameters are printed to the console window.
   * Verify that the websocket successfully transmits the `pcs_feedback_event` schema without errors.
