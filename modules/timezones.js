let timezoneOptions = null;
let timezoneValues = null;

export function getTimezoneOptions() {
	if (!timezoneOptions) {
		const zones = ['UTC', ...Intl.supportedValuesOf('timeZone')];
		timezoneOptions = zones.map((value) => ({
			value,
			label: value.replace(/_/g, ' '),
		}));
		timezoneValues = new Set(zones);
	}

	return timezoneOptions;
}

export function isSupportedTimezone(value) {
	if (!timezoneValues) getTimezoneOptions();
	return timezoneValues.has(value);
}
