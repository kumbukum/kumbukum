// Security — IIFE (loaded dynamically via SPA partial)
(function () {

	// ---- 2FA ----

	var setup2faBtn = document.getElementById('setup-2fa');
	var disable2faBtn = document.getElementById('disable-2fa');
	var twoFaSetupArea = document.getElementById('2fa-setup-area');

	setup2faBtn?.addEventListener('click', async () => {
		try {
			const res = await fetch('/2fa/setup', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
			});
			const data = await res.json();
			if (!res.ok) return showError(data.error || '2FA setup failed');

			twoFaSetupArea.classList.remove('d-none');
			document.getElementById('2fa-secret').textContent = data.secret;

			const qrImg = document.getElementById('2fa-qr');
			const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data.otpauth)}`;
			qrImg.src = qrUrl;
			qrImg.classList.remove('d-none');

			setup2faBtn.classList.add('d-none');
		} catch (err) {
			showError(err.message);
		}
	});

	document.getElementById('cancel-2fa-btn')?.addEventListener('click', () => {
		twoFaSetupArea.classList.add('d-none');
		setup2faBtn.classList.remove('d-none');
		document.getElementById('2fa-code').value = '';
		const qrImg = document.getElementById('2fa-qr');
		qrImg.src = '';
		qrImg.classList.add('d-none');
		document.getElementById('2fa-secret').textContent = '';
	});

	document.getElementById('confirm-2fa-btn')?.addEventListener('click', async () => {
		const code = document.getElementById('2fa-code').value.trim();
		if (!code) return showError('Enter the 6-digit code');

		try {
			const res = await fetch('/2fa/confirm', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code }),
			});
			const data = await res.json();
			if (!res.ok) return showError(data.error || 'Invalid code');

			showSuccess('2FA enabled');
			setTimeout(function () { window.navigateTo ? window.navigateTo('/settings/security') : location.reload(); }, 1200);
		} catch (err) {
			showError(err.message);
		}
	});

	disable2faBtn?.addEventListener('click', async () => {
		const confirmed = await confirmAction('Disable 2FA', 'This will remove two-factor authentication from your account.');
		if (!confirmed) return;

		try {
			await api('POST', '/2fa/disable');
			showSuccess('2FA disabled');
			setTimeout(function () { window.navigateTo ? window.navigateTo('/settings/security') : location.reload(); }, 1200);
		} catch (err) {
			showError(err.message);
		}
	});

	// ---- Passkeys ----

	loadPasskeys();

	document.getElementById('add-passkey')?.addEventListener('click', async () => {
		try {
			const optionsRes = await fetch('/passkey/register/options', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
			});
			const options = await optionsRes.json();
			if (!optionsRes.ok) return showError(options.error || 'Failed to get passkey options');

			const attestation = await SimpleWebAuthnBrowser.startRegistration({ optionsJSON: options });

			const { Swal } = await import('/static/js/vendor.js');
			const { value: name } = await Swal.fire({
				title: 'Name this passkey',
				input: 'text',
				inputPlaceholder: 'e.g. 1Password, MacBook Touch ID',
				showCancelButton: true,
				inputValidator: (v) => !v?.trim() ? 'Please enter a name' : null,
			});
			if (!name) return;
			const browser_info = detectBrowserInfo();

			const verifyRes = await fetch('/passkey/register/verify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ attestation, name: name.trim(), browser_info }),
			});
			const verifyData = await verifyRes.json();
			if (!verifyRes.ok) return showError(verifyData.error || 'Passkey registration failed');

			showSuccess('Passkey added');
			loadPasskeys();
		} catch (err) {
			if (err.name === 'NotAllowedError') return;
			showError(err.message);
		}
	});

	async function loadPasskeys() {
		const list = document.getElementById('passkey-list');
		if (!list) return;

		try {
			const data = await api('GET', '/passkeys');
			if (!data.passkeys?.length) {
				list.innerHTML = '<p class="text-muted">No passkeys registered</p>';
				return;
			}
			list.innerHTML = data.passkeys.map((pk) => {
				const details = [];
				if (pk.browser_info) details.push(escapeHtml(pk.browser_info));
				if (pk.device_type === 'multiDevice') details.push('Synced');
				if (pk.backed_up) details.push('Backed up');
				const detailStr = details.length ? `<small class="text-muted d-block fs-7 ms-4 ps-1">${details.join(' · ')}</small>` : '';
				const lastUsed = pk.last_used_at ? `<small class="text-muted">Last used ${new Date(pk.last_used_at).toLocaleDateString()}</small>` : '';

				return `
				<div class="d-flex justify-content-between align-items-center border rounded p-2 mb-2">
					<div class="flex-grow-1">
						<div class="d-flex align-items-center">
							<i class="bi bi-fingerprint me-2"></i>
							<strong class="passkey-name">${escapeHtml(pk.name || 'Passkey')}</strong>
							<button class="btn btn-sm btn-link p-0 ms-2 rename-passkey" data-id="${pk._id}" data-name="${escapeHtml(pk.name || 'Passkey')}" title="Rename">
								<i class="bi bi-pencil"></i>
							</button>
						</div>
						<div class="ms-4 ps-1">
							<small class="text-muted fs-7">Added ${new Date(pk.createdAt).toLocaleDateString()}</small>
							${lastUsed ? `<small class="text-muted ms-2">Last used ${new Date(pk.last_used_at).toLocaleDateString()}</small>` : ''}
						</div>
						${detailStr}
					</div>
					<button class="btn btn-sm btn-outline-danger delete-passkey ms-2" data-id="${pk._id}">
						<i class="bi bi-trash"></i>
					</button>
				</div>
			`}).join('');

			list.querySelectorAll('.rename-passkey').forEach((btn) => {
				btn.addEventListener('click', async () => {
					const currentName = btn.dataset.name;
					const { Swal } = await import('/static/js/vendor.js');
					const { value: newName } = await Swal.fire({
						title: 'Rename passkey',
						input: 'text',
						inputValue: currentName,
						showCancelButton: true,
						inputValidator: (v) => !v?.trim() ? 'Please enter a name' : null,
					});
					if (!newName || newName.trim() === currentName) return;
					try {
						await api('PATCH', `/passkeys/${btn.dataset.id}`, { name: newName.trim() });
						showSuccess('Passkey renamed');
						loadPasskeys();
					} catch (err) {
						showError(err.message);
					}
				});
			});

			list.querySelectorAll('.delete-passkey').forEach((btn) => {
				btn.addEventListener('click', async () => {
					const confirmed = await confirmAction('Delete Passkey', 'This passkey will be removed.');
					if (!confirmed) return;
					try {
						await api('DELETE', `/passkeys/${btn.dataset.id}`);
						showSuccess('Passkey deleted');
						loadPasskeys();
					} catch (err) {
						showError(err.message);
					}
				});
			});
		} catch (err) {
			list.innerHTML = '<p class="text-danger">Failed to load passkeys</p>';
		}
	}

	// ---- Reset Password ----

	document.getElementById('reset-password-btn')?.addEventListener('click', async () => {
		const confirmed = await confirmAction('Reset Password', 'A new random password will be generated.');
		if (!confirmed) return;

		try {
			const res = await fetch('/reset-password', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
			});
			const data = await res.json();
			if (data.password) {
				document.getElementById('new-password-value').value = data.password;
				document.getElementById('password-result').classList.remove('d-none');
			} else {
				showError(data.error || 'Failed to reset password');
			}
		} catch (err) {
			showError(err.message);
		}
	});

	document.getElementById('copy-password-btn')?.addEventListener('click', () => {
		const val = document.getElementById('new-password-value').value;
		navigator.clipboard.writeText(val);
		showSuccess('Password copied');
	});

	document.getElementById('password-copied-btn')?.addEventListener('click', () => {
		document.getElementById('password-result').classList.add('d-none');
	});

	function escapeHtml(str) {
		const div = document.createElement('div');
		div.textContent = str;
		return div.innerHTML;
	}

	function detectBrowserInfo() {
		var ua = navigator.userAgent;
		var browser = 'Unknown';
		if (ua.includes('Firefox/')) browser = 'Firefox';
		else if (ua.includes('Edg/')) browser = 'Edge';
		else if (ua.includes('Chrome/') && !ua.includes('Edg/')) browser = 'Chrome';
		else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Safari';

		var os = 'Unknown';
		if (ua.includes('Mac OS')) os = 'macOS';
		else if (ua.includes('Windows')) os = 'Windows';
		else if (ua.includes('Linux')) os = 'Linux';
		else if (ua.includes('Android')) os = 'Android';
		else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

		return browser + ' on ' + os;
	}
})();
