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
					(n) => {
						const excerpt = n.text_content?.slice(0, 200) || '';
						const date = new Date(n.updatedAt).toLocaleDateString();
						return `
				<div class="list-group-item list-group-item-action note-item" data-id="${n._id}">
					<div class="d-flex align-items-start gap-2">
						<div class="batch-cb-wrap">
							<input type="checkbox" class="form-check-input batch-cb" value="${n._id}">
						</div>
						<div class="flex-grow-1 overflow-hidden">
							<div class="d-flex justify-content-between align-items-center gap-2">
								<strong class="text-truncate">${n.title}</strong>
								<small class="text-muted text-nowrap flex-shrink-0">${date}</small>
							</div>
							${excerpt ? `<p class="mb-0 text-muted small text-truncate">${excerpt}</p>` : ''}
							<div class="text-muted small">${n.tags?.map((t) => `<span class="badge text-bg-secondary tag-badge rounded-pill me-1">${t}</span>`).join('') || ''}</div>
						</div>
					</div>
				</div>`;
					},
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
					headers: {},
					ondata: (formData) => {
						if (currentProjectId) {
							formData.append('project', currentProjectId);
						}
						return formData;
					},
					onload: (response) => response,
					onerror: (response) => response,
				},
			},
		});

		const pondRoot = dropZone.querySelector('.filepond--root');

		// Show FilePond panel when files are added
		pond.on('addfile', () => {
			if (pondRoot) pondRoot.classList.add('filepond--active');
		});

		let successCount = 0;
		let errorCount = 0;

		pond.on('processfile', (error) => {
			if (error) {
				errorCount++;
			} else {
				successCount++;
			}
		});

		pond.on('processfiles', () => {
			if (successCount > 0) {
				showSuccess(`${successCount} file${successCount > 1 ? 's' : ''} imported as notes`);
				loadNotes();
			}
			if (errorCount > 0) {
				showError(`${errorCount} file${errorCount > 1 ? 's' : ''} could not be imported`);
			}
			successCount = 0;
			errorCount = 0;
			// Hide FilePond panel after a brief delay so user sees final state
			setTimeout(() => {
				pond.removeFiles();
				if (pondRoot) pondRoot.classList.remove('filepond--active');
			}, 2000);
		});

		pond.on('warning', (error) => {
			if (error?.body) showError(error.body);
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
