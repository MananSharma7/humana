import { LightningElement, track, wire } from 'lwc';
import { subscribe, unsubscribe, APPLICATION_SCOPE, MessageContext } from 'lightning/messageService';
import VOICE_CALL_CHANNEL from '@salesforce/messageChannel/LWCToUiConnectorMessengerMs__c';
import { AgentAssistLabels } from 'c/aa_UtilsHum';

function formatTime(isoString) {
	try {
		const d = new Date(isoString);
		let h = d.getHours();
		const m = String(d.getMinutes()).padStart(2, '0');
		const ampm = h >= 12 ? 'pm' : 'am';
		h = h % 12 || 12;
		return `${h}:${m}${ampm}`;
	} catch {
		return '';
	}
}

export default class Aa_liveTranscript extends LightningElement {
	@track isLive = true;
	@track hasError = false;
	@track errorMessage = '';
	@track searchTerm = '';
	@track matchLabel = '0/0';
	@track transcriptMessages = [];

	_searchDebounceTimer = null;
	_matchCount = 0;
	_matchIndex = -1;
	subscription = null;

	@wire(MessageContext)
	messageContext;

	connectedCallback() {
		this.subscribeToMessageChannel();
	}

	disconnectedCallback() {
		this.unsubscribeToMessageChannel();
	}

	subscribeToMessageChannel() {
		if (!this.subscription) {
			this.subscription = subscribe(
				this.messageContext,
				VOICE_CALL_CHANNEL,
				(message) => this.handleMessage(message),
				{ scope: APPLICATION_SCOPE }
			);
		}
	}

	unsubscribeToMessageChannel() {
		if (this.subscription) {
			unsubscribe(this.subscription);
			this.subscription = null;
		}
	}

	handleMessage(message) {
		console.log('Message => ' + JSON.stringify(message, null, 2));
		if (message && message.type === AgentAssistLabels.LIVE_TRANSCRIPTION && message.data) {
			this._processChunk(message.data);
		} else if (
			message &&
			(message.type === AgentAssistLabels.CONNECTION_END || message.type === AgentAssistLabels.POST_CALL_SUMMARY)
		) {
			this.isLive = false;
		} else if (message && message.type === AgentAssistLabels.UPDATE_INTERACTION) {
			// New interaction started — clear previous transcription data
			console.log('aa_liveTranscript | handleMessage | UPDATE_INTERACTION received. Clearing previous transcript.');
			this._resetTranscriptState();
		} else if (message && message.type === AgentAssistLabels.END_INTERACTION) {
			// Call ended — clear transcription data so it doesn't persist to the next call
			console.log('aa_liveTranscript | handleMessage | END_INTERACTION received. Clearing transcript.');
			this._resetTranscriptState();
		} else if (message && message.type === AgentAssistLabels.ERROR) {
			// Optional for error messages
		}
	}

	/**
	 * Resets all transcript state to prepare for a new call.
	 * Clears messages, search highlights, and error flags, and re-marks the transcript as live.
	 */
	_resetTranscriptState() {
		this.transcriptMessages = [];
		this.searchTerm = '';
		this.matchLabel = '0/0';
		this._matchCount = 0;
		this._matchIndex = -1;
		this.isLive = true;
		this.hasError = false;
		this.errorMessage = '';
	}

	processChunk(chunk) {
		this._processChunk(chunk);
	}

	_processChunk(chunk) {
		if (chunk && chunk.error && String(chunk.error.error_status).toLowerCase() === 'true') {
			this.unsubscribeToMessageChannel();
			this.isLive = false;
			this.hasError = true;
			this.errorMessage = chunk.error.user_message || 'An error occurred during live transcription.';
			return;
		}

		if (!chunk || !chunk.data) return;
		const { participant_role, content, send_time } = chunk.data;
		const isAgent = participant_role === 'HUMAN_AGENT' || participant_role === 'AGENT';

		const rawContent = content || '';
		const newMsg = {
			id: Date.now().toString() + Math.random().toString(),
			rawContent: rawContent,
			contentSegments: [{ id: 'seg0', text: rawContent, isMatch: false, markClass: '', matchId: null }],
			wrapClass: isAgent ? 'lt-msg-wrap lt-agent-wrap' : 'lt-msg-wrap lt-caller-wrap',
			roleClass: isAgent ? 'lt-role lt-role-agent' : 'lt-role lt-role-caller',
			roleLabel: isAgent ? 'ADVOCATE' : 'CALLER',
			timeLabel: formatTime(send_time),
			bubbleClass: isAgent ? 'lt-bubble lt-bubble-agent' : 'lt-bubble lt-bubble-caller'
		};

		this.transcriptMessages.push(newMsg);

		if (this.searchTerm && this.searchTerm.trim().length > 0) {
			this._applyHighlights(this.searchTerm.trim());
		}

		setTimeout(() => {
			const body = this.template.querySelector('[data-id="transcript-body"]');
			if (body) {
				body.scrollTop = body.scrollHeight;
			}
		}, 0);
	}

