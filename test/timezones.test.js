import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { getTimezoneOptions, isSupportedTimezone } from '../modules/timezones.js';

describe('timezone helpers', () => {
	it('includes UTC before browser-provided IANA zones', () => {
		const options = getTimezoneOptions();

		assert.equal(options[0].value, 'UTC');
		assert.equal(options[0].label, 'UTC');
		assert.equal(isSupportedTimezone('UTC'), true);
	});

	it('includes known IANA zones with readable labels', () => {
		const options = getTimezoneOptions();
		const option = options.find((item) => item.value === 'America/New_York');

		assert.equal(option?.label, 'America/New York');
		assert.equal(isSupportedTimezone('America/New_York'), true);
	});

	it('rejects unsupported timezone strings', () => {
		assert.equal(isSupportedTimezone('Moon/Base'), false);
		assert.equal(isSupportedTimezone(''), false);
	});
});
