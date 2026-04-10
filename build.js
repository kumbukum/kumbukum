import { build } from 'esbuild';
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production';

// Vendor bundle: Bootstrap JS + SweetAlert2
await build({
	entryPoints: ['src/vendor.js'],
	bundle: true,
	outfile: 'public/js/vendor.js',
	format: 'esm',
	platform: 'browser',
	target: ['es2020'],
	minify: isProd,
	sourcemap: !isProd,
});
console.log('Vendor built → public/js/vendor.js');

// Bootstrap CSS
await build({
	entryPoints: ['src/vendor.css'],
	bundle: true,
	outfile: 'public/css/vendor.css',
	platform: 'browser',
	minify: isProd,
	sourcemap: !isProd,
	loader: {
		'.woff': 'file',
		'.woff2': 'file',
		'.ttf': 'file',
		'.eot': 'file',
		'.svg': 'file',
	},
});
console.log('Vendor CSS built → public/css/vendor.css');

// Copy Bootstrap Icons font files
const iconsDir = join(__dirname, 'node_modules/bootstrap-icons/font/fonts');
const outFontsDir = join(__dirname, 'public/css/fonts');
if (!existsSync(outFontsDir)) mkdirSync(outFontsDir, { recursive: true });
for (const f of ['bootstrap-icons.woff', 'bootstrap-icons.woff2']) {
	const src = join(iconsDir, f);
	if (existsSync(src)) {
		copyFileSync(src, join(outFontsDir, f));
	}
}
console.log('Icon fonts copied → public/css/fonts/');

// TipTap Editor
await build({
	entryPoints: ['src/editor/note_editor.js'],
	bundle: true,
	outfile: 'public/js/editor.js',
	format: 'esm',
	platform: 'browser',
	target: ['es2020'],
	minify: isProd,
	sourcemap: !isProd,
});
console.log('Editor built → public/js/editor.js');

console.log('Build complete.');
