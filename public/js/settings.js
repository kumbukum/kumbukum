// Settings profile — IIFE (loaded dynamically via SPA partial)
(function () {
	var profileForm = document.getElementById('profile-form');

	profileForm?.addEventListener('submit', async function (e) {
		e.preventDefault();
		var data = {
			name: document.getElementById('profile-name').value.trim(),
			email: document.getElementById('profile-email').value.trim(),
			timezone: document.getElementById('profile-timezone').value.trim(),
		};
		await api('PUT', '/profile', data);
		showSuccess('Profile updated');
	});
})();
