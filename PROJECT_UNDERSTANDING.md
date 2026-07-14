# Agent Assist Project Understanding

Last reviewed from local source: 2026-07-08

## Executive Summary

This repository is a Salesforce DX project for an Agent Assist experience used in a Salesforce Service Console / Utility Bar context. The application listens to Salesforce VoiceCall lifecycle events, opens and manages an Agent Assist utility panel, connects to an external Agent Assist websocket service, and renders agent-facing assistance during and after a call.

The main user-facing features are:

- Agent Assist utility shell with websocket lifecycle management.
- Knowledge Cards pushed by the backend during a voice interaction.
- Ask Me Anything (AMA) queries and AMA response cards.
- Interaction 360 historical interaction summaries.
- Live Transcript panel with search and sentiment-aware transcript bubbles.
- Post Call Summary (PCS) cards with telemetry and feedback.
- Splunk usage telemetry for visibility, copy, scroll, websocket, session, feedback, and panel actions.
- VoiceCall platform event bridge from Salesforce events into LWC message channels.

The codebase is primarily Lightning Web Components under `force-app/main/default/lwc`, with supporting Apex controllers and Salesforce metadata under `force-app/main/default`.

## Repository Layout

```text
.
├── force-app/main/default/classes
├── force-app/main/default/customPermissions
├── force-app/main/default/lwc
├── force-app/main/default/messageChannels
├── force-app/main/default/objects
├── force-app/main/default/permissionsets
├── config
├── scripts
├── package.json
├── sfdx-project.json
└── project handover/design docs
```

Important project files:

- `sfdx-project.json`: SFDX package config. Source API version is `65.0`, package directory is `force-app`.
- `package.json`: npm tooling for linting, formatting, and `sfdx-lwc-jest`.
- `eslint.config.js`: Salesforce LWC/Aura ESLint config.
- `jest.config.js`: extends `@salesforce/sfdx-lwc-jest/config`.
- `README.md`: default Salesforce DX starter README, not project-specific.
- `PCS_Handover_Document.md`: detailed feature handover for PCS, telemetry, feedback, transcript, Interaction 360, and cleanup work.
- `Pin_knowledge_Card.md`: design/implementation notes for pinned knowledge cards.
- `likedislikeimplementation.md`: PCS feedback implementation plan.
- `live_transcript_popout_instructions.md`: planned alternative pop-out approach for live transcript.

## Runtime Architecture

The core runtime pattern is:

1. Salesforce emits `VoiceCall__e` platform events for call lifecycle changes.
2. A platform event proxy or websocket utility subscribes to `/event/VoiceCall__e`.
3. Relevant call events are published into Lightning Message Service (LMS).
4. The parent Agent Assist LWC receives call context and sends it to the external Agent Assist websocket service.
5. The websocket service pushes back data events such as knowledge cards, AMA responses, historical interaction summaries, live transcript chunks, PCS data, and notifications.
6. Shared utility code republishes websocket events into LMS.
7. Child LWCs render feature-specific UI and publish user actions back through LMS.
8. The parent receives action events and emits corresponding websocket events.
9. Usage and behavior telemetry is sent to Splunk through `AA_LWCSplunkLogging.LWCSplunkLogging`.

The main LMS channel used by active components is:

- `LWCToUiConnectorMessengerMs__c`

The code also imports these channels, but they are not present in this repository:

- `AgentAssistLWCMessengerMs__c`
- `mp_ConsumerSearch_MessageChannel__c`
- `UtilityPopoutMessageChannel__c`

Those channels likely exist in the target org or a dependent package.

## Primary Data Flow

### Interaction Start

1. A `VoiceCall__e` platform event arrives with fields like:
   - `InteractionId__c`
   - `Voice_Call__c`
   - `Created_By__c`
   - `Call_Disposition__c`
2. `aa_platformEventProxy` publishes the event to `AgentAssistLWCMessengerMs__c`.
3. `aa_agentAssistParent_LWC` subscribes to the proxy channel and checks whether the event belongs to the current user and VoiceCall record.
4. The parent publishes or processes `set_interaction_context`.
5. The websocket sends `set_interaction_context` to Agent Assist with:
   - Genesys interaction ID, prefixed in parts of the client as `a${InteractionId__c}`
   - token
   - user network ID
   - user email
   - Salesforce user ID
