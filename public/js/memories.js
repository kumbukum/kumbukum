document.addEventListener('DOMContentLoaded', () => {
	const listEl = document.getElementById('memories-list');
	const formEl = document.getElementById('memory-inline-form');
	const newBtn = document.getElementById('new-memory-btn');
	const saveBtn = document.getElementById('save-memory-btn');
	const cancelBtn = document.getElementById('cancel-memory-btn');

	let currentMemoryId = null;

	function showForm(data = {}) {
		document.getElementById('memory-title').value = data.title || '';
		document.getElementById('memory-content').value = data.content || '';
		document.getElementById('memory-tags').value = (data.tags || []).join(', ');
		document.getElementById('memory-source').value = data.source || '';
		formEl.classList.remove('d-none');
	}

	function hideForm() {
		currentMemoryId = null;
		formEl.classList.add('d-none');
	}

	async function loadMemories() {
		if (!listEl) return;
		const params = currentProjectId ? `?project=${currentProjectId}` : '';
		const { memories } = await api('GET', `/memories${params}`);

		listEl.innerHTML = memories.length
			? memories
				.map(
					(m) => `
				<div class="list-group-item memory-item" data-id="${m._id}">
					<div class="d-flex justify-content-between align-items-start">
						<div class="flex-grow-1">
							<strong>${m.title}</strong>
							<p class="mb-1 text-muted small">${m.content?.slice(0, 200) || ''}</p>
							<div>${m.tags?.map((t) => `<span class="badge bg-info tag-badge me-1">${t}</span>`).join('') || ''}</div>
							${m.source ? `<small class="text-muted">Source: ${m.source}</small>` : ''}
						</div>
						<div class="btn-group btn-group-sm ms-2">
							<button class="btn btn-outline-primary edit-memory-btn"><i class="bi bi-pencil"></i></button>
							<button class="btn btn-outline-danger delete-memory-btn"><i class="bi bi-trash"></i></button>
						</div>
					</div>
				</div>`,
				)
				.join('')
			: '<p class="text-muted p-3">No memories stored yet.</p>';

		listEl.querySelectorAll('.edit-memory-btn').forEach((btn) => {
			btn.addEventListener('click', async () => {
				const id = btn.closest('.memory-item').dataset.id;
				const { memory } = await api('GET', `/memories/${id}`);
				currentMemoryId = memory._id;
				showForm(memory);
			});
		});

		listEl.querySelectorAll('.delete-memory-btn').forEach((btn) => {
			btn.addEventListener('click', async () => {
				const id = btn.closest('.memory-item').dataset.id;
				const confirmed = await confirmAction('Delete Memory', 'This memory will be permanently deleted.');
				if (!confirmed) return;
				await api('DELETE', `/memories/${id}`);
				showSuccess('Memory deleted');
				loadMemories();
			});
		});
	}

	newBtn?.addEventListener('click', () => {
		currentMemoryId = null;
		showForm();
	});

	cancelBtn?.addEventListener('click', hideForm);

	saveBtn?.addEventListener('click', async () => {
		const title = document.getElementById('memory-title').value.trim();
		const content = document.getElementById('memory-content').value.trim();
		const tags = document
			.getElementById('memory-tags')
			.value.split(',')
			.map((t) => t.trim())
			.filter(Boolean);
		const source = document.getElementById('memory-source').value.trim();

		if (!title || !content) return showError('Title and content are required');

		const data = { title, content, tags, source, project: currentProjectId };

		if (currentMemoryId) {
			await api('PUT', `/memories/${currentMemoryId}`, data);
		} else {
			await api('POST', '/memories', data);
		}

		showSuccess('Memory saved');
		hideForm();
		loadMemories();
	});

	window.addEventListener('project-changed', loadMemories);
	loadMemories();
});
