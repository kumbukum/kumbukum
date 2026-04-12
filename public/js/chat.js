/**
* AI Chat sidebar logic
*/
let currentConversationId = null;

function initChat() {
	const input = document.getElementById('chat-input');
	const sendBtn = document.getElementById('chat-send');
	const messagesEl = document.getElementById('chat-messages');
	const clearBtn = document.getElementById('clear-chat');
	const historyBtn = document.getElementById('chat-history-btn');
	const projectFilter = document.getElementById('chat-project-filter');
	const resultsPanel = document.getElementById('chat-results-panel');
	const resultsList = document.getElementById('chat-results-list');
	const closeResultsBtn = document.getElementById('close-chat-results');
	const pageContent = document.getElementById('page-content');

	if (!input || !sendBtn) return;

	// Populate project filter
	loadProjectFilter();

	// Init result modal handlers
	initResultModalHandlers();

	// Close results panel — restore page content
	closeResultsBtn?.addEventListener('click', () => {
		resultsPanel.classList.add('d-none');
		pageContent?.classList.remove('d-none');
	});

	function addMessage(role, text) {
		const div = document.createElement('div');
		div.className = `chat-message ${role}`;
		div.textContent = text;
		messagesEl.appendChild(div);
		messagesEl.scrollTop = messagesEl.scrollHeight;
		return div;
	}

	async function sendMessage() {
		const query = input.value.trim();
		if (!query) return;

		addMessage('user', query);
		input.value = '';
		sendBtn.disabled = true;

		try {
			const projectId = projectFilter?.value || undefined;
			const res = await api('POST', '/chat', {
				query,
				conversation_id: currentConversationId,
				project_id: projectId,
			});

			// Track conversation
			if (res.conversation_id) {
				currentConversationId = res.conversation_id;
			}

			// Show answer in chat
			if (res.answer) {
				addMessage('assistant', res.answer);
			}

			// Show results in main panel
			if (res.results?.length && res.display_in === 'panel') {
				renderResults(res.results, resultsList, resultsPanel);
			}

			// Show action confirmation
			if (res.action?.completed) {
				addMessage('assistant', `✓ Action completed: ${res.action.type}`);
			}
		} catch (err) {
			addMessage('assistant', 'Error: ' + (err.message || 'Failed to send message'));
		} finally {
			sendBtn.disabled = false;
			input.focus();
		}
	}

	sendBtn.addEventListener('click', sendMessage);
	input.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			sendMessage();
		}
	});

	// New conversation
	clearBtn?.addEventListener('click', () => {
		currentConversationId = null;
		messagesEl.innerHTML = '';
		resultsPanel?.classList.add('d-none');
		pageContent?.classList.remove('d-none');
	});

	// Conversation history
	historyBtn?.addEventListener('click', async () => {
		try {
			const res = await api('GET', '/chat/conversations?limit=10');
			if (!res.conversations?.length) {
				addMessage('assistant', 'No previous conversations.');
				return;
			}
			messagesEl.innerHTML = '';
			const header = document.createElement('div');
			header.className = 'chat-message assistant';
			header.innerHTML = '<strong>Recent conversations:</strong>';
			messagesEl.appendChild(header);

			res.conversations.forEach((c) => {
				const item = document.createElement('div');
				item.className = 'chat-history-item p-2 rounded mb-1';
				item.style.cursor = 'pointer';
				item.textContent = c.title || `Conversation ${c.conversation_id.slice(0, 8)}`;
				item.addEventListener('click', () => {
					currentConversationId = c.conversation_id;
					messagesEl.innerHTML = '';
					addMessage('assistant', `Resumed conversation: ${c.title || c.conversation_id.slice(0, 8)}`);
				});
				messagesEl.appendChild(item);
			});
		} catch {
			addMessage('assistant', 'Could not load conversations.');
		}
	});
}