6. The parent opens the Agent Assist utility panel when the call is not completed.
7. Children receive `UPDATE_INTERACTION` and reset call-specific state.

### Customer Context

When a related record is available, `aa_agentAssistParent_LWC` calls `AA_FetchRelatedRecordDetails.getRecordDetails`.

Supported related record prefixes:

- `00Q`: Lead
- `001`: Account
- `006`: Opportunity, using the related Account

The Apex method returns:

- `type`
- `custID`
- `memberID`
- `sdrID`

The parent then emits `set_customer_context` to Agent Assist using `AgentAssistEvents.set_customer_context`.

### Backend Push Events

The websocket helper `aa_UtilsHum.js` receives backend events and republishes them to `LWCToUiConnectorMessengerMs__c`.

Important backend events:

- `knowledge_card`
- `ask_me_anything_response`
- `historical_interaction_summary`
- `transcript_summary`
- `live_transcription`
- `activity_status_indicator`
- `set_interaction_context_ack`
- `set_interaction_context_notification`
- `set_customer_context_notification`
- `token_refresh_required`
- `token_expired`
- `refresh_token_notification`
- `connect_notification`
- `connection_error`
- `agent_assist_error`

### Interaction End

The parent and utility code listen for completed call disposition or explicit end messages. On end:

- `end_interaction_event` is emitted to the websocket.
- Child components clear cached state.
- Local storage keys for current interaction are removed.
- The utility monitor stops.
- Connection/visibility telemetry may be logged.

## Component Inventory

### `aa_agentAssistParent_LWC`

Path: `force-app/main/default/lwc/aa_agentAssistParent_LWC`

This is the main Agent Assist shell. It is exposed for Home Page, App Page, Record Page, and Utility Bar.

Responsibilities:

- Owns active VoiceCall record ID and current Genesys interaction ID.
- Reads current Salesforce user fields:
  - `User.Id`
  - `User.Email`
  - `User.Humana_ID__c`
- Gets an access token through either non-SSO or SSO flow.
- Initializes `AgentAssistWebsocket`.
- Subscribes to:
  - `LWCToUiConnectorMessengerMs__c`
  - `AgentAssistLWCMessengerMs__c`
  - `mp_ConsumerSearch_MessageChannel__c`
- Sends interaction context and customer context to the websocket.
- Receives child action events, including AMA query and feedback events.
- Writes Agent Assist session ID back to VoiceCall through `AA_VoiceCallFlowInvoker.runVoiceCallSessionFlow`.
- Opens and monitors the Utility Bar panel.
- Handles pop-out mode and live transcript layout.
- Logs utility open, minimized, pop-out, window close, transcript expand/collapse, and context notification telemetry.

Rendered children:

- `c-aa_knowledge-agent-assist`
- `c-aa_interaction360`
- `c-aa_live-transcript`, conditionally inside pop-out layout

Feature gates:

- `MarketPoint_Agent_Assist_Custom`
- `MarketPoint_Agent_Assist_Interaction360_Custom`
- `MarketPoint_Agent_Assist_Knowledge_Card_Custom`
- `MarketPoint_Agent_Assist_SSO`
- `MarketPoint_Agent_Assist_Live_Transcription`
- Apex feature flags:
  - `AA_Error_Framework`
  - `AA_Live_Transcription`

Important storage keys:

- `agentAssistVoiceCallId`
- `agentAssistGenesysInteractionId`
- `agentAssistInteractingMemberId`
- `int_context_error`
- `int_context_error_message`
- `cust_context_error`
- `cust_context_error_message`
- `voiceCallState`

### `aa_UtilsHum`

Path: `force-app/main/default/lwc/aa_UtilsHum`

This is a non-exposed shared utility module. It exports:

- default class `AgentAssistWebsocket`
- `AgentAssistLabels`
- `AgentAssistEvents`
- `AgentAssistSplunkLoggingUtils`

Responsibilities:

- Loads static resource `socketio`.
- Reads websocket endpoint/path/reconnection settings from `AA_WebSocketConfig.getAA_WebSocketConfig`.
- Connects to Agent Assist websocket using token auth.
- Buffers outbound events until the socket is connected.
- Subscribes to `/event/VoiceCall__e`.
- Publishes interaction start/end context into LMS.
- Registers websocket handlers for feature events.
- Emits outbound events with timeout/retry behavior.
- Disconnects websocket.
- Defines common event payload builders.
- Defines Splunk payload builders.

