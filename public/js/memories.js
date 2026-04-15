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
					(m) => {
						const excerpt = m.content?.slice(0, 200) || '';
						const date = new Date(m.updatedAt).toLocaleDateString();
						return `
				<div class="list-group-item list-group-item-action memory-item" data-id="${m._id}">
					<div class="d-flex align-items-start gap-2">
						<div class="batch-cb-wrap">
							<input type="checkbox" class="form-check-input batch-cb" value="${m._id}">
						</div>
						<div class="flex-grow-1 overflow-hidden">
							<div class="d-flex justify-content-between align-items-center gap-2">
								<strong class="text-truncate">${m.title}</strong>
								<small class="text-muted text-nowrap flex-shrink-0">${date}</small>
							</div>
							${excerpt ? `<p class="mb-0 text-muted small text-truncate">${excerpt}</p>` : ''}
							<div class="text-muted small">${m.tags?.map((t) => `<span class="badge text-bg-secondary tag-badge rounded-pill me-1">${t}</span>`).join('') || ''}</div>
						</div>
					</div>
				</div>`;
					},
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
