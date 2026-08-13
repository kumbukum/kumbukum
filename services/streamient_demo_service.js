import { createHash } from 'node:crypto';

export const STREAMIENT_DEMO_DURATION_MS = 12 * 60 * 60 * 1000;
export const STREAMIENT_DEMO_READ_ONLY_MESSAGE = 'Demo mode is read-only. Visit /dashboard?demo=false to return to live data.';
export const STREAMIENT_DEMO_EXPIRED_MESSAGE = 'This demo session expired. Reloading live data.';

const STREAMIENT_DEMO_SESSION_KEY = 'streamientDemoAccounts';
const OWNER_EMAIL = 'maya@northstarlabs.com';
const OWNER_NAME = 'Maya Chen';

const CONTACTS = {
	priya: { name: 'Priya Shah', email: 'priya@brightfieldhq.com' },
	daniel: { name: 'Daniel Ruiz', email: 'daniel@harborcloud.io' },
	marcus: { name: 'Marcus Lee', email: 'marcus@ridgelineops.com' },
	theo: { name: 'Theo Martin', email: 'theo@signalstack.io' },
	victor: { name: 'Victor Alvarez', email: 'victor@evergreenfund.com' },
	olivia: { name: 'Olivia Park', email: 'olivia@willowpartners.co' },
};

const PROJECT_SPECS = [
	{ key: 'product', name: 'Product & Launch', color: '#6D5EF7', is_default: true, notes: 5, memory: 8, urls: 4, emails: 3 },
	{ key: 'research', name: 'Customer Research', color: '#22A06B', is_default: false, notes: 4, memory: 6, urls: 3, emails: 3 },
	{ key: 'operations', name: 'Company Operations', color: '#3388D6', is_default: false, notes: 3, memory: 4, urls: 2, emails: 3 },
];

const NOTE_SPECS = [
	{
		key: 'beta-launch-plan',
		project: 'product',
		title: 'Beta launch plan — August 26',
		tags: ['launch', 'decision', 'beta'],
		text: 'Northstar Labs will open the private beta on August 26 to 25 design partners.\n\nThe launch sequence starts with existing research partners, then expands through the Brightfield co-marketing list. Maya owns partner communication and Priya approves joint launch assets.\n\nSuccess means every invited team reaches a useful, source-backed answer within ten minutes.',
	},
	{
		key: 'launch-readiness-checklist',
		project: 'product',
		title: 'Launch readiness checklist',
		tags: ['launch', 'checklist'],
		text: 'Launch readiness\n\n- Finalize the 25-partner cohort.\n- Approve Brightfield copy and screenshots.\n- Confirm onboarding and source citations.\n- Test export and deletion.\n- Prepare the August 26 support schedule.',
	},
	{
		key: 'onboarding-design-review',
		project: 'product',
		title: 'Onboarding design review',
		tags: ['onboarding', 'product'],
		text: 'The first-run experience should begin with one project, three reviewed memories, and one connected AI tool. Avoid empty dashboards and configuration-heavy setup. The first guided question should demonstrate a cited answer from visible records.',
	},
	{
		key: 'harborcloud-integration-scope',
		project: 'product',
		title: 'HarborCloud integration scope',
		tags: ['integration', 'mcp', 'launch'],
		text: 'The first HarborCloud integration covers project listing, knowledge search, source retrieval, and memory creation through MCP. Daniel reserved the first week of August after the API scope is locked.',
	},
	{
		key: 'shared-inspectable-memory-positioning',
		project: 'product',
		title: 'Positioning: shared, inspectable memory',
		tags: ['positioning', 'memory'],
		text: 'Streamient is shared, inspectable memory for humans and AI. Teams can see the records an AI retrieves, correct them, connect sources, and reuse the same context across tools. It is memory infrastructure, not another chat wrapper.',
	},
	{
		key: 'ridgeline-pilot-interview',
		project: 'research',
		title: 'Ridgeline enterprise pilot interview',
		tags: ['customer-research', 'pilot', 'enterprise'],
		text: 'Ridgeline proposed a 60-day pilot for product and support. The team needs project-scoped retrieval, visible citations, clear deletion behavior, and an owner for every approved memory. Weekly active team usage will be the primary adoption signal.',
	},
	{
		key: 'beta-feedback-synthesis',
		project: 'research',
		title: 'Beta feedback synthesis',
		tags: ['customer-research', 'beta', 'feedback'],
		text: 'Across seven design-partner interviews, bulk triage was the most repeated workflow request. Source citations and project-scoped retrieval were the most repeated trust requirements. Teams preferred fewer durable records over automatic capture of every conversation.',
	},
	{
		key: 'source-citation-requirements',
		project: 'research',
		title: 'Source citation requirements',
		tags: ['customer-research', 'citations', 'trust'],
		text: 'Every generated answer should expose the records used, their project, and the last update time. Users must be able to open a source, correct it, and see connected evidence without leaving the workflow.',
	},
	{
		key: 'design-partner-interview-guide',
		project: 'research',
		title: 'Design partner interview guide',
		tags: ['customer-research', 'interviews'],
		text: 'Ask participants where important context currently lives, which AI tools need it, how they recognize stale context, who can approve corrections, and what proof they need before trusting an answer.',
	},
	{
		key: 'q3-operating-plan',
		project: 'operations',
		title: 'Q3 operating plan',
		tags: ['operations', 'planning'],
		text: 'Q3 priorities are the private beta, the Ridgeline pilot, and reliable source-backed retrieval. Keep the design-partner cohort intentionally small while the team validates onboarding, correction, export, and security workflows.',
	},
	{
		key: 'security-review-checklist',
		project: 'operations',
		title: 'Security review checklist',
		tags: ['security', 'enterprise', 'checklist'],
		text: 'Document tenant isolation, encryption, retention, deletion, export, subprocessors, access logging, and incident response. The Ridgeline questionnaire is due Friday and every answer needs a named owner.',
	},
	{
		key: 'board-reporting-definitions',
		project: 'operations',
		title: 'Board reporting definitions',
		tags: ['board', 'metrics', 'operations'],
		text: 'Report activation by cohort, weekly retained teams, expansion within a project, and source-backed answer completion. Do not combine invited accounts with teams that completed onboarding.',
	},
];

