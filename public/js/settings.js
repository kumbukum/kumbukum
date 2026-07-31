// Settings profile — IIFE (loaded dynamically via SPA partial)
(function () {
	var profileForm = document.getElementById('profile-form');
	var timezoneSelect = document.querySelector('[data-timezone-select]');
	var timeFormatSelect = document.getElementById('profile-time-format');
	var timezoneHint = document.getElementById('profile-timezone-hint');
	var timeFormatHint = document.getElementById('profile-time-format-hint');

	function selectHasValue(select, value) {
		return Boolean(select && Array.prototype.some.call(select.options, function (option) {
			return option.value === value;
		}));
	}

	function applyBrowserSuggestions() {
		var dateFormat = window.StreamientDateFormat;
		if (timezoneSelect && timezoneSelect.value === 'UTC' && timezoneSelect.dataset.timezoneConfigured !== 'true') {
			var detectedTimezone = dateFormat?.detectBrowserTimeZone() || '';
			if (detectedTimezone && selectHasValue(timezoneSelect, detectedTimezone)) {
				timezoneSelect.value = detectedTimezone;
				if (timezoneHint) timezoneHint.textContent = 'Suggested from your browser. Save to apply it.';
			}
		}
		if (timeFormatSelect && !timeFormatSelect.dataset.savedTimeFormat) {
			timeFormatSelect.value = dateFormat?.detectBrowserTimeFormat() || '12-hour';
			if (timeFormatHint) timeFormatHint.textContent = 'Suggested from your browser. Save to apply it.';
		}
	}

	async function initTimezoneSelect() {
		if (!timezoneSelect || timezoneSelect.tomselect) return;
		try {
			var vendor = await import('/static/js/vendor.js');
			new vendor.TomSelect(timezoneSelect, {
				create: false,
				maxItems: 1,
				searchField: ['text', 'value'],
				sortField: [{ field: '$order' }],
			});
		} catch (err) {
			console.error('Timezone picker init error:', err);
		}
	}

	applyBrowserSuggestions();
	initTimezoneSelect();

	if (profileForm && !profileForm.dataset.profileSettingsBound) {
		profileForm.dataset.profileSettingsBound = 'true';
		profileForm.addEventListener('submit', async function (e) {
			e.preventDefault();
			var data = {
				name: document.getElementById('profile-name').value.trim(),
				email: document.getElementById('profile-email').value.trim(),
				timezone: document.getElementById('profile-timezone').value.trim(),
				time_format: document.getElementById('profile-time-format').value,
			};
			var result = await api('PUT', '/profile', data);
			if (timezoneSelect) timezoneSelect.dataset.timezoneConfigured = 'true';
			if (timeFormatSelect) timeFormatSelect.dataset.savedTimeFormat = result.user?.time_format || data.time_format;
			if (timezoneHint) timezoneHint.textContent = 'Times are displayed in this timezone.';
			if (timeFormatHint) timeFormatHint.textContent = 'Times use this clock format.';
			window.StreamientDateFormat?.setPreferences({
				timeZone: result.user?.timezone || data.timezone,
				timeFormat: result.user?.time_format || data.time_format,
			});
			showSuccess('Profile updated');
		});
	}
})();
