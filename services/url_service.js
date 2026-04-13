import { Url } from '../model/url.js';
import { searchCollection, removeDocument } from '../modules/typesense.js';
import { extractUrlContent } from '../modules/url_content_extractor.js';
import { emitToTenant } from '../modules/socket.js';

export async function saveUrl(userId, host_id, data) {
	let extracted = {};
	try {
		extracted = await extractUrlContent(data.url);
	} catch (err) {
		console.error('URL extraction error:', err.message);
	}

	const urlDoc = await Url.create({
		url: data.url,
		title: data.title || extracted.title || data.url,
		description: data.description || extracted.description || '',
		og_image: extracted.og_image || '',
		text_content: extracted.text_content || '',
		crawl_enabled: data.crawl_enabled || false,
		project: data.project,
		owner: userId,
		host_id,
	});

	emitToTenant(host_id, 'url:created', urlDoc);
	return urlDoc;
}

export async function listUrls(host_id, projectId, { page = 1, limit = 50 } = {}) {
	const query = { host_id, in_trash: { $ne: true } };
	if (projectId) query.project = projectId;

	return Url.find(query)
		.select('-text_content')
		.sort({ updatedAt: -1 })
		.skip((page - 1) * limit)
		.limit(limit);
}

export async function getUrl(host_id, urlId) {
	return Url.findOne({ _id: urlId, host_id });
}

export async function updateUrl(host_id, urlId, data) {
	const update = {};
	if (data.title !== undefined) update.title = data.title;
	if (data.description !== undefined) update.description = data.description;
	if (data.crawl_enabled !== undefined) update.crawl_enabled = data.crawl_enabled;
	if (data.project !== undefined) update.project = data.project;

	const urlDoc = await Url.findOneAndUpdate(
		{ _id: urlId, host_id },
		{ $set: update },
		{ new: true },
	);

	if (urlDoc) {
		emitToTenant(host_id, 'url:updated', urlDoc);
	}

	return urlDoc;
}

export async function deleteUrl(host_id, urlId) {
	const urlDoc = await Url.findOneAndUpdate(
		{ _id: urlId, host_id, in_trash: { $ne: true } },
		{ $set: { in_trash: true, trashed_at: new Date() } },
		{ new: true },
	);
	if (urlDoc) {
		removeDocument(host_id, 'urls', urlId).catch((err) => console.error('Typesense remove error:', err.message));
		emitToTenant(host_id, 'url:deleted', { _id: urlId });
	}
	return urlDoc;
}

export async function searchUrls(host_id, query, options = {}) {
	return searchCollection(host_id, 'urls', query, {
		queryBy: 'title,description,text_content,embedding',
		...options,
	});
}

export async function countUrls(host_id) {
	return Url.countDocuments({ host_id, in_trash: { $ne: true } });
}
