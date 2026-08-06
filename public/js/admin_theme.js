document.addEventListener('DOMContentLoaded', () => {
	document.querySelectorAll('[data-admin-theme-toggle]').forEach((button) => {
		button.addEventListener('click', () => {
			const root = document.documentElement;
			const current = root.getAttribute('data-bs-theme') === 'dark' ? 'dark' : 'light';
			const next = current === 'dark' ? 'light' : 'dark';
			root.setAttribute('data-theme', next);
			root.setAttribute('data-bs-theme', next);
			try { localStorage.setItem(button.dataset.themeStorageKey, next); } catch (e) {}
			if (button.dataset.themeChangeEvent) window.dispatchEvent(new CustomEvent(button.dataset.themeChangeEvent, { detail: { theme: next } }));
		});
	});
});
