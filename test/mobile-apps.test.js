import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pug from 'pug';
import { ANDROID_BETA_URL, IOS_BETA_URL, renderMobileAppsModal } from '../routes/mobile_apps.js';

function localPath(relativePath) {
	return fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
}

describe('mobile apps', () => {
	it('renders the public iOS and Android betas', async () => {
		let renderedView = '';
		let renderedData = null;
		await renderMobileAppsModal({}, {
			render(view, data) {
				renderedView = view;
				renderedData = data;
			},
			sendStatus(status) {
				assert.fail(`Unexpected status ${status}`);
			},
		});

		assert.equal(renderedView, 'ajax/mobile_apps_modal');
		assert.equal(renderedData.model.ios.url, IOS_BETA_URL);
		assert.equal(renderedData.model.ios.url, 'https://testflight.apple.com/join/yhXgWbKy');
		assert.match(renderedData.model.ios.qrcode, /<svg/);
		assert.equal(renderedData.model.android.url, ANDROID_BETA_URL);
		assert.equal(renderedData.model.android.url, 'https://play.google.com/apps/testing/com.streamient.mobile');
		assert.match(renderedData.model.android.qrcode, /<svg/);
	});

	it('wires the authenticated navbar modal without SPA navigation', () => {
		const layout = readFileSync(localPath('views/layout.pug'), 'utf8');
		const client = readFileSync(localPath('public/js/app.js'), 'utf8');
		const css = readFileSync(localPath('public/css/app.css'), 'utf8');
		const web = readFileSync(localPath('routes/web.js'), 'utf8');
		const templatePath = localPath('views/ajax/mobile_apps_modal.pug');
		const html = pug.renderFile(templatePath, {
			model: {
				ios: { url: IOS_BETA_URL, qrcode: '<svg></svg>' },
				android: { url: ANDROID_BETA_URL, qrcode: '<svg></svg>' },
			},
			icon: (name) => `<span data-icon="${name}"></span>`,
		});
		const modalInitStart = client.indexOf('function initMobileBetaModal()');
		const modalInitEnd = client.indexOf("\ndocument.addEventListener('DOMContentLoaded'", modalInitStart);
		const modalInit = client.slice(modalInitStart, modalInitEnd);

		assert.equal((layout.match(/Try our mobile apps/g) || []).length, 1);
		assert.match(layout, /d-none\.d-md-inline-flex[^\n]*st-mobile-beta-header-link/);
		assert.match(layout, /st-mobile-beta-header-link[\s\S]{0,500}if is_trialing/);
		assert.match(layout, /#mobileBetaModal/);
		assert.match(layout, /Try the Streamient mobile apps/);
		assert.ok(web.indexOf('router.use(requireAuth, requireTenant);') < web.indexOf("router.get('/ajax/mobile-apps', renderMobileAppsModal);"));
		assert.match(web, /import \{ renderMobileAppsModal \} from '\.\/mobile_apps\.js';/);
		assert.match(modalInit, /fetch\('\/ajax\/mobile-apps'\)/);
		assert.match(modalInit, /loaded \|\| loading/);
		assert.doesNotMatch(modalInit, /navigateTo|mountCurrent|location\.reload/);
		assert.match(css, /#mobileBetaModal a\.btn-primary[\s\S]*color: var\(--st-ink\)/);
		assert.match(css, /#mobileBetaModal \.text-muted[\s\S]*color: var\(--st-muted\) !important/);
		assert.match(html, /https:\/\/testflight\.apple\.com\/join\/yhXgWbKy/);
		assert.match(html, /https:\/\/play\.google\.com\/apps\/testing\/com\.streamient\.mobile/);
		assert.match(html, /role="img" aria-label="QR code for Apple TestFlight"/);
		assert.match(html, /role="img" aria-label="QR code for Google Play testing"/);
		assert.match(html, /rel="noopener noreferrer"/);
		assert.doesNotMatch(html, /Coming soon/);
	});
});
