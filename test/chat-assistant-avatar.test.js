import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import pug from 'pug';
import { fileURLToPath } from 'node:url';

describe('chat assistant avatar', () => {
	it('renders the Streamient icon from the sidebar template', () => {
		const render = pug.compileFile(fileURLToPath(new URL('../views/includes/chat_sidebar.pug', import.meta.url)));
		const html = render({ icon: () => '', user: { name: 'Test' } });

		assert.match(html, /id="chat-assistant-avatar-template"/);
		assert.match(html, /src="\/static\/images\/streamient-icon\.svg"/);
		assert.match(html, /alt="Streamient"/);
	});

	it('clones the template for every assistant rendering path without the legacy K avatar', () => {
		const source = fs.readFileSync(new URL('../public/js/chat.js', import.meta.url), 'utf8');

		assert.match(source, /assistantAvatarTemplate\.content\.cloneNode\(true\)/);
		assert.equal(source.match(/appendChild\(createAssistantAvatar\(\)\)/g)?.length, 3);
		assert.doesNotMatch(source, />K<\/span>/);
		assert.doesNotMatch(source, /background:#253055/);
	});
});
