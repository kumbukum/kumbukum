import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import pug from 'pug';
import { fileURLToPath } from 'node:url';

import { Project } from '../model/project.js';
import { getProjectNames } from '../services/project_service.js';
import swaggerSpec from '../swagger.js';

function localPath(url) {
	return fileURLToPath(url);
}

describe('link search results', () => {
	const originalProjectFind = Project.find;

	afterEach(() => {
		Project.find = originalProjectFind;
	});

	it('resolves unique project IDs through a host-scoped lean query', async () => {
		const projectOneId = '507f1f77bcf86cd799439011';
		const projectTwoId = '507f1f77bcf86cd799439012';
		let receivedFilter;
		let receivedSelection;
		let usedLean = false;
		Project.find = (filter) => {
			receivedFilter = filter;
			return {
				select(selection) {
					receivedSelection = selection;
					return {
						lean: async () => {
							usedLean = true;
							return [
								{ _id: { toString: () => projectOneId }, name: 'Alpha' },
								{ _id: { toString: () => projectTwoId }, name: 'Beta' },
							];
						},
					};
				},
			};
		};

		const names = await getProjectNames('host-1', [projectOneId, projectOneId, projectTwoId, '', 'invalid-project-id']);

		assert.deepEqual(receivedFilter, { _id: { $in: [projectOneId, projectTwoId] }, host_id: 'host-1' });
		assert.equal(receivedSelection, '_id name');
		assert.equal(usedLean, true);
		assert.equal(names.get(projectOneId), 'Alpha');
		assert.equal(names.get(projectTwoId), 'Beta');
	});

	it('renders title, project, and update-time targets from a Pug template', () => {
		const render = pug.compileFile(localPath(new URL('../views/ajax/link_search_result.pug', import.meta.url)));
		const html = render();

		assert.match(html, /id="rm-link-result-template"/);
		assert.match(html, /rm-link-result-title/);
		assert.match(html, /rm-link-result-project/);
		assert.match(html, /rm-link-result-updated/);
	});

	it('populates search result metadata without building row HTML in JavaScript', () => {
		const source = fs.readFileSync(new URL('../public/js/chat.js', import.meta.url), 'utf8');

		assert.match(source, /result\.title \|\| result\.subject \|\| result\.url/);
		assert.match(source, /result\.project_name \|\| 'Deleted project'/);
		assert.match(source, /result\.updated_at \|\| result\.created_at/);
		assert.match(source, /dd\.replaceChildren\(\.\.\.resultElements\)/);
		assert.doesNotMatch(source, /dd\.innerHTML = filtered\.map/);
	});

	it('documents project names and update timestamps in the link-search response', () => {
		const responseSchema = swaggerSpec.paths['/search/all'].post.responses[200].content['application/json'].schema;
		const resultProperties = responseSchema.properties.results.items.properties;

		assert.equal(resultProperties.project_name.type, 'string');
		assert.equal(resultProperties.updated_at.type, 'integer');
		assert.equal(resultProperties.updated_at.description, 'Unix timestamp in seconds');
	});
});