Important outbound payload builders:

- `refresh_token`
- `agent_feedback`
- `ask_me_anything_query`
- `authenticate_websocket`
- `end_interaction`
- `set_customer_context`
- `set_interaction_context`

Important Splunk builders:

- `splunk_logging_context`
- `splunk_outer_context`
- `splunk_inner_context`
- `splunk_agentAssistCopied_message`
- `splunk_agentAssistScrolled`
- `splunk_pcs_interaction_message`
- `splunk_pcs_call_level_message`

### `aa_knowledgeAgentAssist`

Path: `force-app/main/default/lwc/aa_knowledgeAgentAssist`

This is the container for knowledge cards and AMA.

Responsibilities:

- Gates Knowledge Card and AMA UI by custom permission and Apex feature flags.
- Renders orchestration status from `activity_status_indicator`.
- Owns the scroll container around cards.
- Logs one scroll-depth telemetry event once the user scrolls at least 20 percent.
- Shows "Jump to present" behavior through child events.
- Passes reply-card context between `aa_knowledgeMessage` and `aa_askMeAnything`.

Feature gates:

- `MarketPoint_Agent_Assist_Knowledge_Card_Custom`
- `AA_AskMeAnything`
- `MP_Knowledge_Cards`
- `MP_AskMeAnything`
- `AA_Agent_Orchestration`

Storage keys:

- `aa_orchestration_status`
- `aa_is_orchestrating`

### `aa_knowledgeMessage`

Path: `force-app/main/default/lwc/aa_knowledgeMessage`

This is the main card renderer. It renders:

- Knowledge Cards
- AMA response cards
- Post Call Summary cards

Responsibilities:

- Subscribes to `LWCToUiConnectorMessengerMs__c`.
- Converts backend card schemas into UI card state.
- Maintains card cache across refreshes using local storage.
- Filters restored cards by current user permissions.
- Handles card pinning, minimize/expand, reply, citation tooltip positioning, copy telemetry, link-click telemetry, feedback, and PCS visibility telemetry.
- Publishes feedback events back to LMS for the parent to send over websocket.

Supported card lifecycle statuses:

- `loading`
- `completed`
- `abandoned`

Knowledge and AMA card behavior:

- Completed and abandoned cards are logged once using `loggedCards`.
- Feedback uses standard `agent_feedback_event`.
- Non-summary feedback options are:
  - `Not relevant`
  - `Info not accurate`
  - `Confusing Content`
- AMA reply cards carry reply card IDs and local reply context.

PCS card behavior:

- PCS messages are received as `transcript_summary`.
- Rendering is gated by:
  - `MarketPoint_Agent_Assist_Post_Call_Summary`
  - `MP_Post_Call_Summary`
- PCS cards are non-pinnable.
- PCS sections include:
  - Reason for Call
  - Completed Actions
  - Pending Actions
- PCS generated telemetry is logged when a new PCS card is added.
- PCS viewed telemetry is logged once per card using `IntersectionObserver`.
- PCS copied telemetry is logged when copied from the card.
- PCS feedback uses exact `pcs_feedback_event` payload shape.

PCS feedback options:

- Like publishes rating `"true"` with feedback text `"No feedback_text"`.
- Dislike initially publishes rating `"false"` with feedback text `"No feedback_text"`.
- Dislike reason chips are:
  - `Inaccurate information`
  - `Missing information`
  - `Contains PHI/PFI`
- Selecting a reason publishes rating `"false"` with the selected reason.

Storage keys:

- `aa_knowledge_cards_cache`
- `aa_knowledge_interaction_id`

Important note:

- Existing handover docs mention a call-level PCS occurrence log on clear/end interaction. In the current source, `clearCards` clears cards and cache but does not emit `splunk_pcs_call_level_message`. Treat the handover and current implementation as out of sync for that specific point.

### `aa_askMeAnything`

Path: `force-app/main/default/lwc/aa_askMeAnything`

Responsibilities:

- Provides the AMA input UI.
- Supports Enter-to-submit.
- Supports reply mode when a card was selected for follow-up.
- Generates UUIDs using `window.crypto.randomUUID`.
- Publishes `ask_me_anything_query` through LMS.
- Logs AMA request/card-surfaced messages through `LoggerLWC.LogFromLWC`.

