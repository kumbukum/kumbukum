import { readFile, writeFile } from 'node:fs/promises';

import { CommandReferenceRenderer } from '../lib/command-reference.js';

const target = new URL('../../../docs/cli/commands.md', import.meta.url);
const rendered = new CommandReferenceRenderer().render();

if (process.argv.includes('--check')) {
	const current = await readFile(target, 'utf8').catch(() => '');
	if (current !== rendered) {
		process.stderr.write('docs/cli/commands.md is stale; run pnpm --filter @streamient/cli docs:generate\n');
		process.exitCode = 1;
	}
} else {
	await writeFile(target, rendered);
}

