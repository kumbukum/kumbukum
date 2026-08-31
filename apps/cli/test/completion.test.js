import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CommandRegistry } from '../lib/command-registry.js';
import { CompletionRenderer } from '../lib/completion.js';

describe('Streamient CLI completion', () => {
	for (const shell of ['fish', 'bash', 'zsh']) {
		it(`renders ${shell} group and command completion`, () => {
			const result = new CompletionRenderer(new CommandRegistry()).render(shell);
			assert.match(result, /streamient-cli/);
			assert.match(result, /memories/);
			assert.match(result, /knowledge/);
			assert.match(result, /projects/);
			assert.match(result, /token-env/);
		});
	}
});
