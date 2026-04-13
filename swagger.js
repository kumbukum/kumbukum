const swaggerSpec = {
    openapi: '3.0.3',
    info: {
        title: 'Kumbukum API',
        version: '1.0.0',
        description: 'Everything your AI needs to remember — Notes, Memory, URLs, AI Chat',
    },
    servers: [
        { url: '/api/v1', description: 'API v1' },
    ],
    components: {
        securitySchemes: {
            BearerAuth: {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT',
                description: 'JWT token from login',
            },
            AccessToken: {
                type: 'apiKey',
                in: 'header',
                name: 'Authorization',
                description: 'Personal access token. Value: `Token <your-token>`',
            },
        },
        schemas: {
            Project: {
                type: 'object',
                properties: {
                    _id: { type: 'string' },
                    name: { type: 'string' },
                    color: { type: 'string' },
                    host_id: { type: 'string' },
                },
            },
            Note: {
                type: 'object',
                properties: {
                    _id: { type: 'string' },
                    title: { type: 'string' },
                    content: { type: 'string' },
                    project: { type: 'string' },
                    host_id: { type: 'string' },
                    createdAt: { type: 'string', format: 'date-time' },
                    updatedAt: { type: 'string', format: 'date-time' },
                },
            },
            Memory: {
                type: 'object',
                properties: {
                    _id: { type: 'string' },
                    title: { type: 'string' },
                    content: { type: 'string' },
                    project: { type: 'string' },
                    host_id: { type: 'string' },
                    createdAt: { type: 'string', format: 'date-time' },
                    updatedAt: { type: 'string', format: 'date-time' },
                },
            },
            Url: {
                type: 'object',
                properties: {
                    _id: { type: 'string' },
                    title: { type: 'string' },
                    url: { type: 'string', format: 'uri' },
                    project: { type: 'string' },
                    crawl_enabled: { type: 'boolean' },
                    host_id: { type: 'string' },
                    createdAt: { type: 'string', format: 'date-time' },
                    updatedAt: { type: 'string', format: 'date-time' },
                },
            },
            Error: {
                type: 'object',
                properties: {
                    error: { type: 'string' },
                },
            },
            GraphLink: {
                type: 'object',
                properties: {
                    _id: { type: 'string' },
                    source_id: { type: 'string' },
                    source_type: { type: 'string', enum: ['notes', 'memory', 'urls'] },
                    target_id: { type: 'string' },
                    target_type: { type: 'string', enum: ['notes', 'memory', 'urls'] },
                    label: { type: 'string' },
                    owner: { type: 'string' },
                    host_id: { type: 'string' },
                },
            },
        },
        parameters: {
            page: { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            limit: { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
            project: { name: 'project', in: 'query', schema: { type: 'string' }, description: 'Filter by project ID' },
        },
    },
    security: [{ BearerAuth: [] }, { AccessToken: [] }],
    paths: {
        // ---- Projects ----
        '/projects': {
            get: {
                tags: ['Projects'],
                summary: 'List projects',
                responses: {
                    200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { projects: { type: 'array', items: { $ref: '#/components/schemas/Project' } } } } } } },
                },
            },
            post: {
                tags: ['Projects'],
                summary: 'Create a project',
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, color: { type: 'string' } }, required: ['name'] } } },
                },
                responses: {
                    201: { description: 'Created', content: { 'application/json': { schema: { type: 'object', properties: { project: { $ref: '#/components/schemas/Project' } } } } } },
                },
            },
        },
        '/projects/{id}': {
            get: {
                tags: ['Projects'],
                summary: 'Get a project',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: {
                    200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { project: { $ref: '#/components/schemas/Project' } } } } } },
                    404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                },
            },
            put: {
                tags: ['Projects'],
                summary: 'Update a project',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, color: { type: 'string' } } } } },
                },
                responses: {
                    200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { project: { $ref: '#/components/schemas/Project' } } } } } },
                    404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                },
            },
            delete: {
                tags: ['Projects'],
                summary: 'Delete a project',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: {
                    200: { description: 'Deleted', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string' } } } } } },
                    404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                },
            },
        },

        // ---- Notes ----
        '/notes': {
            get: {
                tags: ['Notes'],
                summary: 'List notes',
                parameters: [
                    { $ref: '#/components/parameters/page' },
                    { $ref: '#/components/parameters/limit' },
                    { $ref: '#/components/parameters/project' },
                ],
                responses: {
                    200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { notes: { type: 'array', items: { $ref: '#/components/schemas/Note' } } } } } } },
                },
            },
            post: {
                tags: ['Notes'],
                summary: 'Create a note',
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', properties: { title: { type: 'string' }, content: { type: 'string' }, project: { type: 'string' } }, required: ['title'] } } },
                },
                responses: {
                    201: { description: 'Created', content: { 'application/json': { schema: { type: 'object', properties: { note: { $ref: '#/components/schemas/Note' } } } } } },
                },
            },
        },
        '/notes/{id}': {
            get: {
                tags: ['Notes'],
                summary: 'Get a note',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: {
                    200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { note: { $ref: '#/components/schemas/Note' } } } } } },
                    404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                },
            },
            put: {
                tags: ['Notes'],
                summary: 'Update a note',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', properties: { title: { type: 'string' }, content: { type: 'string' }, project: { type: 'string' } } } } },
                },
                responses: {
                    200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { note: { $ref: '#/components/schemas/Note' } } } } } },
                    404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                },
            },
            delete: {
                tags: ['Notes'],
                summary: 'Delete a note',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: {
                    200: { description: 'Deleted', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string' } } } } } },
                    404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                },
            },
        },
        '/notes/search': {
            post: {
                tags: ['Notes'],
                summary: 'Search notes',
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', properties: { query: { type: 'string' }, options: { type: 'object' } }, required: ['query'] } } },
                },
                responses: {
                    200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'array', items: { $ref: '#/components/schemas/Note' } } } } } } },
                },
            },
        },

        // ---- Memories ----
        '/memories': {
            get: {
                tags: ['Memories'],
                summary: 'List memories',
                parameters: [
                    { $ref: '#/components/parameters/page' },
                    { $ref: '#/components/parameters/limit' },
                    { $ref: '#/components/parameters/project' },
                ],
                responses: {
                    200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { memories: { type: 'array', items: { $ref: '#/components/schemas/Memory' } } } } } } },
                },
            },
            post: {
                tags: ['Memories'],
                summary: 'Store a memory',
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', properties: { title: { type: 'string' }, content: { type: 'string' }, project: { type: 'string' } }, required: ['title'] } } },
                },
                responses: {
                    201: { description: 'Created', content: { 'application/json': { schema: { type: 'object', properties: { memory: { $ref: '#/components/schemas/Memory' } } } } } },
                },
            },
        },
        '/memories/{id}': {
            get: {
                tags: ['Memories'],
                summary: 'Get a memory',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: {
                    200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { memory: { $ref: '#/components/schemas/Memory' } } } } } },
                    404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                },
            },
            put: {
                tags: ['Memories'],
                summary: 'Update a memory',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', properties: { title: { type: 'string' }, content: { type: 'string' }, project: { type: 'string' } } } } },
                },
                responses: {
                    200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { memory: { $ref: '#/components/schemas/Memory' } } } } } },
                    404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                },
            },
            delete: {
                tags: ['Memories'],
                summary: 'Delete a memory',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: {
                    200: { description: 'Deleted', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string' } } } } } },
                    404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                },
            },
        },
        '/memories/search': {
            post: {
                tags: ['Memories'],
                summary: 'Search memories',
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', properties: { query: { type: 'string' }, options: { type: 'object' } }, required: ['query'] } } },
                },
                responses: {
                    200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'array', items: { $ref: '#/components/schemas/Memory' } } } } } } },
                },
            },
        },
        '/memories/tags/suggest': {
            get: {
                tags: ['Memories'],
                summary: 'Suggest memory tags',
                responses: {
                    200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { tags: { type: 'array', items: { type: 'string' } } } } } } },
                },
            },
        },

        // ---- URLs ----
        '/urls': {
            get: {
                tags: ['URLs'],
                summary: 'List URLs',
                parameters: [
                    { $ref: '#/components/parameters/page' },
                    { $ref: '#/components/parameters/limit' },
                    { $ref: '#/components/parameters/project' },
                ],
                responses: {
                    200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { urls: { type: 'array', items: { $ref: '#/components/schemas/Url' } } } } } } },
                },
            },
            post: {
                tags: ['URLs'],
                summary: 'Save a URL',
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', properties: { url: { type: 'string', format: 'uri' }, title: { type: 'string' }, project: { type: 'string' }, crawl_enabled: { type: 'boolean' } }, required: ['url'] } } },
                },
                responses: {
                    201: { description: 'Created', content: { 'application/json': { schema: { type: 'object', properties: { url: { $ref: '#/components/schemas/Url' } } } } } },
                },
            },
        },
        '/urls/{id}': {
            get: {
                tags: ['URLs'],
                summary: 'Get a URL',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: {
                    200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { url: { $ref: '#/components/schemas/Url' } } } } } },
                    404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                },
            },
            put: {
                tags: ['URLs'],
                summary: 'Update a URL',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', properties: { url: { type: 'string', format: 'uri' }, title: { type: 'string' }, project: { type: 'string' }, crawl_enabled: { type: 'boolean' } } } } },
                },
                responses: {
                    200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { url: { $ref: '#/components/schemas/Url' } } } } } },
                    404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                },
            },
            delete: {
                tags: ['URLs'],
                summary: 'Delete a URL',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: {
                    200: { description: 'Deleted', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string' } } } } } },
                    404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                },
            },
        },
        '/urls/search': {
            post: {
                tags: ['URLs'],
                summary: 'Search URLs',
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', properties: { query: { type: 'string' }, options: { type: 'object' } }, required: ['query'] } } },
                },
                responses: {
                    200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'array', items: { $ref: '#/components/schemas/Url' } } } } } } },
                },
            },
        },

        // ---- Batch Operations ----
        '/batch/delete': {
            post: {
                tags: ['Batch'],
                summary: 'Batch delete items',
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', properties: { type: { type: 'string', enum: ['notes', 'memories', 'urls'] }, ids: { type: 'array', items: { type: 'string' } } }, required: ['type', 'ids'] } } },
                },
                responses: {
                    200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string' }, deleted: { type: 'integer' } } } } } },
                },
            },
        },
        '/batch/move': {
            post: {
                tags: ['Batch'],
                summary: 'Batch move items to a project',
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', properties: { type: { type: 'string', enum: ['notes', 'memories', 'urls'] }, ids: { type: 'array', items: { type: 'string' } }, project: { type: 'string' } }, required: ['type', 'ids', 'project'] } } },
                },
                responses: {
                    200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string' }, moved: { type: 'integer' } } } } } },
                },
            },
        },
        '/batch/copy': {
            post: {
                tags: ['Batch'],
                summary: 'Batch copy items to a project',
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', properties: { type: { type: 'string', enum: ['notes', 'memories', 'urls'] }, ids: { type: 'array', items: { type: 'string' } }, project: { type: 'string' } }, required: ['type', 'ids', 'project'] } } },
                },
                responses: {
                    200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string' }, copied: { type: 'integer' } } } } } },
                },
            },
        },

        // ---- Search ----
        '/search/all': {
            post: {
                tags: ['Search'],
                summary: 'Search across all collections',
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
                },
                responses: {
                    200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'array', items: { type: 'object' } } } } } } },
                },
            },
        },
        '/search/knowledge': {
            post: {
                tags: ['Search'],
                summary: 'Search knowledge (notes + memories + URLs + pages)',
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', properties: { query: { type: 'string' }, project_id: { type: 'string', description: 'Filter by project (optional)' }, per_page: { type: 'integer', description: 'Results per collection (default 5)' }, options: { type: 'object' } }, required: ['query'] } } },
                },
                responses: {
                    200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'object' } } } } } },
                },
            },
        },

        // ---- Resolve ----
        '/resolve': {
            post: {
                tags: ['Utility'],
                summary: 'Resolve IDs to titles',
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } } }, required: ['ids'] } } },
                },
                responses: {
                    200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, _type: { type: 'string' } } } } } } } } },
                },
            },
        },

        // ---- Counts ----
        '/counts': {
            get: {
                tags: ['Utility'],
                summary: 'Get project item counts',
                responses: {
                    200: { description: 'OK', content: { 'application/json': { schema: { type: 'object' } } } },
                },
            },
        },

        // ---- Reindex ----
        '/reindex': {
            post: {
                tags: ['Utility'],
                summary: 'Reindex Typesense collections',
                responses: {
                    200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string' } } } } } },
                },
            },
        },

        // ---- AI Chat ----
        '/chat': {
            post: {
                tags: ['AI Chat'],
                summary: 'AI-powered chat with intent classification',
                description: 'Classifies the query intent (search, action, analysis, conversation), routes to the appropriate handler, and returns results + conversational answer. Results are displayed in the main panel.',
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', properties: { query: { type: 'string', description: 'User message or query' }, conversation_id: { type: 'string', description: 'Continue an existing conversation (optional)' }, project_id: { type: 'string', description: 'Scope search/actions to a project (optional)' } }, required: ['query'] } } },
                },
                responses: {
                    200: {
                        description: 'OK',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        answer: { type: 'string', description: 'Conversational response' },
                                        results: { type: 'array', items: { type: 'object' }, description: 'Matching items from knowledge base' },
                                        action: { type: 'object', nullable: true, description: 'Action performed or pending confirmation' },
                                        conversation_id: { type: 'string', description: 'Conversation ID for follow-up messages' },
                                        display_in: { type: 'string', enum: ['panel', 'chat'], description: 'Where results should be displayed' },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        '/chat/conversations': {
            get: {
                tags: ['AI Chat'],
                summary: 'List recent conversations',
                parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } }],
                responses: {
                    200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { conversations: { type: 'array', items: { type: 'object', properties: { conversation_id: { type: 'string' }, title: { type: 'string' }, timestamp: { type: 'integer' } } } } } } } } },
                },
            },
        },
        '/chat/conversations/{id}': {
            delete: {
                tags: ['AI Chat'],
                summary: 'Delete a conversation',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: {
                    200: { description: 'Deleted', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string' } } } } } },
                },
            },
        },
        '/chat/search': {
            post: {
                tags: ['AI Chat'],
                summary: 'AI-powered chat search (legacy)',
                deprecated: true,
                description: 'Deprecated. Use POST /chat instead.',
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', properties: { query: { type: 'string' }, stream: { type: 'boolean', description: 'Enable SSE streaming' } }, required: ['query'] } } },
                },
                responses: {
                    200: { description: 'OK (JSON or SSE stream)', content: { 'application/json': { schema: { type: 'object', properties: { answer: { type: 'string' } } } } } },
                },
            },
        },

        // ---- Trash ----
        '/trash': {
            get: {
                tags: ['Trash'],
                summary: 'List trashed items',
                parameters: [
                    { name: 'type', in: 'query', schema: { type: 'string', enum: ['notes', 'memories', 'urls'] } },
                    { $ref: '#/components/parameters/page' },
                    { $ref: '#/components/parameters/limit' },
                ],
                responses: {
                    200: { description: 'OK', content: { 'application/json': { schema: { type: 'object' } } } },
                },
            },
            delete: {
                tags: ['Trash'],
                summary: 'Empty trash',
                parameters: [{ name: 'confirm', in: 'query', required: true, schema: { type: 'string', enum: ['true'] } }],
                responses: {
                    200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string' }, deleted: { type: 'integer' } } } } } },
                },
            },
        },
        '/trash/count': {
            get: {
                tags: ['Trash'],
                summary: 'Get trash item count',
                responses: {
                    200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { count: { type: 'integer' } } } } } },
                },
            },
        },
        '/trash/restore': {
            post: {
                tags: ['Trash'],
                summary: 'Restore a trashed item',
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', properties: { type: { type: 'string', enum: ['notes', 'memories', 'urls'] }, id: { type: 'string' } }, required: ['type', 'id'] } } },
                },
                responses: {
                    200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string' }, item: { type: 'object' } } } } } },
                    404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                },
            },
        },
        '/trash/{type}/{id}': {
            delete: {
                tags: ['Trash'],
                summary: 'Permanently delete a trashed item',
                parameters: [
                    { name: 'type', in: 'path', required: true, schema: { type: 'string', enum: ['notes', 'memories', 'urls'] } },
                    { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
                ],
                responses: {
                    200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string' } } } } } },
                    404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                },
            },
        },
        '/trash/batch/restore': {
            post: {
                tags: ['Trash'],
                summary: 'Batch restore trashed items',
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { type: { type: 'string' }, id: { type: 'string' } } } } }, required: ['items'] } } },
                },
                responses: {
                    200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string' }, restored: { type: 'integer' } } } } } },
                },
            },
        },
        '/trash/batch/delete': {
            post: {
                tags: ['Trash'],
                summary: 'Batch permanently delete trashed items',
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { type: { type: 'string' }, id: { type: 'string' } } } } }, required: ['items'] } } },
                },
                responses: {
                    200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string' }, deleted: { type: 'integer' } } } } } },
                },
            },
        },
        '/links': {
            post: {
                tags: ['Graph'],
                summary: 'Create a link between two items',
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object', properties: { source_id: { type: 'string' }, source_type: { type: 'string', enum: ['notes', 'memory', 'urls'] }, target_id: { type: 'string' }, target_type: { type: 'string', enum: ['notes', 'memory', 'urls'] }, label: { type: 'string' } }, required: ['source_id', 'source_type', 'target_id', 'target_type'] } } },
                },
                responses: {
                    201: { description: 'Link created', content: { 'application/json': { schema: { type: 'object', properties: { link: { $ref: '#/components/schemas/GraphLink' } } } } } },
                    409: { description: 'Link already exists' },
                },
            },
        },
        '/links/{id}': {
            delete: {
                tags: ['Graph'],
                summary: 'Delete a link',
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                responses: {
                    200: { description: 'Link deleted' },
                    404: { description: 'Link not found' },
                },
            },
        },
        '/links/{itemId}': {
            get: {
                tags: ['Graph'],
                summary: 'Get all links for an item',
                parameters: [{ name: 'itemId', in: 'path', required: true, schema: { type: 'string' } }],
                responses: {
                    200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { links: { type: 'array', items: { $ref: '#/components/schemas/GraphLink' } } } } } } },
                },
            },
        },
        '/graph': {
            get: {
                tags: ['Graph'],
                summary: 'Get the knowledge graph data (nodes and edges)',
                parameters: [
                    { name: 'project_id', in: 'query', schema: { type: 'string' }, description: 'Filter by project' },
                    { name: 'include_tags', in: 'query', schema: { type: 'string', default: 'true' }, description: 'Include tag-based edges' },
                    { name: 'include_semantic', in: 'query', schema: { type: 'string', default: 'false' }, description: 'Include semantic similarity edges' },
                    { name: 'semantic_threshold', in: 'query', schema: { type: 'number', default: 0.7 }, description: 'Semantic similarity threshold' },
                ],
                responses: {
                    200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { nodes: { type: 'array', items: { type: 'object' } }, edges: { type: 'array', items: { type: 'object' } } } } } } },
                },
            },
        },
    },
};

export default swaggerSpec;
