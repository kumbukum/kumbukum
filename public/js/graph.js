/* global api, cytoscape */

(function () {
    'use strict';

    const TYPE_COLORS = {
        notes: '#4A90D9',
        memory: '#50C878',
        urls: '#E8943A',
    };
    const TYPE_SHAPES = {
        notes: 'ellipse',
        memory: 'diamond',
        urls: 'round-rectangle',
    };
    const EDGE_STYLES = {
        manual: { lineStyle: 'solid', color: '#888' },
        tag: { lineStyle: 'dashed', color: '#50C878' },
        semantic: { lineStyle: 'dotted', color: '#E8943A' },
    };

    let cy = null;
    let state = {
        includeManual: true,
        includeTags: true,
        includeSemantic: false,
        projectId: '',
    };

    function initCytoscape() {
        cy = cytoscape({
            container: document.getElementById('graph-container'),
            style: [
                {
                    selector: 'node',
                    style: {
                        label: 'data(label)',
                        'text-valign': 'bottom',
                        'text-margin-y': 6,
                        'font-size': 11,
                        'text-max-width': 100,
                        'text-wrap': 'ellipsis',
                        width: 30,
                        height: 30,
                        'background-color': 'data(color)',
                        shape: 'data(shape)',
                        'border-width': 2,
                        'border-color': '#fff',
                    },
                },
                {
                    selector: 'node:selected',
                    style: {
                        'border-color': '#333',
                        'border-width': 3,
                    },
                },
                {
                    selector: 'edge',
                    style: {
                        width: 1.5,
                        'line-color': 'data(color)',
                        'line-style': 'data(lineStyle)',
                        'curve-style': 'bezier',
                        'target-arrow-shape': 'none',
                        opacity: 0.6,
                    },
                },
                {
                    selector: 'edge[label]',
                    style: {
                        label: 'data(label)',
                        'font-size': 9,
                        'text-rotation': 'autorotate',
                        'text-margin-y': -8,
                        color: '#999',
                    },
                },
                {
                    selector: '.highlighted',
                    style: {
                        'border-color': '#ff6600',
                        'border-width': 4,
                    },
                },
                {
                    selector: '.dimmed',
                    style: {
                        opacity: 0.15,
                    },
                },
            ],
            layout: { name: 'grid' },
            minZoom: 0.1,
            maxZoom: 5,
        });

        cy.on('tap', 'node', onNodeClick);
        cy.on('tap', function (evt) {
            if (evt.target === cy) clearSelection();
        });
    }

    function onNodeClick(evt) {
        const node = evt.target;
        const data = node.data();

        // Highlight neighborhood
        cy.elements().removeClass('highlighted dimmed');
        const neighborhood = node.neighborhood().add(node);
        cy.elements().not(neighborhood).addClass('dimmed');
        node.addClass('highlighted');

        // Show info panel
        const panel = document.getElementById('graph-info-panel');
        const typeLabel = { notes: 'Note', memory: 'Memory', urls: 'URL' };
        const connections = node.neighborhood('node').length;
        const detailUrl = data.type === 'notes' ? '/notes' : data.type === 'urls' ? '/urls' : '/memories';

        panel.innerHTML = `
            <div class="p-2">
                <span class="badge" style="background:${data.color}">${typeLabel[data.type] || data.type}</span>
                <h6 class="mt-2 mb-1">${escapeHtml(data.label)}</h6>
                <p class="text-muted small mb-2">${connections} connection${connections !== 1 ? 's' : ''}</p>
                <a href="${detailUrl}" class="btn btn-sm btn-outline-primary">
                    <i class="bi bi-arrow-right me-1"></i>Go to ${typeLabel[data.type] || 'item'}
                </a>
                <hr>
                <h6 class="small text-muted">Connections</h6>
                <ul class="list-unstyled small">
                    ${node.neighborhood('node').map(n => `<li class="mb-1"><span class="graph-legend-dot" style="background:${n.data('color')}"></span>${escapeHtml(n.data('label'))}</li>`).join('')}
                </ul>
            </div>
        `;
    }

    function clearSelection() {
        cy.elements().removeClass('highlighted dimmed');
        document.getElementById('graph-info-panel').innerHTML = `
            <div class="text-muted small text-center py-5">
                <i class="bi bi-cursor d-block fs-3 mb-2"></i>
                Click a node to see details
            </div>
        `;
    }

    async function loadGraph() {
        const params = new URLSearchParams();
        if (state.projectId) params.set('project_id', state.projectId);
        params.set('include_tags', state.includeTags);
        params.set('include_semantic', state.includeSemantic);

        try {
            const data = await api('GET', `/graph?${params.toString()}`);
            renderGraph(data);
        } catch (err) {
            console.error('Failed to load graph:', err);
        }
    }

    function renderGraph(data) {
        const elements = [];

        // Nodes
        for (const node of data.nodes) {
            elements.push({
                data: {
                    id: node.id,
                    label: node.name || 'Untitled',
                    type: node.type,
                    color: TYPE_COLORS[node.type] || '#999',
                    shape: TYPE_SHAPES[node.type] || 'ellipse',
                },
            });
        }

        // Edges
        for (const edge of data.edges) {
            if (!state.includeManual && edge.type === 'manual') continue;
            if (!state.includeTags && edge.type === 'tag') continue;
            if (!state.includeSemantic && edge.type === 'semantic') continue;

            const style = EDGE_STYLES[edge.type] || EDGE_STYLES.manual;
            elements.push({
                data: {
                    id: `e-${edge.source}-${edge.target}-${edge.type}`,
                    source: edge.source,
                    target: edge.target,
                    label: edge.label || '',
                    color: style.color,
                    lineStyle: style.lineStyle,
                },
            });
        }

        cy.elements().remove();
        cy.add(elements);

        if (elements.length > 0) {
            cy.layout({
                name: 'fcose',
                animate: true,
                animationDuration: 500,
                randomize: true,
                nodeDimensionsIncludeLabels: true,
                idealEdgeLength: 120,
                nodeRepulsion: 8000,
                edgeElasticity: 0.45,
                gravity: 0.25,
                padding: 30,
            }).run();
        }
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function bindControls() {
        const toggleBtn = (el, key) => {
            el.addEventListener('click', () => {
                state[key] = !state[key];
                el.classList.toggle('active', state[key]);
                loadGraph();
            });
        };

        toggleBtn(document.getElementById('toggle-manual'), 'includeManual');
        toggleBtn(document.getElementById('toggle-tags'), 'includeTags');
        toggleBtn(document.getElementById('toggle-semantic'), 'includeSemantic');

        document.getElementById('graph-project-filter').addEventListener('change', (e) => {
            state.projectId = e.target.value;
            loadGraph();
        });

        // Node search
        const searchInput = document.getElementById('graph-search');
        let searchTimeout;
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                const q = searchInput.value.trim().toLowerCase();
                if (!q) {
                    cy.elements().removeClass('highlighted dimmed');
                    return;
                }
                cy.elements().removeClass('highlighted dimmed');
                const matched = cy.nodes().filter(n => n.data('label').toLowerCase().includes(q));
                if (matched.length > 0) {
                    cy.elements().not(matched).addClass('dimmed');
                    matched.addClass('highlighted');
                    cy.fit(matched, 50);
                }
            }, 300);
        });

        // Listen for project changes from sidebar
        document.addEventListener('project-changed', (e) => {
            const projectId = e.detail?.projectId || '';
            document.getElementById('graph-project-filter').value = projectId;
            state.projectId = projectId;
            loadGraph();
        });
    }

    // Init
    document.addEventListener('DOMContentLoaded', () => {
        initCytoscape();
        bindControls();
        loadGraph();
    });
})();
