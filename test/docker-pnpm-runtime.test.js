import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('constrains and preinstalls pnpm 11 without Corepack', () => {
	assert.equal(packageJson.packageManager, undefined);
	assert.equal(packageJson.engines.pnpm, '11');
	for (const file of ['dev.Dockerfile', 'prod.Dockerfile']) {
		const source = fs.readFileSync(new URL(`../docker/dockerfiles/${file}`, import.meta.url), 'utf8');
		assert.match(source, /ARG PNPM_VERSION=11/);
		assert.match(source, /npm install --global pnpm@\$\{PNPM_VERSION\}/);
		assert.doesNotMatch(source, /corepack/);
	}
});
