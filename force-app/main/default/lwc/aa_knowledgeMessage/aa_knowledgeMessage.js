import { LightningElement, track, api, wire } from 'lwc';
import { publish, subscribe, unsubscribe, APPLICATION_SCOPE, MessageContext } from 'lightning/messageService';
import VOICE_CALL_CHANNEL from '@salesforce/messageChannel/LWCToUiConnectorMessengerMs__c';
import Toast from 'lightning/toast';
import { AgentAssistLabels, AgentAssistEvents } from 'c/aa_UtilsHum';
import hasAgentAssistPermission from '@salesforce/customPermission/MarketPoint_Agent_Assist_Custom';
import hasKnowledgeCardPermission from '@salesforce/customPermission/MarketPoint_Agent_Assist_Knowledge_Card_Custom';
import hasAMAPermission from '@salesforce/customPermission/AA_AskMeAnything';
import hasPostCallSummaryPermission from '@salesforce/customPermission/MarketPoint_Agent_Assist_Post_Call_Summary';
import isFeatureEnabled from '@salesforce/apex/AA_Utility.isFeatureEnabled';
import LWCLogger from '@salesforce/apex/LoggerLWC.LogFromLWC';

export default class Aa_knowledgeMessage extends LightningElement {
	@track _isJumpInPresentVisible = false;
	@api
	get isJumpInPresentVisible() {
		return this._isJumpInPresentVisible;
	}
	set isJumpInPresentVisible(value) {
		this._isJumpInPresentVisible = value;
	}
	@track errorMessage;
	messageTimeout;
	@track amaErrorMessage = '';
	@track knowledgeErrorMessage = '';
	lastMessageContext = null;
	showComponent = hasAgentAssistPermission;
	knowledgeCardPermission = hasKnowledgeCardPermission;
	amaPermission = hasAMAPermission;
	isPostCallSummaryPermission = hasPostCallSummaryPermission;
	isPostCallSummaryEnabled = false;

	interactionId = null;
	_recordId;
	@api recordId;
	pollingInterval = null;

	@wire(MessageContext)
	messageContext;

	mockSubscription = null;
	@track cards = [];
	Name_consumer = 'Brian';
	cardMap = new Map();

	get error() {
		return this.errorMessage ? true : false;
	}

	connectedCallback() {
		console.log('aa_knowledgeMessage connectedCallback: Record ID = ' + this.recordId);
		this.updateJumpToPresent();
		this.subscribeToMessageChannel();
		this.handleStateLoad();
	}

	handleStateLoad() {
		try {
			const navEntries = performance.getEntriesByType('navigation');
			const isReload = navEntries.length > 0 && navEntries[0].type === 'reload';
			console.log('handleStateLoad: isReload = ' + isReload);

			const cachedCards = localStorage.getItem('aa_knowledge_cards_cache');
			const cachedInteractionId = localStorage.getItem('aa_knowledge_interaction_id');

			console.log('handleStateLoad: Cached Cards found: ' + !!cachedCards + ' ' + cachedCards);
			console.log('handleStateLoad: Cached Interaction ID: ', cachedInteractionId);

			if (cachedCards) {
				this.cards = JSON.parse(cachedCards);
				if (!Array.isArray(this.cards)) {
					this.cards = [];
				}
				this.cards = this.cards.map((card) => {
					if (!card) return card;
					const isMinimized = !!card.isMinimized;
					const isPinned = !!card.isPinned;
					const isPinnable = card.isPinnable !== undefined ? card.isPinnable : !card.isSummary;
					return {
						...card,
						isMinimized: isMinimized,
						isPinned: isPinned,
						isPinnable: isPinnable,
						contentClass: isMinimized ? 'card-content-collapsible minimized' : 'card-content-collapsible'
					};
				});

				// Filter based on permissions
				this.cards = this.cards.filter((card) => {
					if (card.card_AMA && !this.amaPermission) return false;
					if (!card.card_AMA && !this.knowledgeCardPermission) return false;
					return true;
				});
				console.log('handleStateLoad: Restored ' + this.cards.length + ' cards.');
				this.updateJumpToPresent();
			}
			if (cachedInteractionId) {
				this.interactionId = cachedInteractionId;
				console.log('handleStateLoad: Restored Interaction ID: ' + this.interactionId);
			}
		} catch (e) {
			console.error('Error loading state', e);
		}
	}

