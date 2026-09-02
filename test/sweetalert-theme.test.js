import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function read(relativePath) {
	return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8');
}

describe('shared SweetAlert theme', () => {
	it('derives the theme at open time and preserves caller overrides', () => {
		const source = read('src/vendor.js');
		const decorator = source.slice(source.indexOf('const decorateSwalOptions'), source.indexOf('const originalSwalFire'));

		assert.match(source, /currentSwalTheme = \(\) => document\.documentElement\.getAttribute\('data-bs-theme'\)/);
		assert.ok(decorator.indexOf('theme: currentSwalTheme()') < decorator.indexOf('...options'));
		assert.match(decorator, /popup: withSwalClass\('swal2-st-popup', options\.customClass\?\.popup\)/);
		assert.match(decorator, /decorated\.customClass\.icon = withSwalClass\('swal2-st-icon', options\.customClass\?\.icon\)/);
		assert.match(source, /args\.length === 0 \|\| typeof args\[0\] === 'string'/);
	});

	it('maps SweetAlert surfaces and controls to Streamient theme tokens', () => {
		const styles = read('public/css/streamient-tabler.css');
		const popup = styles.match(/\.swal2-popup\.swal2-st-popup \{([\s\S]*?)\n\}/)?.[1] || '';

		assert.match(popup, /--swal2-background: var\(--st-panel\)/);
		assert.match(popup, /--swal2-color: var\(--st-text\)/);
		assert.match(popup, /--swal2-input-background: var\(--st-panel-muted\)/);
		assert.match(popup, /--swal2-validation-message-background: var\(--st-danger-soft\)/);
		assert.match(popup, /--swal2-confirm-button-background-color: var\(--st-primary\)/);
		assert.match(popup, /--swal2-toast-border:/);
		assert.match(styles, /\.swal2-popup\.swal2-st-popup \.swal2-loader \{[\s\S]*border-color: var\(--st-primary\) transparent/);
		assert.match(styles, /\.swal2-popup\.swal2-st-popup\.swal2-toast \{\s*box-shadow: var\(--st-shadow-hard\)/);
	});

	it('uses compact icons in dialogs and smaller icons in toasts', () => {
		const styles = read('public/css/app.css');
		const icon = styles.match(/\.swal2-icon\.swal2-st-icon \{([\s\S]*?)\n\}/)?.[1] || '';
		const glyph = styles.match(/\.swal2-icon\.swal2-st-icon \.st-icon \{([\s\S]*?)\n\}/)?.[1] || '';

		assert.match(icon, /width: 3rem/);
		assert.match(icon, /height: 3rem/);
		assert.match(glyph, /font-size: 2rem/);
		assert.match(styles, /\.swal2-toast \.swal2-icon\.swal2-st-icon \.st-icon \{\s*font-size: 1\.25rem/);
		assert.match(styles, /label\.swal-label \{[\s\S]*color: var\(--st-text\)/);
		assert.match(styles, /\.swal-hint \{[\s\S]*color: var\(--st-muted\)/);
	});

	it('includes the shared popup theme in the generated vendor bundle', () => {
		const bundle = read('public/js/vendor.js');

		assert.match(bundle, /swal2-st-popup/);
		assert.match(bundle, /data-bs-theme/);
	});
});
