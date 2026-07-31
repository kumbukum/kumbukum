import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { dateFormatPreferences, formatHumanDate, formatHumanDateTime, formatLocaleDate, ordinalDay } from '../modules/date_format.js';

describe('date formatting helpers', () => {
	it('formats current-year dates without the year', () => {
		assert.equal(formatHumanDate('2026-05-05T12:00:00.000Z', { timeZone: 'UTC', now: '2026-07-06T12:00:00.000Z' }), 'May 5th');
	});

	it('formats older dates with the year', () => {
		assert.equal(formatHumanDate('2025-05-05T12:00:00.000Z', { timeZone: 'UTC', now: '2026-07-06T12:00:00.000Z' }), 'May 5th, 2025');
	});

	it('adds ordinal day suffixes', () => {
		assert.deepEqual([1, 2, 3, 11, 12, 13, 21].map(ordinalDay), ['1st', '2nd', '3rd', '11th', '12th', '13th', '21st']);
	});

	it('uses timezone-aware calendar dates near midnight', () => {
		assert.equal(formatHumanDate('2026-01-01T01:30:00.000Z', { timeZone: 'America/Los_Angeles', now: '2026-01-01T12:00:00.000Z' }), 'December 31st, 2025');
	});

	it('honors 12-hour and 24-hour time formats', () => {
		const value = '2026-05-05T19:10:00.000Z';
		const now = '2026-07-06T12:00:00.000Z';
		assert.equal(formatHumanDateTime(value, { timeZone: 'UTC', timeFormat: '12-hour', now }), 'May 5th, 7:10 PM');
		assert.equal(formatHumanDateTime(value, { timeZone: 'UTC', timeFormat: '24-hour', now }), 'May 5th, 19:10');
	});

	it('keeps locale display shapes while applying timezone and clock preferences', () => {
		const value = '2026-01-01T01:30:00.000Z';
		assert.equal(formatLocaleDate(value, { timeZone: 'America/Los_Angeles', year: 'numeric', month: 'long', day: 'numeric' }), 'December 31, 2025');
		assert.match(formatLocaleDate(value, { timeZone: 'UTC', timeFormat: '24-hour', hour: 'numeric', minute: '2-digit' }), /^01:30$/);
	});

	it('keeps missing clock preferences in system mode and falls back invalid timezones to UTC', () => {
		assert.deepEqual(dateFormatPreferences({ timezone: 'Moon/Base' }), { timeZone: 'UTC', timeFormat: null });
		assert.equal(formatHumanDate('2026-01-01T01:30:00.000Z', { timeZone: 'Moon/Base', now: '2026-01-01T12:00:00.000Z' }), 'January 1st');
	});
});