	saveState() {
		try {
			console.log('saveState: Saving ' + this.cards.length + ' cards. InteractionID: ' + this.interactionId);
			localStorage.setItem('aa_knowledge_cards_cache', JSON.stringify(this.cards));
			if (this.interactionId) {
				localStorage.setItem('aa_knowledge_interaction_id', this.interactionId);
			}
		} catch (e) {
			console.error('Error saving state', e);
		}
	}

	disconnectedCallback() {
		console.log('Disconnected from webhook!!');
		if (this.mockSubscription) {
			unsubscribe(this.mockSubscription);
			this.mockSubscription = null;
		}
	}

	subscribeToMessageChannel() {
		try {
			if (!this.mockSubscription) {
				if (!this.messageContext) {
					throw new Error('MessageContext not available');
				}
				if (!VOICE_CALL_CHANNEL) {
					throw new Error('Message channel not found');
				}
				this.mockSubscription = subscribe(
					this.messageContext,
					VOICE_CALL_CHANNEL,
					(message) => {
						console.log('Message => ' + JSON.stringify(message, null, 2));
						this.handleAgentAssistMessage(message);
					},
					{ scope: APPLICATION_SCOPE }
				);
			} else {
				console.error('Subscription failed: MessageContext or Channel missing');
			}
		} catch (error) {
			console.log('inside catch');
			console.log('Error => ' + JSON.stringify(error));
		}
	}

	showError(message) {
		this.errorMessage = message;
	}