const MEMORY_SPECS = [
	['private-beta-date', 'product', 'Private beta opens August 26', 'The Northstar Labs private beta opens on August 26.', ['launch', 'decision', 'beta'], 'Launch planning review'],
	['design-partner-limit', 'product', 'Private beta is limited to 25 design partners', 'Keep the first cohort capped at 25 design partners so onboarding and support remain high touch.', ['launch', 'beta'], 'Launch planning review'],
	['intro-price', 'product', 'Introductory price stays $49/month through September', 'The Unlimited introductory price remains $49 per month through September. The later regular price is $99 per month.', ['pricing', 'decision', 'launch'], 'Pricing review'],
	['maya-partner-owner', 'product', 'Maya owns partner communication', 'Maya owns invitations, partner updates, and launch-day communication.', ['launch', 'owner'], 'Launch planning review'],
	['priya-asset-approval', 'product', 'Priya approves joint launch assets', 'Priya Shah at Brightfield gives final approval for the joint customer quote and launch assets.', ['launch', 'owner', 'brightfield'], 'Brightfield partnership thread'],
	['answers-show-sources', 'product', 'Every answer must expose its sources', 'AI answers must show the notes, memories, URLs, or emails used so a person can inspect and correct them.', ['citations', 'trust', 'product'], 'Onboarding design review'],
	['markdown-export', 'product', 'Exports remain Markdown-first', 'Notes and durable memories must remain exportable as readable Markdown without a proprietary viewer.', ['export', 'trust'], 'Product review'],
	['ten-minute-success', 'product', 'First onboarding success is a cited answer within ten minutes', 'A new design partner should reach a useful, source-backed answer within ten minutes of creating a project.', ['onboarding', 'metric'], 'Onboarding design review'],
	['bulk-triage-request', 'research', 'Bulk triage is the leading repeated request', 'Bulk triage was the most repeated workflow request across seven design-partner interviews.', ['feedback', 'customer-research'], 'Beta feedback synthesis'],
	['ridgeline-pilot-length', 'research', 'Ridgeline requested a 60-day pilot', 'Ridgeline proposed a 60-day evaluation with product and support users.', ['pilot', 'enterprise', 'ridgeline'], 'Ridgeline pilot interview'],
	['citations-block-adoption', 'research', 'Missing citations block adoption', 'Teams will not operationalize AI answers when they cannot inspect the underlying source records.', ['citations', 'trust', 'customer-research'], 'Customer research synthesis'],
	['project-scoped-retrieval', 'research', 'Customers want project-scoped retrieval', 'Design partners want retrieval constrained to the active project before any cross-project search.', ['retrieval', 'customer-research'], 'Customer research synthesis'],
	['security-answer-owners', 'research', 'Security answers need named owners', 'Enterprise security responses must identify the person responsible for keeping each answer current.', ['security', 'enterprise', 'owner'], 'Ridgeline pilot interview'],
	['pilot-success-metric', 'research', 'Pilot success uses weekly active team usage', 'Measure the Ridgeline pilot by weekly active team usage and completion of source-backed workflows.', ['pilot', 'metric'], 'Pilot planning'],
	['security-questionnaire-due', 'operations', 'Security questionnaire is due Friday', 'Ridgeline procurement needs the completed security questionnaire by Friday before pilot kickoff.', ['security', 'deadline'], 'Ridgeline procurement email'],
	['cohort-retention-reporting', 'operations', 'Use cohort retention in board reporting', 'Board reporting should separate invited accounts, activated teams, and retained weekly teams by cohort.', ['board', 'metrics'], 'Board reporting review'],
	['harborcloud-scope-deadline', 'operations', 'Lock HarborCloud API scope before integration week', 'Confirm the MCP and API scope before HarborCloud reserves engineering time in the first week of August.', ['integration', 'deadline'], 'HarborCloud email'],
	['board-evidence', 'operations', 'Board deck needs retention and expansion evidence', 'Slides six and nine need clearer cohort-retention and project-expansion evidence before Monday.', ['board', 'metrics'], 'Evergreen Fund review'],
].map(([key, project, title, content, tags, source]) => ({ key, project, title, content, tags, source }));

const URL_SPECS = [
	['private-beta-brief', 'product', 'Northstar private beta launch brief', 'https://northstarlabs.com/launch/private-beta', 'Launch narrative, audience, schedule, owners, and success criteria for the August 26 private beta.', ['launch', 'beta']],
	['launch-checklist', 'product', 'Product launch checklist', 'https://northstarlabs.com/playbooks/product-launch', 'The shared checklist used by Northstar Labs and Brightfield for launch readiness.', ['launch', 'checklist']],
	['mcp-integration-guide', 'product', 'MCP integration guide', 'https://northstarlabs.com/docs/mcp-integration', 'The approved MCP endpoints and test workflow for the HarborCloud integration.', ['integration', 'mcp']],
	['beta-onboarding-brief', 'product', 'Beta onboarding brief', 'https://northstarlabs.com/product/beta-onboarding', 'The ten-minute onboarding path for design partners.', ['onboarding', 'beta']],
	['ridgeline-requirements', 'research', 'Ridgeline pilot requirements', 'https://northstarlabs.com/research/ridgeline-pilot', 'Project scope, security requirements, adoption signals, and owners for the enterprise pilot.', ['pilot', 'enterprise']],
	['interview-synthesis', 'research', 'Design-partner interview synthesis', 'https://northstarlabs.com/research/design-partners', 'Findings from seven interviews covering retrieval, trust, corrections, and workflow requests.', ['customer-research', 'feedback']],
	['citation-patterns', 'research', 'Source citation design patterns', 'https://northstarlabs.com/research/source-citations', 'Interaction patterns for showing evidence and correcting records behind AI answers.', ['citations', 'trust']],
	['security-review-guide', 'operations', 'Enterprise security review guide', 'https://northstarlabs.com/security/review-guide', 'Owners and evidence for common enterprise security questions.', ['security', 'enterprise']],
	['board-metrics', 'operations', 'Board reporting metrics', 'https://northstarlabs.com/operations/board-metrics', 'Definitions for activation, cohort retention, project expansion, and workflow completion.', ['board', 'metrics']],
].map(([key, project, title, url, description, tags]) => ({ key, project, title, url, description, tags }));

const EMAIL_SPECS = [
	['brightfield-launch', 'product', 'Brightfield launch partnership', 'priya', 'The co-marketing plan is approved. Brightfield only needs final confirmation on the customer quote and the two new product screenshots.', ['launch', 'brightfield']],
	['harborcloud-timeline', 'product', 'HarborCloud integration timeline', 'daniel', 'Engineering can reserve the first week of August once the MCP and API scope is locked.', ['integration', 'launch']],
	['launch-assets', 'product', 'Final approval for launch assets', 'priya', 'The revised launch assets are with Brightfield brand review. I will send final approval by Thursday.', ['launch']],
	['enterprise-pilot', 'research', 'Enterprise pilot terms', 'marcus', 'Ridgeline approved the pilot scope and proposed a 60-day evaluation period for product and support.', ['pilot', 'enterprise']],
	['beta-feedback', 'research', 'Beta feedback synthesis', 'theo', 'The latest interviews repeat two themes: bulk triage saves the most time, and citations are required for trust.', ['feedback', 'beta']],
	['customer-advisory', 'research', 'Customer advisory invite', 'marcus', 'Ridgeline is confirming an executive participant for the design-partner advisory session.', ['customer-research', 'enterprise']],
	['security-questionnaire', 'operations', 'Security questionnaire due Friday', 'marcus', 'Procurement opened the security review and needs the completed questionnaire before pilot kickoff.', ['security', 'enterprise']],
	['board-deck', 'operations', 'Board deck edits for Monday', 'victor', 'Slides six and nine need clearer evidence for cohort retention and project expansion.', ['board', 'metrics']],
	['seed-follow-up', 'operations', 'Seed round follow-up', 'olivia', 'The partnership reviewed the memo and wants to discuss the go-to-market assumptions and design-partner conversion.', ['investors', 'operations']],
].map(([key, project, subject, contact, body, labels]) => ({ key, project, subject, contact, body, labels }));

