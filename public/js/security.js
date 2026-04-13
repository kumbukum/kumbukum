document.addEventListener('DOMContentLoaded', () => {

	// ---- 2FA ----

	const setup2faBtn = document.getElementById('setup-2fa');
	const disable2faBtn = document.getElementById('disable-2fa');
	const twoFaSetupArea = document.getElementById('2fa-setup-area');

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
			setTimeout(() => location.reload(), 1200);
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
			setTimeout(() => location.reload(), 1200);
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

			const verifyRes = await fetch('/passkey/register/verify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ attestation }),
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
			list.innerHTML = data.passkeys.map((pk) => `
				<div class="d-flex justify-content-between align-items-center border rounded p-2 mb-2">
					<div>
						<i class="bi bi-fingerprint me-2"></i>
						<strong>${escapeHtml(pk.name || 'Passkey')}</strong>
						<small class="text-muted ms-2">${new Date(pk.createdAt).toLocaleDateString()}</small>
					</div>
					<button class="btn btn-sm btn-outline-danger delete-passkey" data-id="${pk._id}">
						<i class="bi bi-trash"></i>
					</button>
				</div>
			`).join('');

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
});