	prepareAskMeAnything(message) {
		try {
			if (!this.amaPermission) {
				console.log('prepareAskMeAnything: No AMA permission, skipping.');
				return;
			}
			console.log(' => In handleAgentAssistMessage try');
			this.amaErrorMessage = null;

			if (message.type === AgentAssistLabels.ASK_ME_ANYTHING_RESPONSE) {
				this.lastMessageContext = 'AMA';
			}

			this.amaErrorMessage = null;
			console.log(' => In ask_me_anything_response');
			const messageData = message.data.data;
			const cardMetadata = messageData.card_metadata;
			const content = messageData.content;
			let isLoading = false;
			let isAbandoned = false;
			let isCompleted = false;
			let isFooter = false;
			const cardStatus = cardMetadata?.card_status?.value;

			switch (cardStatus) {
				case 'loading':
					isLoading = true;
					break;
				case 'completed':
					isCompleted = true;
					isFooter = true;
					LWCLogger({
						messageText:
							'Ask Me Anything Card Completed; Interaction ID: ' +
							localStorage.getItem('agentAssistGenesysInteractionId') +
							'; Agent Assist Session ID: ' +
							localStorage.getItem('agentAssistVoiceCallId') +
							'; Card Title: ' +
							content?.header +
							'; Card ID: ' +
							cardMetadata?.card_id,
						source: 'prepareAskMeAnything | AMA',
						level: 'info'
					});
					break;
				case 'abandoned':
					isAbandoned = true;
					LWCLogger({
						messageText:
							'Ask Me Anything Card Abandoned; Interaction ID: ' +
							localStorage.getItem('agentAssistGenesysInteractionId') +
							'; Agent Assist Session ID: ' +
							localStorage.getItem('agentAssistVoiceCallId') +
							'; Card Title: ' +
							content?.header +
							'; Card ID: ' +
							cardMetadata?.card_id,
						source: 'prepareAskMeAnything | AMA',
						level: 'info'
					});
					break;
				default:
					console.error('Unknown card status => ', cardStatus);
			}

			let replyContext = content?.reply_context
				? {
						header: content.reply_context.header,
						query: content.reply_context.query,
						card_id: content.reply_context.card_id
					}
				: null;

			console.log('prepareAskMeAnything: extracted replyContext:', JSON.stringify(replyContext));

			if (!replyContext && cardMetadata?.reply_card_ids && cardMetadata.reply_card_ids.length > 0) {
				const replyCardId = cardMetadata.reply_card_ids[0];
				const repliedCard = this.cards.find((c) => c.card_id === replyCardId);

				if (repliedCard) {
					let contextText = repliedCard.body?.text || '';
					if (repliedCard.list_subheader && repliedCard.list_subheader.length > 0) {
						contextText = repliedCard.list_subheader[0].text;
					}
					replyContext = {
						header: repliedCard.header,
						query: contextText,
						card_id: replyCardId
					};
					console.log('prepareAskMeAnything: Constructed local replyContext:', JSON.stringify(replyContext));
				} else {
					console.log('prepareAskMeAnything: Replied card not found locally with ID:', replyCardId);
				}
			}

			const card = {
				card_id: cardMetadata?.card_id || Date.now(),
				isLoading,
				isAbandoned,
				isCompleted,
				isFooter,
				card_AMA: true,
				isPinnable: true,
				consumer_name: content?.caller_name || '',
				reply: '',
				replyContext,
				header: content?.header || '',
				sub_heading: content?.body?.[0]?.sub_heading?.text || '',
				isExpanded: false,
				isMinimized: false,
				contentClass: 'card-content-collapsible',
				list_subheader: content?.body?.[0]?.sub_heading?.list || null,
				body: {
					text: isAbandoned
						? `We couldn't complete your request. No relevant information found at this time. As Agent Assist continues to grow and improve, more complete responses will become available.`
						: content?.body?.[1]?.text?.text || '',
					citation: null
				},
				list: isAbandoned ? null : content?.body?.[1]?.text?.list || null
			};

			if (!Array.isArray(this.cards)) {
				this.cards = [];
			}
			const existingIndex = this.cards.findIndex((c) => c.card_id === card.card_id);
			console.log('existingIndex =>' + existingIndex);

			if (existingIndex !== -1) {
				const prevCard = this.cards[existingIndex];
				card.isPinned = prevCard.isPinned;
				this.cards = [...this.cards.slice(0, existingIndex), card, ...this.cards.slice(existingIndex + 1)];
			} else {
				card.isPinned = false;
				this.cards = [...this.cards, card];
			}
			this.saveState();
			console.log('Cards => ' + JSON.stringify(this.cards, null, 2));
			this.errorMessage = null;
			this.amaErrorMessage = null;
			this.updateJumpToPresent();
		} catch (error) {
			console.log('Error => ' + error);
			console.log('Error => ' + error.stack);
			this.showError('We are unable to retrieve suggestions at this time');
		}
	}

	togglePin(event) {
		const cardId = event.target.dataset.id;
		this.cards = this.cards.map((card) => {
			if (card.card_id === cardId) {
				return { ...card, isPinned: !card.isPinned };
			}
			return { ...card, isPinned: false };
		});
		this.saveState();
	}

	toggleMinimize(event) {
		const cardId = event.target.dataset.id;
		this.cards = this.cards.map((card) => {
			if (card.card_id === cardId) {
				const isMinimized = !card.isMinimized;
				return {
					...card,
					isMinimized: isMinimized,
					contentClass: isMinimized ? 'card-content-collapsible minimized' : 'card-content-collapsible'
				};
			}
			return card;
		});
		this.saveState();
	}

	handleContextClick(event) {
		event.stopPropagation();
		const cardId = event.currentTarget.dataset.id;
		console.log('handleContextClick: clicked cardId:', cardId);

		const container = this.template.querySelector('.container');

		const targetCard = container?.querySelector(`div[data-card-id="${cardId}"]`);
		console.log('handleContextClick: targetCard found:', !!targetCard);

		if (targetCard) {
			targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
			targetCard.animate([{ backgroundColor: 'rgba(255, 255, 0, 0.3)' }, { backgroundColor: 'transparent' }], {
				duration: 2000
			});
		} else {
			console.warn(`Card with ID ${cardId} not found in DOM.`);
		}
	}

