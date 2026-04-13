document.addEventListener('DOMContentLoaded', () => {
	const profileForm = document.getElementById('profile-form');

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
});
