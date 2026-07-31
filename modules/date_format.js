const DATE_LOCALE = 'en-US';

function toDate(value) {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeTimeZone(value) {
	const timeZone = typeof value === 'string' ? value.trim() : '';
	if (!timeZone) return undefined;
	try {
		new Intl.DateTimeFormat(DATE_LOCALE, { timeZone }).format();
		return timeZone;
	} catch {
		return 'UTC';
	}
}

function normalizeTimeFormat(value) {
	return ['12-hour', '24-hour'].includes(value) ? value : undefined;
}

export function ordinalDay(day) {
	const value = Number(day);
	const modHundred = value % 100;
	if (modHundred >= 11 && modHundred <= 13) return `${value}th`;
	const modTen = value % 10;
	if (modTen === 1) return `${value}st`;
	if (modTen === 2) return `${value}nd`;
	if (modTen === 3) return `${value}rd`;
	return `${value}th`;
}

function dateParts(date, options = {}) {
	const formatterOptions = {
		month: 'long',
		day: 'numeric',
		year: 'numeric',
	};
	const timeZone = normalizeTimeZone(options.timeZone);
	if (timeZone) formatterOptions.timeZone = timeZone;
	try {
		const parts = new Intl.DateTimeFormat(DATE_LOCALE, formatterOptions).formatToParts(date);
		return {
			month: parts.find((part) => part.type === 'month')?.value || '',
			day: Number(parts.find((part) => part.type === 'day')?.value || 0),
			year: Number(parts.find((part) => part.type === 'year')?.value || 0),
		};
	} catch {
		if (formatterOptions.timeZone) return dateParts(date);
		return { month: '', day: 0, year: 0 };
	}
}

function timeParts(date, options = {}) {
	const formatterOptions = {
		hour: 'numeric',
		minute: '2-digit',
	};
	const timeZone = normalizeTimeZone(options.timeZone);
	if (timeZone) formatterOptions.timeZone = timeZone;
	const timeFormat = normalizeTimeFormat(options.timeFormat);
	if (timeFormat === '24-hour') {
		formatterOptions.hourCycle = 'h23';
	} else if (timeFormat === '12-hour') {
		formatterOptions.hour12 = true;
	}
	try {
		return new Intl.DateTimeFormat(undefined, formatterOptions).formatToParts(date);
	} catch {
		if (formatterOptions.timeZone) return timeParts(date, { ...options, timeZone: undefined });
		return [];
	}
}

export function formatHumanDate(value, options = {}) {
	const date = toDate(value);
	if (!date) return '';
	const parts = dateParts(date, options);
	if (!parts.month || !parts.day || !parts.year) return '';
	const nowParts = dateParts(toDate(options.now) || new Date(), options);
	const showYear = options.includeYear === true || parts.year !== nowParts.year;
	return `${parts.month} ${ordinalDay(parts.day)}${showYear ? `, ${parts.year}` : ''}`;
}

export function formatHumanTime(value, options = {}) {
	const date = toDate(value);
	if (!date) return '';
	const parts = timeParts(date, options);
	const hour = parts.find((part) => part.type === 'hour')?.value || '';
	const minute = parts.find((part) => part.type === 'minute')?.value || '';
	const period = parts.find((part) => part.type === 'dayPeriod')?.value || '';
	if (!hour || !minute) return '';
	if (normalizeTimeFormat(options.timeFormat) === '24-hour' || !period) return `${hour.padStart(2, '0')}:${minute}`;
	return `${hour}:${minute}${period ? ` ${period}` : ''}`;
}

export function formatHumanDateTime(value, options = {}) {
	const dateText = formatHumanDate(value, options);
	const timeText = formatHumanTime(value, options);
	return [dateText, timeText].filter(Boolean).join(', ');
}

export function formatLocaleDate(value, options = {}) {
	const date = toDate(value);
	if (!date) return '';
	const formatterOptions = { ...options };
	const timeZone = normalizeTimeZone(options.timeZone);
	delete formatterOptions.timeZone;
	delete formatterOptions.timeFormat;
	if (timeZone) formatterOptions.timeZone = timeZone;
	if (formatterOptions.hour) {
		const timeFormat = normalizeTimeFormat(options.timeFormat);
		if (timeFormat === '24-hour') formatterOptions.hourCycle = 'h23';
		else if (timeFormat === '12-hour') formatterOptions.hour12 = true;
	}
	try {
		return new Intl.DateTimeFormat(undefined, formatterOptions).format(date);
	} catch {
		delete formatterOptions.timeZone;
		return new Intl.DateTimeFormat(undefined, formatterOptions).format(date);
	}
}

export function dateFormatPreferences(user = {}) {
	return {
		timeZone: normalizeTimeZone(user.timezone) || 'UTC',
		timeFormat: normalizeTimeFormat(user.time_format) || null,
	};
}

export function createDateFormatters(user = {}) {
	const preferences = dateFormatPreferences(user);
	return {
		formatDate: (value, options = {}) => formatHumanDate(value, { ...preferences, ...options }),
		formatDateTime: (value, options = {}) => formatHumanDateTime(value, { ...preferences, ...options }),
		formatLocaleDate: (value, options = {}) => formatLocaleDate(value, { ...preferences, ...options }),
		dateFormatPreferences: preferences,
	};
}