	prepareKnowledgeCard(message) {
		try {
			if (!this.knowledgeCardPermission) {
				console.log('prepareKnowledgeCard: No Knowledge permission, skipping.');
				return;
			}
			console.log(' => In handleAgentAssistMessage try');
			this.amaErrorMessage = null;

			if (message.type === AgentAssistLabels.KNOWLEDGE_CARD) {
				this.lastMessageContext = 'KNOWLEDGE';
			}
			this.amaErrorMessage = null;
			console.log(' => In KNOWLEDGE_CARD_response');
			const messageData = message.data.data;
			const cardMetadata = messageData.card_metadata;
			const content = messageData.content;
			let isLoading = false;
			let isAbandoned = false;
			let isCompleted = false;
			let isFooter = false;
			const cardStatus = cardMetadata?.card_status?.value;

			switch (cardStatus) {
				case 'loading':
					isLoading = true;
					break;
				case 'completed':
					isCompleted = true;
					isFooter = true;
					LWCLogger({
						messageText:
							'Knowledge Card Completed; Interaction ID: ' +
							localStorage.getItem('agentAssistGenesysInteractionId') +
							'; Agent Assist Session ID: ' +
							localStorage.getItem('agentAssistVoiceCallId') +
							'; Card Title: ' +
							content?.header +
							'; Card ID: ' +
							cardMetadata?.card_id,
						source: 'prepareKnowledgeCard | Knowledge Cards',
						level: 'info'
					});
					break;
				case 'abandoned':
					isAbandoned = true;
					LWCLogger({
						messageText:
							'Knowledge Card Abandoned; Interaction ID: ' +
							localStorage.getItem('agentAssistGenesysInteractionId') +
							'; Agent Assist Session ID: ' +
							localStorage.getItem('agentAssistVoiceCallId') +
							'; Card Title: ' +
							content?.header +
							'; Card ID: ' +
							cardMetadata?.card_id,
						source: 'prepareKnowledgeCard | Knowledge Cards',
						level: 'info'
					});
					break;
				default:
					console.error('Unknown card status => ', cardStatus);
			}

			const card = {
				card_id: cardMetadata?.card_id || Date.now(),
				isLoading,
				isAbandoned,
				isCompleted,
				isFooter,
				card_AMA: false,
				isPinnable: true,
				reply: '',
				header: content?.header || '',
				sub_heading: content?.body?.[0]?.sub_heading?.text || '',
				isExpanded: false,
				isMinimized: false,
				contentClass: 'card-content-collapsible',
				list_subheader: content?.body?.[0]?.sub_heading?.list || null,
				body: {
					text: isAbandoned
						? `We couldn't complete your request. No relevant information found at this time. As Agent Assist continues to grow and improve, more complete responses will become available.`
						: content?.body?.[1]?.text?.text || '',
					citation: null
				},
				list: isAbandoned ? null : content?.body?.[1]?.text?.list || null
			};

			if (!Array.isArray(this.cards)) {
				this.cards = [];
			}

			const existingIndex = this.cards.findIndex((c) => c.card_id === card.card_id);
			console.log('existingIndex =>' + existingIndex);

			if (existingIndex !== -1) {
				const prevCard = this.cards[existingIndex];
				card.isPinned = prevCard.isPinned;
				this.cards = [...this.cards.slice(0, existingIndex), card, ...this.cards.slice(existingIndex + 1)];
			} else {
				card.isPinned = false;
				this.cards = [...this.cards, card];
			}
			this.saveState();
			console.log('Cards => ' + JSON.stringify(this.cards, null, 2));
			this.errorMessage = null;
			this.knowledgeErrorMessage = null;
			this.updateJumpToPresent();
		} catch (error) {
			console.log('Error => ' + error);
			console.log('Error => ' + error.stack);
			this.showError('We are unable to retrieve suggestions at this time');
		}
	}
	preparePostCallSummary(message) {
		try {
			let isSumError = '';
			if (message?.data?.error?.error_status == true) {
				isSumError = message?.data?.error?.user_message;
			}

			if (message.type === AgentAssistLabels.POST_CALL_SUMMARY) {
				this.lastMessageContext = 'Summary';
			}
			const messageData = message?.data?.data || '';
			const summaryTitle = messageData?.summary_title || 'Post Call Summary Error';

			const actions = messageData?.actions_taken || '';
			const outcome = messageData?.outcome || '';
			const conversationId = messageData?.conversation_id || '';
			let isLoading = false;
			let isAbandoned = false;
			let isCompleted = false;
			let isFooter = true;
			let isSummary = false;

			const card = {
				card_id: conversationId || Date.now(),
				isLoading,
				isAbandoned,
				isCompleted,
				isFooter,
				isSummary: true,
				isSumError,
				card_AMA: false,
				isPinnable: false,
				reply: '',
				header: 'Summary: ' + summaryTitle || '',
				sub_heading: '',
				isExpanded: false,
				list_subheader: '',
				body: {
					text: '',
					citation: null
				},
				list: null,
				reasonForCall: messageData.summary,
				completedActions: actions,
				pendingActions: outcome
			};

			if (!Array.isArray(this.cards)) {
				this.cards = [];
			}

			const existingIndex = this.cards.findIndex((c) => c.card_id === card.card_id);

			if (existingIndex !== -1) {
				const prevCard = this.cards[existingIndex];
				card.isPinned = prevCard.isPinned;
				this.cards = [...this.cards.slice(0, existingIndex), card, ...this.cards.slice(existingIndex + 1)];
			} else {
				card.isPinned = false;
				this.cards = [...this.cards, card];
			}
			this.saveState();
			this.errorMessage = null;
			this.SummaryErrorMessage = null;
			this.updateJumpToPresent();
			LWCLogger({
				messageText:
					'Post Call Summary Completed; Interaction ID: ' +
					localStorage.getItem('agentAssistGenesysInteractionId') +
					'; Agent Assist Session ID: ' +
					localStorage.getItem('agentAssistVoiceCallId') +
					'; Card ID: ' +
					card?.card_id +
					'; Summary Title: ' +
					summaryTitle,
				source: 'prepareKnowledgeCard | Post Call Summary',
				level: 'info'
			});
		} catch (error) {
			this.showError('We are unable to retrieve Summary at this time');
		}
	}

