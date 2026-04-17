// Batch selection & actions for notes, memories, urls
(function () {
	const toolbar = document.getElementById('batch-toolbar');
	if (!toolbar) return;

	const batchType = toolbar.dataset.type;
	const batchActions = document.getElementById('batch-actions');
	const selectAllCb = document.getElementById('select-all-cb');
	const batchCount = document.getElementById('batch-count');
	const batchDeleteBtn = document.getElementById('batch-delete-btn');
	const batchMoveBtn = document.getElementById('batch-move-btn');
	const batchCopyBtn = document.getElementById('batch-copy-btn');
	const selectAllBanner = document.getElementById('select-all-records-banner');

	let selectAllRecords = false;
	let totalRecordCount = 0;

	function getSelected() {
		return Array.from(document.querySelectorAll('.batch-cb:checked')).map((cb) => cb.value);
	}

	function getAllCheckboxes() {
		return document.querySelectorAll('.batch-cb');
	}

	function clearSelectAllRecords() {
		selectAllRecords = false;
		totalRecordCount = 0;
		if (selectAllBanner) selectAllBanner.classList.add('d-none');
	}

	function updateBatchBar() {
		const selected = getSelected();
		const count = selectAllRecords ? totalRecordCount : selected.length;

		if (selectAllRecords) {
			batchCount.textContent = `All ${totalRecordCount} selected`;
		} else {
			batchCount.textContent = `${count} selected`;
		}

		if (count > 0) {
			batchActions.classList.remove('d-none');
		} else {
			batchActions.classList.add('d-none');
		}

		const all = getAllCheckboxes();
		selectAllCb.checked = all.length > 0 && selected.length === all.length;
		selectAllCb.indeterminate = selected.length > 0 && selected.length < all.length;
	}

	function resetBatch() {
		selectAllCb.checked = false;
		selectAllCb.indeterminate = false;
		batchActions.classList.add('d-none');
		clearSelectAllRecords();
	}

	selectAllCb.addEventListener('change', async () => {
		const checked = selectAllCb.checked;
		getAllCheckboxes().forEach((cb) => {
			cb.checked = checked;
		});

		if (!checked) {
			clearSelectAllRecords();
		}

		updateBatchBar();

		if (checked && selectAllBanner) {
			const params = new URLSearchParams({ type: batchType });
			if (currentProjectId) params.set('project', currentProjectId);
			try {
				const { count } = await api('GET', `/batch/count?${params}`);
				totalRecordCount = count;
				const visibleCount = getAllCheckboxes().length;

				if (count > visibleCount) {
					selectAllBanner.innerHTML = `All ${visibleCount} items on this page are selected. <a href="#" id="select-all-records-link">Select all ${count} items</a>`;
					selectAllBanner.classList.remove('d-none');
				}
			} catch (e) {
				// Silently fail — user can still use normal batch actions
			}
		}
	});

	if (selectAllBanner) {
		selectAllBanner.addEventListener('click', (e) => {
			if (e.target.id === 'select-all-records-link') {
				e.preventDefault();
				selectAllRecords = true;
				batchCount.textContent = `All ${totalRecordCount} selected`;
				selectAllBanner.innerHTML = `All ${totalRecordCount} items are selected. <a href="#" id="clear-all-records-link">Clear selection</a>`;
			} else if (e.target.id === 'clear-all-records-link') {
				e.preventDefault();
				selectAllCb.checked = false;
				getAllCheckboxes().forEach((cb) => { cb.checked = false; });
				clearSelectAllRecords();
				updateBatchBar();
			}
		});
	}

	let lastChecked = null;

	document.addEventListener('change', (e) => {
		if (e.target.classList.contains('batch-cb')) {
			if (selectAllRecords && !e.target.checked) {
				clearSelectAllRecords();
			}
			updateBatchBar();
		}
	});

	// Shift+click range selection and prevent checkbox clicks from triggering list-item click
	document.addEventListener('click', (e) => {
		const cb = e.target.classList.contains('batch-cb')
			? e.target
			: e.target.closest('.batch-cb-wrap')?.querySelector('.batch-cb');

		if (!cb) return;

		if (e.target.closest('.batch-cb-wrap')) {
			e.stopPropagation();
		}

		if (e.shiftKey && lastChecked && lastChecked !== cb) {
			const all = Array.from(getAllCheckboxes());
			const start = all.indexOf(lastChecked);
			const end = all.indexOf(cb);
			if (start !== -1 && end !== -1) {
				const low = Math.min(start, end);
				const high = Math.max(start, end);
				const checked = cb.checked;
				for (let i = low; i <= high; i++) {
					all[i].checked = checked;
				}
				updateBatchBar();
			}
		}

		lastChecked = cb;
	}, true);

	function buildBatchBody(extra = {}) {
		const body = { type: batchType, ...extra };
		if (selectAllRecords) {
			body.all = true;
			if (currentProjectId) body.filterProject = currentProjectId;
		} else {
			body.ids = getSelected();
		}
		return body;
	}

	function getActionCount() {
		return selectAllRecords ? totalRecordCount : getSelected().length;
	}

	batchDeleteBtn.addEventListener('click', async () => {
		const count = getActionCount();
		if (!count) return;
		const confirmed = await confirmAction('Move to Trash', `${count} item(s) will be moved to trash.`);
		if (!confirmed) return;

		await api('POST', '/batch/delete', buildBatchBody());
		showSuccess(`${count} moved to trash`);
		resetBatch();
		window.dispatchEvent(new CustomEvent('batch-done'));
	});

	async function pickProject(action) {
		const count = getActionCount();
		if (!count) return;

		const { projects } = await api('GET', '/projects');
		const others = projects.filter((p) => p._id !== currentProjectId);
		if (!others.length) {
			showError('No other projects available');
			return;
		}

		const { Swal } = await import('/static/js/vendor.js');
		const options = others.map((p) => `<option value="${p._id}">${p.name}</option>`).join('');
		const { value: project } = await Swal.fire({
			title: `${action === 'move' ? 'Move' : 'Copy'} to project`,
			html: `<select id="batch-project-select" class="form-select">${options}</select>`,
			showCancelButton: true,
			confirmButtonText: action === 'move' ? 'Move' : 'Copy',
			preConfirm: () => document.getElementById('batch-project-select').value,
		});
		if (!project) return;

		await api('POST', `/batch/${action}`, buildBatchBody({ project }));
		showSuccess(`${count} ${action === 'move' ? 'moved' : 'copied'}`);