	handleSearchInput(e) {
		const term = e.target.value;
		this.searchTerm = term;

		window.clearTimeout(this._searchDebounceTimer);
		this._searchDebounceTimer = window.setTimeout(() => {
			if (term && term.trim().length > 0) {
				this._applyHighlights(term.trim());
			} else {
				this._clearHighlights();
			}
		}, 200);
	}

	clearSearch() {
		this.searchTerm = '';
		this._clearHighlights();
	}

	handleNext() {
		if (this._matchCount === 0) return;
		this._setActive(this._matchIndex + 1);
	}

	handlePrev() {
		if (this._matchCount === 0) return;
		this._setActive(this._matchIndex - 1);
	}

	_setActive(idx) {
		if (this._matchCount === 0) return;
		const newIdx = ((idx % this._matchCount) + this._matchCount) % this._matchCount;
		this._matchIndex = newIdx;

		this.transcriptMessages = this.transcriptMessages.map((msg) => {
			let changed = false;
			const newSegs = msg.contentSegments.map((seg) => {
				if (seg.isMatch) {
					const active = seg.matchId === newIdx;
					const newClass = active ? 'lt-highlight lt-highlight-active' : 'lt-highlight';
					if (seg.markClass !== newClass) {
						changed = true;
						return { ...seg, markClass: newClass };
					}
				}
				return seg;
			});
			return changed ? { ...msg, contentSegments: newSegs } : msg;
		});

		this.matchLabel = `${newIdx + 1}/${this._matchCount}`;

		setTimeout(() => {
			const activeMark = this.template.querySelector('mark.lt-highlight-active');
			if (activeMark) activeMark.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}, 0);
	}

	_applyHighlights(term) {
		if (!term) {
			this._clearHighlights();
			return;
		}

		const regex = new RegExp(`(${this._escapeRegex(term)})`, 'gi');
		let matchCount = 0;

		this.transcriptMessages = this.transcriptMessages.map((msg) => {
			const parts = msg.rawContent.split(regex);
			if (parts.length <= 1) {
				return { ...msg, contentSegments: [{ id: msg.id + '0', text: msg.rawContent, isMatch: false }] };
			}

			const segments = [];
			parts.forEach((part, idx) => {
				if (!part) return;
				const isMatch = regex.test(part);
				regex.lastIndex = 0;
				let mId = null;
				let markCls = '';
				if (isMatch) {
					mId = matchCount++;
					markCls = 'lt-highlight';
				}
				segments.push({
					id: msg.id + '_' + idx,
					text: part,
					isMatch: isMatch,
					matchId: mId,
					markClass: markCls
				});
			});
			return { ...msg, contentSegments: segments };
		});

		this._matchCount = matchCount;
		this._matchIndex = -1;

		if (this._matchCount > 0) {
			this.matchLabel = `1/${this._matchCount}`;
			this._setActive(0);
		} else {
			this.matchLabel = `0/0`;
		}
	}

	_clearHighlights() {
		this.transcriptMessages = this.transcriptMessages.map((msg) => ({
			...msg,
			contentSegments: [{ id: msg.id + '0', text: msg.rawContent, isMatch: false, markClass: '', matchId: null }]
		}));
		this._matchCount = 0;
		this._matchIndex = -1;
		this.matchLabel = '0/0';
	}

	_escapeRegex(str) {
		return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	dismissError() {
		this.hasError = false;
		this.errorMessage = '';
	}

	handleClose() {
		this.dispatchEvent(new CustomEvent('toggletranscript'));
	}
}