Important behavior:

- `AgentAssistEvents.ask_me_anything_query` is called without interaction/customer values at the component level. The parent later reconstructs/sends the query with interaction ID and `interactingAboutMemberId`.

### `aa_interaction360`

Path: `force-app/main/default/lwc/aa_interaction360`

Responsibilities:

- Renders historical interaction summaries returned by the backend.
- Gates display by custom permission and feature flag.
- Caches histories in local storage.
- Clears histories when a new interaction starts or the matching interaction ends.
- Displays empty/error/awaiting states.
- Provides expand/collapse UI for the whole panel and individual history rows.
- Logs chevron clicks, no-data, copy, and error telemetry.

Feature gates:

- `MarketPoint_Agent_Assist_Interaction360_Custom`
- `MP_Interaction_360`

Expected backend event:

- `historical_interaction_summary`

Expected content shape:

- `data.content[]`
- each item contains `header.date`, `header.summary_title`, and `body.summary`, `body.actions_taken`, `body.outcome`

Storage keys:

- `aa_interaction_history_cache`
- `aa_interaction_customer_id`

### `aa_liveTranscript`

Path: `force-app/main/default/lwc/aa_liveTranscript`

Responsibilities:

- Renders live transcript chunks from `live_transcription`.
- Tracks live vs ended state.
- Clears transcript on new or ended interaction.
- Handles live transcript error payloads.
- Displays caller/agent bubbles.
- Formats timestamps.
- Applies sentiment CSS class based on sentiment score:
  - positive: score greater than `0.25`
  - negative: score less than `-0.25`
  - neutral: otherwise
- Provides text search with highlight navigation and match count.
- Auto-scrolls to newest message.
- Logs chunk, error, and copy telemetry.

Feature gate is owned by parent and websocket utility:

- `MarketPoint_Agent_Assist_Live_Transcription`
- `AA_Live_Transcription`

### `aa_voiceCallDetails`

Path: `force-app/main/default/lwc/aa_voiceCallDetails`

Responsibilities:

- Wires to the VoiceCall record fields to detect call status, outcome, and related records.
- Publishes `CALL_STARTED`, `SET_CUSTOMER_CONTEXT_WIRE`, and `END_INTERACTION_WIRE` events to the LMS `VOICE_CALL_CHANNEL`.
- Updates the VoiceCall record locally via `updateRecord` for interaction sent/ended flags.

### `aa_platformEventProxy`

Path: `force-app/main/default/lwc/aa_platformEventProxy`

Responsibilities:

- Exposed utility/app/home/record component.
- Subscribes to `/event/VoiceCall__e` using EMP API.
- Publishes raw platform event responses to `AgentAssistLWCMessengerMs__c`.
- Registers EMP API error listener.

This component appears to be the intended bridge from platform events to the main parent component.

### `aa_agentAssistParentLWCWrapper`

Path: `force-app/main/default/lwc/aa_agentAssistParentLWCWrapper`

Responsibilities:

- Exposed wrapper/launcher.
- Uses `NavigationMixin` to open `c__aa_agentAssistParent_LWC_ARC` in a separate browser window.
- Uses session storage key `DISABLE_UTILITY_AUTOLOAD` to avoid repeatedly opening the same window.
- Uses `BroadcastChannel('salesforce_window_channel')` to detect window close.

Current source status:

- Large portions are commented or partially implemented.
- It references symbols that are not imported in this file, such as `AgentAssist_Labels`, `AuthErrorClass`, `LWCLogger`, and `logError`.
- It looks more like a launcher experiment or legacy wrapper than the main active panel.

### `aa_VoiceCallSubscriber`

Path: `force-app/main/default/lwc/aa_VoiceCallSubscriber`

Responsibilities:

- Exposed component that subscribes directly to `/event/VoiceCall__e`.
- Contains commented-out logic and an unused `handleEvent` publisher.

Current source status:

- Appears experimental or superseded by `aa_platformEventProxy` and `AgentAssistWebsocket.subscribeToVoicecallEvent`.

### `aa_wireHandler`

Path: `force-app/main/default/lwc/aa_wireHandler`

Responsibilities:

