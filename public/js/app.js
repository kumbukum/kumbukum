const API = '/api/v1';

// Redirect to login when session is expired
function redirectToLogin() {
	window.location.href = '/login';
}

// Check if a fetch response was redirected to the login page
function isLoginRedirect(res) {
	return res.redirected && new URL(res.url).pathname.startsWith('/login');
}

async function api(method, path, body) {
	const options = {
		method,
		headers: { 'Content-Type': 'application/json' },
	};
	if (body && method !== 'GET') options.body = JSON.stringify(body);

	const res = await fetch(`${API}${path}`, options);
	if (res.status === 401) return redirectToLogin();
	if (isLoginRedirect(res)) return redirectToLogin();
	if (!res.ok) {
		const err = await res.json().catch(() => ({ error: res.statusText }));
		throw new Error(err.error || 'Request failed');
	}
	return res.json();
}

// Handle bfcache restoration — force reload so the server can check the session
window.addEventListener('pageshow', (event) => {
	if (event.persisted) window.location.reload();
});

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
window.currentProjectId = null;

// Load projects sidebar with counts
async function loadProjects() {
	try {
		const list = document.getElementById('project-list');
		if (!list) return;

		const res = await fetch(`/ajax/project-list?active=${currentProjectId || ''}`);
		if (isLoginRedirect(res)) return redirectToLogin();
		const html = await res.text();
		list.innerHTML = html;

		list.querySelectorAll('.project-item').forEach((el) => {
			// Clicking project name -> dashboard with ?g=
			el.addEventListener('click', (e) => {
				if (e.target.closest('a')) return;
				currentProjectId = el.dataset.id;
				document.querySelectorAll('.project-item').forEach((e) => e.classList.remove('active'));
				el.classList.add('active');
				window.dispatchEvent(new CustomEvent('project-changed', { detail: currentProjectId }));
				if (document.getElementById('project-overview')) {
					const g = JSURL.stringify({ project_id: currentProjectId });
					history.replaceState(null, '', `/dashboard?g=${g}`);
					loadProjectOverview(currentProjectId);
				} else {
					const g = JSURL.stringify({ project_id: currentProjectId });
					window.location.href = `/dashboard?g=${g}`;
				}
			});

			// Intercept section links (Notes, Memories, URLs) to pass ?g=
			el.querySelectorAll('.project-item-section a').forEach((link) => {
				link.addEventListener('click', (e) => {
					e.preventDefault();
					const projectId = el.dataset.id;
					const g = JSURL.stringify({ project_id: projectId });
					window.location.href = `${link.getAttribute('href')}?g=${g}`;
				});
			});
		});

		if (!currentProjectId) {
			const first = list.querySelector('.project-item');
			if (first) {
				currentProjectId = first.dataset.id;
				first.classList.add('active');
			}
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
		const res = await fetch(`/ajax/project-overview/${projectId}`);
		if (isLoginRedirect(res)) return redirectToLogin();
		if (!res.ok) throw new Error('Failed to load');
		const html = await res.text();
		container.innerHTML = html;

		// Intercept overview card links to pass ?g=
		container.querySelectorAll('.project-section-link').forEach((link) => {
			link.addEventListener('click', (e) => {
				e.preventDefault();
				const pid = link.dataset.project;
				const g = JSURL.stringify({ project_id: pid });
				window.location.href = `${link.getAttribute('href')}?g=${g}`;
			});
		});
	} catch (err) {
		container.innerHTML = '<div class="text-danger">Failed to load project</div>';
		console.error('Failed to load project overview:', err);
	}
}

// Edit project
async function editProject(projectId) {
	const { Swal, Huebee } = await import('/static/js/vendor.js');
	const { project } = await api('GET', `/projects/${projectId}`);

	let selectedColor = project.color;
	const { value: formValues } = await Swal.fire({
		title: 'Edit Project',
		html: `
			<input id="swal-name" class="swal2-input" placeholder="Project name" value="${project.name}">
			<div class="mt-3"><label class="form-label">Color</label><div id="swal-color-container"><input id="swal-color" value="${project.color}"></div></div>
		`,
		showCancelButton: true,
		focusConfirm: false,
		didOpen: () => {
			const colorInput = document.getElementById('swal-color');
			const hueb = new Huebee(colorInput, huebeeOptions);
			hueb.on('change', (color) => { selectedColor = color; });
		},
		preConfirm: () => {
			const name = document.getElementById('swal-name').value.trim();
			if (!name) { Swal.showValidationMessage('Name is required'); return false; }
			return { name, color: selectedColor };
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

// Project color picker options
const huebeeOptions = {
	notation: 'hex',
	hues: 12,
	saturations: 3,
	shades: 5,
	staticOpen: true,
	customColors: ['#C25', '#E62', '#EA0', '#19F', '#2D2', '#6c757d', '#333', '#F8F'],
};

// New project — inline
document.getElementById('new-project-btn')?.addEventListener('click', async () => {
	const { Swal, Huebee } = await import('/static/js/vendor.js');
	let selectedColor = '#6c757d';
	const { value: formValues } = await Swal.fire({
		title: 'New Project',
		html: `
			<input id="swal-name" class="swal2-input" placeholder="Project name">
			<div class="mt-3"><label class="form-label">Color</label><div id="swal-color-container"><input id="swal-color" value="${selectedColor}"></div></div>
		`,
		showCancelButton: true,
		focusConfirm: false,
		didOpen: () => {
			const colorInput = document.getElementById('swal-color');
			const hueb = new Huebee(colorInput, huebeeOptions);
			hueb.on('change', (color) => { selectedColor = color; });
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
document.addEventListener('DOMContentLoaded', async () => {
	const params = new URLSearchParams(window.location.search);
	const g = params.get('g');
	const hasExplicitProject = !!(g && JSURL.tryParse(g, {}).project_id);
	if (hasExplicitProject) {
		currentProjectId = JSURL.tryParse(g, {}).project_id;
	}
	await loadProjects();
	loadTrashCount();
	if (hasExplicitProject && currentProjectId) loadProjectOverview(currentProjectId);
	if (typeof initResultModalHandlers === 'function') initResultModalHandlers();
	if (typeof initChat === 'function') initChat();

	// ── Socket.IO: live count updates ──
	if (typeof io === 'function' && typeof __host_id === 'string' && __host_id) {
		const socket = io(__ws_url || undefined, { transports: ['websocket'] });
		socket.on('connect', () => {
			socket.emit('subscribe', `tenant:${__host_id}`);
		});
		const crudEvents = [
			'note:created', 'note:deleted',
			'memory:created', 'memory:deleted',
			'url:created', 'url:deleted',
			'counts:refresh',
		];
		for (const evt of crudEvents) {
			socket.on(evt, () => {
				refreshCounts();
				loadTrashCount();
			});
		}
	}
});

// Refresh sidebar counts via API
let countDebounce = null;
async function refreshCounts() {
	clearTimeout(countDebounce);
	countDebounce = setTimeout(async () => {
		try {
			const counts = await api('GET', '/counts');
			document.querySelectorAll('.project-item').forEach(el => {
				const pid = el.dataset.id;
				const pc = counts[pid] || { notes: 0, memory: 0, urls: 0 };
				const sectionCounts = el.querySelectorAll('.section-count');
				if (sectionCounts[0]) sectionCounts[0].textContent = pc.notes;
				if (sectionCounts[1]) sectionCounts[1].textContent = pc.memory;
				if (sectionCounts[2]) sectionCounts[2].textContent = pc.urls;
			});
			// Also update overview cards if visible
			const overview = document.getElementById('project-overview');
			if (overview && currentProjectId) {
				const pc = counts[currentProjectId] || { notes: 0, memory: 0, urls: 0 };
				const cards = overview.querySelectorAll('.fw-bold');
				if (cards[0]) cards[0].textContent = pc.notes;
				if (cards[1]) cards[1].textContent = pc.memory;
				if (cards[2]) cards[2].textContent = pc.urls;
			}
		} catch (err) {
			console.error('Failed to refresh counts:', err);
		}
	}, 300);
}

async function loadTrashCount() {
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

// ---- Git Sync ----

async function addGitRepo(projectId) {
	const { value: formValues } = await Swal.fire({
		title: 'Add Git Repository',
		html: `
			<label class="swal-label" for="swal-git-name">Label</label>
			<input id="swal-git-name" class="swal2-input">
			<label class="swal-label" for="swal-git-url">Repository URL</label>
			<div class="input-group">
				<span class="input-group-text">https://</span>
				<input id="swal-git-url" class="form-control">
			</div>
			<label class="swal-label" for="swal-git-branch">Branch</label>
			<input id="swal-git-branch" class="swal2-input">
			<span class="swal-hint">Default: main</span>
			<label class="swal-label" for="swal-git-token">Access token <small class="fw-normal text-muted">(private repos)</small></label>
			<input id="swal-git-token" class="swal2-input" type="password">
			<label class="swal-label" for="swal-git-notes">Notes directory</label>
			<input id="swal-git-notes" class="swal2-input">
			<span class="swal-hint">Default: notes</span>
			<label class="swal-label" for="swal-git-memories">Memories directory</label>
			<input id="swal-git-memories" class="swal2-input">
			<span class="swal-hint">Default: memories</span>
		`,
		focusConfirm: false,
		showCancelButton: true,
		confirmButtonText: 'Add',
		preConfirm: () => {
			let url = document.getElementById('swal-git-url').value.trim();
			if (!url) { Swal.showValidationMessage('Repository URL is required'); return false; }
			if (!url.startsWith('https://') && !url.startsWith('http://')) url = 'https://' + url;
			return {
				name: document.getElementById('swal-git-name').value.trim(),
				repo_url: url,
				branch: document.getElementById('swal-git-branch').value.trim() || 'main',
				auth_token: document.getElementById('swal-git-token').value.trim(),
				notes_path: document.getElementById('swal-git-notes').value.trim() || 'notes',
				memories_path: document.getElementById('swal-git-memories').value.trim() || 'memories',
			};
		},
	});
	if (!formValues) return;
	try {
		await api('POST', `/projects/${projectId}/git-repos`, formValues);
		loadProjectOverview(projectId);
		Swal.fire({ icon: 'success', title: 'Git repo added', timer: 1500, showConfirmButton: false });
	} catch (err) {
		Swal.fire('Error', err.message, 'error');
	}
}

async function editGitRepo(repoId) {
	try {
		const { repo } = await api('GET', `/git-repos/${repoId}`);
		const editUrl = (repo.repo_url || '').replace(/^https?:\/\//, '');
		const { value: formValues } = await Swal.fire({
			title: 'Edit Git Repository',
			html: `
				<label class="swal-label" for="swal-git-name">Label</label>
				<input id="swal-git-name" class="swal2-input" value="${repo.name || ''}">
				<label class="swal-label" for="swal-git-url">Repository URL</label>
				<div class="input-group">
					<span class="input-group-text">https://</span>
					<input id="swal-git-url" class="form-control" value="${editUrl}">
				</div>
				<label class="swal-label" for="swal-git-branch">Branch</label>
				<input id="swal-git-branch" class="swal2-input" value="${repo.branch || 'main'}">
				<span class="swal-hint">Default: main</span>
				<label class="swal-label" for="swal-git-token">Access token <small class="fw-normal text-muted">(leave empty to keep)</small></label>
				<input id="swal-git-token" class="swal2-input" type="password">
				<label class="swal-label" for="swal-git-notes">Notes directory</label>
				<input id="swal-git-notes" class="swal2-input" value="${repo.notes_path || 'notes'}">
				<span class="swal-hint">Default: notes</span>
				<label class="swal-label" for="swal-git-memories">Memories directory</label>
				<input id="swal-git-memories" class="swal2-input" value="${repo.memories_path || 'memories'}">
				<span class="swal-hint">Default: memories</span>
				<div class="swal2-checkbox-container mt-2" style="margin:0 1em">
					<label><input type="checkbox" id="swal-git-enabled" ${repo.enabled ? 'checked' : ''}> Enabled</label>
				</div>
			`,
			focusConfirm: false,
			showCancelButton: true,
			confirmButtonText: 'Save',
			preConfirm: () => {
				let rawUrl = document.getElementById('swal-git-url').value.trim();
				if (rawUrl && !rawUrl.startsWith('https://') && !rawUrl.startsWith('http://')) rawUrl = 'https://' + rawUrl;
				const data = {
					name: document.getElementById('swal-git-name').value.trim(),
					repo_url: rawUrl,
					branch: document.getElementById('swal-git-branch').value.trim(),
					notes_path: document.getElementById('swal-git-notes').value.trim(),
					memories_path: document.getElementById('swal-git-memories').value.trim(),
					enabled: document.getElementById('swal-git-enabled').checked,
				};
				const tok = document.getElementById('swal-git-token').value.trim();
				if (tok) data.auth_token = tok;
				return data;
			},
		});
		if (!formValues) return;
		await api('PUT', `/git-repos/${repoId}`, formValues);
		const activeProject = document.querySelector('.project-item.active')?.dataset?.id;
		if (activeProject) loadProjectOverview(activeProject);
		Swal.fire({ icon: 'success', title: 'Updated', timer: 1500, showConfirmButton: false });
	} catch (err) {
		Swal.fire('Error', err.message, 'error');
	}
}

async function deleteGitRepo(repoId) {
	const result = await Swal.fire({
		title: 'Remove git repo?',
		text: 'This removes the sync configuration. Synced items remain.',
		icon: 'warning',
		showCancelButton: true,
		confirmButtonColor: '#d33',
		confirmButtonText: 'Remove',
	});
	if (!result.isConfirmed) return;
	try {
		await api('DELETE', `/git-repos/${repoId}`);
		const activeProject = document.querySelector('.project-item.active')?.dataset?.id;
		if (activeProject) loadProjectOverview(activeProject);
	} catch (err) {
		Swal.fire('Error', err.message, 'error');
	}
}

async function triggerGitSync(repoId) {
	try {
		Swal.fire({ title: 'Syncing…', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
		await api('POST', `/git-repos/${repoId}/sync`);
		const activeProject = document.querySelector('.project-item.active')?.dataset?.id;
		if (activeProject) loadProjectOverview(activeProject);
		Swal.fire({ icon: 'success', title: 'Sync complete', timer: 1500, showConfirmButton: false });
	} catch (err) {
		Swal.fire('Sync failed', err.message, 'error');
	}
}
