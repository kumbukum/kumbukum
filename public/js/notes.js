document.addEventListener('DOMContentLoaded', () => {
	const listEl = document.getElementById('notes-list');
	const editorEl = document.getElementById('note-editor');
	const newBtn = document.getElementById('new-note-btn');
	const saveBtn = document.getElementById('save-note-btn');
	const deleteBtn = document.getElementById('delete-note-btn');
	const backBtn = document.getElementById('back-to-list-btn');

	const batchToolbar = document.getElementById('batch-toolbar');

	let currentNoteId = null;
	let tiptapEditor = null;

	function initEditor(content) {
		const container = document.getElementById('editor-container');
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
		const container = document.getElementById('editor-container');
		return {
			content: container.innerHTML,
			text_content: container.textContent,
		};
	}

	async function loadNotes() {
		if (!listEl) return;
		const params = currentProjectId ? `?project=${currentProjectId}` : '';
		const { notes } = await api('GET', `/notes${params}`);

		listEl.innerHTML = notes.length
			? notes
				.map(
					(n) => `
				<div class="list-group-item list-group-item-action note-item d-flex justify-content-between align-items-center" data-id="${n._id}">
					<div class="batch-cb-wrap me-2">
						<input type="checkbox" class="form-check-input batch-cb" value="${n._id}">
					</div>
					<div class="flex-grow-1">
						<strong>${n.title}</strong>
						<div class="text-muted small">${n.tags?.map((t) => `<span class="badge bg-secondary tag-badge me-1">${t}</span>`).join('') || ''}</div>
					</div>
					<small class="text-muted">${new Date(n.updatedAt).toLocaleDateString()}</small>
				</div>`,
				)
				.join('')
			: '<p class="text-muted p-3">No notes yet. Create one!</p>';

		listEl.querySelectorAll('.note-item').forEach((el) => {
			el.addEventListener('click', () => openNote(el.dataset.id));
		});
	}

	async function openNote(id) {
		const { note } = await api('GET', `/notes/${id}`);
		currentNoteId = note._id;
		document.getElementById('note-title').value = note.title;
		document.getElementById('note-tags').value = (note.tags || []).join(', ');
		initEditor(note.content || '');
		listEl.classList.add('d-none');
		newBtn.classList.add('d-none');
		if (batchToolbar) batchToolbar.classList.add('d-none');
		editorEl.classList.remove('d-none');
		deleteBtn.classList.remove('d-none');
	}

	newBtn?.addEventListener('click', () => {
		currentNoteId = null;
		document.getElementById('note-title').value = '';
		document.getElementById('note-tags').value = '';
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
		loadNotes();
	});

	saveBtn?.addEventListener('click', async () => {
		const title = document.getElementById('note-title').value.trim() || 'Untitled';
		const { content, text_content } = getEditorContent();
		const tags = document
			.getElementById('note-tags')
			.value.split(',')
			.map((t) => t.trim())
			.filter(Boolean);

		const data = { title, content, text_content, tags, project: currentProjectId };

		if (currentNoteId) {
			await api('PUT', `/notes/${currentNoteId}`, data);
		} else {
			const { note } = await api('POST', '/notes', data);
			currentNoteId = note._id;
		}

		showSuccess('Note saved');
		backBtn.click();
	});

	deleteBtn?.addEventListener('click', async () => {
		if (!currentNoteId) return;
		const confirmed = await confirmAction('Move to Trash', 'This note will be moved to trash.');
		if (!confirmed) return;

		await api('DELETE', `/notes/${currentNoteId}`);
		showSuccess('Moved to trash');
		backBtn.click();
	});

	window.addEventListener('project-changed', loadNotes);
	window.addEventListener('batch-done', loadNotes);
	loadNotes();

	// ---- File Import via Drag & Drop (FilePond) ----

	const dropZone = document.getElementById('notes-drop-zone');
	const dropOverlay = document.getElementById('drop-overlay');
	const filepondInput = document.getElementById('import-filepond');

	if (dropZone && dropOverlay && filepondInput && window.FilePond) {
		const pond = FilePond.create(filepondInput, {
			allowMultiple: true,
			credits: false,
			server: {
				process: {
					url: '/api/v1/notes/import',
					method: 'POST',
					ondata: (formData) => {
						if (currentProjectId) {
							formData.append('project', currentProjectId);
						}
						return formData;
					},
				},
			},
		});

		// Hide the FilePond UI — we only use it programmatically
		const pondRoot = dropZone.querySelector('.filepond--root');
		if (pondRoot) pondRoot.style.display = 'none';

		pond.on('processfiles', () => {
			showSuccess('Files imported as notes');
			pond.removeFiles();
			loadNotes();
		});

		pond.on('error', (error) => {
			if (error?.main) showError(error.main);
		});

		// Drag & drop overlay logic
		let dragCounter = 0;

		dropZone.addEventListener('dragenter', (e) => {
			e.preventDefault();
			dragCounter++;
			if (dragCounter === 1) {
				dropOverlay.classList.remove('d-none');
			}
		});

		dropZone.addEventListener('dragover', (e) => {
			e.preventDefault();
		});

		dropZone.addEventListener('dragleave', (e) => {
			e.preventDefault();
			dragCounter--;
			if (dragCounter <= 0) {
				dragCounter = 0;
				dropOverlay.classList.add('d-none');
			}
		});

		dropZone.addEventListener('drop', (e) => {
			e.preventDefault();
			dragCounter = 0;
			dropOverlay.classList.add('d-none');
			if (e.dataTransfer?.files?.length) {
				pond.addFiles(Array.from(e.dataTransfer.files));
			}
		});
	}
});
