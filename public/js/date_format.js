(function () {
	var DATE_LOCALE = 'en-US';

	function toDate(value) {
		if (!value) return null;
		var date = value instanceof Date ? value : new Date(value);
		return Number.isNaN(date.getTime()) ? null : date;
	}

	function normalizeTimeZone(value) {
		var timeZone = typeof value === 'string' ? value.trim() : '';
		if (!timeZone) return undefined;
		try {
			new Intl.DateTimeFormat(DATE_LOCALE, { timeZone: timeZone }).format();
			return timeZone;
		} catch (err) {
			return 'UTC';
		}
	}

	function normalizeTimeFormat(value) {
		return value === '12-hour' || value === '24-hour' ? value : undefined;
	}

	function preferences(options) {
		var settings = window.STREAMIENTDateSettings || {};
		options = options || {};
		var hasTimeZone = Object.prototype.hasOwnProperty.call(options, 'timeZone');
		var hasTimeFormat = Object.prototype.hasOwnProperty.call(options, 'timeFormat');
		return {
			timeZone: normalizeTimeZone(hasTimeZone ? options.timeZone : settings.timeZone),
			timeFormat: normalizeTimeFormat(hasTimeFormat ? options.timeFormat : settings.timeFormat),
			now: options.now,
			includeYear: options.includeYear,
		};
	}

	function ordinalDay(day) {
		var value = Number(day);
		var modHundred = value % 100;
		if (modHundred >= 11 && modHundred <= 13) return value + 'th';
		var modTen = value % 10;
		if (modTen === 1) return value + 'st';
		if (modTen === 2) return value + 'nd';
		if (modTen === 3) return value + 'rd';
		return value + 'th';
	}

	function dateParts(date, options) {
		var formatterOptions = { month: 'long', day: 'numeric', year: 'numeric' };
		var timeZone = normalizeTimeZone(options && options.timeZone);
		if (timeZone) formatterOptions.timeZone = timeZone;
		try {
			var parts = new Intl.DateTimeFormat(DATE_LOCALE, formatterOptions).formatToParts(date);
			return {
				month: (parts.find(function (part) { return part.type === 'month'; }) || {}).value || '',
				day: Number((parts.find(function (part) { return part.type === 'day'; }) || {}).value || 0),
				year: Number((parts.find(function (part) { return part.type === 'year'; }) || {}).value || 0),
			};
		} catch (err) {
			if (formatterOptions.timeZone) return dateParts(date, {});
			return { month: '', day: 0, year: 0 };
		}
	}

	function timeParts(date, options) {
		var formatterOptions = { hour: 'numeric', minute: '2-digit' };
		var timeZone = normalizeTimeZone(options && options.timeZone);
		if (timeZone) formatterOptions.timeZone = timeZone;
		var timeFormat = normalizeTimeFormat(options && options.timeFormat);
		if (timeFormat === '24-hour') {
			formatterOptions.hourCycle = 'h23';
		} else if (timeFormat === '12-hour') {
			formatterOptions.hour12 = true;
		}
		try {
			return new Intl.DateTimeFormat(undefined, formatterOptions).formatToParts(date);
		} catch (err) {
			if (formatterOptions.timeZone) return timeParts(date, { timeFormat: options && options.timeFormat });
			return [];
		}
	}

	function formatDate(value, options) {
		var date = toDate(value);
		if (!date) return '';
		var opts = preferences(options);
		var parts = dateParts(date, opts);
		if (!parts.month || !parts.day || !parts.year) return '';
		var nowParts = dateParts(toDate(opts.now) || new Date(), opts);
		var showYear = opts.includeYear === true || parts.year !== nowParts.year;
		return parts.month + ' ' + ordinalDay(parts.day) + (showYear ? ', ' + parts.year : '');
	}

	function formatTime(value, options) {
		var date = toDate(value);
		if (!date) return '';
		var opts = preferences(options);
		var parts = timeParts(date, opts);
		var hour = (parts.find(function (part) { return part.type === 'hour'; }) || {}).value || '';
		var minute = (parts.find(function (part) { return part.type === 'minute'; }) || {}).value || '';
		var period = (parts.find(function (part) { return part.type === 'dayPeriod'; }) || {}).value || '';
		if (!hour || !minute) return '';
		if (opts.timeFormat === '24-hour' || !period) return hour.padStart(2, '0') + ':' + minute;
		return hour + ':' + minute + (period ? ' ' + period : '');
	}

	function formatDateTime(value, options) {
		return [formatDate(value, options), formatTime(value, options)].filter(Boolean).join(', ');
	}

	function formatLocale(value, options) {
		var date = toDate(value);
		if (!date) return '';
		var opts = preferences(options);
		var formatterOptions = Object.assign({}, options || {});
		delete formatterOptions.timeZone;
		delete formatterOptions.timeFormat;
		delete formatterOptions.now;
		delete formatterOptions.includeYear;
		if (opts.timeZone) formatterOptions.timeZone = opts.timeZone;
		if (formatterOptions.hour) {
			if (opts.timeFormat === '24-hour') formatterOptions.hourCycle = 'h23';
			else if (opts.timeFormat === '12-hour') formatterOptions.hour12 = true;
		}
		try {
			return new Intl.DateTimeFormat(undefined, formatterOptions).format(date);
		} catch (err) {
			delete formatterOptions.timeZone;
			return new Intl.DateTimeFormat(undefined, formatterOptions).format(date);
		}
	}

	function detectBrowserTimeZone() {
		try {
			return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
		} catch (err) {
			return '';
		}
	}

	function detectBrowserTimeFormat() {
		try {
			var resolved = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions();
			if (resolved.hour12 === false || resolved.hourCycle === 'h23' || resolved.hourCycle === 'h24') return '24-hour';
		} catch (err) {
			return '12-hour';
		}
		return '12-hour';
	}

	function refresh(root) {
		var scope = root && typeof root.querySelectorAll === 'function' ? root : document;
		Array.prototype.forEach.call(scope.querySelectorAll('[data-date-value][data-date-format]'), function (element) {
			var value = element.dataset.dateValue;
			var format = element.dataset.dateFormat;
			var options = {};
			try {
				options = element.dataset.dateOptions ? JSON.parse(element.dataset.dateOptions) : {};
			} catch (err) {
				options = {};
			}
			var text = '';
			if (format === 'date') text = formatDate(value, options);
			else if (format === 'time') text = formatTime(value, options);
			else if (format === 'date-time') text = formatDateTime(value, options);
			else if (format === 'locale') text = formatLocale(value, options);
			if (text) element.textContent = (element.dataset.datePrefix || '') + text + (element.dataset.dateSuffix || '');
		});
	}

	function setPreferences(next) {
		next = next || {};
		window.STREAMIENTDateSettings = {
			timeZone: normalizeTimeZone(next.timeZone) || 'UTC',
			timeFormat: normalizeTimeFormat(next.timeFormat) || null,
		};
		refresh(document);
		if (typeof window.CustomEvent === 'function') window.dispatchEvent(new CustomEvent('streamient:date-settings-changed', { detail: window.STREAMIENTDateSettings }));
	}

	window.StreamientDateFormat = {
		ordinalDay: ordinalDay,
		formatDate: formatDate,
		formatTime: formatTime,
		formatDateTime: formatDateTime,
		formatLocale: formatLocale,
		detectBrowserTimeZone: detectBrowserTimeZone,
		detectBrowserTimeFormat: detectBrowserTimeFormat,
		refresh: refresh,
		setPreferences: setPreferences,
	};
	window.STREAMIENTDateFormat = window.StreamientDateFormat;
})();