const LINK_SPECS = [
	['notes', 'beta-launch-plan', 'memory', 'private-beta-date', 'sets date'],
	['notes', 'beta-launch-plan', 'memory', 'intro-price', 'includes decision'],
	['notes', 'launch-readiness-checklist', 'emails', 'brightfield-launch', 'informed by'],
	['notes', 'harborcloud-integration-scope', 'urls', 'mcp-integration-guide', 'references'],
	['notes', 'ridgeline-pilot-interview', 'memory', 'ridgeline-pilot-length', 'confirms'],
	['notes', 'beta-feedback-synthesis', 'memory', 'bulk-triage-request', 'supports'],
	['notes', 'source-citation-requirements', 'memory', 'citations-block-adoption', 'supports'],
	['notes', 'security-review-checklist', 'emails', 'security-questionnaire', 'requested by'],
	['notes', 'board-reporting-definitions', 'memory', 'cohort-retention-reporting', 'defines'],
	['notes', 'board-reporting-definitions', 'emails', 'board-deck', 'requested by'],
];

const SCENE_SPECS = {
	overview: { path: '/dashboard', project: 'product' },
	search: { path: '/dashboard', project: 'product', chat_query: 'What did we decide about the beta launch?' },
	notes: { path: '/notes', project: 'product', open_type: 'notes', open_key: 'beta-launch-plan' },
	memory: { path: '/memories', project: 'product', open_type: 'memory', open_key: 'intro-price' },
	urls: { path: '/urls', project: 'product', open_type: 'urls', open_key: 'private-beta-brief' },
	emails: { path: '/emails', project: 'product', open_type: 'emails', open_key: 'brightfield-launch' },
	graph: { path: '/graph', project: 'product', focus_type: 'notes', focus_key: 'beta-launch-plan' },
};

function demoObjectId(value) {
	return createHash('sha256').update(`streamient-demo:${value}`).digest('hex').slice(0, 24);
}

function isoAt(anchorMs, hoursAgo) {
	return new Date(anchorMs - (hoursAgo * 60 * 60 * 1000)).toISOString();
}

function unixSeconds(value) {
	return Math.floor(Date.parse(value) / 1000);
}

