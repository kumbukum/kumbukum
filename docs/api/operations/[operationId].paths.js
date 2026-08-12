import { usePaths } from 'vitepress-openapi';
import spec from '../../.vitepress/data/openapi.json' with { type: 'json' };

const META_DESCRIPTION_MAX_LENGTH = 160;

function compactSentence(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '');
}

function truncateMetaDescription(value) {
    if (value.length <= META_DESCRIPTION_MAX_LENGTH) return value;

    const shortened = value.slice(0, META_DESCRIPTION_MAX_LENGTH - 1);
    const lastSpace = shortened.lastIndexOf(' ');
    return `${shortened.slice(0, lastSpace)}…`;
}

function buildMetaDescription({ summary, description, verb, path }) {
    const operationSummary = compactSentence(summary);
    const endpoint = `${verb.toUpperCase()} ${path}`;
    const detail = compactSentence(description) || 'Review authentication, parameters, request bodies, responses, and examples';
    let value = `${operationSummary}. ${endpoint}. ${detail}.`;

    if (value.length < 110) value = `${value} Review parameters, responses, and examples.`;
    return truncateMetaDescription(value);
}

export default {
    paths() {
        const operations = usePaths({ spec }).getPathsByVerbs();
        const summaryCounts = operations.reduce((counts, { summary }) => counts.set(summary, (counts.get(summary) || 0) + 1), new Map());

        return operations
            .map(({ operationId, summary, description, verb, path }) => {
                const endpoint = `${verb.toUpperCase()} ${path}`;
                return {
                    params: {
                        operationId,
                        seoTitle: summaryCounts.get(summary) > 1 ? `${summary} (${endpoint})` : summary,
                        seoDescription: buildMetaDescription({ summary, description, verb, path }),
                    },
                };
            });
    },
};
