const API = '/api/v1';

async function api(method, path, body) {
	const options = {
		method,
		headers: { 'Content-Type': 'application/json' },
	};
	if (body && method !== 'GET') options.body = JSON.stringify(body);

	const res = await fetch(`${API}${path}`, options);
	if (!res.ok) {
		const err = await res.json().catch(() => ({ error: res.statusText }));
		throw new Error(err.error || 'Request failed');
	}
	return res.json();
}

// SweetAlert2 confirm helper
async function confirmAction(title, text) {
	const { Swal } = await import('/static/js/vendor.js');
	const result = await Swal.fire({
		title,
		text,
		icon: 'warning',
		showCancelButton: true,
		confirmButtonColor: '#d33',
		confirmButtonText: 'Yes, do it',
	});
	return result.isConfirmed;
}

async function showSuccess(title) {
	const { Swal } = await import('/static/js/vendor.js');
	Swal.fire({ title, icon: 'success', timer: 1500, showConfirmButton: false });
}

async function showError(message) {
	const { Swal } = await import('/static/js/vendor.js');
	Swal.fire({ title: 'Error', text: message, icon: 'error' });
}

// Current project
let currentProjectId = null;

// Load projects sidebar with counts
async function loadProjects() {
	try {
		const [{ projects }, counts] = await Promise.all([
			api('GET', '/projects'),
			api('GET', '/counts').catch(() => ({ notes: 0, memory: 0, urls: 0 })),
		]);
		const list = document.getElementById('project-list');
		if (!list) return;

		list.innerHTML = projects
			.map(
				(p) => `
			<div class="project-item ${p._id === currentProjectId ? 'active' : ''}" data-id="${p._id}">
				<div class="d-flex align-items-center mb-1">
					<span class="project-color" style="background:${p.color}"></span>
					<span class="fw-medium">${p.name}</span>
					${p.is_default ? '<i class="bi bi-star-fill text-warning ms-auto" style="font-size:0.7rem"></i>' : ''}
				</div>
				<a href="/notes" class="section-link"><i class="bi bi-journal-text me-2"></i>Notes<span class="section-count">${counts.notes || 0}</span></a>
				<a href="/memories" class="section-link"><i class="bi bi-brain me-2"></i>Memories<span class="section-count">${counts.memory || 0}</span></a>
				<a href="/urls" class="section-link"><i class="bi bi-link-45deg me-2"></i>URLs<span class="section-count">${counts.urls || 0}</span></a>
			</div>`,
			)
			.join('');

		list.querySelectorAll('.project-item').forEach((el) => {
			el.addEventListener('click', (e) => {
				if (e.target.closest('a')) return;
				currentProjectId = el.dataset.id;
				document.querySelectorAll('.project-item').forEach((e) => e.classList.remove('active'));
				el.classList.add('active');
				window.dispatchEvent(new CustomEvent('project-changed', { detail: currentProjectId }));
				loadProjectOverview(currentProjectId);
			});
		});

		if (!currentProjectId && projects.length) {
			const def = projects.find((p) => p.is_default) || projects[0];
			currentProjectId = def._id;
			list.querySelector(`[data-id="${def._id}"]`)?.classList.add('active');
			loadProjectOverview(currentProjectId);
		}
	} catch (err) {
		console.error('Failed to load projects:', err);
	}
}

// Load project overview into main content
async function loadProjectOverview(projectId) {
	const container = document.getElementById('project-overview');
	if (!container) return;

	try {
		const [{ project }, counts] = await Promise.all([
			api('GET', `/projects/${projectId}`),
			api('GET', '/counts').catch(() => ({ notes: 0, memory: 0, urls: 0 })),
		]);

		const createdAt = new Date(project.createdAt).toLocaleDateString('en-US', {
			year: 'numeric', month: 'long', day: 'numeric',
		});

		container.innerHTML = `
			<div class="d-flex justify-content-between align-items-center mb-4">
				<div class="d-flex align-items-center gap-2">
					<span class="project-color" style="background:${project.color}; width:16px; height:16px"></span>
					<h4 class="mb-0">${project.name}</h4>
					${project.is_default ? '<span class="badge bg-warning text-dark">Default</span>' : ''}
				</div>
				<div class="d-flex gap-2">
					<button class="btn btn-sm btn-outline-secondary" onclick="editProject('${project._id}')">
						<i class="bi bi-pencil me-1"></i>Edit
					</button>
					${!project.is_default ? `<button class="btn btn-sm btn-outline-danger" onclick="deleteProject('${project._id}')">
						<i class="bi bi-trash me-1"></i>Delete
					</button>` : ''}
				</div>
			</div>
			<p class="text-muted small">Created ${createdAt}</p>
			<div class="row g-3 mt-2">
				<div class="col-md-4">
					<a href="/notes" class="text-decoration-none">
						<div class="card h-100">
							<div class="card-body text-center">
								<i class="bi bi-journal-text d-block mb-2" style="font-size:1.5rem; color:#0d6efd"></i>
								<div class="fs-3 fw-bold">${counts.notes || 0}</div>
								<div class="text-muted">Notes</div>
							</div>
						</div>
					</a>
				</div>
				<div class="col-md-4">
					<a href="/memories" class="text-decoration-none">
						<div class="card h-100">
							<div class="card-body text-center">
								<i class="bi bi-brain d-block mb-2" style="font-size:1.5rem; color:#6f42c1"></i>
								<div class="fs-3 fw-bold">${counts.memory || 0}</div>
								<div class="text-muted">Memories</div>
							</div>
						</div>
					</a>
				</div>
				<div class="col-md-4">
					<a href="/urls" class="text-decoration-none">
						<div class="card h-100">
							<div class="card-body text-center">
								<i class="bi bi-link-45deg d-block mb-2" style="font-size:1.5rem; color:#198754"></i>
								<div class="fs-3 fw-bold">${counts.urls || 0}</div>
								<div class="text-muted">URLs</div>
							</div>
						</div>
					</a>
				</div>
			</div>`;
	} catch (err) {
		container.innerHTML = '<div class="text-danger">Failed to load project</div>';
		console.error('Failed to load project overview:', err);
	}
}

