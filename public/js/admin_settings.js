document.addEventListener('DOMContentLoaded', () => {
	const managaniForm = document.getElementById('managani-settings-form');
	const customCodeForm = document.getElementById('custom-code-settings-form');
	const enabledInput = document.getElementById('managani-enabled');
	const baseUrlInput = document.getElementById('managani-base-url');
	const siteKeyInput = document.getElementById('managani-site-key');
	const siteSecretInput = document.getElementById('managani-site-secret');
	const secretStatus = document.getElementById('managani-secret-status');
	const clearSecretButton = document.getElementById('managani-clear-secret');
	const cssSnippetInput = document.getElementById('custom-css-snippet');
	const jsSnippetInput = document.getElementById('custom-js-snippet');

	async function getSwal() {
		const vendor = await import('/static/js/vendor.js');
		return vendor.Swal;
	}

	async function parseResponse(response) {
		const data = await response.json().catch(() => ({}));
		if (!response.ok) throw new Error(data.error || 'Request failed');
		return data;
	}

	async function showSuccess(message) {
		const Swal = await getSwal();
		await Swal.fire({ icon: 'success', title: message, showConfirmButton: false, timer: 1800, toast: true, position: 'top-end' });
	}

	async function showError(message) {
		const Swal = await getSwal();
		await Swal.fire({ icon: 'error', title: 'Settings could not be saved', text: message });
	}

	function setButtonLoading(button, loading, label) {
		if (!button) return;
		const text = button.querySelector('span');
		if (loading) {
			button.dataset.originalLabel = text?.textContent || '';
			button.disabled = true;
			if (text) text.textContent = label;
			return;
		}
		button.disabled = false;
		if (text && button.dataset.originalLabel) text.textContent = button.dataset.originalLabel;
		delete button.dataset.originalLabel;
	}

	function selectPanel(name) {
		document.querySelectorAll('[data-settings-panel]').forEach((button) => {
			const active = button.dataset.settingsPanel === name;
			button.classList.toggle('active', active);
			button.setAttribute('aria-selected', active ? 'true' : 'false');
		});
		document.getElementById('settings-panel-managani')?.classList.toggle('d-none', name !== 'managani');
		document.getElementById('settings-panel-custom-code')?.classList.toggle('d-none', name !== 'custom-code');
	}

	document.querySelectorAll('[data-settings-panel]').forEach((button) => {
		button.addEventListener('click', () => selectPanel(button.dataset.settingsPanel));
	});

	function applyManaganiSettings(settings) {
		enabledInput.checked = settings.enabled === true;
		baseUrlInput.value = settings.base_url || '';
		siteKeyInput.value = settings.site_key || '';
		siteSecretInput.value = '';
		secretStatus.textContent = settings.site_secret_configured ? 'Configured' : 'Not configured';
		secretStatus.classList.toggle('bg-success-lt', settings.site_secret_configured === true);
		secretStatus.classList.toggle('bg-secondary-lt', settings.site_secret_configured !== true);
		clearSecretButton.disabled = settings.site_secret_configured !== true;
	}

	async function loadManaganiSettings() {
		try {
			const response = await fetch('/admin/api/settings/managani');
			const data = await parseResponse(response);
			applyManaganiSettings(data.settings);
		} catch (error) {
			await showError(error.message);
		}
	}

	async function loadCustomCodeSettings() {
		try {
			const response = await fetch('/admin/api/settings/custom-code');
			const data = await parseResponse(response);
			cssSnippetInput.value = data.settings.css_snippet || '';
			jsSnippetInput.value = data.settings.js_snippet || '';
		} catch (error) {
			await showError(error.message);
		}
	}

	managaniForm?.addEventListener('submit', async (event) => {
		event.preventDefault();
		const submitButton = managaniForm.querySelector('[type="submit"]');
		const payload = {
			enabled: enabledInput.checked,
			base_url: baseUrlInput.value.trim(),
			site_key: siteKeyInput.value.trim(),
		};
		if (siteSecretInput.value.trim()) payload.site_secret = siteSecretInput.value.trim();
		setButtonLoading(submitButton, true, 'Saving…');
		try {
			const response = await fetch('/admin/api/settings/managani', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			});
			const data = await parseResponse(response);
			applyManaganiSettings(data.settings);
			await showSuccess('Managani settings saved');
		} catch (error) {
			await showError(error.message);
		} finally {
			setButtonLoading(submitButton, false);
		}
	});

	clearSecretButton?.addEventListener('click', async () => {
		const Swal = await getSwal();
		const confirmation = await Swal.fire({
			icon: 'warning',
			title: 'Clear the Managani site secret?',
			text: 'This also disables the Managani integration until a new secret is saved.',
			showCancelButton: true,
			confirmButtonText: 'Clear Site Secret',
			confirmButtonColor: '#d63939',
		});
		if (!confirmation.isConfirmed) return;
		setButtonLoading(clearSecretButton, true, 'Clearing…');
		try {
			const response = await fetch('/admin/api/settings/managani', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ enabled: false, clear_site_secret: true }),
			});
			const data = await parseResponse(response);
			applyManaganiSettings(data.settings);
			await showSuccess('Managani site secret cleared');
		} catch (error) {
			await showError(error.message);
		} finally {
			const shouldRemainDisabled = secretStatus.textContent !== 'Configured';
			if (clearSecretButton.dataset.originalLabel) setButtonLoading(clearSecretButton, false);
			clearSecretButton.disabled = shouldRemainDisabled;
		}
	});

	customCodeForm?.addEventListener('submit', async (event) => {
		event.preventDefault();
		const submitButton = customCodeForm.querySelector('[type="submit"]');
		setButtonLoading(submitButton, true, 'Saving…');
		try {
			const response = await fetch('/admin/api/settings/custom-code', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ css_snippet: cssSnippetInput.value, js_snippet: jsSnippetInput.value }),
			});
			const data = await parseResponse(response);
			cssSnippetInput.value = data.settings.css_snippet || '';
			jsSnippetInput.value = data.settings.js_snippet || '';
			await showSuccess('Custom code saved');
		} catch (error) {
			await showError(error.message);
		} finally {
			setButtonLoading(submitButton, false);
		}
	});

	void Promise.all([loadManaganiSettings(), loadCustomCodeSettings()]);
});
