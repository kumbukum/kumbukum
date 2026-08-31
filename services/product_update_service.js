import striptags from 'striptags';
import mongoose from '../model/mongoose.js';
import { ProductUpdate } from '../model/product_update.js';
import { User } from '../model/user.js';
import config from '../config.js';

const GHOST_PAGE_LIMIT = 100;
const ARCHIVE_PAGE_SIZE = 7;
const MODAL_LIMIT = 10;

function productUpdateConfig(overrides = {}) {
	return { ...config.productUpdates, ...overrides };
}

function buildGhostPostsUrl(page, overrides = {}) {
	const settings = productUpdateConfig(overrides);
	const url = new URL('/ghost/api/content/posts/', settings.ghostBaseUrl);
	url.searchParams.set('key', settings.contentApiKey);
	url.searchParams.set('filter', 'tag:product');
	url.searchParams.set('include', 'tags');
	url.searchParams.set('fields', 'id,title,slug,excerpt,custom_excerpt,feature_image,published_at,updated_at');
	url.searchParams.set('limit', String(GHOST_PAGE_LIMIT));
	url.searchParams.set('page', String(page));
	url.searchParams.set('order', 'published_at desc');
	return url;
}

function isModalPost(post) {
	return Array.isArray(post?.tags) && post.tags.some((tag) => tag?.name === '#modal' || tag?.slug === 'hash-modal');
}

function safeHttpUrl(value) {
	try {
		const url = new URL(value);
		return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
	} catch {
		return '';
	}
}

function mapGhostPost(post, overrides = {}) {
	const settings = productUpdateConfig(overrides);
	const ghostId = String(post?.id || '').trim();
	const title = String(post?.title || '').trim();
	const slug = String(post?.slug || '').trim();
	const publishedAt = new Date(post?.published_at || '');
	if (!ghostId || !title || !slug || Number.isNaN(publishedAt.getTime())) return null;
	const excerpt = striptags(String(post.custom_excerpt || post.excerpt || '')).trim();
	return {
		ghost_id: ghostId,
		title,
		excerpt,
		slug,
		link: new URL(`/blog/${encodeURIComponent(slug)}/`, settings.ghostBaseUrl).toString(),
		feature_image: safeHttpUrl(post.feature_image),
		published_at: publishedAt,
		show_modal: isModalPost(post),
		active: true,
	};
}

async function fetchGhostJson(fetchImpl, url) {
	const response = await fetchImpl(url, { headers: { Accept: 'application/json', 'User-Agent': 'Streamient/1.0' }, signal: AbortSignal.timeout(10000) });
	if (!response.ok) throw new Error(`Ghost Content API returned ${response.status}`);
	return response.json();
}

export async function syncProductUpdates({ fetchImpl = fetch, productUpdateModel = ProductUpdate, config: configOverrides = {} } = {}) {
	const settings = productUpdateConfig(configOverrides);
	if (!settings.contentApiKey) return { enabled: false, fetched: 0, upserted: 0, deactivated: 0 };

	const mappedById = new Map();
	let page = 1;
	let totalPages = 1;
	do {
		const payload = await fetchGhostJson(fetchImpl, buildGhostPostsUrl(page, settings));
		if (!Array.isArray(payload?.posts)) throw new Error('Ghost Content API returned an invalid posts payload');
		for (const post of payload.posts) {
			const mapped = mapGhostPost(post, settings);
			if (mapped) mappedById.set(mapped.ghost_id, mapped);
		}
		const reportedPages = Number(payload?.meta?.pagination?.pages);
		totalPages = Number.isInteger(reportedPages) && reportedPages > 0 ? reportedPages : (payload.posts.length === GHOST_PAGE_LIMIT ? page + 1 : page);
		page += 1;
	} while (page <= totalPages);

	const updates = [...mappedById.values()];
	let bulkResult = null;
	if (updates.length) {
		bulkResult = await productUpdateModel.bulkWrite(updates.map((update) => ({
			updateOne: {
				filter: { ghost_id: update.ghost_id },
				update: { $set: update },
				upsert: true,
			},
		})), { ordered: false });
	}

	const activeGhostIds = updates.map((update) => update.ghost_id);
	const staleQuery = activeGhostIds.length ? { active: true, ghost_id: { $nin: activeGhostIds } } : { active: true };
	const staleResult = await productUpdateModel.updateMany(staleQuery, { $set: { active: false, show_modal: false } });
	return {
		enabled: true,
		fetched: updates.length,
		upserted: bulkResult?.upsertedCount || 0,
		deactivated: staleResult?.modifiedCount || 0,
	};
}

