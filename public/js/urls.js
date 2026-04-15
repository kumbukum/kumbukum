document.addEventListener('DOMContentLoaded', () => {
	const listEl = document.getElementById('urls-list');
	const newBtn = document.getElementById('new-url-btn');
	const batchToolbar = document.getElementById('batch-toolbar');

	async function loadUrls() {
		if (!listEl) return;
		const params = currentProjectId ? `?project=${currentProjectId}` : '';
		const { urls } = await api('GET', `/urls${params}`);

		listEl.innerHTML = urls.length
			? urls
				.map(
					(u) => {
						const date = u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '';
						return `
				<div class="list-group-item url-item d-flex align-items-start gap-3" data-id="${u._id}" role="button" style="cursor:pointer">
					<div class="batch-cb-wrap">
						<input type="checkbox" class="form-check-input batch-cb" value="${u._id}">
					</div>
					${u.og_image ? `<img src="${u.og_image}" class="og-image-thumb rounded flex-shrink-0" alt="">` : ''}
					<div class="flex-grow-1 overflow-hidden">
						<div class="d-flex justify-content-between align-items-center gap-2">
							<strong class="text-truncate">${u.title || u.url}</strong>
							<span class="text-muted small text-nowrap flex-shrink-0">${date}</span>
						</div>
						<div class="text-truncate"><a href="${u.url}" target="_blank" class="text-muted small url-link">${u.url}</a></div>
						<p class="mb-0 text-muted small text-truncate">${u.description?.slice(0, 200) || ''}</p>
						${u.crawl_enabled ? '<span class="badge bg-success mt-1"><i class="bi bi-arrow-repeat"></i> Crawling</span>' : ''}
					</div>
				</div>`;
					},
				)
				.join('')
			: '<p class="text-muted p-3">No URLs saved yet.</p>';

		listEl.querySelectorAll('.url-item').forEach((item) => {
			item.addEventListener('click', (e) => {
				if (e.target.closest('.batch-cb-wrap') || e.target.closest('.url-link')) return;
				window.openItemModal('urls', item.dataset.id);
			});
		});
	}

	newBtn?.addEventListener('click', () => window.openItemModal('urls'));

	window.addEventListener('project-changed', loadUrls);
	window.addEventListener('batch-done', loadUrls);
	window.addEventListener('item-modal-saved', (e) => { if (e.detail?.type === 'urls') loadUrls(); });
	window.addEventListener('item-modal-deleted', (e) => { if (e.detail?.type === 'urls') loadUrls(); });
	loadUrls().then(() => {
		const openId = new URLSearchParams(window.location.search).get('open');
		if (openId) window.openItemModal('urls', openId);
	});
});
