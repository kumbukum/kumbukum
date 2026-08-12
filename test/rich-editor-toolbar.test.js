import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { load } from 'cheerio';
import pug from 'pug';
import { fileURLToPath } from 'node:url';

const COMMANDS = [
	'heading1',
	'heading2',
	'heading3',
	'bold',
	'italic',
	'underline',
	'link',
	'bulletList',
	'orderedList',
	'taskList',
	'codeBlock',
	'blockquote',
	'horizontalRule',
	'undo',
	'redo',
	'clear',
];

function localPath(relativePath) {
	return fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
}

function read(relativePath) {
	return readFileSync(localPath(relativePath), 'utf8');
}

describe('Note and Memory rich editor toolbar', () => {
	it('renders all toolbar commands from an accessible Pug template', () => {
		const html = pug.renderFile(localPath('views/ajax/rich_editor.pug'), { icon: (name) => `<span data-icon="${name}"></span>` });
		const $ = load(html);
		const toolbar = $('[role="toolbar"]');
		const buttons = toolbar.find('button[data-command]');

		assert.equal(toolbar.attr('aria-label'), 'Text formatting');
		assert.equal($('.st-rich-editor-body').length, 1);
		assert.deepEqual(buttons.map((index, button) => $(button).attr('data-command')).get(), COMMANDS);
		assert.equal(new Set(COMMANDS).size, 16);
		assert.equal(buttons.filter('[aria-pressed]').length, 12);
		buttons.each((index, button) => {
			assert.equal($(button).attr('type'), 'button');
			assert.ok($(button).attr('title'));
			assert.ok($(button).attr('aria-label'));
		});
	});

	it('binds the Pug template without slash-command or reload behavior', () => {
		const source = read('src/editor/note_editor.js');
		const createEditorSource = source.slice(source.indexOf('export function createEditor'), source.indexOf('const EMAIL_TOOLBAR_BUTTONS'));

		for (const command of COMMANDS) assert.match(source, new RegExp(`\\n\\t${command}: \\{`));
		assert.match(source, /document\.getElementById\('st-rich-editor-template'\)/);
		assert.match(source, /element\.replaceChildren\(template\.content\.cloneNode\(true\)\)/);
		assert.match(source, /window\.Swal\.fire\(/);
		assert.match(source, /inputLabel: 'Link URL'/);
		assert.match(source, /editor\.view\.dom\.closest\('\.modal'\) \|\| document\.body/);
		assert.match(source, /const hasFocus = editor\.isFocused/);
		assert.match(source, /const active = hasFocus && Boolean\(command\.isActive\?\.\(editor\)\)/);
		assert.match(source, /button\.setAttribute\('aria-pressed', String\(active\)\)/);
		assert.match(source, /editor\.on\('focus', refresh\)/);
		assert.match(source, /editor\.on\('blur', refresh\)/);
		assert.doesNotMatch(source, /slash/i);
		assert.doesNotMatch(source, /@tiptap\/pm/);
		assert.doesNotMatch(createEditorSource, /createElement|innerHTML|location\.reload|window\.location/);
	});

	it('includes responsive themed toolbar styling in the authenticated layout', () => {
		const layout = read('views/layout.pug');
		const css = read('public/css/app.css');

		assert.match(layout, /include ajax\/rich_editor/);
		assert.match(css, /\.st-rich-editor-toolbar \{[\s\S]*flex-wrap: wrap;[\s\S]*background: var\(--bs-body-bg\);/);
		assert.match(css, /\.st-rich-editor-button\.active,[\s\S]*color: var\(--bs-primary\);/);
		assert.match(css, /\.st-rich-editor-button:disabled \{[\s\S]*cursor: not-allowed;/);
		assert.doesNotMatch(css, /\.slash-menu/);
	});
});