- Wires to a `VoiceCall` record and observes related fields.
- Attempts to end interaction when call reason and outcome are present.

Current source status:

- Not exposed.
- Contains incomplete references such as `subscribe`, `APPLICATION_SCOPE`, `messageContext`, and `getRelatedRecordDetails` without imports/definitions.
- Appears legacy/incomplete.

### `aa_UtilityPopoutListener`

Path: `force-app/main/default/lwc/aa_UtilityPopoutListener`

Responsibilities:

- Checks Utility Bar pop-out status and listens to `UtilityPopoutMessageChannel__c`.

Current source status:

- Supporting/experimental utility. The message channel is not present in this repo.

### `temp-files`, `agentAssistParentOLD.js`, `knowledgeMessageOLD.js`, `temp.js`, `temp.html`

These appear to be scratch, archived, or legacy files. They should not be treated as primary runtime source unless confirmed by the deployment target.

## Apex Inventory

### `AA_AzureOAuthCallout`

Invocable class that calls named credential/callout endpoint `AzureAgentAssistOAuth/oauth2/v2.0/token` and returns an OAuth token from `access_token`.

### `AA_IntegrationController`

Invocable class for Azure OAuth token retrieval using org-specific custom metadata and shared integration utilities:

- `MP_CalloutSettingMetadataSelector`
- `MP_ApexContantsClass`
- `MP_CalloutSettingMetadataSingleton`
- `MP_ApexCommonUtils`
- `IntegrationUtil`
- `LogService`

These dependencies are not defined in this repository, so they are expected to exist in the target org or another package.

### `AA_FetchRelatedRecordDetails`

Aura-enabled methods:

- `getRecordDetails(String relatedRecordId)`
- `getVoiceCallDetails(String voiceCallId)`

`getRecordDetails` maps Lead, Account, or Opportunity to customer/member identifiers used for Agent Assist customer context.

Observed detail:

- For Account and Opportunity paths, `response.put('type', 'Lead')` is used. This may be intentional for backend schema compatibility, but the naming is suspicious.

### `AA_Utility`

Responsibilities:

- Updates `VoiceCall.AgentAssist_Session_ID__c`.
- Finds the latest in-progress VoiceCall for a user.
- Builds an `AA_InteractionContext`.
- Checks user permission set assignments against Agent Assist permission set names.

Observed risk:

- `getInteractionContext` indexes `voiceCallList[0]` without first checking whether a matching VoiceCall exists.

### `AA_setSessionIdInVoiceCall`

Aura-enabled helper to set `AgentAssist_Session_ID__c` on a passed `VoiceCall`.

### `AA_CheckUserPermission`

Invocable class to check whether the user associated to a VoiceCall has one of these permission sets:

- `MarketPoint_Agent_Assist`
- `MarketPoint_Agent_Assist_Interaction360`
- `MarketPoint_Agent_Assist_Knowledge_Card`

### `AA_TelephonyVoiceCallService`

Creates VoiceCall records through Salesforce Telephony API:

- endpoint: `/services/data/v61.0/telephony/v1/voiceCalls`
- provider header: `Amazon Connect`

### `AA_RecordReader`

Aura-enabled generic record reader that builds dynamic SOQL from object and field inputs.

Observed risk:

- It uses `String.escapeSingleQuotes`, but object and field names are still dynamically accepted. Safer production code should validate names against schema describe metadata.

### `AA_RecordReaderTest`

Basic tests for `AA_RecordReader`.

## Salesforce Metadata

### Platform Event

Object: `VoiceCall__e`

Properties:

- High volume platform event.
- Deployed.
- Publish behavior: `PublishImmediately`.

Fields:

- `Voice_Call__c`: Text, length 50.
- `Created_By__c`: Text, length 100.
- `Call_Disposition__c`: Text, length 5.
- `InteractionId__c`: Text, length 100.

### Message Channel

`LWCToUiConnectorMessengerMs`

Exposed LMS channel with fields:

- `messageToSend`
- `sourceSystem`

Important note:

- The runtime code publishes arbitrary objects with `type` and `data` to this channel. The field metadata is generic and does not strictly document the runtime shape.

### Custom Permission and Permission Set

Present locally:

- Custom permission: `MarketPoint_Agent_Assist_Knowledge_Message_Custom`
- Permission set: `Agent_Assist_Knowledge_Message_Access`

