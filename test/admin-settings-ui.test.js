import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import pug from 'pug';

import swaggerSpec from '../swagger.js';

describe('backend admin settings UI', () => {
	it('renders Settings navigation and both settings panels', () => {
		const render = pug.compileFile(new URL('../views/admin/settings.pug', import.meta.url).pathname);
		const html = render({
			title: 'Settings',
			activeNav: 'settings',
			is_hosted: true,
			v: 'test',
			icon: () => '',
		});

		assert.match(html, /<h1[^>]*>Settings<\/h1>/);
		assert.match(html, /class="nav-link active" href="\/admin\/settings"/);
		assert.match(html, /id="settings-nav-managani"/);
		assert.match(html, /id="settings-nav-custom-code"/);
		assert.match(html, /id="managani-base-url"/);
		assert.match(html, /only the base URL/);
		assert.match(html, /id="managani-site-key"/);
		assert.match(html, /id="managani-site-secret"/);
		assert.match(html, /id="custom-js-snippet"/);
		assert.match(html, /id="custom-css-snippet"/);
		assert.doesNotMatch(html, /placeholder=/);
	});

	it('saves incrementally without reload or section replacement calls', () => {
		const source = fs.readFileSync(new URL('../public/js/admin_settings.js', import.meta.url), 'utf8');
		assert.match(source, /fetch\('\/admin\/api\/settings\/managani'/);
		assert.match(source, /fetch\('\/admin\/api\/settings\/custom-code'/);
		assert.match(source, /setButtonLoading/);
		assert.match(source, /Swal\.fire/);
		assert.doesNotMatch(source, /location\.reload|location\.href|navigateTo|loadSection|innerHTML/);
	});

	it('renders CSS, Managani, and JS in authenticated footer order only', () => {
		const appLayout = fs.readFileSync(new URL('../views/layout.pug', import.meta.url), 'utf8');
		const authLayout = fs.readFileSync(new URL('../views/auth_layout.pug', import.meta.url), 'utf8');
		const adminLayout = fs.readFileSync(new URL('../views/admin/layout.pug', import.meta.url), 'utf8');
		const cssIndex = appLayout.indexOf('custom_footer_code.css_snippet');
		const managaniIndex = appLayout.indexOf('managani_browser');
		const jsIndex = appLayout.indexOf('custom_footer_code.js_snippet');

		assert.ok(cssIndex > -1);
		assert.ok(managaniIndex > cssIndex);
		assert.ok(jsIndex > managaniIndex);
		assert.match(appLayout, /data-site-key=managani_browser\.site_key/);
		assert.match(appLayout, /data-user-token=managani_browser\.user_token/);
		assert.doesNotMatch(authLayout, /managani_browser|custom_footer_code/);
		assert.doesNotMatch(adminLayout, /managani_browser|custom_footer_code/);
	});

	it('documents both backend settings APIs with admin-session security', () => {
		for (const path of ['/admin/api/settings/managani', '/admin/api/settings/custom-code']) {
			assert.ok(swaggerSpec.paths[path]);
			assert.deepEqual(swaggerSpec.paths[path].get.security, [{ AdminSession: [] }]);
			assert.deepEqual(swaggerSpec.paths[path].put.security, [{ AdminSession: [] }]);
			assert.deepEqual(swaggerSpec.paths[path].get.servers, [{ url: '/', description: 'Root application endpoint' }]);
		}
	});
});
