import { defineConfig } from 'vitepress';
import { useSidebar } from 'vitepress-openapi';
import spec from './data/openapi.json' with { type: 'json' };

const sidebar = useSidebar({ spec, linkPrefix: '/api/operations/' });

export default defineConfig({
    title: 'Kumbukum Docs',
    description: 'Documentation for Kumbukum — Notes, Memory, URLs, AI Chat',
    base: '/docs/',
    cleanUrls: true,

    head: [
        ['link', { rel: 'icon', type: 'image/x-icon', href: '/docs/favicon.ico' }],
    ],

    themeConfig: {
        nav: [
            { text: 'Guide', link: '/getting-started' },
            {
                text: 'API Reference',
                items: [
                    { text: 'Overview', link: '/api/' },
                    { text: 'Authentication', link: '/api/authentication' },
                ],
            },
            { text: 'MCP', link: '/mcp/' },
            {
                text: process.env.VITEPRESS_VERSION || 'dev',
                items: [
                    { text: 'Changelog', link: 'https://github.com/kumbukum/kumbukum/releases' },
                ],
            },
        ],

        sidebar: {
            '/': [
                {
                    text: 'Getting Started',
                    items: [
                        { text: 'Introduction', link: '/' },
                        { text: 'Quick Start', link: '/getting-started' },
                    ],
                },
            ],
            '/api/': [
                {
                    text: 'API Reference',
                    items: [
                        { text: 'Overview', link: '/api/' },
                        { text: 'Authentication', link: '/api/authentication' },
                        { text: 'Notes', link: '/api/notes' },
                        { text: 'Memories', link: '/api/memories' },
                        { text: 'URLs', link: '/api/urls' },
                        { text: 'Search', link: '/api/search' },
                    ],
                },
                {
                    text: 'OpenAPI Reference',
                    collapsed: true,
                    items: sidebar.generateSidebarGroups().map(group => ({
                        ...group,
                        collapsed: true,
                    })),
                },
            ],
            '/mcp/': [
                {
                    text: 'MCP Server',
                    items: [
                        { text: 'Overview', link: '/mcp/' },
                        { text: 'Setup', link: '/mcp/setup' },
                        { text: 'Tools', link: '/mcp/tools' },
                    ],
                },
            ],
        },

        search: {
            provider: 'local',
        },

        socialLinks: [
            { icon: 'github', link: 'https://github.com/kumbukum/kumbukum' },
        ],

        editLink: {
            pattern: 'https://github.com/kumbukum/kumbukum/edit/main/docs/:path',
            text: 'Edit this page on GitHub',
        },
    },
});