Referenced by code but not present locally:

- `MarketPoint_Agent_Assist_Custom`
- `MarketPoint_Agent_Assist_Interaction360_Custom`
- `MarketPoint_Agent_Assist_Knowledge_Card_Custom`
- `AA_AskMeAnything`
- `MarketPoint_Agent_Assist_Post_Call_Summary`
- `MarketPoint_Agent_Assist_SSO`
- `MarketPoint_Agent_Assist_Live_Transcription`

## Feature Flags

The project uses `AA_Utility.isFeatureEnabled` from Apex, but that Apex method is not present in the local `AA_Utility.cls` file. This likely means the method exists in the org/package but is absent from this repo snapshot, or this source does not currently compile standalone.

Referenced feature names:

- `AA_Error_Framework`
- `AA_Live_Transcription`
- `MP_AskMeAnything`
- `MP_Knowledge_Cards`
- `AA_Agent_Orchestration`
- `MP_Post_Call_Summary`
- `MP_Interaction_360`

The websocket config also contains feature flags:

- `i360`
- `knowledge`
- `ama`

## Event and Payload Summary

### LMS Event Envelope

Most internal LMS messages use:

```json
{
  "type": "event_name",
  "data": {}
}
```

Created by:

```javascript
AgentAssistEvents.aa_lms_event(type, data)
```

### Set Interaction Context

Outbound websocket event:

```json
{
  "version": "0.1",
  "event_type": "set_interaction_context",
  "data": {
    "card_metadata": {
      "interaction_id": "",
      "interaction_id_type": "voice",
      "token": "",
      "user_network_id": "",
      "user_email": "",
      "salesforce_user_id": ""
    }
  }
}
```

### Set Customer Context

Outbound websocket event:

```json
{
  "version": "0.1",
  "event_type": "set_customer_context",
  "data": {
    "card_metadata": {
      "interacting_about": {
        "customer_type": "",
        "enterprise_person_id": "",
        "customer_id": ""
      },
      "get_historical_interactions": true,
      "interaction_id": "",
      "interaction_id_type": "voice"
    }
  }
}
```

### AMA Query

Outbound websocket event:

```json
{
  "version": "0.1",
  "event_type": "ask_me_anything_query",
  "data": {
    "card_metadata": {
      "interaction_id": "",
      "interaction_id_type": "voice",
      "customer_type": "member",
      "enterprise_person_id": "",
      "member_id": "",
      "customer_id": "",
      "card_id": "",
      "reply": false,
      "reply_card_ids": [],
      "query_id": "",
      "timestamp": "",
      "card_status": {
        "visible": true,
        "value": "loading"
      },
      "transcript_reference": {
        "transcript_id": "",
        "start_timestamp": "",
        "end_timestamp": ""
      }
    },
    "content": {
      "query": {
        "text": ""
      }
    }
  }
}
```

### Agent Feedback

Outbound websocket event:

```json
{
  "version": "1.0",
  "event_type": "agent_feedback_event",
  "data": {
    "card_metadata": {
      "interaction_id": "",
      "card_id": "",
      "interaction_id_type": "voice"
    },
    "feedback": {
      "feedback_text": "",
      "rating": true
    }
  }
}
```

### PCS Feedback

Outbound websocket event:

```json
{
  "version": "1.0",
  "event_type": "pcs_feedback_event",
  "data": {
    "card_metadata": {
      "interaction_id": "",
      "user_network_id": ""
    },
    "feedback": {
      "feedback_text": "No feedback_text",
      "rating": "true"
    }
  }
}
```

The parent special-cases this event type and emits it over websocket as `pcs_feedback_event` without reformatting into `agent_feedback_event`.

### End Interaction

Outbound websocket event:

```json
{
  "version": "1.0",
  "event_type": "end_interaction_event",
  "data": {
    "card_metadata": {
      "interaction_id": "",
      "interaction_id_type": "voice"
    }
  }
}
```

## Telemetry Model

Telemetry uses two Apex loggers:

- `LoggerLWC.LogFromLWC` for general application logging.
- `AA_LWCSplunkLogging.LWCSplunkLogging` for Splunk usage events.

Splunk event name is commonly:

```text
AgentAssistUsageEvent
```

Common Splunk context fields:

