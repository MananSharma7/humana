# Live Transcript Pop-out Implementation Guide

To make the Live Transcript component open in a new Chrome "pop-out" window (similar to the Genesys CTI pop-out) instead of overlapping the agent component, follow these step-by-step instructions.

## 1. Create a Standalone Wrapper for the Transcript
Lightning Web Components (LWC) cannot act as a standalone URL address by themselves without a wrapper in many classic scenarios. The most robust way to open it in a new window is via an Aura Component wrapper that implements `lightning:isUrlAddressable`.

**Create an Aura Component named `aa_liveTranscriptAuraWrapper`:**

**`aa_liveTranscriptAuraWrapper.cmp`**
```xml
<aura:component implements="lightning:isUrlAddressable,flexipage:availableForAllPageTypes" access="global">
    <aura:attribute name="recordId" type="String" />

    <aura:handler name="init" value="{!this}" action="{!c.doInit}" />

    <!-- Container matching regular padding / background -->
    <div class="slds-box slds-theme_default slds-m-around_small" style="height: 100vh; overflow-y: auto;">
        
        <!-- Inject the LWC component here -->
        <!-- Ensure you pass any necessary attributes that c-aa_live-transcript requires -->
        <c:aa_liveTranscript recordId="{!v.recordId}" />
        
    </div>
</aura:component>
```

**`aa_liveTranscriptAuraWrapperController.js`**
```javascript
({
    doInit : function(component, event, helper) {
        // Read parameters from the URL (passed via window.open)
        var pageReference = component.get("v.pageReference");
        if (pageReference && pageReference.state) {
            component.set("v.recordId", pageReference.state.c__recordId);
        }
    }
})
```

## 2. Update the Parent LWC JavaScript Class
Modify `aa_agentAssistParent_LWC.js` to trigger a new Chrome pop-out window using native `window.open` rather than toggling a local boolean variable.

**`aa_agentAssistParent_LWC.js`**
Locate the `handleToggleTranscript` function (around line 906) and replace it with the following implementation:

```javascript
	handleToggleTranscript() {
		// Define the URL for your Aura Wrapper. 
		// We pass the recordId (and any other state) via the c__ parameter convention
		const baseUrl = '/lightning/cmp/c__aa_liveTranscriptAuraWrapper';
		let urlParams = '?c__recordId=' + (this.recordId || '');

		// If you need to pass interactionIDs or other state, append it to the URL string here:
		// urlParams += '&c__genesysInteractionId=' + this.genesysInteractionId;

		const fullUrl = baseUrl + urlParams;

		// Open in a new Chrome pop-out window
		// The features string strictly limits browser tools to make it look like a standalone widget
		const windowFeatures = 'width=450,height=700,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes';
		
		window.open(fullUrl, 'LiveTranscriptPopOut', windowFeatures);
	}
```

## 3. Update the Parent LWC HTML Template
Remove the existing overlapping live transcript markup from `aa_agentAssistParent_LWC.html` so it no longer renders locally to cover the knowledge components.

**`aa_agentAssistParent_LWC.html`**
Locate and **delete** the following block of code (around lines 34-40):

```html
					<!-- Live Transcript Panel (overlays main panels) -->
					<template if:true={showTranscript}>
						<div class="transcript-panel">
							<c-aa_live-transcript ontoggletranscript={handleToggleTranscript}> </c-aa_live-transcript>
						</div>
					</template>
```

*(Optional Cleanup)*: You can also safely remove the `@track showTranscript = false;` property from `aa_agentAssistParent_LWC.js` as it is no longer used for local UI toggling.

---

### Summary of Tasks:
- [ ] **[NEW]** File: `aa_liveTranscriptAuraWrapper.cmp` (Wraps LWC for standalone usage)
- [ ] **[NEW]** File: `aa_liveTranscriptAuraWrapperController.js`
- [ ] **[MODIFY]** File: `aa_agentAssistParent_LWC.js` (Update `handleToggleTranscript` to call `window.open`)
- [ ] **[MODIFY]** File: `aa_agentAssistParent_LWC.html` (Delete the `<template if:true={showTranscript}>` block)
