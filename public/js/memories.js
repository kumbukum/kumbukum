document.addEventListener('DOMContentLoaded', () => {
	const listEl = document.getElementById('memories-list');
	const newBtn = document.getElementById('new-memory-btn');

	const batchToolbar = document.getElementById('batch-toolbar');

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
			el.addEventListener('click', (e) => {
				if (e.target.closest('.batch-cb-wrap')) return;
				window.openItemModal('memory', el.dataset.id);
			});
		});
	}

	newBtn?.addEventListener('click', () => window.openItemModal('memory'));

	window.addEventListener('project-changed', loadMemories);
	window.addEventListener('batch-done', loadMemories);
	window.addEventListener('item-modal-saved', (e) => { if (e.detail?.type === 'memory') loadMemories(); });
	window.addEventListener('item-modal-deleted', (e) => { if (e.detail?.type === 'memory') loadMemories(); });
	loadMemories();

	// Auto-open memory from ?open= query param
	const openId = new URLSearchParams(window.location.search).get('open');
	if (openId) window.openItemModal('memory', openId);
});
