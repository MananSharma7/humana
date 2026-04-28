# Pin Knowledge Card

This implementation plan outlines the changes required to allow agents to pin a knowledge card during a call. The pinned card will stay at the top of the feed (easily accessible), and only one card can be pinned at a time.

## User Review Required

Please review the proposed CSS implementation. The plan relies on `position: sticky` and `order: -1` in a flex container to push the pinned card to the top visually and make it stick while the agent scrolls. This ensures the card remains easily accessible.

## Proposed Changes

### Component: Knowledge Message (`c-aa_knowledge-message`)

#### [MODIFY] aa_knowledgeMessage.html
1. Update the parent `.card` div to track the `isPinned` state via a data attribute:
   ```html
   <div
       data-is-loading={card.isLoading}
       data-is-abandoned={card.isAbandoned}
       data-is-pinned={card.isPinned}
       key={card.card_id}
       data-card-id={card.card_id}
       class="card"
   >
   ```

2. Inside the `.card-actions` div, add the pin icon before the minimize/expand icons:
   ```html
   <div class="card-actions">
       <template if:true={card.isPinned}>
           <lightning-icon
               icon-name="utility:pinned"
               alternative-text="pinned"
               size="large"
               title="pinned"
               onclick={togglePin}
               data-id={card.card_id}
               class="action-icon pinned-icon"
           ></lightning-icon>
       </template>
       <template if:false={card.isPinned}>
           <lightning-icon
               icon-name="utility:pin"
               alternative-text="pin"
               size="large"
               title="pin"
               onclick={togglePin}
               data-id={card.card_id}
               class="action-icon unpinned-icon"
           ></lightning-icon>
       </template>
       <!-- Existing minimize/expand icons remain here -->
   ```

#### [MODIFY] aa_knowledgeMessage.js
1. **Handle State Load**: Update `handleStateLoad()` to restore the `isPinned` property from local storage.
   ```javascript
   const isPinned = !!card.isPinned;
   return {
       ...card,
       isPinned: isPinned,
       // ... existing logic ...
   };
   ```

2. **Card Preparation logic**: Update `prepareAskMeAnything`, `prepareKnowledgeCard`, and `preparePostCallSummary` to preserve the `isPinned` property if the card is re-rendered by a backend update.
   ```javascript
   if (existingIndex !== -1) {
       const prevCard = this.cards[existingIndex];
       card.isPinned = prevCard.isPinned;
       // ... update array logic ...
   } else {
       card.isPinned = false;
       this.cards = [...this.cards, card];
   }
   ```

3. **Toggle Pin Method**: Add the `togglePin` action logic to handle mutual exclusivity.
   ```javascript
   togglePin(event) {
       const cardId = event.target.dataset.id;
       this.cards = this.cards.map((card) => {
           if (card.card_id === cardId) {
               return { ...card, isPinned: !card.isPinned };
           }
           // Unpin all other cards (only one card pinned at a time)
           return { ...card, isPinned: false };
       });
       this.saveState();
   }
   ```

#### [MODIFY] aa_knowledgeMessage.css
Add the following CSS to ensure the pinned card pops to the top of the feed and remains sticky, and to style the pin icons.
```css
/* Styling for pinned card */
.card[data-is-pinned="true"] {
    position: sticky;
    top: 0;
    z-index: 100;
    order: -1; /* Pushes the pinned card to the top of the flex container */
    box-shadow: 0px 4px 8px rgba(0, 0, 0, 0.2);
    border: 2px solid #0070d2;
}

/* Icon colors */
.pinned-icon {
    --sds-c-icon-color-foreground-default: #0070d2;
}

.unpinned-icon {
    --sds-c-icon-color-foreground-default: #706e6b;
}

.unpinned-icon:hover {
    --sds-c-icon-color-foreground-default: #0070d2;
}
```

## Verification Plan
### Manual Verification
1. Open the Agent Assist application and load a live call that triggers a knowledge card.
2. Select the pin icon on a card. Verify the card jumps to the top, sticks while scrolling, and the icon state changes.
3. Select the pin icon on a different card. Verify it replaces the previously pinned card.
4. Select the pin icon on the currently pinned card to unpin it. Verify it returns to its normal order and scrolling behavior.