async function loadProjectFilter() {
	const select = document.getElementById('chat-project-filter');
	if (!select) return;

	try {
		const res = await api('GET', '/projects');
		const projects = res.projects || res;
		if (!Array.isArray(projects)) return;

		projects.forEach((p) => {
			const opt = document.createElement('option');
			opt.value = p._id;
			opt.textContent = p.name;
			select.appendChild(opt);
		});
	} catch {
		// silently fail
	}
}

function renderResults(results, listEl, panelEl) {
	const pageContent = document.getElementById('page-content');
	listEl.innerHTML = '';
	panelEl.classList.remove('d-none');
	pageContent?.classList.add('d-none');

	results.forEach((item) => {
		const card = document.createElement('div');
		card.className = 'card mb-2 chat-result-card';
		card.style.cursor = 'pointer';
		card.addEventListener('click', () => openResultModal(item));

		const body = document.createElement('div');
		body.className = 'card-body p-3';

		const badge = document.createElement('span');
		badge.className = `badge bg-${typeBadgeColor(item._type)} me-2`;
		badge.textContent = item._type;

		const title = document.createElement('strong');
		title.textContent = item.title || item.url || 'Untitled';

		const header = document.createElement('div');
		header.className = 'mb-1';
		header.appendChild(badge);
		header.appendChild(title);
		body.appendChild(header);

		// Date
		const ts = item.updated_at || item.created_at || item.crawled_at;
		if (ts) {
			const dateEl = document.createElement('small');
			dateEl.className = 'text-muted';
			dateEl.textContent = new Date(ts * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
			body.appendChild(dateEl);
		}

		const snippet = item.text_content || item.content || item.description || '';
		if (snippet) {
			const text = document.createElement('p');
			text.className = 'card-text text-muted small mb-0 mt-1';
			text.textContent = snippet.slice(0, 200) + (snippet.length > 200 ? '...' : '');
			body.appendChild(text);
		}

		card.appendChild(body);
		listEl.appendChild(card);
	});
}

// ── Universal Item Modal (create / edit / preview) ───────────────

let rmEditor = null;
let rmCurrentId = null;
let rmCurrentType = null;
let rmContent = '';
let rmTextContent = '';
let rmSelectedRelationships = [];
let rmRelDropdown = null;
let rmRelDebounce = null;

/**
 * Open the universal item modal.
 * @param {string} type - 'notes' | 'memory' | 'urls'
 * @param {string|null} id - Record ID for edit mode, null for create
 * @param {object} defaults - Optional default values for create mode
 */
async function openItemModal(type, id, defaults = {}) {
	const modalEl = document.getElementById('chat-result-modal');
	if (!modalEl) return;

	const titleEl = document.getElementById('result-modal-title');
	const badgeEl = document.getElementById('result-modal-badge');
	const loadingEl = document.getElementById('result-modal-loading');
	const saveBtn = document.getElementById('rm-save-btn');
	const deleteBtn = document.getElementById('rm-delete-btn');

	// Reset
	rmCleanup();
	document.getElementById('result-modal-note').classList.add('d-none');
	document.getElementById('result-modal-memory').classList.add('d-none');
	document.getElementById('result-modal-url').classList.add('d-none');
	loadingEl.classList.add('d-none');
	saveBtn.classList.remove('d-none');

	rmCurrentType = type;
	rmCurrentId = id || null;

	const typeLabels = { notes: 'Note', memory: 'Memory', urls: 'URL' };
	const isCreate = !id;
	titleEl.textContent = isCreate ? `New ${typeLabels[type] || type}` : (defaults.title || defaults.url || 'Loading...');
	badgeEl.className = `badge bg-${typeBadgeColor(type)} me-2`;
	badgeEl.textContent = typeLabels[type] || type;

	// Show/hide delete button (only for existing records)
	if (isCreate) {
		deleteBtn.classList.add('d-none');
	} else {
		deleteBtn.classList.remove('d-none');
	}

	const modal = new BsModal(modalEl);
	modal.show();

	if (isCreate) {
		rmPopulate(type, defaults);
		// Start in edit mode for create
		if (type === 'notes') rmShowNoteEdit();
		else if (type === 'memory') rmShowMemoryEdit();
	} else {
		loadingEl.classList.remove('d-none');
		try {
			const typeEndpoints = { notes: 'notes', memory: 'memories', urls: 'urls' };
			const endpoint = typeEndpoints[type];
			const res = await api('GET', `/${endpoint}/${id}`);
			const record = res.note || res.memory || res.url || res;
			titleEl.textContent = record.title || record.url || 'Untitled';
			loadingEl.classList.add('d-none');
			rmPopulate(type, record);
		} catch (err) {
			loadingEl.innerHTML = `<p class="text-danger">Failed to load: ${err.message || 'Unknown error'}</p>`;
		}
	}
}

/**
 * Open modal from a chat search result item (may include pages/unknown types).
 */
async function openResultModal(item) {
	const editableTypes = ['notes', 'memory', 'urls'];
	if (editableTypes.includes(item._type) && item.id) {
		return openItemModal(item._type, item.id, item);
	}
	// Pages or unknown — read-only preview
	const modalEl = document.getElementById('chat-result-modal');
	if (!modalEl) return;

	rmCleanup();
	document.getElementById('result-modal-note').classList.add('d-none');
	document.getElementById('result-modal-memory').classList.add('d-none');
	document.getElementById('result-modal-url').classList.add('d-none');
	document.getElementById('rm-save-btn').classList.add('d-none');
	document.getElementById('rm-delete-btn').classList.add('d-none');

	document.getElementById('result-modal-title').textContent = item.title || item.url || 'Untitled';
	document.getElementById('result-modal-badge').className = `badge bg-${typeBadgeColor(item._type)} me-2`;
	document.getElementById('result-modal-badge').textContent = item._type;

	const loadingEl = document.getElementById('result-modal-loading');
	loadingEl.classList.remove('d-none');
	let html = '';
	if (item.url) html += `<div class="mb-2"><a href="${escapeHtml(item.url)}" target="_blank">${escapeHtml(item.url)}</a></div>`;
	const text = item.text_content || item.content || item.description || '';
	if (text) html += `<div class="text-muted" style="white-space:pre-wrap">${escapeHtml(text.slice(0, 3000))}</div>`;
	loadingEl.innerHTML = html || '<p class="text-muted">No content available</p>';

	const modal = new BsModal(modalEl);
	modal.show();
}

function rmPopulate(type, record) {
	if (type === 'notes') {
		const panel = document.getElementById('result-modal-note');
		panel.classList.remove('d-none');
		document.getElementById('rm-note-title').value = record.title || '';
		document.getElementById('rm-note-tags').value = (record.tags || []).join(', ');
		rmContent = record.content || '';
		rmTextContent = record.text_content || '';
		rmShowNotePreview();
	} else if (type === 'memory') {
		const panel = document.getElementById('result-modal-memory');
		panel.classList.remove('d-none');
		document.getElementById('rm-memory-title').value = record.title || '';
		document.getElementById('rm-memory-tags').value = (record.tags || []).join(', ');
		document.getElementById('rm-memory-source').value = record.source || '';
		rmContent = record.content || '';
		rmTextContent = record.text_content || '';
		// Load relationships
		rmSelectedRelationships = [];
		if (record.relationships?.length) {
			api('POST', '/resolve', { ids: record.relationships }).then(({ items }) => {
				rmSelectedRelationships = items || [];
				rmRenderRelationshipTags();
			}).catch(() => {});
		}
		rmRenderRelationshipTags();
		rmShowMemoryPreview();
	} else if (type === 'urls') {
		const panel = document.getElementById('result-modal-url');
		panel.classList.remove('d-none');
		const urlInput = document.getElementById('rm-url-input');
		urlInput.value = record.url || '';
		urlInput.readOnly = !!rmCurrentId && !!record.url;
		document.getElementById('rm-url-title').value = record.title || '';
		document.getElementById('rm-url-description').value = record.description || '';
		document.getElementById('rm-url-crawl').checked = !!record.crawl_enabled;

		const ogWrap = document.getElementById('rm-url-og-wrap');
		const ogImg = document.getElementById('rm-url-og-image');
		ogWrap.classList.add('d-none');
		if (record.og_image) {
			ogImg.src = record.og_image;
			ogWrap.classList.remove('d-none');
		}
	}
}

// ── Note preview/edit tabs ───────────────────────────────────────

function rmRenderPreview(textContent, htmlContent) {
	if (!textContent && !htmlContent) return '<p class="text-muted">No content</p>';
	if (textContent && window.marked) return window.marked.parse(textContent);
	return htmlContent || `<pre>${textContent}</pre>`;
}

function rmShowNotePreview() {
	document.getElementById('rm-note-tab-preview').classList.add('active');
	document.getElementById('rm-note-tab-edit').classList.remove('active');
	document.getElementById('rm-note-preview').classList.remove('d-none');
	document.getElementById('rm-note-editor').classList.add('d-none');
	document.getElementById('rm-note-preview').innerHTML = rmRenderPreview(rmTextContent, rmContent);
}

function rmShowNoteEdit() {
	document.getElementById('rm-note-tab-preview').classList.remove('active');
	document.getElementById('rm-note-tab-edit').classList.add('active');
	document.getElementById('rm-note-preview').classList.add('d-none');
	document.getElementById('rm-note-editor').classList.remove('d-none');
	if (!rmEditor) rmInitEditor('rm-note-editor', rmContent);
}

function rmShowMemoryPreview() {
	document.getElementById('rm-memory-tab-preview').classList.add('active');
	document.getElementById('rm-memory-tab-edit').classList.remove('active');
	document.getElementById('rm-memory-preview').classList.remove('d-none');
	document.getElementById('rm-memory-editor').classList.add('d-none');
	document.getElementById('rm-memory-preview').innerHTML = rmRenderPreview(rmTextContent, rmContent);
}

function rmShowMemoryEdit() {
	document.getElementById('rm-memory-tab-preview').classList.remove('active');
	document.getElementById('rm-memory-tab-edit').classList.add('active');
	document.getElementById('rm-memory-preview').classList.add('d-none');
	document.getElementById('rm-memory-editor').classList.remove('d-none');
	if (!rmEditor) rmInitEditor('rm-memory-editor', rmContent);
}

function rmInitEditor(containerId, content) {
	const container = document.getElementById(containerId);
	container.innerHTML = '';
	if (rmEditor) { rmEditor.destroy(); rmEditor = null; }
	if (window.KumbukumEditor) {
		rmEditor = window.KumbukumEditor.createEditor(container, { content });
	} else {
		container.innerHTML = content || '';
		container.setAttribute('contenteditable', 'true');
	}
}

function rmGetEditorContent() {
	if (rmEditor) return { content: rmEditor.getHTML(), text_content: rmEditor.getText() };
	return { content: rmContent, text_content: rmTextContent };
}

// ── Relationship search (memory) ─────────────────────────────────

const rmTypeIcons = { notes: 'bi-file-text', memory: 'bi-lightbulb', urls: 'bi-link-45deg' };
const rmTypeLabels = { notes: 'Note', memory: 'Memory', urls: 'URL' };

function rmEnsureRelDropdown() {
	if (rmRelDropdown) return rmRelDropdown;
	const input = document.getElementById('rm-relationship-search');
	if (!input) return null;
	rmRelDropdown = document.createElement('div');
	rmRelDropdown.className = 'source-dropdown list-group position-absolute w-100';
	rmRelDropdown.style.cssText = 'z-index:1060; max-height:200px; overflow-y:auto; display:none; top:100%';
	input.parentElement.appendChild(rmRelDropdown);
	return rmRelDropdown;
}

function rmHideRelDropdown() {
	if (rmRelDropdown) rmRelDropdown.style.display = 'none';
}

function rmRenderRelationshipTags() {
	const container = document.getElementById('rm-relationship-tags');
	if (!container) return;
	container.innerHTML = rmSelectedRelationships.map((r, i) => `
		<span class="badge bg-secondary d-inline-flex align-items-center gap-1 me-1 mb-1">
			<i class="${rmTypeIcons[r._type] || 'bi-link'}"></i>
			${escapeHtml(r.title || r.url || r.id)}
			<button type="button" class="btn-close btn-close-white ms-1" style="font-size:0.5rem" data-index="${i}"></button>
		</span>
	`).join('');
	container.querySelectorAll('.btn-close').forEach(btn => {
		btn.addEventListener('click', () => {
			rmSelectedRelationships.splice(parseInt(btn.dataset.index), 1);
			rmRenderRelationshipTags();
		});
	});
}

async function rmSearchRelationships(query) {
	if (!query || query.length < 3) { rmHideRelDropdown(); return; }
	const { results } = await api('POST', '/search/all', { query });
	const filtered = (results || []).filter(r => !rmSelectedRelationships.some(s => s.id === r.id));
	const dd = rmEnsureRelDropdown();
	if (!dd || !filtered.length) { rmHideRelDropdown(); return; }

	dd.innerHTML = filtered.map(r => `
		<button type="button" class="list-group-item list-group-item-action py-1 px-2 small" data-id="${r.id}" data-type="${r._type}" data-title="${escapeHtml(r.title || r.url || '')}">
			<div class="d-flex align-items-center gap-1">
				<i class="${rmTypeIcons[r._type] || 'bi-link'}"></i>
				<span class="badge bg-light text-dark" style="font-size:0.65rem">${rmTypeLabels[r._type] || r._type}</span>
				<span class="fw-semibold text-truncate">${escapeHtml(r.title || r.url || r.id)}</span>
			</div>
		</button>
	`).join('');
	dd.style.display = 'block';

	dd.querySelectorAll('button').forEach(btn => {
		btn.addEventListener('mousedown', (e) => {
			e.preventDefault();
			rmSelectedRelationships.push({ id: btn.dataset.id, _type: btn.dataset.type, title: btn.dataset.title });
			rmRenderRelationshipTags();
			document.getElementById('rm-relationship-search').value = '';
			rmHideRelDropdown();
		});
	});
}

// ── Cleanup ──────────────────────────────────────────────────────

function rmCleanup() {
	if (rmEditor) { rmEditor.destroy(); rmEditor = null; }
	rmCurrentId = null;
	rmCurrentType = null;
	rmContent = '';
	rmTextContent = '';
	rmSelectedRelationships = [];
	rmRenderRelationshipTags();
	if (rmRelDropdown) { rmRelDropdown.remove(); rmRelDropdown = null; }
	// Reset loading + form panels so modal is clean for next open
	const loadingEl = document.getElementById('result-modal-loading');
	if (loadingEl) {
		loadingEl.classList.add('d-none');
		loadingEl.innerHTML = '<div class="spinner-border spinner-border-sm"></div> Loading...';
	}
	document.getElementById('result-modal-note')?.classList.add('d-none');
	document.getElementById('result-modal-memory')?.classList.add('d-none');
	document.getElementById('result-modal-url')?.classList.add('d-none');
}

// ── Save & Delete handlers ───────────────────────────────────────

function initResultModalHandlers() {
	const modalEl = document.getElementById('chat-result-modal');
	if (!modalEl) return;

	// Tab clicks
	document.getElementById('rm-note-tab-preview')?.addEventListener('click', rmShowNotePreview);
	document.getElementById('rm-note-tab-edit')?.addEventListener('click', rmShowNoteEdit);
	document.getElementById('rm-memory-tab-preview')?.addEventListener('click', rmShowMemoryPreview);
	document.getElementById('rm-memory-tab-edit')?.addEventListener('click', rmShowMemoryEdit);

	// Relationship search
	const relInput = document.getElementById('rm-relationship-search');
	relInput?.addEventListener('input', () => {
		clearTimeout(rmRelDebounce);
		rmRelDebounce = setTimeout(() => rmSearchRelationships(relInput.value.trim()), 150);
	});
	relInput?.addEventListener('blur', () => setTimeout(rmHideRelDropdown, 150));

	// Save (create or update)
	document.getElementById('rm-save-btn')?.addEventListener('click', async () => {
		if (!rmCurrentType) return;

		try {
			const isCreate = !rmCurrentId;

			if (rmCurrentType === 'notes') {
				const title = document.getElementById('rm-note-title').value.trim() || 'Untitled';
				const { content, text_content } = rmGetEditorContent();
				const tags = document.getElementById('rm-note-tags').value.split(',').map((t) => t.trim()).filter(Boolean);
				const data = { title, content, text_content, tags, project: window.currentProjectId };
				if (isCreate) {
					const { note } = await api('POST', '/notes', data);
					rmCurrentId = note._id;
				} else {
					await api('PUT', `/notes/${rmCurrentId}`, data);
				}
			} else if (rmCurrentType === 'memory') {
				const title = document.getElementById('rm-memory-title').value.trim();
				if (!title) return showError('Title is required');
				const { content, text_content } = rmGetEditorContent();
				const tags = document.getElementById('rm-memory-tags').value.split(',').map((t) => t.trim()).filter(Boolean);
				const source = document.getElementById('rm-memory-source').value.trim();
				const relationships = rmSelectedRelationships.map(r => r.id);
				const data = { title, content, text_content, tags, source, relationships, project: window.currentProjectId };
				if (isCreate) {
					const { memory } = await api('POST', '/memories', data);
					rmCurrentId = memory._id;
				} else {
					await api('PUT', `/memories/${rmCurrentId}`, data);
				}
			} else if (rmCurrentType === 'urls') {
				const url = document.getElementById('rm-url-input').value.trim();
				if (!url) return showError('URL is required');
				const title = document.getElementById('rm-url-title').value.trim();
				const description = document.getElementById('rm-url-description').value.trim();
				const crawl_enabled = document.getElementById('rm-url-crawl').checked;
				const data = { url, title, description, crawl_enabled, project: window.currentProjectId };
				if (isCreate) {
					await api('POST', '/urls', data);
				} else {
					await api('PUT', `/urls/${rmCurrentId}`, data);
				}
			}

			showSuccess(isCreate ? 'Created' : 'Saved');
			BsModal.getInstance(modalEl)?.hide();
			window.dispatchEvent(new CustomEvent('item-modal-saved', { detail: { type: rmCurrentType, id: rmCurrentId } }));
		} catch (err) {
			showError('Save failed: ' + (err.message || 'Unknown error'));
		}
	});

	// Delete
	document.getElementById('rm-delete-btn')?.addEventListener('click', async () => {
		if (!rmCurrentId || !rmCurrentType) return;
		const confirmed = await confirmAction('Move to Trash', 'This item will be moved to trash.');
		if (!confirmed) return;

		try {
			const typeEndpoints = { notes: 'notes', memory: 'memories', urls: 'urls' };
			const endpoint = typeEndpoints[rmCurrentType];
			if (endpoint) await api('DELETE', `/${endpoint}/${rmCurrentId}`);
			showSuccess('Moved to trash');
			BsModal.getInstance(modalEl)?.hide();
			window.dispatchEvent(new CustomEvent('item-modal-deleted', { detail: { type: rmCurrentType, id: rmCurrentId } }));
		} catch (err) {
			showError('Delete failed: ' + (err.message || 'Unknown error'));
		}
	});

	// Cleanup on modal close
	modalEl.addEventListener('hidden.bs.modal', rmCleanup);
}

// Expose globally so page scripts can use it
window.openItemModal = openItemModal;

function escapeHtml(str) {
	const div = document.createElement('div');
	div.textContent = str;
	return div.innerHTML;
}

function typeBadgeColor(type) {
	switch (type) {
		case 'notes': return 'primary';
		case 'memory': return 'success';
		case 'urls': return 'warning';
		case 'pages': return 'info';
		default: return 'secondary';
	}
}
