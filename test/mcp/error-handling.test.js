import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createMockApi } from './helpers/mock-api.js';
import { noteTools } from '../../apps/mcp/tools/notes.js';
import { memoryTools } from '../../apps/mcp/tools/memory.js';
import { urlTools } from '../../apps/mcp/tools/urls.js';

describe('MCP Tools — Error handling', () => {
    const failingApi = createMockApi({
        get: async () => { throw new Error('API GET failed (404): Not found'); },
        post: async () => { throw new Error('API POST failed (500): Internal'); },
        put: async () => { throw new Error('API PUT failed (400): Bad request'); },
        delete: async () => { throw new Error('API DELETE failed (403): Forbidden'); },
    });

    const notes = noteTools(failingApi);
    const memory = memoryTools(failingApi);
    const urls = urlTools(failingApi);

    it('read_note — handler throws when API fails', async () => {
        await assert.rejects(
            () => notes.read_note.handler({ id: 'bad' }),
            (err) => err.message.includes('404'),
        );
    });

    it('create_note — handler throws when API fails', async () => {
        await assert.rejects(
            () => notes.create_note.handler({ title: 'Fail', project: 'p' }),
            (err) => err.message.includes('500'),
        );
    });

    it('update_note — handler throws when API fails', async () => {
        await assert.rejects(
            () => notes.update_note.handler({ id: 'bad', title: 'Fail' }),
            (err) => err.message.includes('400'),
        );
    });

    it('delete_note — handler throws when API fails', async () => {
        await assert.rejects(
            () => notes.delete_note.handler({ id: 'bad' }),
            (err) => err.message.includes('403'),
        );
    });

    it('store_memory — handler throws when API fails', async () => {
        await assert.rejects(
            () => memory.store_memory.handler({ title: 'x', content: 'y', project: 'p' }),
            (err) => err.message.includes('500'),
        );
    });

    it('save_url — handler throws when API fails', async () => {
        await assert.rejects(
            () => urls.save_url.handler({ url: 'https://bad.com', project: 'p' }),
            (err) => err.message.includes('500'),
        );
    });
});
