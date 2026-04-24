import { execFileSync } from 'node:child_process';

const {
	GH_TOKEN,
	GITHUB_REPOSITORY,
	IMAGE,
	TAG
} = process.env;

if (!GH_TOKEN) {
	throw new Error('GH_TOKEN is required');
}

if (!GITHUB_REPOSITORY) {
	throw new Error('GITHUB_REPOSITORY is required');
}

if (!TAG) {
	throw new Error('TAG is required');
}

const apiBase = 'https://api.github.com';

async function githubApi(path, options = {}) {
	const response = await fetch(`${apiBase}${path}`, {
		method: options.method || 'GET',
		headers: {
			accept: 'application/vnd.github+json',
			authorization: `Bearer ${GH_TOKEN}`,
			'content-type': 'application/json',
			'x-github-api-version': '2022-11-28'
		},
		body: options.body ? JSON.stringify(options.body) : undefined
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`GitHub API ${response.status} for ${path}: ${text}`);
	}

	return response.json();
}

function getPreviousTag() {
	const tags = execFileSync('git', ['tag', '--sort=-creatordate'], {
		encoding: 'utf8'
	})
		.split('\n')
		.map((tag) => tag.trim())
		.filter(Boolean);

	return tags.find((tag) => tag !== TAG) || '';
}

function collectReferences(generatedBody) {
	const references = new Map();
	let section = "What's Changed";

	for (const line of generatedBody.split('\n')) {
		const heading = line.match(/^#{2,6}\s+(.+?)\s*$/);

		if (heading) {
			section = heading[1].trim();
		}

		const matches = [
			...line.matchAll(/(?:issues|pull)\/(\d+)/g),
			...line.matchAll(/(^|[^A-Za-z0-9_])#(\d+)\b/g)
		];

		for (const match of matches) {
			const number = Number(match.at(-1));

			if (number && !references.has(number)) {
				references.set(number, section);
			}
		}
	}

	return references;
}

function markdownEscape(text) {
	return text.replaceAll('[', '\\[').replaceAll(']', '\\]');
}

function primaryLabel(issue, fallbackSection) {
	if (fallbackSection && fallbackSection !== "What's Changed") {
		return fallbackSection;
	}

	const label = issue.labels.find((item) => typeof item === 'string' || item.name);

	if (typeof label === 'string') {
		return label;
	}

	return label?.name || fallbackSection || "What's Changed";
}

function normalizeBody(body) {
	const text = (body || '').trim();

	if (!text) {
		return '_No details provided._';
	}

	return text;
}

function fullChangelogUrl(previousTag) {
	if (!previousTag) {
		return `https://github.com/${GITHUB_REPOSITORY}/commits/${TAG}`;
	}

	return `https://github.com/${GITHUB_REPOSITORY}/compare/${previousTag}...${TAG}`;
}

async function main() {
	const previousTag = getPreviousTag();
	const generatedNotesRequest = {
		tag_name: TAG
	};

	if (previousTag) {
		generatedNotesRequest.previous_tag_name = previousTag;
	}

	const generatedNotes = await githubApi(`/repos/${GITHUB_REPOSITORY}/releases/generate-notes`, {
		method: 'POST',
		body: generatedNotesRequest
	});

	const references = collectReferences(generatedNotes.body || '');
	const issues = [];

	for (const [number, section] of references) {
		const issue = await githubApi(`/repos/${GITHUB_REPOSITORY}/issues/${number}`);

		issues.push({
			...issue,
			section
		});
	}

	const groups = new Map();

	for (const issue of issues) {
		const group = primaryLabel(issue, issue.section);

		if (!groups.has(group)) {
			groups.set(group, []);
		}

		groups.get(group).push(issue);
	}

	const lines = [
		`Docker image: ${IMAGE || `ghcr.io/${GITHUB_REPOSITORY}:${TAG}`}`,
		'',
		"## What's Changed",
		''
	];

	if (groups.size === 0) {
		lines.push((generatedNotes.body || '_No generated release notes._').trim());
		lines.push('');
	} else {
		for (const [group, groupIssues] of groups) {
			lines.push(`### ${group}`);
			lines.push('');

			for (const issue of groupIssues) {
				lines.push(`#### [#${issue.number}: ${markdownEscape(issue.title)}](${issue.html_url})`);
				lines.push('');
				lines.push(normalizeBody(issue.body));
				lines.push('');
			}
		}
	}

	lines.push(`**Full Changelog**: ${fullChangelogUrl(previousTag)}`);
	lines.push('');

	process.stdout.write(lines.join('\n'));
}

await main();
