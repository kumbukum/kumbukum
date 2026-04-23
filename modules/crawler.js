import { PlaywrightCrawler } from 'crawlee';
import { ensureCollections, indexDocument } from '../modules/typesense.js';
import { Url } from '../model/url.js';

const SKIP_URL_TOKEN_RE = /(^|[\/_.\-?=&])(login|log-in|signin|sign-in|signon|sso|oauth|auth|authenticate)([\/_.\-?=&]|$)/i;

function shouldSkipCrawledUrl(rawUrl) {
	if (!rawUrl) return true;
	try {
		const parsed = new URL(rawUrl);
		const haystack = `${parsed.pathname}${parsed.search}`.toLowerCase();
		return SKIP_URL_TOKEN_RE.test(haystack);
	} catch {
		return SKIP_URL_TOKEN_RE.test(String(rawUrl || '').toLowerCase());
	}
}

/**
* Crawl all internal pages for a given URL and index them into Typesense.
*/
export async function crawlSite(urlDoc) {
	const baseUrl = new URL(urlDoc.url);
	const urlId = urlDoc._id?.toString?.() || String(urlDoc._id);
	const hostId = urlDoc.host_id;
	const projectId = urlDoc.project.toString();
	const pages = [];
	let indexedCount = 0;

	// Immediate crawl can run before scheduled indexing has created collections.
	// Ensure all collections (including pages) exist before indexing crawl output.
	await ensureCollections(hostId);

	const crawler = new PlaywrightCrawler({
		maxRequestsPerCrawl: 200,
		maxConcurrency: 3,
		requestHandlerTimeoutSecs: 30,

		async requestHandler({ request, page, enqueueLinks, response }) {
			const currentUrl = request.loadedUrl || request.url;
			const statusCode = response?.status?.() || null;
			if (statusCode && statusCode >= 400) return;
			if (shouldSkipCrawledUrl(currentUrl)) return;

			const title = await page.title();
			const textContent = await page.evaluate(() => {
				const el = document.querySelector('main, article, [role="main"], .content, #content, body');
				return el ? el.innerText.replace(/\s+/g, ' ').trim().slice(0, 50000) : '';
			});

			pages.push({
				url: currentUrl,
				title,
				text_content: textContent,
			});

			// Only follow links on the same host
			await enqueueLinks({
				strategy: 'same-hostname',
				transformRequestFunction: (req) => {
					if (shouldSkipCrawledUrl(req.url)) return false;
					return req;
				},
			});
		},

		failedRequestHandler({ request }) {
			console.warn(`Crawl failed: ${request.url}`);
		},
	});

	await crawler.run([urlDoc.url]);

	// Deduplicate by URL before indexing. Crawler request count can be higher than unique URLs.
	const uniquePages = new Map();
	for (const pageData of pages) {
		const docId = `${urlId}_${Buffer.from(pageData.url).toString('base64url')}`;
		if (!uniquePages.has(docId)) {
			uniquePages.set(docId, pageData);
		}
	}

	// Index all unique crawled pages
	for (const [docId, pageData] of uniquePages) {
		try {
			await indexDocument(hostId, 'pages', {
				id: docId,
				url: pageData.url,
				parent_url_id: urlId,
				title: pageData.title,
				text_content: pageData.text_content,
				project_id: projectId,
				crawled_at: Math.floor(Date.now() / 1000),
			});
			indexedCount++;
		} catch (err) {
			console.error(`Page index error (${pageData.url}):`, err.message);
		}
	}

	// Update last_crawled regardless of whether caller passed a mongoose document or plain object.
	await Url.updateOne(
		{ _id: urlId, host_id: hostId },
		{ $set: { last_crawled: new Date() } },
	);

	console.log(`Crawled ${pages.length} requests for ${urlDoc.url}; indexed ${indexedCount} unique pages`);
	return indexedCount;
}

/**
* Re-crawl all URLs with crawl_enabled.
*/
export async function reindexAll() {
	const urls = await Url.find({ crawl_enabled: true });
	console.log(`Reindexing ${urls.length} crawl-enabled URLs`);

	for (const urlDoc of urls) {
		try {
			await crawlSite(urlDoc);
		} catch (err) {
			console.error(`Reindex error for ${urlDoc.url}:`, err.message);
		}
	}
}

/**
* Re-crawl only URLs that are due based on last_crawled age.
* This spreads crawling over time instead of a single daily spike.
*/
export async function reindexDue({ intervalHours = 24 } = {}) {
	const cutoff = new Date(Date.now() - intervalHours * 60 * 60 * 1000);
	const urls = await Url.find({
		crawl_enabled: true,
		$or: [
			{ last_crawled: { $exists: false } },
			{ last_crawled: null },
			{ last_crawled: { $lte: cutoff } },
		],
	});

	if (!urls.length) return 0;
	console.log(`Reindexing ${urls.length} due crawl-enabled URLs`);

	let crawled = 0;
	for (const urlDoc of urls) {
		try {
			await crawlSite(urlDoc);
			crawled++;
		} catch (err) {
			console.error(`Reindex due error for ${urlDoc.url}:`, err.message);
		}
	}

	return crawled;
}
