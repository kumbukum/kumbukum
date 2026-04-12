/**
 * Mock API client that records calls and returns configurable responses.
 * Used to test MCP tool handlers without a running backend.
 */
export function createMockApi(overrides = {}) {
    const calls = [];

    function record(method, path, body) {
        calls.push({ method, path, body });
    }

    const defaults = {
        get: async () => ({}),
        post: async () => ({}),
        put: async () => ({}),
        delete: async () => ({}),
    };

    const merged = { ...defaults, ...overrides };

    const api = {
        get(path) {
            record('GET', path);
            return merged.get(path);
        },
        post(path, body) {
            record('POST', path, body);
            return merged.post(path, body);
        },
        put(path, body) {
            record('PUT', path, body);
            return merged.put(path, body);
        },
        delete(path) {
            record('DELETE', path);
            return merged.delete(path);
        },
        /** All recorded calls */
        get calls() {
            return calls;
        },
        /** Last recorded call */
        get lastCall() {
            return calls[calls.length - 1];
        },
        /** Reset call history */
        reset() {
            calls.length = 0;
        },
    };

    return api;
}