function encodeCursor(update) {
	if (!update?._id || !update?.published_at) return '';
	return Buffer.from(JSON.stringify({ published_at: new Date(update.published_at).toISOString(), id: update._id.toString() })).toString('base64url');
}

function decodeCursor(cursor) {
	if (!cursor) return null;
	try {
		const parsed = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
		const publishedAt = new Date(parsed.published_at);
		if (Number.isNaN(publishedAt.getTime()) || !mongoose.isValidObjectId(parsed.id)) return null;
		return { published_at: publishedAt, id: new mongoose.Types.ObjectId(parsed.id) };
	} catch {
		return null;
	}
}

export async function listProductUpdates({ cursor = '', limit = ARCHIVE_PAGE_SIZE, productUpdateModel = ProductUpdate } = {}) {
	const pageSize = Math.min(Math.max(Number.parseInt(limit, 10) || ARCHIVE_PAGE_SIZE, 1), 50);
	const decoded = decodeCursor(cursor);
	if (cursor && !decoded) {
		const error = new Error('Invalid product update cursor');
		error.status = 400;
		throw error;
	}
	const query = { active: true };
	if (decoded) query.$or = [{ published_at: { $lt: decoded.published_at } }, { published_at: decoded.published_at, _id: { $lt: decoded.id } }];
	const records = await productUpdateModel.find(query).sort({ published_at: -1, _id: -1 }).limit(pageSize + 1).lean();
	const hasMore = records.length > pageSize;
	const updates = hasMore ? records.slice(0, pageSize) : records;
	return { updates, next_cursor: hasMore ? encodeCursor(updates.at(-1)) : '', latest_update_id: updates[0]?._id?.toString() || '' };
}

async function getUserSeenAt(userId, userModel) {
	const user = await userModel.findById(userId).select('+product_updates_seen_at createdAt').lean();
	if (!user) {
		const error = new Error('User not found');
		error.status = 404;
		throw error;
	}
	return user.product_updates_seen_at || user.createdAt || new Date();
}

export async function getProductUpdateStatus(userId, { productUpdateModel = ProductUpdate, userModel = User } = {}) {
	const seenAt = await getUserSeenAt(userId, userModel);
	const [newCount, modalCount] = await Promise.all([
		productUpdateModel.countDocuments({ active: true, published_at: { $gt: seenAt } }),
		productUpdateModel.countDocuments({ active: true, show_modal: true, published_at: { $gt: seenAt } }),
	]);
	return { new_count: newCount, has_modal: modalCount > 0 };
}

export async function getModalProductUpdates(userId, { productUpdateModel = ProductUpdate, userModel = User, limit = MODAL_LIMIT } = {}) {
	const seenAt = await getUserSeenAt(userId, userModel);
	const [updates, throughUpdate] = await Promise.all([
		productUpdateModel.find({ active: true, show_modal: true, published_at: { $gt: seenAt } }).sort({ published_at: -1, _id: -1 }).limit(limit).lean(),
		productUpdateModel.findOne({ active: true, published_at: { $gt: seenAt } }).sort({ published_at: -1, _id: -1 }).lean(),
	]);
	return { updates, through_update_id: throughUpdate?._id?.toString() || '' };
}

export async function markProductUpdatesSeen(userId, updateId, { productUpdateModel = ProductUpdate, userModel = User } = {}) {
	if (!mongoose.isValidObjectId(updateId)) {
		const error = new Error('Invalid product update');
		error.status = 400;
		throw error;
	}
	const update = await productUpdateModel.findOne({ _id: updateId, active: true }).select('published_at').lean();
	if (!update) {
		const error = new Error('Product update not found');
		error.status = 404;
		throw error;
	}
	await userModel.updateOne({ _id: userId }, { $max: { product_updates_seen_at: update.published_at } });
	return { seen_at: update.published_at };
}

export async function backfillProductUpdatesSeenAt({ userModel = User, now = new Date() } = {}) {
	const result = await userModel.updateMany({ $or: [{ product_updates_seen_at: { $exists: false } }, { product_updates_seen_at: null }] }, { $set: { product_updates_seen_at: now } }, { timestamps: false });
	return { migrated: result?.modifiedCount || 0 };
}

export const _private = { buildGhostPostsUrl, decodeCursor, encodeCursor, isModalPost, mapGhostPost };