	handleInteractionContext(message) {
		try {
			const messageData = message?.data?.data;
			if (!messageData?.card_metadata) {
				console.warn('handleInteractionContext: Missing card_metadata', JSON.stringify(message));
				return;
			}
			const cardMetadata = messageData.card_metadata;
			const newInteractionId = cardMetadata?.interaction_id;

			if (newInteractionId && this.interactionId && this.interactionId !== newInteractionId) {
				console.log('handleInteractionContext: New Interaction ID detected. Clearing old knowledge cards.');
				this.cards = [];
				localStorage.removeItem('aa_knowledge_cards_cache');
			}

			this.interactionId = newInteractionId;
			this.saveState();
		} catch (error) {
			console.log('Error => ' + error);
			console.log('Error => ' + error.stack);
		}
	}

	handleAgentAssistMessage(message) {
		console.log('handleAgentAssistMessage: Msg Type = ' + message?.type);
		console.log('handleAgentAssistMessage: Current InteractionID = ' + this.interactionId);
		if (message?.type) {
			switch (message.type) {
				case AgentAssistLabels.SET_INTERACTION_CONTEXT:
					this.handleInteractionContext(message);
					break;
				case AgentAssistLabels.ASK_ME_ANYTHING_RESPONSE:
					this.showError(null);
					this.prepareAskMeAnything(message);
					break;
				case AgentAssistLabels.KNOWLEDGE_CARD:
					this.showError(null);
					this.prepareKnowledgeCard(message);
					break;
				//check is there is summary available
				case AgentAssistLabels.POST_CALL_SUMMARY:
					this.showError(null);
					if (this.isPostCallSummaryEnabled && this.isPostCallSummaryPermission) {
						this.preparePostCallSummary(message);
					}
					break;
				case AgentAssistLabels.ERROR:
					this.showError('Failed to connect, please log out and back in.');
					break;
				case AgentAssistLabels.END_INTERACTION:
					console.log('Inside End knowledge/AMA*');
					console.log('END_INTERACTION received with data:', JSON.stringify(message.data));
					this.clearCards(message);
					console.log('Call ended => ' + JSON.stringify(message, null, 2));
					break;
				default:
			}
		}
	}
	clearCards(message) {
		console.log('clearCards: Attempting to clear. Current ID: ' + this.interactionId);
		if (message && message.data) {
			const incomingId = message.data.interactionId;
			console.log('clearCards: Incoming End Interaction ID: ' + incomingId);
			if (this.interactionId && this.interactionId !== 'a' + incomingId) {
				console.log(
					'clearCards: Mismatch in Interaction ID, SKIPPING CLEAR. ' +
						this.interactionId +
						' vs ' +
						incomingId
				);
				return;
			}
		} else {
			console.log('clearCards: No message data provided to verify ID.');
		}
		console.log('clearCards: CLEARING DATA NOW.');
		this.cards = [];
		this.interactionId = null;

		localStorage.removeItem('aa_knowledge_cards_cache');
		localStorage.removeItem('aa_knowledge_interaction_id');

		this.saveState();

		this._isJumpInPresentVisible = false;
	}

