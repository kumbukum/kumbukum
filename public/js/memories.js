document.addEventListener('DOMContentLoaded', () => {
	const listEl = document.getElementById('memories-list');
	const editorEl = document.getElementById('memory-editor');
	const newBtn = document.getElementById('new-memory-btn');
	const saveBtn = document.getElementById('save-memory-btn');
	const deleteBtn = document.getElementById('delete-memory-btn');
	const backBtn = document.getElementById('back-to-memories-btn');
	const relationshipInput = document.getElementById('relationship-search');
	const relationshipTags = document.getElementById('relationship-tags');

	const batchToolbar = document.getElementById('batch-toolbar');

	let currentMemoryId = null;
	let tiptapEditor = null;
	let relationshipDropdown = null;
	let relationshipDebounce = null;
	let selectedRelationships = [];

	function initEditor(content) {
		const container = document.getElementById('memory-editor-container');
		container.innerHTML = '';
		if (tiptapEditor) {
			tiptapEditor.destroy();
			tiptapEditor = null;
		}
		if (window.KumbukumEditor) {
			tiptapEditor = window.KumbukumEditor.createEditor(container, { content });
		} else {
			container.innerHTML = content || '';
			container.setAttribute('contenteditable', 'true');
		}
	}

	function getEditorContent() {
		if (tiptapEditor) {
			return {
				content: tiptapEditor.getHTML(),
				text_content: tiptapEditor.getText(),
			};
		}
		const container = document.getElementById('memory-editor-container');
		return {
			content: container.innerHTML,
			text_content: container.textContent,
		};
	}

	// ── Relationship search ──
	const typeIcons = { notes: 'bi-file-text', memory: 'bi-lightbulb', urls: 'bi-link-45deg' };
	const typeLabels = { notes: 'Note', memory: 'Memory', urls: 'URL' };

	function ensureRelationshipDropdown() {
		if (relationshipDropdown) return relationshipDropdown;
		relationshipDropdown = document.createElement('div');
		relationshipDropdown.className = 'source-dropdown list-group position-absolute w-100';
		relationshipDropdown.style.cssText = 'z-index:1050; max-height:200px; overflow-y:auto; display:none; top:100%';
		relationshipInput.parentElement.appendChild(relationshipDropdown);
		return relationshipDropdown;
	}

	function hideRelationshipDropdown() {
		if (relationshipDropdown) relationshipDropdown.style.display = 'none';
	}

	function renderRelationshipTags() {
		relationshipTags.innerHTML = selectedRelationships.map((r, i) => `
			<span class="badge bg-secondary d-inline-flex align-items-center gap-1 me-1 mb-1">
				<i class="${typeIcons[r._type] || 'bi-link'}"></i>
				${r.title || r.url || r.id}
				<button type="button" class="btn-close btn-close-white ms-1" style="font-size:0.5rem" data-index="${i}"></button>
			</span>
		`).join('');
		relationshipTags.querySelectorAll('.btn-close').forEach(btn => {
			btn.addEventListener('click', () => {
				selectedRelationships.splice(parseInt(btn.dataset.index), 1);
				renderRelationshipTags();
			});
		});
	}

	async function searchRelationships(query) {
		if (!query || query.length < 3) { hideRelationshipDropdown(); return; }
		const { results } = await api('POST', '/search/all', { query });

		const filtered = (results || []).filter(r => !selectedRelationships.some(s => s.id === r.id));
		const dd = ensureRelationshipDropdown();
		if (!filtered.length) { hideRelationshipDropdown(); return; }

		dd.innerHTML = filtered.map(r => `
			<button type="button" class="list-group-item list-group-item-action py-1 px-2 small" data-id="${r.id}" data-type="${r._type}" data-title="${(r.title || r.url || '').replace(/"/g, '&quot;')}">
				<div class="d-flex align-items-center gap-1">
					<i class="${typeIcons[r._type] || 'bi-link'}"></i>
					<span class="badge bg-light text-dark" style="font-size:0.65rem">${typeLabels[r._type] || r._type}</span>
					<span class="fw-semibold text-truncate">${r.title || r.url || r.id}</span>
				</div>
			</button>
		`).join('');
		dd.style.display = 'block';

		dd.querySelectorAll('button').forEach(btn => {
			btn.addEventListener('mousedown', (e) => {
				e.preventDefault();
				selectedRelationships.push({
					id: btn.dataset.id,
					_type: btn.dataset.type,
					title: btn.dataset.title,
				});
				renderRelationshipTags();
				relationshipInput.value = '';
				hideRelationshipDropdown();
			});
		});
	}

	relationshipInput?.addEventListener('input', () => {
		clearTimeout(relationshipDebounce);
		relationshipDebounce = setTimeout(() => searchRelationships(relationshipInput.value.trim()), 150);
	});

	relationshipInput?.addEventListener('blur', () => setTimeout(hideRelationshipDropdown, 150));

	async function loadMemories() {
		if (!listEl) return;
		const params = currentProjectId ? `?project=${currentProjectId}` : '';
		const { memories } = await api('GET', `/memories${params}`);

		listEl.innerHTML = memories.length
			? memories
				.map(
					(m) => `
				<div class="list-group-item list-group-item-action memory-item d-flex justify-content-between align-items-center" data-id="${m._id}">
					<div class="batch-cb-wrap me-2">
						<input type="checkbox" class="form-check-input batch-cb" value="${m._id}">
					</div>
					<div class="flex-grow-1">
						<strong>${m.title}</strong>
						<div class="text-muted small">${m.tags?.map((t) => `<span class="badge bg-secondary tag-badge me-1">${t}</span>`).join('') || ''}</div>
					</div>
					<small class="text-muted">${new Date(m.updatedAt).toLocaleDateString()}</small>
				</div>`,
				)
				.join('')
			: '<p class="text-muted p-3">No memories yet. Create one!</p>';

		listEl.querySelectorAll('.memory-item').forEach((el) => {
			el.addEventListener('click', () => openMemory(el.dataset.id));
		});
	}

	async function openMemory(id) {
		const { memory } = await api('GET', `/memories/${id}`);
		currentMemoryId = memory._id;
		document.getElementById('memory-title').value = memory.title;
		document.getElementById('memory-tags').value = (memory.tags || []).join(', ');
		document.getElementById('memory-source').value = memory.source || '';

		selectedRelationships = [];
		if (memory.relationships?.length) {
			const { items } = await api('POST', '/resolve', { ids: memory.relationships });
			selectedRelationships = items || [];
		}
		renderRelationshipTags();

		initEditor(memory.content || '');
		listEl.classList.add('d-none');
		newBtn.classList.add('d-none');
		if (batchToolbar) batchToolbar.classList.add('d-none');
		editorEl.classList.remove('d-none');
		deleteBtn.classList.remove('d-none');
	}

	newBtn?.addEventListener('click', () => {
		currentMemoryId = null;
		document.getElementById('memory-title').value = '';
		document.getElementById('memory-tags').value = '';
		document.getElementById('memory-source').value = '';
		selectedRelationships = [];
		renderRelationshipTags();
		initEditor('');
		listEl.classList.add('d-none');
		newBtn.classList.add('d-none');
		if (batchToolbar) batchToolbar.classList.add('d-none');
		editorEl.classList.remove('d-none');
		deleteBtn.classList.add('d-none');
	});

	backBtn?.addEventListener('click', () => {
		if (tiptapEditor) {
			tiptapEditor.destroy();
			tiptapEditor = null;
		}
		editorEl.classList.add('d-none');
		listEl.classList.remove('d-none');
		newBtn.classList.remove('d-none');
		if (batchToolbar) batchToolbar.classList.remove('d-none');
		loadMemories();
	});

	saveBtn?.addEventListener('click', async () => {
		const title = document.getElementById('memory-title').value.trim();
		const { content, text_content } = getEditorContent();
		const tags = document
			.getElementById('memory-tags')
			.value.split(',')
			.map((t) => t.trim())
			.filter(Boolean);
		const source = document.getElementById('memory-source').value.trim();

		if (!title) return showError('Title is required');

		const data = { title, content, text_content, tags, source, relationships: selectedRelationships.map(r => r.id), project: currentProjectId };

		if (currentMemoryId) {
			await api('PUT', `/memories/${currentMemoryId}`, data);
		} else {
			const { memory } = await api('POST', '/memories', data);
			currentMemoryId = memory._id;
		}

		showSuccess('Memory saved');
		backBtn.click();
	});

	deleteBtn?.addEventListener('click', async () => {
		if (!currentMemoryId) return;
		const confirmed = await confirmAction('Move to Trash', 'This memory will be moved to trash.');
		if (!confirmed) return;

		await api('DELETE', `/memories/${currentMemoryId}`);
		showSuccess('Moved to trash');
		backBtn.click();
	});

	window.addEventListener('project-changed', loadMemories);
	window.addEventListener('batch-done', loadMemories);
	loadMemories();
});
