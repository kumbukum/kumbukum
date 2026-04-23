// Notes section — mount/unmount for SPA navigation
(function () {
	var listEl, newBtn, pond;
	var windowListeners = [];

	function addWindowListener(event, handler) {
		window.addEventListener(event, handler);
		windowListeners.push([event, handler]);
	}

	async function loadNotes() {
		if (!listEl) return;
		var params = currentProjectId ? '?project=' + currentProjectId : '';
		var data = await api('GET', '/notes' + params);
		if (!listEl) return;
		var notes = data.notes;

		listEl.innerHTML = notes.length
			? notes
				.map(function (n) {
					var excerpt = n.text_content?.slice(0, 200) || '';
					var date = new Date(n.updatedAt).toLocaleDateString();
					return '<div class="list-group-item list-group-item-action note-item" data-id="' + n._id + '">'
						+ '<div class="d-flex align-items-start gap-2">'
						+ '<div class="batch-cb-wrap"><input type="checkbox" class="form-check-input batch-cb" value="' + n._id + '"></div>'
						+ '<div class="flex-grow-1 overflow-hidden">'
						+ '<div class="d-flex justify-content-between align-items-center gap-2">'
						+ '<strong class="text-truncate">' + n.title + '</strong>'
						+ '<small class="text-muted text-nowrap flex-shrink-0">' + date + '</small>'
						+ '</div>'
						+ (excerpt ? '<p class="mb-0 text-muted small text-truncate">' + excerpt + '</p>' : '')
						+ '<div class="text-muted small">' + (n.tags?.map(function (t) { return '<span class="badge text-bg-secondary tag-badge rounded-pill me-1">' + t + '</span>'; }).join('') || '') + '</div>'
						+ '</div></div></div>';
				})
				.join('')
			: '<p class="text-muted p-3">No notes yet. Create one!</p>';

		listEl.querySelectorAll('.note-item').forEach(function (el) {
			el.addEventListener('click', function (e) {
				if (e.target.closest('.batch-cb-wrap')) return;
				window.openItemModal('notes', el.dataset.id);
			});
		});
	}

	function setupFilePond() {
		var dropZone = document.getElementById('notes-drop-zone');
		var dropOverlay = document.getElementById('drop-overlay');
		var filepondInput = document.getElementById('import-filepond');

		if (!dropZone || !dropOverlay || !filepondInput || !window.FilePond) return;

		pond = FilePond.create(filepondInput, {
			name: 'file',
			allowMultiple: true,
			credits: false,
			server: {
				process: {
					url: '/api/v1/notes/import',
					method: 'POST',
					headers: {},
					ondata: function (formData) {
						if (currentProjectId) formData.append('project', currentProjectId);
						return formData;
					},
					onload: function (response) { return response; },
					onerror: function (response) { return response; },
				},
			},
		});

		var pondRoot = dropZone.querySelector('.filepond--root');
		if (pondRoot) pondRoot.classList.add('d-none');
		var successCount = 0;
		var errorCount = 0;

		function updatePondVisibility() {
			if (!pondRoot || !pond) return;
			if (pond.getFiles().length > 0) pondRoot.classList.add('filepond--active');
			else pondRoot.classList.remove('filepond--active');
		}

		function removePondItem(fileItem) {
			if (!pond || !fileItem) return;
			pond.removeFile(fileItem.id);
			updatePondVisibility();
		}

		pond.on('addfile', function (error, fileItem) {
			if (error) return;
			if (fileItem && fileItem.fileSize === 0) {
				removePondItem(fileItem);
				return;
			}
			updatePondVisibility();
		});

		pond.on('processfile', function (error, fileItem) {
			if (error) errorCount++;
			else successCount++;
			removePondItem(fileItem);
		});

		pond.on('processfiles', function () {
			if (successCount > 0) {
				showSuccess(successCount + ' file' + (successCount > 1 ? 's' : '') + ' imported as notes');
				loadNotes();
			}
			if (errorCount > 0) {
				showError(errorCount + ' file' + (errorCount > 1 ? 's' : '') + ' could not be imported');
			}
			successCount = 0;
			errorCount = 0;
			updatePondVisibility();
		});

		pond.on('warning', function (error) {
			if (error?.body) showError(error.body);
		});

		var dragCounter = 0;
		dropZone.addEventListener('dragenter', function (e) {
			e.preventDefault();
			dragCounter++;
			if (dragCounter === 1) dropOverlay.classList.remove('d-none');
		});
		dropZone.addEventListener('dragover', function (e) { e.preventDefault(); });
		dropZone.addEventListener('dragleave', function (e) {
			e.preventDefault();
			dragCounter--;
			if (dragCounter <= 0) { dragCounter = 0; dropOverlay.classList.add('d-none'); }
		});
		dropZone.addEventListener('drop', function (e) {
			e.preventDefault();
			dragCounter = 0;
			dropOverlay.classList.add('d-none');
			if (e.dataTransfer?.files?.length) pond.addFiles(Array.from(e.dataTransfer.files));
		});
	}

	function onModalSaved(e) { if (e.detail?.type === 'notes') loadNotes(); }
	function onModalDeleted(e) { if (e.detail?.type === 'notes') loadNotes(); }

	function mount() {
		listEl = document.getElementById('notes-list');
		newBtn = document.getElementById('new-note-btn');
		newBtn?.addEventListener('click', function () { window.openItemModal('notes'); });

		addWindowListener('project-changed', loadNotes);
		addWindowListener('batch-done', loadNotes);
		addWindowListener('item-modal-saved', onModalSaved);
		addWindowListener('item-modal-deleted', onModalDeleted);

		loadNotes();
		setupFilePond();

		var openId = new URLSearchParams(window.location.search).get('open');
		if (openId) window.openItemModal('notes', openId);
	}

	function unmount() {
		for (var i = 0; i < windowListeners.length; i++) {
			window.removeEventListener(windowListeners[i][0], windowListeners[i][1]);
		}
		windowListeners.length = 0;
		if (pond) { pond.destroy(); pond = null; }
		listEl = null;
		newBtn = null;
	}

	window.__sections = window.__sections || {};
	window.__sections.notes = { mount: mount, unmount: unmount };
})();
