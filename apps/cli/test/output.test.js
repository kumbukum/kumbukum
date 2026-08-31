import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { OutputWriter } from '../lib/output.js';

class CaptureStream {
	constructor() {
		this.value = '';
	}

	write(chunk) {
		this.value += chunk;
	}
}

describe('Streamient CLI output', () => {
	it('renders compact and pretty JSON', () => {
		const compact = new CaptureStream();
		new OutputWriter({ stdout: compact }).write({ ok: true });
		assert.equal(compact.value, '{"ok":true}\n');
		const pretty = new CaptureStream();
		new OutputWriter({ stdout: pretty }).write({ ok: true }, { pretty: true });
		assert.equal(pretty.value, '{\n  "ok": true\n}\n');
	});

	it('renders arrays as tables', () => {
		const stdout = new CaptureStream();
		new OutputWriter({ stdout }).write([{ id: '1', subject: 'First' }, { id: '2', subject: 'Second' }], { table: true });
		assert.match(stdout.value, /id\s+subject/);
		assert.match(stdout.value, /1\s+First/);
		assert.match(stdout.value, /2\s+Second/);
	});
});

