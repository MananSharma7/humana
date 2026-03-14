import { LightningElement, track } from 'lwc';

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

	{
		error: {
			error_status: 'true',
			code: 'AA-LT-500',
			message: 'WebSocket connection lost unexpectedly',
			user_message: 'Live transcription is not available at this time. Please try again later.'
		}
	}
];

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

	_chunkIndex = 0;
	_streamInterval = null;
	_searchDebounceTimer = null;
	_matchNodes = [];
	_matchIndex = -1;

	connectedCallback() {
		this._streamInterval = window.setInterval(() => {
			this._deliverNextChunk();
		}, 1400);
	}

	disconnectedCallback() {
		this._stopStream();
	}

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

	processChunk(chunk) {
		this._processChunk(chunk);
	}

	_processChunk(chunk) {
		if (chunk.error && chunk.error.error_status) {
			this._stopStream();
			this.isLive = false;
			this.hasError = true;
			this.errorMessage = chunk.error.user_message || 'An error occurred during live transcription.';
			return;
		}

		const { participant_role, content, send_time } = chunk.data;
		const isAgent = participant_role === 'AGENT';

		const node = this._buildMessageNode(isAgent, participant_role, content, send_time);

		const body = this.template.querySelector('[data-id="transcript-body"]');
		if (body) {
			body.appendChild(node);

			body.scrollTop = body.scrollHeight;
		}

		if (this.searchTerm) {
			this._applyHighlights(this.searchTerm);
		}
	}

	_buildMessageNode(isAgent, role, content, sendTime) {
		const wrap = document.createElement('div');
		wrap.className = isAgent ? 'lt-msg-wrap lt-agent-wrap' : 'lt-msg-wrap lt-caller-wrap';

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

		const bubble = document.createElement('div');
		bubble.className = isAgent ? 'lt-bubble lt-bubble-agent' : 'lt-bubble lt-bubble-caller';

		const textSpan = document.createElement('span');
		textSpan.className = 'lt-msg-text';
		textSpan.textContent = content;

		bubble.appendChild(textSpan);
		wrap.appendChild(meta);
		wrap.appendChild(bubble);

		return wrap;
	}

	handleSearchInput(e) {
		const term = e.target.value;
		this.searchTerm = term;

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

		const newIdx = ((idx % total) + total) % total;

		if (this._matchIndex >= 0 && this._matchIndex < this._matchNodes.length) {
			this._matchNodes[this._matchIndex].className = 'lt-highlight';
		}

		this._matchIndex = newIdx;
		const activeNode = this._matchNodes[newIdx];
		activeNode.className = 'lt-highlight lt-highlight-active';
		activeNode.scrollIntoView({ behavior: 'smooth', block: 'center' });

		this.matchLabel = `${newIdx + 1}/${total}`;
	}

	_applyHighlights(term) {
		this._clearHighlights();
		const body = this.template.querySelector('[data-id="transcript-body"]');
		if (!body || !term) return;

		const textSpans = body.querySelectorAll('.lt-msg-text');
		const marks = [];
		const regex = new RegExp(`(${this._escapeRegex(term)})`, 'gi');

		textSpans.forEach((span) => {
			const textNodes = this._getTextNodes(span);

			textNodes.forEach((textNode) => {
				const text = textNode.nodeValue;
				if (!text) return;

				const parts = text.split(regex);
				if (parts.length <= 1) return;

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
					regex.lastIndex = 0;
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

	_clearHighlights() {
		const body = this.template.querySelector('[data-id="transcript-body"]');
		if (!body) return;

		const marks = body.querySelectorAll('mark.lt-highlight');
		marks.forEach((mark) => {
			const parent = mark.parentNode;
			parent.replaceChild(document.createTextNode(mark.textContent), mark);
			parent.normalize();
		});

		this._matchNodes = [];
		this._matchIndex = -1;
	}

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

	dismissError() {
		this.hasError = false;
		this.errorMessage = '';
	}

	handleClose() {
		this.dispatchEvent(new CustomEvent('toggletranscript'));
	}
}
