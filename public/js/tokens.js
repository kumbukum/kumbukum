document.addEventListener('DOMContentLoaded', () => {
	const createBtn = document.getElementById('create-token');
	const nameInput = document.getElementById('token-name');
	const tokensList = document.getElementById('tokens-list');

	loadTokens();

	createBtn?.addEventListener('click', async () => {
		const name = nameInput.value.trim();
		if (!name) return showError('Enter a token name');

		try {
			const data = await api('POST', '/tokens', { name });
			nameInput.value = '';

			const alertHtml = `
				<div class="alert alert-success alert-dismissible fade show" id="new-token-alert">
					<strong>Token created!</strong> Copy it now — it won't be shown again.
					<div class="input-group mt-2">
						<input class="form-control" type="text" value="${data.token}" readonly id="new-token-value">
						<button class="btn btn-outline-secondary" id="copy-new-token"><i class="bi bi-clipboard"></i> Copy</button>
					</div>
					<button type="button" class="btn-close" data-bs-dismiss="alert"></button>
				</div>
			`;
			tokensList.insertAdjacentHTML('afterbegin', alertHtml);

			document.getElementById('copy-new-token')?.addEventListener('click', () => {
				navigator.clipboard.writeText(data.token);
				showSuccess('Token copied');
			});

			loadTokens();
		} catch (err) {
			showError(err.message);
		}
	});

	async function loadTokens() {
		try {
			const data = await api('GET', '/tokens');
			const listEl = document.getElementById('tokens-table');
			if (!listEl) {
				const table = document.createElement('div');
				table.id = 'tokens-table';
				tokensList.appendChild(table);
			}
			const tableEl = document.getElementById('tokens-table');

			if (!data.tokens?.length) {
				tableEl.innerHTML = '<p class="text-muted mt-3">No access tokens</p>';
				return;
			}

			tableEl.innerHTML = `
				<div class="list-group mt-3">
					${data.tokens.map((t) => `
						<div class="list-group-item d-flex justify-content-between align-items-center">
							<div>
								<strong>${escapeHtml(t.name)}</strong>
								<small class="text-muted ms-2">Created ${new Date(t.created_at).toLocaleDateString()}</small>
							</div>
							<button class="btn btn-sm btn-outline-danger delete-token" data-id="${t._id}">
								<i class="bi bi-trash"></i>
							</button>
						</div>
					`).join('')}
				</div>
			`;

			tableEl.querySelectorAll('.delete-token').forEach((btn) => {
				btn.addEventListener('click', async () => {
					const confirmed = await confirmAction('Delete Token', 'This token will stop working immediately.');
					if (!confirmed) return;
					try {
						await api('DELETE', `/tokens/${btn.dataset.id}`);
						showSuccess('Token deleted');
						loadTokens();
					} catch (err) {
						showError(err.message);
					}
				});
			});
		} catch (err) {
			console.error('Failed to load tokens:', err);
		}
	}

	function escapeHtml(str) {
		const div = document.createElement('div');
		div.textContent = str;
		return div.innerHTML;
	}
});
