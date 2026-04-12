document.addEventListener('DOMContentLoaded', () => {
	const listEl = document.getElementById('notes-list');
	const newBtn = document.getElementById('new-note-btn');

	const batchToolbar = document.getElementById('batch-toolbar');
	const dropZoneEl = document.getElementById('notes-drop-zone');

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
			el.addEventListener('click', (e) => {
				if (e.target.closest('.batch-cb-wrap')) return;
				window.openItemModal('notes', el.dataset.id);
			});
		});
	}

	newBtn?.addEventListener('click', () => window.openItemModal('notes'));

	window.addEventListener('project-changed', loadNotes);
	window.addEventListener('batch-done', loadNotes);
	window.addEventListener('item-modal-saved', (e) => { if (e.detail?.type === 'notes') loadNotes(); });
	window.addEventListener('item-modal-deleted', (e) => { if (e.detail?.type === 'notes') loadNotes(); });
	loadNotes();

	// Auto-open note from ?open= query param
	const openId = new URLSearchParams(window.location.search).get('open');
	if (openId) window.openItemModal('notes', openId);

	// ---- File Import via Drag & Drop (FilePond) ----

	const dropZone = document.getElementById('notes-drop-zone');
	const dropOverlay = document.getElementById('drop-overlay');
	const filepondInput = document.getElementById('import-filepond');

	if (dropZone && dropOverlay && filepondInput && window.FilePond) {
		const pond = FilePond.create(filepondInput, {
			name: 'file',
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