- `ComponentName`
- `GenesysInteractionId`
- `DateTime`
- `SalesforceUserId`
- `LogEventType`
- `Message`
- `TransactionName`

Important transaction names in the current source:

- `Websocket Connected`
- `Websocket Disconnected`
- `WebSocket Connection Error`
- `Call Ended`
- `Interaction Context Set`
- `AgentAssistSessionInitiated`
- `AgentAssistSessionFailedToInitiate`
- `Interaction360Available`
- `Interaction360NoDataToDisplay`
- `Interaction360ChevronClicked`
- `AskMeAnythingRequestSubmitted`
- `AskMeAnythingCardCompleted`
- `AskMeAnythingCardAbandoned`
- `KnowledgeCard_Completed`
- `KnowledgeCard_Abandoned`
- `KnowledgeCard_copied`
- `KnowledgeCard_LinkClicked`
- `AMA_copied`
- `AMA_LinkClicked`
- `PCS_generated`
- `PCS_viewed`
- `PCS_copied`
- `PCS_Expanded`
- `PCS_Collapsed`
- `AA Scroll`
- `AA Copy`
- `AA_AutoOpen`
- `AA_PopedOut`
- `AA_Minimized`
- `AA_WINDOW_CLOSE`
- `LiveTranscriptExpanded`
- `LiveTranscriptCollapsed`
- `LiveTranscriptChunkPublished`
- `LiveTranscriptError`

## Local Storage and Session Storage

The UI intentionally persists several pieces of call state for refresh/pop-out continuity.

Local storage:

- `agentAssistVoiceCallId`
- `agentAssistGenesysInteractionId`
- `agentAssistInteractingMemberId`
- `aa_knowledge_cards_cache`
- `aa_knowledge_interaction_id`
- `aa_interaction_history_cache`
- `aa_interaction_customer_id`
- `aa_orchestration_status`
- `aa_is_orchestrating`
- `int_context_error`
- `int_context_error_message`
- `cust_context_error`
- `cust_context_error_message`

Session storage:

- `voiceCallState`
- `DISABLE_UTILITY_AUTOLOAD`

Broadcast channel:

- `salesforce_window_channel`

## Build, Lint, Test, and Formatting

From `package.json`:

```bash
npm run lint
npm run test
npm run test:unit
npm run test:unit:watch
npm run test:unit:debug
npm run test:unit:coverage
npm run prettier
npm run prettier:verify
```

Pre-commit tooling:

- Husky
- lint-staged
- Prettier for source-like files
- ESLint for Aura/LWC JavaScript
- Related LWC Jest tests for LWC changes

Current automated test coverage visible in this repo:

- Apex: `AA_RecordReaderTest`
- LWC Jest tests: none found in the reviewed file list.

## Deployment Notes

Typical SFDX deployment for the active Agent Assist feature areas would include:

```bash
sf project deploy start --source-dir force-app/main/default/lwc/aa_agentAssistParent_LWC --source-dir force-app/main/default/lwc/aa_UtilsHum --source-dir force-app/main/default/lwc/aa_knowledgeAgentAssist --source-dir force-app/main/default/lwc/aa_knowledgeMessage --source-dir force-app/main/default/lwc/aa_askMeAnything --source-dir force-app/main/default/lwc/aa_interaction360 --source-dir force-app/main/default/lwc/aa_liveTranscript --source-dir force-app/main/default/lwc/aa_platformEventProxy
```

However, this repository references org/package assets that are not present locally. A full standalone deployment likely also needs:

- missing Apex classes:
  - `AA_AzureOAuthGraphCallout`
  - `AA_VoiceCallFlowInvoker`
  - `AA_WebSocketConfig`
  - `AA_LWCSplunkLogging`
  - `LoggerLWC`
  - integration/logging framework classes referenced by Apex
- missing message channels:
  - `AgentAssistLWCMessengerMs__c`
  - `mp_ConsumerSearch_MessageChannel__c`
  - `UtilityPopoutMessageChannel__c`
- missing custom permissions listed earlier
- static resource `socketio`
- named credential/callout configuration for Azure OAuth and websocket config metadata
- feature flag implementation behind `AA_Utility.isFeatureEnabled`

## Current Risks and Gaps Observed

These are source observations, not changes made.

