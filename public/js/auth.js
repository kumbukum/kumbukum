document.addEventListener('DOMContentLoaded', () => {
	const Swal = window.Swal;
	const loginForm = document.querySelector('#login-form form');
	const totpForm = document.getElementById('form-2fa');
	const magicLinkBtn = document.getElementById('magic-link-btn');
	const passkeyBtn = document.getElementById('passkey-btn');
	const signupForm = document.getElementById('signup-form');
	const forgotForm = document.getElementById('forgot-password-form');

	let tempToken = null;

	// ---- Signup ----
	if (signupForm) {
		signupForm.addEventListener('submit', async (e) => {
			e.preventDefault();
			const name = signupForm.querySelector('#name').value.trim();
			const email = signupForm.querySelector('#email').value.trim();
			if (!name || !email) return;

			try {
				const res = await fetch('/signup', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ name, email }),
				});
				const data = await res.json();

				if (res.status === 409) {
					Swal.fire({
						icon: 'warning',
						title: 'Email already registered',
						text: data.error || 'An account with this email already exists.',
						confirmButtonText: 'Go to login',
						showCancelButton: true,
						cancelButtonText: 'Try another email',
					}).then((result) => {
						if (result.isConfirmed) window.location.href = '/login';
					});
					return;
				}

				if (!res.ok) {
					Swal.fire({ icon: 'error', title: 'Signup failed', text: data.error || 'Please try again.' });
					return;
				}

				signupForm.classList.add('d-none');
				const html = await fetch('/ajax/signup-success').then(r => r.text());
				document.getElementById('signup-result').innerHTML = html;
			} catch (err) {
				Swal.fire({ icon: 'error', title: 'Error', text: err.message });
			}
		});
	}

	// ---- Forgot Password ----
	if (forgotForm) {
		forgotForm.addEventListener('submit', async (e) => {
			e.preventDefault();
			const email = forgotForm.querySelector('#email').value.trim();
			if (!email) return;

			try {
				const res = await fetch('/forgot-password', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ email }),
				});
				const data = await res.json();

				forgotForm.classList.add('d-none');
				const html = await fetch('/ajax/forgot-password-success').then(r => r.text());
				forgotForm.insertAdjacentHTML('afterend', html);
			} catch (err) {
				Swal.fire({ icon: 'error', title: 'Error', text: err.message });
			}
		});
	}

	// ---- Login ----
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

				if (data.isSysadmin) {
					window.location.href = '/sysadmin';
				} else if (data.requires2FA) {
					tempToken = data.tempToken;
					document.getElementById('login-form').classList.add('d-none');
					document.getElementById('totp-form').classList.remove('d-none');
				} else if (data.token) {
					window.location.href = '/dashboard';
				} else {
					Swal.fire({ icon: 'error', title: 'Login failed', text: data.error || 'Invalid credentials' });
				}
			} catch (err) {
				Swal.fire({ icon: 'error', title: 'Login error', text: err.message });
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
					Swal.fire({ icon: 'error', title: '2FA failed', text: data.error || '2FA verification failed' });
				}
			} catch (err) {
				Swal.fire({ icon: 'error', title: '2FA error', text: err.message });
			}
		});
	}

	magicLinkBtn?.addEventListener('click', async () => {
		const email = document.getElementById('email').value.trim();
		if (!email) {
			document.getElementById('login-form').classList.add('d-none');
			document.getElementById('create-account').classList.add('d-none');
			document.getElementById('magic-link-form').classList.remove('d-none');
			document.getElementById('magic-link-email').focus();
			return;
		}

		const res = await fetch('/magic-link', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email }),
		});
		const data = await res.json();
		await Swal.fire({ icon: 'success', title: 'Magic link sent', text: data.message || 'Check your email for a login link' });
		window.location.href = '/login';
	});

	// Magic link email form
	const magicLinkForm = document.getElementById('form-magic-link');
	if (magicLinkForm) {
		magicLinkForm.addEventListener('submit', async (e) => {
			e.preventDefault();
			const email = document.getElementById('magic-link-email').value.trim();
			if (!email) return;

			const res = await fetch('/magic-link', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email }),
			});
			const data = await res.json();
			await Swal.fire({ icon: 'success', title: 'Magic link sent', text: data.message || 'Check your email for a login link' });
			window.location.href = '/login';
		});
	}

	document.getElementById('magic-link-back')?.addEventListener('click', (e) => {
		e.preventDefault();
		document.getElementById('magic-link-form').classList.add('d-none');
		document.getElementById('login-form').classList.remove('d-none');
	});

	passkeyBtn?.addEventListener('click', async () => {
		try {
			const optRes = await fetch('/passkey/login/options', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
			});
			const options = await optRes.json();
			if (!optRes.ok) return Swal.fire({ icon: 'error', title: 'Error', text: options.error || 'Failed to get passkey options' });

			const assertion = await SimpleWebAuthnBrowser.startAuthentication({ optionsJSON: options });

			const verifyRes = await fetch('/passkey/login/verify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ assertion }),
			});
			const data = await verifyRes.json();
			if (data.token) {
				window.location.href = '/dashboard';
			} else {
				Swal.fire({ icon: 'error', title: 'Passkey login failed', text: data.error || 'Passkey login failed' });
			}
		} catch (err) {
			if (err.name === 'NotAllowedError') return;
			Swal.fire({ icon: 'error', title: 'Passkey error', text: err.message });
		}
	});
});
