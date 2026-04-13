document.addEventListener('DOMContentLoaded', () => {
	const listEl = document.getElementById('trash-list');
	const emptyBtn = document.getElementById('empty-trash-btn');
	const selectAllCb = document.getElementById('trash-select-all-cb');
	const batchActions = document.getElementById('trash-batch-actions');
	const batchCount = document.getElementById('trash-batch-count');
	const batchRestoreBtn = document.getElementById('trash-batch-restore-btn');
	const batchDeleteBtn = document.getElementById('trash-batch-delete-btn');
	const filterBtns = document.querySelectorAll('.trash-filter-btn');

	let currentFilter = '';

	const ICONS = {
		notes: 'bi-file-text',
		memories: 'bi-lightbulb',
		urls: 'bi-link-45deg',
	};

	const LABELS = {
		notes: 'Note',
		memories: 'Memory',
		urls: 'URL',
	};

	function getSelected() {
		return [...listEl.querySelectorAll('.batch-cb:checked')].map((cb) => ({
			type: cb.dataset.type,
			id: cb.value,
		}));
	}

	function updateBatchBar() {
		const selected = getSelected();
		if (selected.length > 0) {
			batchActions.classList.remove('d-none');
			batchCount.textContent = `${selected.length} selected`;
		} else {
			batchActions.classList.add('d-none');
		}
		const all = listEl.querySelectorAll('.batch-cb');
		if (all.length && selected.length === all.length) {
			selectAllCb.checked = true;
			selectAllCb.indeterminate = false;
		} else if (selected.length > 0) {
			selectAllCb.checked = false;
			selectAllCb.indeterminate = true;
		} else {
			selectAllCb.checked = false;
			selectAllCb.indeterminate = false;
		}
	}

	async function loadTrash() {
		if (!listEl) return;
		const params = currentFilter ? `?type=${currentFilter}` : '';
		const { items, total } = await api('GET', `/trash${params}`);

		listEl.innerHTML = items.length
			? items
				.map(
					(item) => `
				<div class="list-group-item d-flex justify-content-between align-items-start trash-item" data-id="${item._id}" data-type="${item._type}">
					<div class="batch-cb-wrap me-2 pt-1">
						<input type="checkbox" class="form-check-input batch-cb" value="${item._id}" data-type="${item._type}">
					</div>
					<div class="flex-grow-1">
						<div class="d-flex align-items-center gap-2 mb-1">
							<span class="badge bg-secondary"><i class="bi ${ICONS[item._type] || 'bi-file'}"></i> ${LABELS[item._type] || item._type}</span>
							<strong>${item.title || item.url || 'Untitled'}</strong>
						</div>
						<small class="text-muted">Trashed ${new Date(item.trashed_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small>
					</div>
					<div class="btn-group btn-group-sm ms-2">
						<button class="btn btn-outline-success restore-btn" title="Restore"><i class="bi bi-arrow-counterclockwise"></i></button>
						<button class="btn btn-outline-danger permanent-delete-btn" title="Delete forever"><i class="bi bi-x-circle"></i></button>
					</div>
				</div>`,
				)
				.join('')
			: '<p class="text-muted p-3">Trash is empty.</p>';

		listEl.querySelectorAll('.restore-btn').forEach((btn) => {
			btn.addEventListener('click', async () => {
				const el = btn.closest('.trash-item');
				await api('POST', '/trash/restore', { type: el.dataset.type, id: el.dataset.id });
				showSuccess('Item restored');
				loadTrash();
				refreshTrashCount();
			});
		});

		listEl.querySelectorAll('.permanent-delete-btn').forEach((btn) => {
			btn.addEventListener('click', async () => {
				const el = btn.closest('.trash-item');
				const confirmed = await confirmAction('Delete Forever', 'This item will be permanently deleted. This cannot be undone.');
				if (!confirmed) return;
				await api('DELETE', `/trash/${el.dataset.type}/${el.dataset.id}`);
				showSuccess('Item permanently deleted');
				loadTrash();
				refreshTrashCount();
			});
		});

		listEl.querySelectorAll('.batch-cb').forEach((cb) => {
			cb.addEventListener('change', updateBatchBar);
			cb.addEventListener('click', (e) => e.stopPropagation());
		});

		selectAllCb.checked = false;
		selectAllCb.indeterminate = false;
		batchActions.classList.add('d-none');
	}

	selectAllCb?.addEventListener('change', () => {
		const cbs = listEl.querySelectorAll('.batch-cb');
		cbs.forEach((cb) => (cb.checked = selectAllCb.checked));
		updateBatchBar();
	});

	batchRestoreBtn?.addEventListener('click', async () => {
		const items = getSelected();
		if (!items.length) return;
		await api('POST', '/trash/batch/restore', { items });
		showSuccess(`${items.length} items restored`);
		loadTrash();
		refreshTrashCount();
	});

	batchDeleteBtn?.addEventListener('click', async () => {
		const items = getSelected();
		if (!items.length) return;
		const confirmed = await confirmAction('Delete Forever', `${items.length} items will be permanently deleted. This cannot be undone.`);
		if (!confirmed) return;
		await api('POST', '/trash/batch/delete', { items });
		showSuccess(`${items.length} items permanently deleted`);
		loadTrash();
		refreshTrashCount();
	});

	emptyBtn?.addEventListener('click', async () => {
		const confirmed = await confirmAction('Empty Trash', 'All items in trash will be permanently deleted. This cannot be undone.');
		if (!confirmed) return;
		await api('DELETE', '/trash?confirm=true');
		showSuccess('Trash emptied');
		loadTrash();
		refreshTrashCount();
	});

	filterBtns.forEach((btn) => {
		btn.addEventListener('click', () => {
			filterBtns.forEach((b) => b.classList.remove('active'));
			btn.classList.add('active');
			currentFilter = btn.dataset.type;
			loadTrash();
		});
	});

	loadTrash();
});

async function refreshTrashCount() {
	try {
		const { count } = await api('GET', '/trash/count');
		const badge = document.getElementById('trash-count-badge');
		if (badge) {
			badge.textContent = count || '';
			badge.classList.toggle('d-none', !count);
		}
	} catch (e) {
		// ignore
	}
}