1. `aa_agentAssistParent_LWC.js` imports `./layoutConfig`, but no `layoutConfig.js` exists in that component folder.
2. `aa_agentAssistParent_LWC.js` has duplicate method names for SSO/auth handling and duplicate `@wire` method name `wired`; this can make behavior hard to reason about and may cause one definition to override another.
3. `aa_agentAssistParent_LWC.js` references `logError` but does not import it.
4. `aa_agentAssistParent_LWC.js` has a `CALL_CONNECTED` case that references `msg`, but the variable in scope is `message`.
5. `aa_agentAssistParent_LWC.js` uses `currentmembertype` without `this.` in at least one condition.
6. `aa_agentAssistParentLWCWrapper` references `AgentAssist_Labels`, `AuthErrorClass`, `LWCLogger`, and `logError` without imports.
7. `aa_agentAssistParentLWCWrapper.disconnectedCallback` calls `this.this.unsubscribeToAgentAssistMessageMessageChannel()`, which looks incorrect.
8. `aa_wireHandler` has incomplete imports and undefined methods/properties.
9. `aa_VoiceCallSubscriber` appears unfinished and does not currently publish in the active subscription callback.
10. `AA_Utility.getInteractionContext` indexes into `voiceCallList[0]` without checking for an empty list.
11. `AA_RecordReader` accepts dynamic object and field names; schema describe validation would be safer than string escaping alone.
12. `AA_FetchRelatedRecordDetails.getRecordDetails` labels Account and Opportunity responses as `type = 'Lead'`, which may be intentional schema compatibility but should be verified.
13. Several runtime dependencies are expected from the org/package and are not represented in this repo snapshot.
14. Existing handover docs and current source differ on call-level PCS occurrence telemetry.

## Practical Debugging Checklist

When debugging the app in Salesforce:

1. Confirm the user has the required custom permissions and permission sets.
2. Confirm all Apex feature flags return expected values.
3. Confirm `socketio` static resource loads.
4. Confirm `AA_WebSocketConfig.getAA_WebSocketConfig` returns endpoint, path, reconnection properties, and feature flags.
5. Confirm token retrieval path:
   - SSO path through `getSSOAccessToken`, `getAzureCallout`, `revokeAccess`
   - non-SSO path through `getAccessToken`
6. Confirm `/event/VoiceCall__e` is published and received.
7. Confirm platform event payload user/record IDs match the current utility panel.
8. Confirm `set_interaction_context` is emitted and an ack/notification returns.
9. Confirm `runVoiceCallSessionFlow` updates the VoiceCall session ID.
10. Confirm `set_customer_context` emits only after related record data is resolved.
11. Confirm child components receive LMS events on `LWCToUiConnectorMessengerMs__c`.
12. Confirm telemetry calls reach `AA_LWCSplunkLogging.LWCSplunkLogging`.
13. Inspect local storage keys if stale cards or histories appear after refresh.

## Recommended Cleanup Priorities

If this project is going toward production hardening, the highest-value cleanup items are:

1. Restore or add missing source dependencies needed for standalone compile.
2. Resolve duplicate methods and missing imports in `aa_agentAssistParent_LWC`.
3. Decide whether `aa_agentAssistParentLWCWrapper`, `aa_VoiceCallSubscriber`, `aa_wireHandler`, `temp-files`, and old JS files are active or should be archived outside deployable source.
4. Add LWC Jest tests around:
   - LMS event handling
   - card rendering for Knowledge, AMA, and PCS
   - PCS feedback payloads
   - interaction end clearing
   - live transcript chunk/error/search behavior
5. Add Apex tests for all deployable Apex, especially callout/token and VoiceCall update paths.
6. Replace dynamic SOQL object/field string acceptance with describe-based validation in `AA_RecordReader`.
7. Reconcile handover docs with current source, especially PCS call-level telemetry.
8. Document org-level dependencies in a deployment manifest or setup guide.

## Mental Model for Future Development

Treat this app as an event-driven shell:

- The parent owns identity, token, VoiceCall, utility, and websocket state.
- `aa_UtilsHum` owns websocket mechanics and shared schema builders.
- LMS is the local event bus between parent and children.
- Child panels should render state and publish user actions; they should not own websocket transport.
- Backend-pushed payloads are normalized into simple card/history/transcript UI state at component boundaries.
- Splunk logging is a first-class behavior and should be kept with every new user-visible interaction.

