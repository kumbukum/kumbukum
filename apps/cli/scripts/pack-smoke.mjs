import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const packageRoot = new URL('..', import.meta.url);
const temporaryRoot = await mkdtemp(join(tmpdir(), 'streamient-cli-pack-'));

try {
	const packed = await run('npm', ['pack', '--pack-destination', temporaryRoot], { cwd: packageRoot });
	const tarballName = packed.stdout.trim().split('\n').at(-1);
	assert.match(tarballName, /^streamient-cli-0\.1\.0\.tgz$/);
	const installRoot = join(temporaryRoot, 'install');
	await mkdir(installRoot);
	await run('npm', ['install', '--prefix', installRoot, join(temporaryRoot, tarballName)]);
	const binary = join(installRoot, 'node_modules', '.bin', 'streamient-cli');
	assert.equal((await run(binary, ['--version'], { cwd: temporaryRoot })).stdout.trim(), '0.1.0');
	assert.match((await run(binary, ['--help'], { cwd: temporaryRoot })).stdout, /Streamient CLI 0\.1\.0/);
	assert.match((await run(binary, ['completion', 'fish'], { cwd: temporaryRoot })).stdout, /complete -c streamient-cli/);
	let doctor;
	try {
		await run(binary, ['doctor'], { cwd: temporaryRoot, env: { ...process.env, STREAMIENT_CLI_ACCESS_TOKEN: '' } });
	} catch (error) {
		doctor = error;
	}
	assert.equal(doctor?.code, 3);
	assert.equal(JSON.parse(doctor.stdout).checks.token.ok, false);
	let accountDoctor;
	try {
		await run(binary, ['doctor', '--account', 'client-a'], { cwd: temporaryRoot, env: { ...process.env, STREAMIENT_CLI_ACCESS_TOKEN: '', STREAMIENT_CLI_ACCESS_TOKEN_CLIENT_A: '' } });
	} catch (error) {
		accountDoctor = error;
	}
	assert.equal(accountDoctor?.code, 3);
	assert.equal(JSON.parse(accountDoctor.stdout).checks.token.source, 'STREAMIENT_CLI_ACCESS_TOKEN_CLIENT_A');
	process.stdout.write(`Installed and smoke-tested ${tarballName}\n`);
} finally {
	await rm(temporaryRoot, { recursive: true, force: true });
}

