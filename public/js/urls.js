document.addEventListener('DOMContentLoaded', () => {
	const listEl = document.getElementById('urls-list');
	const formEl = document.getElementById('url-inline-form');
	const newBtn = document.getElementById('new-url-btn');
	const saveBtn = document.getElementById('save-url-btn');
	const cancelBtn = document.getElementById('cancel-url-btn');
	const batchToolbar = document.getElementById('batch-toolbar');

	let currentUrlId = null;

	function showForm(data = {}) {
		document.getElementById('url-input').value = data.url || '';
		document.getElementById('url-title').value = data.title || '';
		document.getElementById('url-description').value = data.description || '';
		document.getElementById('url-crawl').checked = data.crawl_enabled || false;
		document.getElementById('url-input').readOnly = !!data.url;
		formEl.classList.remove('d-none');
		if (batchToolbar) batchToolbar.classList.add('d-none');
	}

	function hideForm() {
		currentUrlId = null;
		document.getElementById('url-input').readOnly = false;
		formEl.classList.add('d-none');
		if (batchToolbar) batchToolbar.classList.remove('d-none');
	}

	async function loadUrls() {
		if (!listEl) return;
		const params = currentProjectId ? `?project=${currentProjectId}` : '';
		const { urls } = await api('GET', `/urls${params}`);

		listEl.innerHTML = urls.length
			? urls
				.map(
					(u) => `
				<div class="list-group-item url-item d-flex justify-content-between align-items-start" data-id="${u._id}">
					<div class="batch-cb-wrap me-2 pt-1">
						<input type="checkbox" class="form-check-input batch-cb" value="${u._id}">
					</div>
					<div class="flex-grow-1">
						${u.og_image ? `<img src="${u.og_image}" class="og-image rounded mb-2 d-block" alt="">` : ''}
						<strong>${u.title || u.url}</strong>
						<div><a href="${u.url}" target="_blank" class="text-muted small">${u.url}</a></div>
						<p class="mb-1 text-muted small">${u.description?.slice(0, 200) || ''}</p>
						${u.crawl_enabled ? '<span class="badge bg-success"><i class="bi bi-arrow-repeat"></i> Crawling</span>' : ''}
					</div>
					<div class="btn-group btn-group-sm ms-2">
						<button class="btn btn-outline-primary edit-url-btn"><i class="bi bi-pencil"></i></button>
						<button class="btn btn-outline-danger delete-url-btn"><i class="bi bi-trash"></i></button>
					</div>
				</div>`,
				)
				.join('')
			: '<p class="text-muted p-3">No URLs saved yet.</p>';

		listEl.querySelectorAll('.edit-url-btn').forEach((btn) => {
			btn.addEventListener('click', async () => {
				const id = btn.closest('.url-item').dataset.id;
				const { url } = await api('GET', `/urls/${id}`);
				currentUrlId = url._id;
				showForm(url);
			});
		});

		listEl.querySelectorAll('.delete-url-btn').forEach((btn) => {
			btn.addEventListener('click', async () => {
				const id = btn.closest('.url-item').dataset.id;
				const confirmed = await confirmAction('Move to Trash', 'This URL will be moved to trash.');
				if (!confirmed) return;
				await api('DELETE', `/urls/${id}`);
				showSuccess('Moved to trash');
				loadUrls();
			});
		});
	}

	newBtn?.addEventListener('click', () => {
		currentUrlId = null;
		showForm();
	});

	cancelBtn?.addEventListener('click', hideForm);

	saveBtn?.addEventListener('click', async () => {
		const url = document.getElementById('url-input').value.trim();
		const title = document.getElementById('url-title').value.trim();
		const description = document.getElementById('url-description').value.trim();
		const crawl_enabled = document.getElementById('url-crawl').checked;

		if (!url) return showError('URL is required');

		const data = { url, title, description, crawl_enabled, project: currentProjectId };

		if (currentUrlId) {
			await api('PUT', `/urls/${currentUrlId}`, data);
		} else {
			await api('POST', '/urls', data);
		}

		showSuccess('URL saved');
		hideForm();
		loadUrls();
	});

	window.addEventListener('project-changed', loadUrls);
	window.addEventListener('batch-done', loadUrls);
	loadUrls();
});
