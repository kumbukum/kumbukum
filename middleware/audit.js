import * as auditService from '../services/audit_service.js';

/**
 * Map HTTP method + path to audit action/resource.
 * Returns null for routes that shouldn't be audited.
 */
const ROUTE_MAP = [
    // Notes
    { method: 'POST', pattern: /^\/notes\/import$/, action: 'import', resource: 'note' },
    { method: 'POST', pattern: /^\/notes\/search$/, action: 'search', resource: 'note' },
    { method: 'POST', pattern: /^\/notes$/, action: 'create', resource: 'note' },
    { method: 'PUT', pattern: /^\/notes\/([^/]+)$/, action: 'update', resource: 'note', idGroup: 1 },
    { method: 'DELETE', pattern: /^\/notes\/([^/]+)$/, action: 'delete', resource: 'note', idGroup: 1 },

    // Memory
    { method: 'POST', pattern: /^\/memories\/search$/, action: 'search', resource: 'memory' },
    { method: 'POST', pattern: /^\/memories$/, action: 'create', resource: 'memory' },
    { method: 'PUT', pattern: /^\/memories\/([^/]+)$/, action: 'update', resource: 'memory', idGroup: 1 },
    { method: 'DELETE', pattern: /^\/memories\/([^/]+)$/, action: 'delete', resource: 'memory', idGroup: 1 },

    // URLs
    { method: 'POST', pattern: /^\/urls\/search$/, action: 'search', resource: 'url' },
    { method: 'POST', pattern: /^\/urls$/, action: 'create', resource: 'url' },
    { method: 'PUT', pattern: /^\/urls\/([^/]+)$/, action: 'update', resource: 'url', idGroup: 1 },
    { method: 'DELETE', pattern: /^\/urls\/([^/]+)$/, action: 'delete', resource: 'url', idGroup: 1 },

    // Projects
    { method: 'POST', pattern: /^\/projects$/, action: 'create', resource: 'project' },
    { method: 'PUT', pattern: /^\/projects\/([^/]+)$/, action: 'update', resource: 'project', idGroup: 1 },
    { method: 'DELETE', pattern: /^\/projects\/([^/]+)$/, action: 'delete', resource: 'project', idGroup: 1 },

    // Links
    { method: 'POST', pattern: /^\/links$/, action: 'create', resource: 'link' },
    { method: 'DELETE', pattern: /^\/links\/([^/]+)$/, action: 'delete', resource: 'link', idGroup: 1 },

    // Batch operations
    { method: 'POST', pattern: /^\/batch\/delete$/, action: 'delete', resource: 'trash' },
    { method: 'POST', pattern: /^\/batch\/move$/, action: 'update', resource: 'note' },
    { method: 'POST', pattern: /^\/batch\/copy$/, action: 'create', resource: 'note' },

    // Trash
    { method: 'POST', pattern: /^\/trash\/restore$/, action: 'restore', resource: 'trash' },
    { method: 'POST', pattern: /^\/trash\/batch\/restore$/, action: 'restore', resource: 'trash' },
    { method: 'POST', pattern: /^\/trash\/batch\/delete$/, action: 'delete', resource: 'trash' },
    { method: 'DELETE', pattern: /^\/trash\/([^/]+)\/([^/]+)$/, action: 'delete', resource: 'trash', idGroup: 2 },
    { method: 'DELETE', pattern: /^\/trash$/, action: 'delete', resource: 'trash' },

    // Profile & tokens
    { method: 'PUT', pattern: /^\/profile$/, action: 'update', resource: 'user' },
    { method: 'POST', pattern: /^\/tokens$/, action: 'create', resource: 'user' },
    { method: 'DELETE', pattern: /^\/tokens\/([^/]+)$/, action: 'delete', resource: 'user', idGroup: 1 },

    // Passkeys
    { method: 'PATCH', pattern: /^\/passkeys\/([^/]+)$/, action: 'update', resource: 'passkey', idGroup: 1 },
    { method: 'DELETE', pattern: /^\/passkeys\/([^/]+)$/, action: 'delete', resource: 'passkey', idGroup: 1 },

    // 2FA
    { method: 'POST', pattern: /^\/2fa\/disable$/, action: 'update', resource: 'user' },

    // Search
    { method: 'POST', pattern: /^\/search\/knowledge$/, action: 'search', resource: 'note' },

    // Chat
    { method: 'POST', pattern: /^\/chat$/, action: 'search', resource: 'conversation' },
    { method: 'DELETE', pattern: /^\/chat\/conversations\/([^/]+)$/, action: 'delete', resource: 'conversation', idGroup: 1 },

    // Reindex
    { method: 'POST', pattern: /^\/reindex$/, action: 'reindex', resource: 'note' },

    // Export
    { method: 'POST', pattern: /^\/export$/, action: 'export', resource: 'note' },
];

function matchRoute(method, routePath) {
    for (const route of ROUTE_MAP) {
        if (route.method !== method) continue;
        const match = routePath.match(route.pattern);
        if (match) {
            return {
                action: route.action,
                resource: route.resource,
                resource_id: route.idGroup ? match[route.idGroup] : undefined,
            };
        }
    }
    return null;
}

function detectChannel(req) {
    if (req.headers['x-mcp-client']) return 'mcp';
    if (req.headers.authorization) return 'api';
    return 'web';
}

/**
 * Audit logging middleware for API routes.
 * Logs completed mutating requests (non-GET, successful status).
 */
export function auditMiddleware(req, res, next) {
    res.on('finish', () => {
        if (res.statusCode >= 400) return;
        if (!req.userId) return;

        const routePath = req.route?.path
            ? req.baseUrl.replace(/^\/api\/v1/, '') + req.route.path
            : req.path;

        const matched = matchRoute(req.method, routePath);
        if (!matched) return;

        auditService.log({
            action: matched.action,
            resource: matched.resource,
            resource_id: matched.resource_id || req.params?.id,
            user_id: req.userId,
            host_id: req.host_id,
            channel: detectChannel(req),
            token_label: req.tokenLabel || undefined,
            mcp_client: req.headers['x-mcp-client'] || undefined,
            ip: req.ip,
            user_agent: req.headers['user-agent'],
        });
    });

    next();
}
