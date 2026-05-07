# Post Call Summary (PCS) Feedback Options Implementation Plan

This plan covers the implementation for displaying feedback options (thumbs up/down) when a Post Call Summary (PCS) is visible, handling the submission with specific reasons for negative feedback, and visually confirming the submission to the agent.

## User Review Required
No major architectural changes. The change introduces a new event schema `pcs_feedback_event` via `aa_UtilsHum.js` and modifies the rendering logic of `aa_knowledgeMessage` to support feedback options specifically for `isSummary` cards. 

## Open Questions
- Is `user_network_id` in the schema required to be populated from a specific source, or can it remain an empty string like in the provided example payload?
- For the `pcs_feedback_event` schema, what should be the string values of `rating`? The schema example uses `"true"` and `"false"` as strings for rating; we will adhere to strings instead of booleans unless instructed otherwise.
- In `aa_UtilsHum.js`, `AgentAssistEvents.agent_feedback` is published to `VOICE_CALL_CHANNEL`. We'll introduce `PCS_FEEDBACK` to follow the exact same pattern. Please confirm if any WebSocket emission code needs to be updated.

## Proposed Changes

### aa_UtilsHum
This component stores shared utilities and event formatting.

#### [MODIFY] [aa_UtilsHum.js](file:///Users/manansharma/agentAssist/force-app/main/default/lwc/aa_UtilsHum/aa_UtilsHum.js)
- Add `PCS_FEEDBACK: 'pcs_feedback'` to `AgentAssistLabels`.
- Add a new function `pcs_feedback(rating, feedback_text, interaction_id, user_network_id)` inside `AgentAssistEvents` that generates the payload according to the provided schema:
  - `version: "1.0"`
  - `event_type: "pcs_feedback_event"`
  - `data.card_metadata.interaction_id`
  - `data.card_metadata.user_network_id`
  - `data.feedback.feedback_text`
  - `data.feedback.rating` (as string `"true"` or `"false"`).

### aa_knowledgeMessage
This component renders the Post Call Summary and handles feedback interactions.

#### [MODIFY] [aa_knowledgeMessage.js](file:///Users/manansharma/agentAssist/force-app/main/default/lwc/aa_knowledgeMessage/aa_knowledgeMessage.js)
- **`preparePostCallSummary(message)`**: 
  - Change `isFooter = false;` to `isFooter = true;` when constructing the PCS card object so that the feedback buttons (like/dislike) appear on the summary UI.
- **`handleLike(event)`**:
  - Add logic to check if `card.isSummary` is true.
  - If true, dispatch the new `pcs_feedback` event (from `AgentAssistEvents`) with `rating: "true"` and `feedback_text: "No feedback_text"`.
  - Maintain the existing logic to disable further feedback (AC4) and display the "Thank you for your feedback!" toast message (AC2).
- **`handleDislike(event)`**:
  - Check if `card.isSummary` is true.
  - If true, instead of standard reasons, populate `disLikeReasons` with the specific PCS chips: `"Inaccurate information"`, `"Missing information"`, `"Contains PHI/PFI"` (AC3).
  - Update `showDislikeReasons: true` so the chips are rendered.
- **`selectDislikeReason(event)`**:
  - Check if `card.isSummary` is true.
  - If true, dispatch the new `pcs_feedback` event with `rating: "false"` and `feedback_text: selectedReason`.
  - Update card properties to disable further feedback (`isLikeDisabled`, `isDislikeDisabled`, styling classes) and show the toast confirmation message (AC4).

## Verification Plan

### Automated Tests
- N/A - The repository currently does not appear to rely on automated LWC jest tests for this interaction.

### Manual Verification
- Start a mock agent session and simulate receiving a Post Call Summary message.
- Verify that the thumbs up and thumbs down icons are visible on the Post Call Summary card (AC1).
- Select thumbs up and verify the "Thank you for your feedback!" toast appears (AC2) and the buttons are disabled (AC4).
- Restart the session, trigger the summary again, and select thumbs down.
- Verify that three chips appear: "Inaccurate information", "Missing information", "Contains PHI/PFI" (AC3).
- Select a chip, verify the "Thanks for providing a reason!" toast appears and the selection is visually indicated and further feedback is disabled (AC4).
- Confirm via network or logs that the LMS message is formatted precisely according to the required `pcs_feedback_event` schema.