function escapeHtml(value) {
	return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function htmlFromText(value) {
	return String(value || '').split(/\n{2,}/).map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`).join('');
}

function cleanText(value) {
	return String(value || '').replace(/\s+/g, ' ').trim();
}

function cloneSessionDemoAccounts(session) {
	const value = session?.[STREAMIENT_DEMO_SESSION_KEY];
	return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

function normalizeScene(value) {
	const scene = String(value || '').trim().toLowerCase();
	return Object.prototype.hasOwnProperty.call(SCENE_SPECS, scene) ? scene : 'overview';
}

function validStreamientDemoSessionEntry(req) {
	const authorization = String(req?.headers?.authorization || req?.headers?.['x-access-token'] || req?.headers?.['access-token'] || '');
	if (authorization) return null;
	const hostId = String(req?.host_id || req?.session?.host_id || '');
	if (!req?.session || !hostId) return null;
	const entry = cloneSessionDemoAccounts(req.session)[hostId];
	const activatedAt = Date.parse(entry?.activated_at || '');
	const expiresAt = Date.parse(entry?.expires_at || '');
	if (!Number.isFinite(activatedAt) || !Number.isFinite(expiresAt) || expiresAt - activatedAt !== STREAMIENT_DEMO_DURATION_MS) return null;
	return { activatedAt, expiresAt };
}

export function hasStreamientDemoSessionEntry(req) {
	return Boolean(validStreamientDemoSessionEntry(req));
}

export function hasActiveStreamientDemoSession(req, now = Date.now()) {
	const entry = validStreamientDemoSessionEntry(req);
	return Boolean(entry && entry.expiresAt > now);
}

export function activateStreamientDemoSession(req, scene = 'overview', now = Date.now()) {
	if (req?.authMethod !== 'session' || !req.session || !req.host_id) return null;
	const accounts = cloneSessionDemoAccounts(req.session);
	const hostId = String(req.host_id);
	const existing = accounts[hostId];
	const existingActivatedAt = Date.parse(existing?.activated_at || '');
	const existingExpiresAt = Date.parse(existing?.expires_at || '');
	const activeExisting = Number.isFinite(existingActivatedAt) && Number.isFinite(existingExpiresAt) && existingExpiresAt > now && existingExpiresAt - existingActivatedAt === STREAMIENT_DEMO_DURATION_MS;
	const activatedAt = activeExisting ? existingActivatedAt : now;
	const entry = {
		activated_at: new Date(activatedAt).toISOString(),
		expires_at: new Date(activeExisting ? existingExpiresAt : now + STREAMIENT_DEMO_DURATION_MS).toISOString(),
		scene: normalizeScene(scene),
	};
	accounts[hostId] = entry;
	req.session[STREAMIENT_DEMO_SESSION_KEY] = accounts;
	return entry;
}

export function deactivateStreamientDemoSession(req) {
	if (req?.authMethod !== 'session' || !req.session || !req.host_id) return false;
	const accounts = cloneSessionDemoAccounts(req.session);
	const hostId = String(req.host_id);
	if (!Object.prototype.hasOwnProperty.call(accounts, hostId)) return false;
	delete accounts[hostId];
	req.session[STREAMIENT_DEMO_SESSION_KEY] = accounts;
	return true;
}

export function getStreamientDemoSession(req, now = Date.now()) {
	if (req?.authMethod !== 'session' || !req.session || !req.host_id) return null;
	const accounts = cloneSessionDemoAccounts(req.session);
	const hostId = String(req.host_id);
	const entry = accounts[hostId];
	if (!entry) return null;
	const activatedAt = Date.parse(entry.activated_at || '');
	const expiresAt = Date.parse(entry.expires_at || '');
	if (!Number.isFinite(activatedAt) || !Number.isFinite(expiresAt) || expiresAt - activatedAt !== STREAMIENT_DEMO_DURATION_MS) {
		delete accounts[hostId];
		req.session[STREAMIENT_DEMO_SESSION_KEY] = accounts;
		return null;
	}
	if (expiresAt <= now) {
		req.streamientDemoExpired = true;
		return null;
	}
	return {
		host_id: hostId,
		activated_at: new Date(activatedAt).toISOString(),
		expires_at: new Date(expiresAt).toISOString(),
		anchor_ms: activatedAt,
		scene: normalizeScene(entry.scene),
	};
}

export function handleStreamientDemoToggle(req, res, next) {
	const value = typeof req.query?.demo === 'string' ? req.query.demo.toLowerCase() : '';
	if (req.method !== 'GET' || !['true', 'false'].includes(value) || req.authMethod !== 'session') return next();
	req.managaniSkip = true;
	let redirectPath = '/dashboard';
	if (value === 'true') {
		const scene = normalizeScene(req.query.scene);
		activateStreamientDemoSession(req, scene);
		redirectPath = SCENE_SPECS[scene].path;
	} else {
		deactivateStreamientDemoSession(req);
	}
	const redirect = () => res.redirect(redirectPath);
	if (typeof req.session?.save !== 'function') return redirect();
	return req.session.save((err) => err ? next(err) : redirect());
}

function buildProjects(anchorMs, hostId, ownerId) {
	return PROJECT_SPECS.map((spec, index) => ({
		_id: demoObjectId(`project:${spec.key}`),
		name: spec.name,
		owner: ownerId,
		host_id: hostId,
		color: spec.color,
		email_filter: '',
		is_default: spec.is_default,
		is_active: true,
		createdAt: isoAt(anchorMs, 24 * (120 - index * 10)),
		updatedAt: isoAt(anchorMs, 24 * (7 - index)),
		key: spec.key,
	}));
}

function buildNotes(anchorMs, hostId, ownerId, projectIds) {
	return NOTE_SPECS.map((spec, index) => {
		const updatedAt = isoAt(anchorMs, 5 + index * 7);
		return {
			_id: demoObjectId(`note:${spec.key}`),
			title: spec.title,
			content: htmlFromText(spec.text),
			text_content: spec.text,
			tags: [...spec.tags],
			project: projectIds[spec.project],
			owner: ownerId,
			host_id: hostId,
			is_indexed: true,
			in_trash: false,
			trashed_at: null,
			createdAt: isoAt(anchorMs, 120 + index * 8),
			updatedAt,
			key: spec.key,
		};
	});
}

function buildMemories(anchorMs, hostId, ownerId, projectIds) {
	return MEMORY_SPECS.map((spec, index) => ({
		_id: demoObjectId(`memory:${spec.key}`),
		title: spec.title,
		content: spec.content,
		text_content: spec.content,
		tags: [...spec.tags],
		source: spec.source,
		project: projectIds[spec.project],
		owner: ownerId,
		host_id: hostId,
		is_indexed: true,
		in_trash: false,
		trashed_at: null,
		createdAt: isoAt(anchorMs, 90 + index * 6),
		updatedAt: isoAt(anchorMs, 3 + index * 5),
		key: spec.key,
	}));
}

function buildUrls(anchorMs, hostId, ownerId, projectIds) {
	return URL_SPECS.map((spec, index) => ({
		_id: demoObjectId(`url:${spec.key}`),
		url: spec.url,
		normalized_url: spec.url,
		title: spec.title,
		description: spec.description,
		og_image: '',
		screenshot: '',
		screenshot_url: '',
		text_content: `${spec.title}. ${spec.description}`,
		tags: [...spec.tags],
		crawl_enabled: index % 3 === 0,
		last_crawled: isoAt(anchorMs, 12 + index),
		project: projectIds[spec.project],
		owner: ownerId,
		host_id: hostId,
		is_indexed: true,
		in_trash: false,
		trashed_at: null,
		createdAt: isoAt(anchorMs, 150 + index * 9),
		updatedAt: isoAt(anchorMs, 12 + index * 6),
		key: spec.key,
	}));
}

function buildUrlPages(urls, anchorMs) {
	const pages = {};
	for (const url of urls) {
		if (!url.crawl_enabled) {
			pages[url._id] = [];
			continue;
		}
		pages[url._id] = [
			{ id: demoObjectId(`page:${url.key}:overview`), url: `${url.url}/overview`, title: `${url.title}: overview`, crawled_at: unixSeconds(isoAt(anchorMs, 10)) },
			{ id: demoObjectId(`page:${url.key}:checklist`), url: `${url.url}/checklist`, title: `${url.title}: checklist`, crawled_at: unixSeconds(isoAt(anchorMs, 11)) },
		];
	}
	return pages;
}

function buildEmails(anchorMs, hostId, ownerId, projectIds) {
	const roots = [];
	const threads = {};
	const all = [];
	EMAIL_SPECS.forEach((spec, index) => {
		const contact = CONTACTS[spec.contact];
		const firstId = demoObjectId(`email:${spec.key}:1`);
		const latestId = demoObjectId(`email:${spec.key}:2`);
		const threadKey = `northstar-${spec.key}@northstarlabs.com`;
		const firstMessageId = `<northstar-${spec.key}-1@northstarlabs.com>`;
		const latestMessageId = `<northstar-${spec.key}-2@northstarlabs.com>`;
		const firstText = `Hi ${contact.name.split(' ')[0]},\n\nSharing the latest Northstar Labs context for ${spec.subject.toLowerCase()}. Please send any final decisions or blockers so we can keep the source record current.\n\nBest,\nMaya`;
		const latestText = `Hi Maya,\n\n${spec.body}\n\nBest,\n${contact.name.split(' ')[0]}`;
		const common = {
			subject: spec.subject,
			cc: [],
			bcc: [],
			source: 'api',
			mailbox: 'inbox',
			labels: [...spec.labels],
			project: projectIds[spec.project],
			owner: ownerId,
			host_id: hostId,
			is_indexed: true,
			in_trash: false,
			trashed_at: null,
			thread_key: threadKey,
		};
		const first = {
			...common,
			_id: firstId,
			message_id: firstMessageId,
			references: [],
			in_reply_to: '',
			from: [`${OWNER_NAME} <${OWNER_EMAIL}>`],
			to: [`${contact.name} <${contact.email}>`],
			text_content: firstText,
			html_content: htmlFromText(firstText),
			html_content_has_remote_images: false,
			attachment_text_content: '',
			createdAt: isoAt(anchorMs, 80 + index * 9),
			updatedAt: isoAt(anchorMs, 80 + index * 9),
		};
		const latest = {
			...common,
			_id: latestId,
			message_id: latestMessageId,
			references: [firstMessageId],
			in_reply_to: firstMessageId,
			from: [`${contact.name} <${contact.email}>`],
			to: [`${OWNER_NAME} <${OWNER_EMAIL}>`],
			text_content: latestText,
			html_content: htmlFromText(latestText),
			html_content_has_remote_images: false,
			attachment_text_content: '',
			createdAt: isoAt(anchorMs, 2 + index * 6),
			updatedAt: isoAt(anchorMs, 2 + index * 6),
			excerpt: spec.body,
			display_date: isoAt(anchorMs, 2 + index * 6),
			thread_source_ids: [firstId, latestId],
			key: spec.key,
		};
		const thread = [first, latest];
		threads[firstId] = thread;
		threads[latestId] = thread;
		roots.push(latest);
		all.push(...thread);
	});
	return { roots, threads, all };
}

function recordMaps(fixtures) {
	return {
		notes: new Map(fixtures.notes.map((item) => [item.key, item])),
		memory: new Map(fixtures.memories.map((item) => [item.key, item])),
		urls: new Map(fixtures.urls.map((item) => [item.key, item])),
		emails: new Map(fixtures.emails.map((item) => [item.key, item])),
	};
}

function buildLinks(fixtures, hostId, ownerId) {
	const maps = recordMaps(fixtures);
	return LINK_SPECS.map(([sourceType, sourceKey, targetType, targetKey, label], index) => {
		const source = maps[sourceType].get(sourceKey);
		const target = maps[targetType].get(targetKey);
		return {
			_id: demoObjectId(`link:${index + 1}`),
			source_id: source._id,
			source_type: sourceType,
			target_id: target._id,
			target_type: targetType,
			label,
			owner: ownerId,
			host_id: hostId,
		};
	});
}

function buildCounts(projects) {
	return Object.fromEntries(projects.map((project) => {
		const spec = PROJECT_SPECS.find((item) => item.key === project.key);
		return [project._id, { notes: spec.notes, memory: spec.memory, urls: spec.urls, emails: spec.emails }];
	}));
}

function buildGraphNodes(fixtures) {
	return [
		...fixtures.notes.map((item) => ({ id: item._id, name: item.title, type: 'notes', tags: item.tags, project_id: item.project, created_at: unixSeconds(item.createdAt) })),
		...fixtures.memories.map((item) => ({ id: item._id, name: item.title, type: 'memory', tags: item.tags, project_id: item.project, created_at: unixSeconds(item.createdAt) })),
		...fixtures.urls.map((item) => ({ id: item._id, name: item.title, type: 'urls', tags: item.tags, project_id: item.project, created_at: unixSeconds(item.createdAt) })),
	];
}

function buildGraphEdges(fixtures, nodes) {
	const nodeIds = new Set(nodes.map((node) => node.id));
	const edges = fixtures.links
		.filter((link) => nodeIds.has(link.source_id) && nodeIds.has(link.target_id))
		.map((link) => ({ id: link._id, source: link.source_id, target: link.target_id, source_type: link.source_type, target_type: link.target_type, label: link.label, edge_type: 'manual' }));
	const tagMap = new Map();
	for (const node of nodes) {
		for (const tag of node.tags || []) {
			if (!tagMap.has(tag)) tagMap.set(tag, []);
			tagMap.get(tag).push(node.id);
		}
	}
	const seen = new Set(edges.map((edge) => [edge.source, edge.target].sort().join(':')));
	for (const [tag, ids] of tagMap) {
		for (let index = 1; index < Math.min(ids.length, 6); index++) {
			const key = [ids[0], ids[index]].sort().join(':');
			if (seen.has(key)) continue;
			seen.add(key);
			edges.push({ source: ids[0], target: ids[index], label: tag, edge_type: 'tag' });
		}
	}
	return edges;
}

export function buildStreamientDemoFixtures(context = {}) {
	const anchorMs = Number.isFinite(context.anchor_ms) ? context.anchor_ms : Date.parse(context.activated_at || '') || Date.now();
	const hostId = String(context.host_id || 'demo-host');
	const ownerId = demoObjectId('owner:maya');
	const tenantId = demoObjectId('tenant:northstar-labs');
	const projects = buildProjects(anchorMs, hostId, ownerId);
	const projectIds = Object.fromEntries(projects.map((project) => [project.key, project._id]));
	const notes = buildNotes(anchorMs, hostId, ownerId, projectIds);
	const memories = buildMemories(anchorMs, hostId, ownerId, projectIds);
	const urls = buildUrls(anchorMs, hostId, ownerId, projectIds);
	const emailData = buildEmails(anchorMs, hostId, ownerId, projectIds);
	const fixtures = {
		anchor_ms: anchorMs,
		host_id: hostId,
		owner_id: ownerId,
		tenant_id: tenantId,
		user: {
			_id: ownerId,
			name: OWNER_NAME,
			email: OWNER_EMAIL,
			timezone: 'America/New_York',
			time_format: '12-hour',
			is_active: true,
			is_verified: true,
		},
		tenant: { tenantId, host_id: hostId, name: 'Northstar Labs', role: 'owner' },
		projects,
		project_ids: projectIds,
		counts: buildCounts(projects),
		notes,
		memories,
		urls,
		url_pages: buildUrlPages(urls, anchorMs),
		emails: emailData.roots,
		email_threads: emailData.threads,
		all_emails: emailData.all,
	};
	fixtures.links = buildLinks(fixtures, hostId, ownerId);
	fixtures.graph_nodes = buildGraphNodes(fixtures);
	fixtures.graph_edges = buildGraphEdges(fixtures, fixtures.graph_nodes);
	return fixtures;
}

export function getStreamientDemoScene(context, fixtures = buildStreamientDemoFixtures(context)) {
	const name = normalizeScene(context?.scene);
	const spec = SCENE_SPECS[name];
	const maps = recordMaps(fixtures);
	const openRecord = spec.open_type && spec.open_key ? maps[spec.open_type].get(spec.open_key) : null;
	const focusRecord = spec.focus_type && spec.focus_key ? maps[spec.focus_type].get(spec.focus_key) : null;
	return {
		name,
		path: spec.path,
		project_id: fixtures.project_ids[spec.project],
		open_type: spec.open_type || '',
		open_id: openRecord?._id || '',
		chat_query: spec.chat_query || '',
		graph_focus_id: focusRecord?._id || '',
	};
}

function pageValues(query = {}, defaultLimit = 50) {
	return {
		page: Math.max(1, Number.parseInt(query.page, 10) || 1),
		limit: Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || defaultLimit)),
	};
}

function paginate(items, query = {}, defaultLimit = 50) {
	const { page, limit } = pageValues(query, defaultLimit);
	return { items: items.slice((page - 1) * limit, page * limit), page, limit, total: items.length };
}

function listRecords(records, query = {}) {
	const projectId = String(query.project || query.project_id || '').trim();
	const filtered = records.filter((item) => !projectId || String(item.project) === projectId);
	filtered.sort((left, right) => Date.parse(right.updatedAt || right.createdAt) - Date.parse(left.updatedAt || left.createdAt));
	return paginate(filtered, query).items;
}

function normalizedPath(req) {
	const path = String(req.path || '').replace(/\/+$/, '');
	return path || '/';
}

function pathId(path, pattern) {
	const match = path.match(pattern);
	if (!match) return '';
	try {
		return decodeURIComponent(match[1]);
	} catch {
		return match[1];
	}
}

function recordById(fixtures, type, id) {
	const records = {
		notes: fixtures.notes,
		memory: fixtures.memories,
		urls: fixtures.urls,
		emails: fixtures.all_emails,
	}[type] || [];
	return records.find((item) => String(item._id) === String(id)) || null;
}

function displayTitle(type, record) {
	if (type === 'emails') return record.subject || '(No subject)';
	return record.title || record.url || 'Untitled';
}

function projectName(fixtures, projectId) {
	return fixtures.projects.find((project) => String(project._id) === String(projectId))?.name || '';
}

function searchableRows(fixtures, types = ['notes', 'memory', 'urls', 'emails']) {
	const rows = [];
	if (types.includes('notes')) rows.push(...fixtures.notes.map((record) => ({ type: 'notes', record, title: record.title, body: record.text_content, tags: record.tags })));
	if (types.includes('memory')) rows.push(...fixtures.memories.map((record) => ({ type: 'memory', record, title: record.title, body: `${record.content} ${record.source}`, tags: record.tags })));
	if (types.includes('urls')) rows.push(...fixtures.urls.map((record) => ({ type: 'urls', record, title: record.title, body: `${record.description} ${record.text_content} ${record.url}`, tags: record.tags })));
	if (types.includes('emails')) rows.push(...fixtures.emails.map((record) => ({ type: 'emails', record, title: record.subject, body: `${record.text_content} ${(record.from || []).join(' ')}`, tags: record.labels })));
	return rows;
}

function queryTerms(value) {
	return [...new Set(String(value || '').toLowerCase().match(/[a-z0-9$]+/g) || [])].filter((term) => term.length > 1);
}

function scoreRow(row, query) {
	const normalizedQuery = cleanText(query).toLowerCase();
	if (!normalizedQuery || normalizedQuery === '*') return 1;
	const terms = queryTerms(normalizedQuery);
	const title = cleanText(row.title).toLowerCase();
	const body = cleanText(row.body).toLowerCase();
	const tags = cleanText(row.tags || []).toLowerCase();
	let score = title.includes(normalizedQuery) ? 500 : 0;
	if (body.includes(normalizedQuery)) score += 180;
	for (const term of terms) {
		if (title.includes(term)) score += 50;
		if (tags.includes(term)) score += 30;
		if (body.includes(term)) score += 12;
	}
	return score;
}

function projectFilterFromOptions(options = {}) {
	const direct = options.project_id || options.projectId || options.project;
	if (direct) return String(direct);
	const filter = String(options.filter_by || '');
	const match = filter.match(/project_id:=([^&\s]+)/);
	return match ? match[1] : '';
}

function searchRows(fixtures, query, options = {}, types) {
	const projectId = projectFilterFromOptions(options);
	return searchableRows(fixtures, types)
		.filter((row) => !projectId || String(row.record.project) === projectId)
		.map((row) => ({ ...row, score: scoreRow(row, query) }))
		.filter((row) => row.score > 0)
		.sort((left, right) => right.score - left.score || Date.parse(right.record.updatedAt) - Date.parse(left.record.updatedAt));
}

function searchDocument(row) {
	const record = row.record;
	const base = {
		id: record._id,
		source_id: record._id,
		project_id: record.project,
		created_at: unixSeconds(record.createdAt),
		updated_at: unixSeconds(record.updatedAt || record.createdAt),
	};
	if (row.type === 'notes') return { ...base, title: record.title, text_content: record.text_content, tags: record.tags };
	if (row.type === 'memory') return { ...base, title: record.title, content: record.content, source: record.source, tags: record.tags };
	if (row.type === 'urls') return { ...base, title: record.title, url: record.url, description: record.description, text_content: record.text_content, tags: record.tags };
	return { ...base, subject: record.subject, from: record.from, text_content: record.text_content, attachment_text_content: record.attachment_text_content, labels: record.labels };
}

function rawSearch(fixtures, type, query, options = {}) {
	const typeRows = searchRows(fixtures, query, options, [type]);
	const page = Math.max(1, Number.parseInt(options.page, 10) || 1);
	const perPage = Math.min(100, Math.max(1, Number.parseInt(options.per_page || options.perPage, 10) || 10));
	const hits = typeRows.slice((page - 1) * perPage, page * perPage).map((row) => ({
		document: searchDocument(row),
		text_match: row.score,
		text_match_info: { score: row.score },
	}));
	return { found: typeRows.length, hits, page, request_params: { q: String(query || ''), per_page: perPage } };
}

function searchKnowledgeResponse(fixtures, query, options = {}) {
	return {
		notes: rawSearch(fixtures, 'notes', query, options),
		memory: rawSearch(fixtures, 'memory', query, options),
		urls: rawSearch(fixtures, 'urls', query, options),
		emails: rawSearch(fixtures, 'emails', query, options),
	};
}

function quickSearchResponse(fixtures, query, options = {}) {
	const limit = Math.min(50, Math.max(1, Number.parseInt(options.limit, 10) || 12));
	const rows = searchRows(fixtures, query, options).slice(0, limit);
	const labels = { notes: 'Note', memory: 'Memory', urls: 'URL', emails: 'Email' };
	const results = rows.map((row) => {
		const record = row.record;
		const excerpt = row.type === 'notes' ? record.text_content : row.type === 'memory' ? record.content : row.type === 'urls' ? record.description : record.excerpt || record.text_content;
		const subtitle = row.type === 'urls' ? record.url : row.type === 'emails' ? (record.from || []).join(', ') : row.type === 'memory' ? record.source : (record.tags || []).join(', ');
		return {
			id: record._id,
			type: row.type,
			label: labels[row.type],
			title: displayTitle(row.type, record),
			subtitle: cleanText(subtitle).slice(0, 160),
			excerpt: cleanText(excerpt).slice(0, 260),
			url: record.url || '',
			highlight_field: '',
			highlight_segments: [],
			project_id: record.project,
			updated_at: unixSeconds(record.updatedAt || record.createdAt),
			open_target: { kind: 'modal', type: row.type, id: record._id, project_id: record.project },
		};
	});
	return { results, found: results.length };
}

function chatResult(fixtures, type, key) {
	const record = recordMaps(fixtures)[type].get(key);
	if (!record) return null;
	return {
		...record,
		id: record._id,
		_type: type,
		title: displayTitle(type, record),
		project_id: record.project,
		project_name: projectName(fixtures, record.project),
		created_at: unixSeconds(record.createdAt),
		updated_at: unixSeconds(record.updatedAt || record.createdAt),
	};
}

function chatScenario(fixtures, query) {
	const normalized = cleanText(query).toLowerCase();
	if (/price|pricing|\$49/.test(normalized)) {
		return {
			key: 'pricing',
			answer: 'The Unlimited introductory price remains **$49/month through September**. The later regular price is $99/month. The decision is recorded separately from the launch plan so the team can update pricing without rewriting the rest of the launch context.',
			results: [chatResult(fixtures, 'memory', 'intro-price'), chatResult(fixtures, 'notes', 'beta-launch-plan'), chatResult(fixtures, 'emails', 'brightfield-launch'), chatResult(fixtures, 'urls', 'private-beta-brief')],
		};
	}
	if (/repeat|customer request|feedback|theme/.test(normalized)) {
		return {
			key: 'feedback',
			answer: 'Two themes repeat across the design-partner research:\n\n1. **Bulk triage** is the leading workflow request.\n2. **Visible source citations** are the leading trust requirement.\n\nTeams also prefer project-scoped retrieval and a smaller set of reviewed memories over automatic capture of every conversation.',
			results: [chatResult(fixtures, 'notes', 'beta-feedback-synthesis'), chatResult(fixtures, 'memory', 'bulk-triage-request'), chatResult(fixtures, 'memory', 'citations-block-adoption'), chatResult(fixtures, 'urls', 'interview-synthesis')],
		};
	}
	if (/pilot|enterprise|ridgeline/.test(normalized)) {
		return {
			key: 'pilot',
			answer: 'Ridgeline proposed a **60-day enterprise pilot** for product and support. Before kickoff, Northstar needs to finish the security questionnaire due Friday. Success will be measured through weekly active team usage and completion of source-backed workflows.',
			results: [chatResult(fixtures, 'notes', 'ridgeline-pilot-interview'), chatResult(fixtures, 'memory', 'ridgeline-pilot-length'), chatResult(fixtures, 'emails', 'security-questionnaire'), chatResult(fixtures, 'urls', 'ridgeline-requirements')],
		};
	}
	if (/beta|launch|august 26|design partner/.test(normalized)) {
		return {
			key: 'launch',
			answer: 'Northstar’s private beta opens **August 26** to **25 design partners**. The introductory Unlimited price stays at **$49/month through September**. Maya owns partner communication, and Priya at Brightfield approves the joint launch assets.',
			results: [chatResult(fixtures, 'notes', 'beta-launch-plan'), chatResult(fixtures, 'memory', 'intro-price'), chatResult(fixtures, 'emails', 'brightfield-launch'), chatResult(fixtures, 'notes', 'launch-readiness-checklist')],
		};
	}
	const fallbackRows = searchRows(fixtures, query, {}).slice(0, 4);
	return {
		key: 'help',
		answer: 'This Northstar Labs demo can answer questions about the beta launch, repeated customer requests, the Ridgeline enterprise pilot, or the pricing decision. Try one of those topics to see a source-backed answer.',
		results: fallbackRows.map((row) => ({ ...row.record, id: row.record._id, _type: row.type, project_id: row.record.project, project_name: projectName(fixtures, row.record.project), created_at: unixSeconds(row.record.createdAt), updated_at: unixSeconds(row.record.updatedAt || row.record.createdAt) })),
	};
}

function chatPayload(fixtures, query) {
	const scenario = chatScenario(fixtures, query);
	return {
		answer: scenario.answer,
		results: scenario.results.filter(Boolean),
		action: null,
		conversation_id: demoObjectId(`conversation:${scenario.key}`),
		conversation_reset: false,
		display_in: 'panel',
	};
}

function sendChatStream(res, fixtures, query) {
	res.setHeader('Content-Type', 'text/event-stream');
	res.setHeader('Cache-Control', 'no-cache');
	res.setHeader('Connection', 'keep-alive');
	res.setHeader('X-Accel-Buffering', 'no');
	res.flushHeaders?.();
	if (!cleanText(query)) {
		res.write(`event: error\ndata: ${JSON.stringify({ error: 'query required' })}\n\n`);
		return res.end();
	}
	const payload = chatPayload(fixtures, query);
	const chunks = payload.answer.match(/.{1,90}(?:\s|$)/g) || [payload.answer];
	for (const text of chunks) res.write(`event: token\ndata: ${JSON.stringify({ text })}\n\n`);
	res.write(`event: done\ndata: ${JSON.stringify({ conversation_id: payload.conversation_id, results: payload.results, action: payload.action, display_in: payload.display_in, conversation_reset: false })}\n\n`);
	return res.end();
}

function tagConnections(fixtures, itemId, manualIds) {
	const rows = searchableRows(fixtures, ['notes', 'memory', 'urls']);
	const source = rows.find((row) => String(row.record._id) === String(itemId));
	if (!source?.record.tags?.length) return [];
	return rows
		.filter((row) => String(row.record._id) !== String(itemId) && !manualIds.has(String(row.record._id)))
		.map((row) => ({ row, shared: (row.record.tags || []).filter((tag) => source.record.tags.includes(tag)) }))
		.filter((entry) => entry.shared.length)
		.slice(0, 12)
		.map((entry) => ({ id: entry.row.record._id, type: entry.row.type, title: displayTitle(entry.row.type, entry.row.record), shared_tags: entry.shared }));
}

function connectionsResponse(fixtures, itemId) {
	const links = fixtures.links.filter((link) => String(link.source_id) === String(itemId) || String(link.target_id) === String(itemId));
	const manualIds = new Set([String(itemId)]);
	for (const link of links) {
		manualIds.add(String(link.source_id));
		manualIds.add(String(link.target_id));
	}
	return { links, tag_connections: tagConnections(fixtures, itemId, manualIds) };
}

function itemExists(fixtures, id) {
	return ['notes', 'memory', 'urls', 'emails'].some((type) => recordById(fixtures, type, id));
}

function demoGetResponse(fixtures, req) {
	const path = normalizedPath(req);
	const query = req.query || {};
	if (path === '/projects') return { status: 200, body: { projects: fixtures.projects } };
	if (path === '/features') return { status: 200, body: { features: { email_ingest: true, git_sync: true } } };
	let id = pathId(path, /^\/projects\/([^/]+)$/);
	if (id) {
		const project = fixtures.projects.find((item) => String(item._id) === id);
		return project ? { status: 200, body: { project } } : { status: 404, body: { error: 'Project not found' } };
	}
	if (path === '/notes') return { status: 200, body: { notes: listRecords(fixtures.notes, query) } };
	id = pathId(path, /^\/notes\/([^/]+)$/);
	if (id) {
		const note = recordById(fixtures, 'notes', id);
		return note ? { status: 200, body: { note } } : { status: 404, body: { error: 'Note not found' } };
	}
	if (path === '/memories') return { status: 200, body: { memories: listRecords(fixtures.memories, query) } };
	if (path === '/memories/tags/suggest') {
		const prefix = String(query.q || query.query || '').toLowerCase();
		const projectId = String(query.project || query.project_id || '');
		const tags = [...new Set(fixtures.memories.filter((item) => !projectId || String(item.project) === projectId).flatMap((item) => item.tags))].filter((tag) => !prefix || tag.toLowerCase().startsWith(prefix)).slice(0, Math.min(100, Number.parseInt(query.limit, 10) || 50));
		return { status: 200, body: { tags } };
	}
	id = pathId(path, /^\/memories\/([^/]+)$/);
	if (id) {
		const memory = recordById(fixtures, 'memory', id);
		return memory ? { status: 200, body: { memory } } : { status: 404, body: { error: 'Memory not found' } };
	}
	if (path === '/urls') return { status: 200, body: { urls: listRecords(fixtures.urls, query) } };
	id = pathId(path, /^\/urls\/([^/]+)\/pages$/);
	if (id) {
		const url = recordById(fixtures, 'urls', id);
		if (!url) return { status: 404, body: { error: 'URL not found' } };
		const page = paginate(fixtures.url_pages[id] || [], query, 100);
		return { status: 200, body: { pages: page.items, count: page.total, page: page.page, per_page: page.limit } };
	}
	id = pathId(path, /^\/urls\/([^/]+)$/);
	if (id) {
		const url = recordById(fixtures, 'urls', id);
		return url ? { status: 200, body: { url } } : { status: 404, body: { error: 'URL not found' } };
	}
	if (path === '/emails') return { status: 200, body: { emails: listRecords(fixtures.emails, query) } };
	if (path === '/emails/ids') return { status: 200, body: { ids: listRecords(fixtures.emails, { ...query, page: 1, limit: 100 }).map((item) => item._id) } };
	id = pathId(path, /^\/emails\/([^/]+)\/thread$/);
	if (id) {
		const thread = fixtures.email_threads[id];
		if (!thread) return { status: 404, body: { error: 'Email not found' } };
		const ordered = query.order === 'desc' ? [...thread].reverse() : [...thread];
		return { status: 200, body: { thread: ordered } };
	}
	id = pathId(path, /^\/emails\/([^/]+)$/);
	if (id) {
		const email = recordById(fixtures, 'emails', id);
		return email ? { status: 200, body: { email } } : { status: 404, body: { error: 'Email not found' } };
	}
	if (path === '/counts') return { status: 200, body: fixtures.counts };
	if (path === '/batch/count') {
		const map = { notes: fixtures.notes, memories: fixtures.memories, urls: fixtures.urls, emails: fixtures.emails };
		const rows = map[query.type];
		if (!rows) return { status: 400, body: { error: 'valid type required' } };
		return { status: 200, body: { count: rows.filter((item) => !query.project || String(item.project) === String(query.project)).length } };
	}
	if (path === '/graph') {
		const projectId = String(query.project_id || '');
		const nodes = fixtures.graph_nodes.filter((node) => !projectId || String(node.project_id) === projectId);
		const nodeIds = new Set(nodes.map((node) => node.id));
		const includeTags = query.include_tags !== 'false';
		const edges = fixtures.graph_edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target) && (includeTags || edge.edge_type !== 'tag'));
		return { status: 200, body: { nodes, edges } };
	}
	id = pathId(path, /^\/links\/([^/]+)$/);
	if (id) {
		if (!itemExists(fixtures, id)) return { status: 404, body: { error: 'Item not found' } };
		return { status: 200, body: { links: connectionsResponse(fixtures, id).links } };
	}
	id = pathId(path, /^\/connections\/([^/]+)$/);
	if (id) {
		if (!itemExists(fixtures, id)) return { status: 404, body: { error: 'Item not found' } };
		return { status: 200, body: connectionsResponse(fixtures, id) };
	}
	if (path === '/chat/conversations') {
		return { status: 200, body: { conversations: [{ conversation_id: demoObjectId('conversation:launch'), title: 'Private beta launch decisions', created_at: unixSeconds(isoAt(fixtures.anchor_ms, 3)), updated_at: unixSeconds(isoAt(fixtures.anchor_ms, 2)) }] } };
	}
	id = pathId(path, /^\/chat\/conversations\/([^/]+)\/messages$/);
	if (id) {
		if (id !== demoObjectId('conversation:launch')) return { status: 404, body: { error: 'Conversation not found' } };
		const payload = chatPayload(fixtures, 'What did we decide about the beta launch?');
		return { status: 200, body: { messages: [{ role: 'user', message: 'What did we decide about the beta launch?' }, { role: 'assistant', message: payload.answer }] } };
	}
	if (path === '/trash') return { status: 200, body: { items: [], total: 0, page: 1, limit: Number.parseInt(query.limit, 10) || 50 } };
	if (path === '/trash/count') return { status: 200, body: { count: 0 } };
	return null;
}

function demoPostResponse(fixtures, req) {
	const path = normalizedPath(req);
	const body = req.body || {};
	if (path === '/notes/search') return { status: 200, body: { results: rawSearch(fixtures, 'notes', body.query, { ...(body.options || {}), project_id: body.project_id }) } };
	if (path === '/memories/search') return { status: 200, body: { results: rawSearch(fixtures, 'memory', body.query, { ...(body.options || {}), project_id: body.project_id }) } };
	if (path === '/urls/search') return { status: 200, body: { results: rawSearch(fixtures, 'urls', body.query, body.options || {}) } };
	if (path === '/emails/search') return { status: 200, body: { results: rawSearch(fixtures, 'emails', body.query, body.options || {}) } };
	if (path === '/search/knowledge') return { status: 200, body: { results: searchKnowledgeResponse(fixtures, body.query, { ...(body.options || {}), project_id: body.project_id, per_page: body.per_page }) } };
	if (path === '/search/quick') {
		const query = cleanText(body.query);
		if (!query) return { status: 400, body: { error: 'query required' } };
		return { status: 200, body: { query, ...quickSearchResponse(fixtures, query, body) } };
	}
	if (path === '/search/all') {
		const query = cleanText(body.query);
		if (!query) return { status: 400, body: { error: 'query required' } };
		const results = searchRows(fixtures, query, {}).slice(0, 20).map((row) => ({ ...row.record, id: row.record._id, _type: row.type, project_id: row.record.project, project_name: projectName(fixtures, row.record.project) }));
		return { status: 200, body: { results } };
	}
	if (path === '/resolve') {
		const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
		const items = [];
		for (const type of ['notes', 'memory', 'urls', 'emails']) {
			for (const id of ids) {
				const record = recordById(fixtures, type, id);
				if (record && !items.some((item) => item.id === id)) items.push({ id, title: displayTitle(type, record), _type: type });
			}
		}
		return { status: 200, body: { items } };
	}
	if (path === '/chat') {
		const query = cleanText(body.query);
		if (!query) return { status: 400, body: { error: 'query required' } };
		return { status: 200, body: chatPayload(fixtures, query) };
	}
	if (path === '/chat/search') {
		const query = cleanText(body.query);
		if (!query) return { status: 400, body: { error: 'query required' } };
		return { status: 200, body: { answer: chatPayload(fixtures, query).answer } };
	}
	return null;
}

export function streamientDemoApiMiddleware(req, res, next) {
	const context = getStreamientDemoSession(req);
	if (!context) {
		if (req.streamientDemoExpired) return res.status(410).json({ error: STREAMIENT_DEMO_EXPIRED_MESSAGE, code: 'DEMO_EXPIRED', redirect: '/dashboard?demo=false' });
		return next();
	}
	req.managaniSkip = true;
	const fixtures = buildStreamientDemoFixtures(context);
	if (req.method === 'POST' && normalizedPath(req) === '/chat/stream') return sendChatStream(res, fixtures, req.body?.query);
	if (req.method === 'POST') {
		const response = demoPostResponse(fixtures, req);
		if (response) return res.status(response.status).json(response.body);
		return res.status(409).json({ error: STREAMIENT_DEMO_READ_ONLY_MESSAGE, code: 'DEMO_READ_ONLY' });
	}
	if (req.method !== 'GET') return res.status(409).json({ error: STREAMIENT_DEMO_READ_ONLY_MESSAGE, code: 'DEMO_READ_ONLY' });
	const response = demoGetResponse(fixtures, req);
	if (!response) return res.status(404).json({ error: 'Demo endpoint not found', code: 'DEMO_NOT_FOUND' });
	return res.status(response.status).json(response.body);
}
