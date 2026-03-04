import { LightningElement, track } from 'lwc';

// ─── Mock chunk data (Phase 1) ───────────────────────────────────────────────
// Replace this array with real Platform Event / LMS data in Phase 2
const MOCK_CHUNKS = [
	{
		version: '1.0',
		event_type: 'live_transcription',
		data: {
			conversation_id: 'mock-conv-001',
			member_id: 'mem-001',
			participant_role: 'AGENT',
			content: 'Hello! Thank you for calling Humana. My name is Sarah, how can I help you today?',
			send_time: new Date(Date.now() - 600000).toISOString(),
			sentiment_analysis: { score: 0.8, magnitude: 0.6 },
			language_code: 'en-US',
			create_date: new Date().toISOString()
		},
		error: null
	},
	{
		version: '1.0',
		event_type: 'live_transcription',
		data: {
			conversation_id: 'mock-conv-001',
			member_id: 'mem-002',
			participant_role: 'END_USER',
			content: 'Hi Sarah, I have a question about my Medicare and Medicaid coverage.',
			send_time: new Date(Date.now() - 540000).toISOString(),
			sentiment_analysis: { score: 0.3, magnitude: 0.4 },
			language_code: 'en-US',
			create_date: new Date().toISOString()
		},
		error: null
	},
	{
		version: '1.0',
		event_type: 'live_transcription',
		data: {
			conversation_id: 'mock-conv-001',
			member_id: 'mem-001',
			participant_role: 'AGENT',
			content:
				"Of course! I'd be happy to help. Are you currently enrolled in both Medicare and Medicaid, dual eligible?",
			send_time: new Date(Date.now() - 480000).toISOString(),
			sentiment_analysis: { score: 0.7, magnitude: 0.5 },
			language_code: 'en-US',
			create_date: new Date().toISOString()
		},
		error: null
	},
	{
		version: '1.0',
		event_type: 'live_transcription',
		data: {
			conversation_id: 'mock-conv-001',
			member_id: 'mem-002',
			participant_role: 'END_USER',
			content: "I know I have Medicare for sure. I'm not completely sure about Medicaid though.",
			send_time: new Date(Date.now() - 420000).toISOString(),
			sentiment_analysis: { score: 0.2, magnitude: 0.3 },
			language_code: 'en-US',
			create_date: new Date().toISOString()
		},
		error: null
	},
	{
		version: '1.0',
		event_type: 'live_transcription',
		data: {
			conversation_id: 'mock-conv-001',
			member_id: 'mem-001',
			participant_role: 'AGENT',
			content:
				"No problem at all. Sometimes people who qualify for Medicaid also receive what's called Low Income Subsidy or 'Extra Help' with their prescription costs. Do you know if you're receiving that?",
			send_time: new Date(Date.now() - 360000).toISOString(),
			sentiment_analysis: { score: 0.6, magnitude: 0.7 },
			language_code: 'en-US',
			create_date: new Date().toISOString()
		},
		error: null
	},
	{
		version: '1.0',
		event_type: 'live_transcription',
		data: {
			conversation_id: 'mock-conv-001',
			member_id: 'mem-002',
			participant_role: 'END_USER',
			content: "Yes, I do get some kind of help with my prescriptions — I think it's called Extra Help.",
			send_time: new Date(Date.now() - 300000).toISOString(),
			sentiment_analysis: { score: 0.5, magnitude: 0.4 },
			language_code: 'en-US',
			create_date: new Date().toISOString()
		},
		error: null
	},
	{
		version: '1.0',
		event_type: 'live_transcription',
		data: {
			conversation_id: 'mock-conv-001',
			member_id: 'mem-001',
			participant_role: 'AGENT',
			content:
				"That's great to hear! That typically means you may be eligible for Medicaid as well. I'll go ahead and mark you as likely dual eligible.",
			send_time: new Date(Date.now() - 240000).toISOString(),
			sentiment_analysis: { score: 0.8, magnitude: 0.6 },
			language_code: 'en-US',
			create_date: new Date().toISOString()
		},
		error: null
	},
	{
		version: '1.0',
		event_type: 'live_transcription',
		data: {
			conversation_id: 'mock-conv-001',
			member_id: 'mem-002',
			participant_role: 'END_USER',
			content: 'Perfect, thank you for explaining that.',
			send_time: new Date(Date.now() - 180000).toISOString(),
			sentiment_analysis: { score: 0.7, magnitude: 0.3 },
			language_code: 'en-US',
			create_date: new Date().toISOString()
		},
		error: null
	},
	{
		version: '1.0',
		event_type: 'live_transcription',
		data: {
			conversation_id: 'mock-conv-001',
			member_id: 'mem-001',
			participant_role: 'AGENT',
			content: 'Is there anything else I may assist you with today?',
			send_time: new Date(Date.now() - 120000).toISOString(),
			sentiment_analysis: { score: 0.8, magnitude: 0.4 },
			language_code: 'en-US',
			create_date: new Date().toISOString()
		},
		error: null
	},
	{
		version: '1.0',
		event_type: 'live_transcription',
		data: {
			conversation_id: 'mock-conv-001',
			member_id: 'mem-002',
			participant_role: 'END_USER',
			content:
				"Yes, can you also help me with my prescription refill status? It's been over a week since it was supposed to be filled.",
			send_time: new Date(Date.now() - 60000).toISOString(),
			sentiment_analysis: { score: 0.1, magnitude: 0.6 },
			language_code: 'en-US',
			create_date: new Date().toISOString()
		},
		error: null
	},
	// Error chunk — always last in mock data
	{
		error: {
			error_status: 'true',
			code: 'AA-LT-500',
			message: 'WebSocket connection lost unexpectedly',
			user_message: 'Live transcription is not available at this time. Please try again later.'
		}
	}
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Format an ISO timestamp to "H:MMam/pm" e.g. "1:03pm"
 */
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

// ─── Component ────────────────────────────────────────────────────────────────

export default class Aa_liveTranscript extends LightningElement {
	// ── Reactive state ──────────────────────────────────────────────────────
	@track isLive = true;
	@track hasError = false;
	@track errorMessage = '';
	@track searchTerm = '';
	@track matchLabel = '0/0';

	// ── Internal state ──────────────────────────────────────────────────────
	_chunkIndex = 0;
	_streamInterval = null;
	_searchDebounceTimer = null;
	_matchNodes = []; // array of <mark> DOM nodes  for current search
	_matchIndex = -1; // which match is currently "active" (yellow)

	// ── Lifecycle ────────────────────────────────────────────────────────────

	connectedCallback() {
		// Start mock streaming: one chunk every 1400 ms
		this._streamInterval = window.setInterval(() => {
			this._deliverNextChunk();
		}, 1400);
	}

	disconnectedCallback() {
		this._stopStream();
	}

	// ── Streaming ─────────────────────────────────────────────────────────────

	_stopStream() {
		if (this._streamInterval) {
			window.clearInterval(this._streamInterval);
			this._streamInterval = null;
		}
	}

	_deliverNextChunk() {
		if (this._chunkIndex >= MOCK_CHUNKS.length) {
			this._stopStream();
			this.isLive = false;
			return;
		}

		const chunk = MOCK_CHUNKS[this._chunkIndex++];
		this._processChunk(chunk);
	}

	/**
	 * Public API – in Phase 2 the LMS subscriber will call this directly.
	 * @param {Object} chunk  – raw payload from Platform Event / LMS
	 */
	processChunk(chunk) {
		this._processChunk(chunk);
	}

	_processChunk(chunk) {
		// Error payload
		if (chunk.error && chunk.error.error_status) {
			this._stopStream();
			this.isLive = false;
			this.hasError = true;
			this.errorMessage = chunk.error.user_message || 'An error occurred during live transcription.';
			return;
		}

		// Success payload
		const { participant_role, content, send_time } = chunk.data;
		const isAgent = participant_role === 'AGENT';

		// Build DOM node — direct append, NO tracked array, no full re-render
		const node = this._buildMessageNode(isAgent, participant_role, content, send_time);

		const body = this.template.querySelector('[data-id="transcript-body"]');
		if (body) {
			body.appendChild(node);
			// Auto-scroll to bottom
			body.scrollTop = body.scrollHeight;
		}

		// Re-apply search highlights if a search is active
		if (this.searchTerm) {
			this._applyHighlights(this.searchTerm);
		}
	}

	/**
	 * Builds a single message DOM node without using innerHTML on user content.
	 */
	_buildMessageNode(isAgent, role, content, sendTime) {
		// Outer wrapper
		const wrap = document.createElement('div');
		wrap.className = isAgent ? 'lt-msg-wrap lt-agent-wrap' : 'lt-msg-wrap lt-caller-wrap';

		// Sender label + time
		const meta = document.createElement('div');
		meta.className = 'lt-meta';
		const labelSpan = document.createElement('span');
		labelSpan.className = isAgent ? 'lt-role lt-role-agent' : 'lt-role lt-role-caller';
		labelSpan.textContent = isAgent ? 'AGENT' : 'CALLER';
		const timeSpan = document.createElement('span');
		timeSpan.className = 'lt-time';
		timeSpan.textContent = formatTime(sendTime);
		meta.appendChild(labelSpan);
		meta.appendChild(timeSpan);

		// Bubble
		const bubble = document.createElement('div');
		bubble.className = isAgent ? 'lt-bubble lt-bubble-agent' : 'lt-bubble lt-bubble-caller';

		// Text span (search highlights will wrap text nodes inside this)
		const textSpan = document.createElement('span');
		textSpan.className = 'lt-msg-text';
		textSpan.textContent = content; // safe — textContent, not innerHTML

		bubble.appendChild(textSpan);
		wrap.appendChild(meta);
		wrap.appendChild(bubble);

		return wrap;
	}

	// ── Search & Highlight ────────────────────────────────────────────────────

	handleSearchInput(e) {
		const term = e.target.value;
		this.searchTerm = term;

		// Debounce 200 ms
		window.clearTimeout(this._searchDebounceTimer);
		this._searchDebounceTimer = window.setTimeout(() => {
			this._clearHighlights();
			if (term && term.trim().length > 0) {
				this._applyHighlights(term.trim());
			} else {
				this.matchLabel = '0/0';
			}
		}, 200);
	}

	clearSearch() {
		this.searchTerm = '';
		this._clearHighlights();
		this.matchLabel = '0/0';
	}

	handleNext() {
		if (!this._matchNodes.length) return;
		this._setActive(this._matchIndex + 1);
	}

	handlePrev() {
		if (!this._matchNodes.length) return;
		this._setActive(this._matchIndex - 1);
	}

	_setActive(idx) {
		const total = this._matchNodes.length;
		if (!total) return;

		// Wrap around
		const newIdx = ((idx % total) + total) % total;

		// Deactivate previous
		if (this._matchIndex >= 0 && this._matchIndex < this._matchNodes.length) {
			this._matchNodes[this._matchIndex].className = 'lt-highlight';
		}

		// Activate new
		this._matchIndex = newIdx;
		const activeNode = this._matchNodes[newIdx];
		activeNode.className = 'lt-highlight lt-highlight-active';
		activeNode.scrollIntoView({ behavior: 'smooth', block: 'center' });

		this.matchLabel = `${newIdx + 1}/${total}`;
	}

	/**
	 * Walk all .lt-msg-text spans in the transcript body,
	 * split text nodes at match positions, and wrap matches in <mark>.
	 */
	_applyHighlights(term) {
		this._clearHighlights();
		const body = this.template.querySelector('[data-id="transcript-body"]');
		if (!body || !term) return;

		const textSpans = body.querySelectorAll('.lt-msg-text');
		const marks = [];
		const regex = new RegExp(`(${this._escapeRegex(term)})`, 'gi');

		textSpans.forEach((span) => {
			// We work with child text nodes inside the span
			// At this point the span only has one text node (from textContent set initially)
			// or plain text nodes after previous searches were cleared.
			const textNodes = this._getTextNodes(span);

			textNodes.forEach((textNode) => {
				const text = textNode.nodeValue;
				if (!text) return;

				const parts = text.split(regex);
				if (parts.length <= 1) return; // no match in this node

				const frag = document.createDocumentFragment();
				parts.forEach((part) => {
					if (regex.test(part)) {
						const mark = document.createElement('mark');
						mark.className = 'lt-highlight';
						mark.textContent = part;
						marks.push(mark);
						frag.appendChild(mark);
					} else {
						frag.appendChild(document.createTextNode(part));
					}
					regex.lastIndex = 0; // reset stateful regex
				});

				textNode.parentNode.replaceChild(frag, textNode);
			});
		});

		this._matchNodes = marks;
		this._matchIndex = -1;

		if (marks.length > 0) {
			this.matchLabel = `1/${marks.length}`;
			this._setActive(0);
		} else {
			this.matchLabel = `0/0`;
		}
	}

	/**
	 * Remove all <mark> nodes, restoring plain text.
	 */
	_clearHighlights() {
		const body = this.template.querySelector('[data-id="transcript-body"]');
		if (!body) return;

		const marks = body.querySelectorAll('mark.lt-highlight');
		marks.forEach((mark) => {
			const parent = mark.parentNode;
			parent.replaceChild(document.createTextNode(mark.textContent), mark);
			parent.normalize(); // merge adjacent text nodes
		});

		this._matchNodes = [];
		this._matchIndex = -1;
	}

	/** Collect all leaf text nodes within an element */
	_getTextNodes(el) {
		const nodes = [];
		const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
		let node;
		while ((node = walker.nextNode())) {
			nodes.push(node);
		}
		return nodes;
	}

	_escapeRegex(str) {
		return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	// ── Error Banner ──────────────────────────────────────────────────────────

	dismissError() {
		this.hasError = false;
		this.errorMessage = '';
	}

	// ── Panel Toggle ──────────────────────────────────────────────────────────

	handleClose() {
		this.dispatchEvent(new CustomEvent('toggletranscript'));
	}
}
