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
