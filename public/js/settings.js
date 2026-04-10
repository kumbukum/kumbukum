document.addEventListener('DOMContentLoaded', () => {
	const profileForm = document.getElementById('profile-form');
	const resetPasswordBtn = document.getElementById('reset-password-btn');
	const reindexBtn = document.getElementById('reindex-btn');

	profileForm?.addEventListener('submit', async (e) => {
		e.preventDefault();
		const data = {
			name: document.getElementById('profile-name').value.trim(),
			email: document.getElementById('profile-email').value.trim(),
			timezone: document.getElementById('profile-timezone').value.trim(),
		};
		await api('PUT', '/profile', data);
		showSuccess('Profile updated');
	});

	resetPasswordBtn?.addEventListener('click', async () => {
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

	reindexBtn?.addEventListener('click', async () => {
		const confirmed = await confirmAction('Reindex All Data', 'This will rebuild all Typesense search indexes from the database.');
		if (!confirmed) return;

		reindexBtn.disabled = true;
		reindexBtn.textContent = 'Reindexing...';
		const resultEl = document.getElementById('reindex-result');

		try {
			const data = await api('POST', '/reindex');
			resultEl.innerHTML = `<div class="alert alert-success">Reindex complete: ${data.notes} notes, ${data.memory} memories, ${data.urls} URLs indexed.</div>`;
			resultEl.classList.remove('d-none');
		} catch (err) {
			resultEl.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
			resultEl.classList.remove('d-none');
		} finally {
			reindexBtn.disabled = false;
			reindexBtn.textContent = 'Reindex All Data';
		}
	});
});
