import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import express from 'express';
import pug from 'pug';

import { User } from '../model/user.js';
import { icon } from '../modules/icons.js';
import { buildAdminUsersCsv, escapeAdminCsvCell, serializeAdminUsersCsv, splitAdminUserName } from '../services/admin_user_export_service.js';
import swaggerSpec from '../swagger.js';

const product = 'streamient';
const themeStorageKey = 'st-theme';
const originalUserFind = User.find;

function userQuery(users) {
	const query = {
		select() { return query; },
		sort() { return query; },
		lean: async () => users,
	};
	return query;
}

async function createServer(isAdmin = true) {
	const { default: adminRoutes } = await import(`../routes/admin.js?admin_user_export_test=${Date.now()}_${Math.random()}`);
	const app = express();
	app.use((req, res, next) => {
		req.session = isAdmin ? { isAdmin: true } : {};
		next();
	});
	app.use('/admin', adminRoutes);
	return app.listen(0);
}

async function requestExport(server) {
	const { port } = server.address();
	return fetch(`http://127.0.0.1:${port}/admin/api/users.csv`, {
		headers: { accept: 'application/json' },
		redirect: 'manual',
	});
}

describe('backend admin user CSV export and theme', () => {
	afterEach(() => {
		User.find = originalUserFind;
	});

	it('splits names and serializes safe UTF-8 CSV', () => {
		assert.deepEqual(splitAdminUserName('  Ada   Lovelace Byron '), { first_name: 'Ada', last_name: 'Lovelace Byron' });
		assert.deepEqual(splitAdminUserName('Prince'), { first_name: 'Prince', last_name: '' });
		assert.deepEqual(splitAdminUserName(''), { first_name: '', last_name: '' });
		assert.equal(escapeAdminCsvCell('A,"B"\nC'), `"A,""B""\nC"`);
		assert.equal(escapeAdminCsvCell('=2+2'), `"'=2+2"`);

		const csv = serializeAdminUsersCsv([
			{ name: '李 小龍', email: 'bruce@example.test' },
		]);
		assert.equal(csv, '\uFEFFfirst_name,last_name,email\r\n"李","小龍","bruce@example.test"\r\n');
	});

	it('queries every user with a projected, sorted, lean query', async () => {
		let selected;
		let sorted;
		let leanCalled = false;
		User.find = (filter) => {
			assert.deepEqual(filter, {});
			const query = {
				select(value) {
					selected = value;
					return query;
				},
				sort(value) {
					sorted = value;
					return query;
				},
				async lean() {
					leanCalled = true;
					return [{ name: 'Ada Lovelace', email: 'ada@example.test' }];
				},
			};
			return query;
		};

		const csv = await buildAdminUsersCsv();
		assert.equal(selected, 'name email');
		assert.deepEqual(sorted, { email: 1 });
		assert.equal(leanCalled, true);
		assert.match(csv, /"Ada","Lovelace","ada@example\.test"/);
	});

	it('serves only authenticated admins with download headers', async () => {
		User.find = () => userQuery([{ name: 'Ada Lovelace', email: 'ada@example.test' }]);
		const server = await createServer();
		try {
			const response = await requestExport(server);
			const bytes = new Uint8Array(await response.arrayBuffer());
			assert.equal(response.status, 200);
			assert.match(response.headers.get('content-type') || '', /^text\/csv;\s*charset=utf-8/i);
			assert.match(response.headers.get('content-disposition') || '', new RegExp(`attachment; filename="${product}-users-\\d{4}-\\d{2}-\\d{2}\\.csv"`));
			assert.equal(response.headers.get('cache-control'), 'no-store');
			assert.deepEqual(Array.from(bytes.slice(0, 3)), [0xef, 0xbb, 0xbf]);
		} finally {
			await new Promise((resolve) => server.close(resolve));
		}

		const unauthorizedServer = await createServer(false);
		try {
			const response = await requestExport(unauthorizedServer);
			assert.equal(response.status, 403);
		} finally {
			await new Promise((resolve) => unauthorizedServer.close(resolve));
		}
	});

	it('renders the export and persistent light/dark controls and documents the API', () => {
		const render = pug.compileFile(new URL('../views/admin/accounts.pug', import.meta.url).pathname);
		const html = render({
			title: 'Accounts',
			activeNav: 'accounts',
			is_hosted: true,
			v: 'test',
			icon,
			status: 'active',
			accounts: [],
			total: 0,
			page: 1,
			pages: 0,
		});
		assert.match(html, /href="\/admin\/api\/users\.csv"[^>]*>Export Users CSV<\/a>/);
		assert.match(html, /ti-moon/);
		assert.match(html, /ti-sun/);

		const layoutSource = fs.readFileSync(new URL('../views/admin/layout.pug', import.meta.url), 'utf8');
		const loginSource = fs.readFileSync(new URL('../views/admin/login.pug', import.meta.url), 'utf8');
		for (const source of [layoutSource, loginSource]) {
			assert.ok(source.includes(`localStorage.getItem('${themeStorageKey}')`));
			assert.ok(source.includes("t = 'light'"));
			assert.ok(source.includes('data-admin-theme-toggle'));
			assert.ok(source.includes(`data-theme-storage-key="${themeStorageKey}"`));
			assert.ok(source.includes('js/admin_theme.js'));
		}
		const cssSource = fs.readFileSync(new URL('../public/css/app.css', import.meta.url), 'utf8');
		assert.match(cssSource, /body\.backend-admin \.list-group-item-action\.active/);
		assert.match(cssSource, /admin-theme-label-light/);
		const themeSource = fs.readFileSync(new URL('../public/js/admin_theme.js', import.meta.url), 'utf8');
		assert.match(themeSource, /localStorage\.setItem\(button\.dataset\.themeStorageKey, next\)/);
		assert.doesNotMatch(themeSource, /location\.reload|location\.href/);

		const endpoint = swaggerSpec.paths['/admin/api/users.csv'].get;
		assert.deepEqual(endpoint.security, [{ AdminSession: [] }]);
		assert.ok(endpoint.responses[200].content['text/csv']);
	});
});