	handleBottom() {
		this.dispatchEvent(new CustomEvent('bottom'));
		this._isJumpInPresentVisible = false;
	}

	updateJumpToPresent() {
		if (this.cards.length >= 3) {
			this._isJumpInPresentVisible = true;
		}
	}

	scrollToPresentCard() {
		// eslint-disable-next-line @lwc/lwc/no-async-operation
		requestAnimationFrame(() => {
			const container = this.template.querySelector('.container');
			const lastCard = container?.querySelector('.card:last-child');
			if (lastCard) {
				lastCard.scrollIntoView({
					behavior: 'smooth',
					block: 'end'
				});
			}
		});
	}

	handleReply(event) {
		const dataId = event.currentTarget.dataset.id;
		const card = this.cards.find((c) => c.card_id === dataId);

		this.dispatchEvent(
			new CustomEvent('replycard', {
				detail: card
			})
		);
	}

	handleCitationPosition(event) {
		const citation = event.currentTarget;
		const tooltip = citation.querySelector('.multi-citation-tooltip');

		const container = event.currentTarget.closest('.card');

		const containerRect = container.getBoundingClientRect();
		const citationRect = citation.getBoundingClientRect();
		const tooltipWidth = 241;
		const tooltipHeight = 60;

		tooltip.style.maxHeight = containerRect.height - 20 + 'px';
		tooltip.style.overflowY = 'auto';

		tooltip.style.left = '';
		tooltip.style.right = '';
		tooltip.classList.remove('tooltip--bottom', 'tooltip--top');

		const containerLeft = containerRect.left;
		const containerRight = containerRect.right;

		tooltip.style.left = '0px';
		tooltip.style.right = 'auto';

		if (citationRect.left + tooltipWidth > containerRight) {
			tooltip.style.left = 'auto';
			tooltip.style.right = '0px';
		}

		if (citationRect.left < containerLeft) {
			tooltip.style.left = '0px';
			tooltip.style.right = 'auto';
		}

		const spaceBelow = containerRect.bottom - citationRect.bottom;
		const spaceAbove = citationRect.top - containerRect.top;

		if (spaceBelow < tooltipHeight && spaceAbove > tooltipHeight) {
			tooltip.classList.add('tooltip--top');
		} else {
			tooltip.classList.add('tooltip--bottom');
		}

		if (!citation._handlersAttached) {
			citation._handlersAttached = true;

			citation.addEventListener('mouseenter', () => {
				clearTimeout(this.tooltipHideTimeout);
				tooltip.classList.add('visible');
			});

			citation.addEventListener('mouseleave', () => {
				this.scheduleTooltipHide(citation, tooltip);
			});

			tooltip.addEventListener('mouseenter', () => {
				clearTimeout(this.tooltipHideTimeout);
				tooltip.classList.add('visible');
			});

			tooltip.addEventListener('mouseleave', () => {
				this.scheduleTooltipHide(citation, tooltip);
			});
		}

		tooltip.classList.add('visible');
	}

