document.addEventListener('DOMContentLoaded', () => {
	const loginForm = document.querySelector('#login-form form');
	const totpForm = document.getElementById('form-2fa');
	const magicLinkBtn = document.getElementById('magic-link-btn');
	const passkeyBtn = document.getElementById('passkey-btn');

	let tempToken = null;

	if (loginForm) {
		loginForm.addEventListener('submit', async (e) => {
			e.preventDefault();
			const fd = new FormData(loginForm);
			try {
				const res = await fetch('/login', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						email: fd.get('email'),
						password: fd.get('password'),
					}),
				});
				const data = await res.json();

				if (data.requires2FA) {
					tempToken = data.tempToken;
					document.getElementById('login-form').classList.add('d-none');
					document.getElementById('totp-form').classList.remove('d-none');
				} else if (data.token) {
					window.location.href = '/dashboard';
				} else {
					alert(data.error || 'Login failed');
				}
			} catch (err) {
				alert('Login error: ' + err.message);
			}
		});
	}

	if (totpForm) {
		totpForm.addEventListener('submit', async (e) => {
			e.preventDefault();
			const code = document.getElementById('totp-code').value;
			try {
				const res = await fetch('/2fa/verify', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ code, tempToken }),
				});
				const data = await res.json();
				if (data.token) {
					window.location.href = '/dashboard';
				} else {
					alert(data.error || '2FA verification failed');
				}
			} catch (err) {
				alert('2FA error: ' + err.message);
			}
		});
	}

	magicLinkBtn?.addEventListener('click', async () => {
		const email = document.getElementById('email').value;
		if (!email) return alert('Enter your email first');

		const res = await fetch('/magic-link', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email }),
		});
		const data = await res.json();
		alert(data.message || 'Check your email for a login link');
	});

	passkeyBtn?.addEventListener('click', async () => {
		const email = document.getElementById('email').value;
		if (!email) return alert('Enter your email first');

		try {
			const optRes = await fetch('/passkey/login/options', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email }),
			});
			const options = await optRes.json();

			const credential = await navigator.credentials.get({ publicKey: options });

			const verifyRes = await fetch('/passkey/login/verify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(credential),
			});
			const data = await verifyRes.json();
			if (data.token) {
				window.location.href = '/dashboard';
			} else {
				alert(data.error || 'Passkey login failed');
			}
		} catch (err) {
			alert('Passkey error: ' + err.message);
		}
	});
});