// Edit project
async function editProject(projectId) {
	const { Swal, Huebee } = await import('/static/js/vendor.js');
	const { project } = await api('GET', `/projects/${projectId}`);

	const { value: formValues } = await Swal.fire({
		title: 'Edit Project',
		html: `
			<input id="swal-name" class="swal2-input" placeholder="Project name" value="${project.name}">
			<div class="mt-3"><label class="form-label">Color</label><input id="swal-color" class="form-control form-control-sm" value="${project.color}" readonly style="width:80px; cursor:pointer"></div>
		`,
		showCancelButton: true,
		focusConfirm: false,
		didOpen: () => {
			const colorInput = document.getElementById('swal-color');
			colorInput.style.backgroundColor = project.color;
			colorInput.style.color = 'transparent';
			const hueb = new Huebee(colorInput, { notation: 'hex', saturations: 2, shades: 3, customColors: ['#6c757d'] });
			hueb.on('change', (color) => { colorInput.value = color; colorInput.style.backgroundColor = color; });
		},
		preConfirm: () => {
			const name = document.getElementById('swal-name').value.trim();
			if (!name) { Swal.showValidationMessage('Name is required'); return false; }
			return { name, color: document.getElementById('swal-color').value };
		},
	});

	if (formValues) {
		await api('PUT', `/projects/${projectId}`, formValues);
		await loadProjects();
		loadProjectOverview(projectId);
		showSuccess('Project updated');
	}
}

// Delete project
async function deleteProject(projectId) {
	const confirmed = await confirmAction('Delete Project', 'This will permanently delete this project and cannot be undone.');
	if (!confirmed) return;

	try {
		await api('DELETE', `/projects/${projectId}`);
		currentProjectId = null;
		await loadProjects();
		showSuccess('Project deleted');
	} catch (err) {
		showError(err.message);
	}
}

// New project — inline
document.getElementById('new-project-btn')?.addEventListener('click', async () => {
	const { Swal, Huebee } = await import('/static/js/vendor.js');
	let selectedColor = '#6c757d';
	const { value: formValues } = await Swal.fire({
		title: 'New Project',
		html: `
			<input id="swal-name" class="swal2-input" placeholder="Project name">
			<div class="mt-3"><label class="form-label">Color</label><input id="swal-color" class="form-control form-control-sm" value="${selectedColor}" readonly style="width:80px; cursor:pointer; background:${selectedColor}; color:transparent"></div>
		`,
		showCancelButton: true,
		focusConfirm: false,
		didOpen: () => {
			const colorInput = document.getElementById('swal-color');
			const hueb = new Huebee(colorInput, { notation: 'hex', saturations: 2, shades: 3, customColors: ['#6c757d'] });
			hueb.on('change', (color) => { selectedColor = color; colorInput.value = color; colorInput.style.backgroundColor = color; });
		},
		preConfirm: () => {
			const name = document.getElementById('swal-name').value.trim();
			if (!name) { Swal.showValidationMessage('Name is required'); return false; }
			return { name, color: selectedColor };
		},
	});
	if (formValues) {
		await api('POST', '/projects', formValues);
		loadProjects();
	}
});

// Logout
function logout() {
	fetch('/logout', { method: 'POST' }).then(() => (window.location.href = '/login'));
}

// Init
document.addEventListener('DOMContentLoaded', () => {
	loadProjects();
	if (typeof initChat === 'function') initChat();
});