	scheduleTooltipHide(citation, tooltip) {
		clearTimeout(this.tooltipHideTimeout);

		// eslint-disable-next-line @lwc/lwc/no-async-operation
		this.tooltipHideTimeout = setTimeout(() => {
			const isOverCitation = citation.matches(':hover');
			const isOverTooltip = tooltip.matches(':hover');

			if (!isOverCitation && !isOverTooltip) {
				tooltip.classList.remove('visible');
			}
		}, 120);
	}

	toggleExpand(event) {
		const cardId = event.target.dataset.id;
		this.cards = this.cards.map((card) => {
			if (card.card_id !== cardId) return card;

			card.isExpanded = !card.isExpanded;

			return card;
		});
	}
	handleIconClick(event) {
		event.stopPropagation();
		this.toggleExpand(event);
	}

	handleLike(event) {
		const cardId = event.currentTarget.dataset.id;

		this.cards = this.cards.map((card) => {
			if (card.card_id === cardId) {
				return {
					...card,
					isLiked: true,
					isDisLiked: false,

					likeClass: 'like-green',
					dislikeClass: 'icon-disabled',

					isLikeDisabled: 'pointer-events:none; opacity:1;',
					isDislikeDisabled: 'pointer-events:none; opacity:0.4;'
				};
			}
			return card;
		});
		this.saveState();

		let data;
		let label = 'Thank you for your feedback!';

		if (this.cards.find((c) => c.card_id === cardId)?.isSummary) {
			data = AgentAssistEvents.agent_feedback('true', 'Liked', cardId, this.interactionId);
			label = 'Thank you for your feedback!';
		} else {
			data = AgentAssistEvents.agent_feedback(true, 'Liked', cardId, this.interactionId);
			label = 'Thanks for providing a reason!'; // Keeping existing (though likely a bug, as per plan we maintain existing)
		}

		try {
			publish(
				this.messageContext,
				VOICE_CALL_CHANNEL,
				AgentAssistEvents.aa_lms_event(AgentAssistLabels.AGENT_FEEDBACK, data)
			);

			Toast.show({
				label: label,
				mode: 'dismissible',
				variant: 'success'
			});
		} catch (error) {
			console.error('Feedback error', error);
			this.cards = this.cards.map((card) => {
				if (card.card_id === cardId) {
					return {
						...card,
						feedbackError: 'Feedback has been captured. Additional submissions are disabled.'
					};
				}
				return card;
			});
		}
	}
	handleDislike(event) {
		const cardId = event.currentTarget.dataset.id;

		this.cards = this.cards.map((card) => {
			if (card.card_id === cardId) {
				let reasons = [
					{
						text: 'Not relevant',
						isSelected: false,
						buttonClass: 'slds-button_neutral',
						disabled: false
					},
					{
						text: 'Info not accurate',
						isSelected: false,
						buttonClass: 'slds-button_neutral',
						disabled: false
					},
					{
						text: 'Confusing Content',
						isSelected: false,
						buttonClass: 'slds-button_neutral',
						disabled: false
					}
				];

				if (card.isSummary) {
					reasons = [
						{
							text: 'Inaccurate information',
							isSelected: false,
							buttonClass: 'slds-button_neutral',
							disabled: false
						},
						{
							text: 'Missing information',
							isSelected: false,
							buttonClass: 'slds-button_neutral',
							disabled: false
						},
						{
							text: 'Contains PHI/PFI',
							isSelected: false,
							buttonClass: 'slds-button_neutral',
							disabled: false
						}
					];
				}

				return {
					...card,
					isLiked: false,
					isDisLiked: true,

					likeClass: 'icon-disabled',
					dislikeClass: 'dislike-red',

					isLikeDisabled: 'pointer-events:none; opacity:0.4;',
					isDislikeDisabled: 'pointer-events:none; opacity:1;',

					disLikeReasons: reasons,
					showDislikeReasons: true
				};
			}
			return card;
		});
		this.saveState();

		const card = this.cards.find((c) => c.card_id === cardId);
		let data;
		if (card?.isSummary) {
			data = AgentAssistEvents.agent_feedback('false', 'Disliked', cardId, this.interactionId);
		} else {
			data = AgentAssistEvents.agent_feedback(false, 'Disliked', cardId, this.interactionId);
		}

		try {
			publish(
				this.messageContext,
				VOICE_CALL_CHANNEL,
				AgentAssistEvents.aa_lms_event(AgentAssistLabels.AGENT_FEEDBACK, data)
			);

			Toast.show({
				label: 'Thank you for your feedback!',
				mode: 'dismissible',
				variant: 'success'
			});
		} catch (error) {
			console.error('Feedback error', error);
			this.cards = this.cards.map((card) => {
				if (card.card_id === cardId) {
					return {
						...card,
						feedbackError: 'Feedback has been captured. Additional submissions are disabled.'
					};
				}
				return card;
			});
		}
	}
	selectDislikeReason(event) {
		const cardId = event.target.dataset.id;
		const selectedReason = event.target.dataset.reason;

		this.cards = this.cards.map((card) => {
			if (card.card_id === cardId) {
				const updatedReasons = card.disLikeReasons.map((reason) => ({
					...reason,
					isSelected: reason.text === selectedReason,
					buttonClass: reason.text === selectedReason ? 'slds-button_brand' : 'slds-button_neutral',
					disabled: reason.text !== selectedReason
				}));

				return {
					...card,
					disLikeReasons: updatedReasons,
					showDislikeReasons: false,
					dislikeClass: 'dislike-red',
					isLikeDisabled: 'pointer-events:none; opacity:0.4;',
					isDislikeDisabled: 'pointer-events:none; opacity:1;'
				};
			}
			return card;
		});
		this.saveState();

		const card = this.cards.find((c) => c.card_id === cardId);
		let data;
		if (card?.isSummary) {
			data = AgentAssistEvents.agent_feedback('false', selectedReason, cardId, this.interactionId);
		} else {
			data = AgentAssistEvents.agent_feedback(false, selectedReason, cardId, this.interactionId);
		}

		try {
			publish(
				this.messageContext,
				VOICE_CALL_CHANNEL,
				AgentAssistEvents.aa_lms_event(AgentAssistLabels.AGENT_FEEDBACK, data)
			);

			Toast.show({
				label: 'Thanks for providing a reason!',
				mode: 'dismissible',
				variant: 'success'
			});
		} catch (error) {
			console.error('Feedback error', error);
			this.cards = this.cards.map((card) => {
				if (card.card_id === cardId) {
					return {
						...card,
						feedbackError: 'Feedback has been captured. Additional submissions are disabled.'
					};
				}
				return card;
			});
		}
	}

	@wire(isFeatureEnabled, { featureName: 'MP_Post_Call_Summary' })
	wiredFeatureEnabled({ error, data }) {
		if (data) {
			this.isPostCallSummaryEnabled = data;
		} else if (error) {
			console.error(error);
		}
	}
}
