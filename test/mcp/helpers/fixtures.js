/**
 * Shared fixtures for MCP tests.
 */

export const FIXTURES = {
    project: {
        _id: '507f1f77bcf86cd799439011',
        name: 'Test Project',
        color: '#3B82F6',
        is_default: false,
        is_active: true,
    },

    note: {
        _id: '507f1f77bcf86cd799439022',
        title: 'Test Note',
        content: '<p>Hello world</p>',
        text_content: 'Hello world',
        tags: ['test'],
        project: '507f1f77bcf86cd799439011',
    },

    memory: {
        _id: '507f1f77bcf86cd799439033',
        title: 'Test Memory',
        content: 'Remember this fact',
        tags: ['test'],
        source: 'unit-test',
        project: '507f1f77bcf86cd799439011',
    },

    url: {
        _id: '507f1f77bcf86cd799439044',
        url: 'https://example.com',
        title: 'Example Domain',
        description: 'An example page',
        crawl_enabled: false,
        project: '507f1f77bcf86cd799439011',
    },

    searchResults: {
        notes: [{ title: 'Result Note', score: 0.9 }],
        memories: [{ title: 'Result Memory', score: 0.85 }],
        urls: [{ title: 'Result URL', score: 0.8 }],
    },

    tags: ['test', 'dev', 'docs'],
};
