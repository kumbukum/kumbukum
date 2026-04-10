import { PlaywrightCrawler } from 'crawlee';
import { indexDocument } from '../modules/typesense.js';
import { Url } from '../model/url.js';

/**
* Crawl all internal pages for a given URL and index them into Typesense.
*/
export async function crawlSite(urlDoc) {
	const baseUrl = new URL(urlDoc.url);
	const hostId = urlDoc.host_id;
	const projectId = urlDoc.project.toString();
	const pages = [];

	const crawler = new PlaywrightCrawler({
		maxRequestsPerCrawl: 200,
		maxConcurrency: 3,
		requestHandlerTimeoutSecs: 30,

		async requestHandler({ request, page, enqueueLinks }) {
			const title = await page.title();
			const textContent = await page.evaluate(() => {
				const el = document.querySelector('main, article, [role="main"], .content, #content, body');
				return el ? el.innerText.replace(/\s+/g, ' ').trim().slice(0, 50000) : '';
			});

			pages.push({
				url: request.url,
				title,
				text_content: textContent,
			});

			// Only follow links on the same host
			await enqueueLinks({
				strategy: 'same-hostname',
			});
		},

		failedRequestHandler({ request }) {
			console.warn(`Crawl failed: ${request.url}`);
		},
	});

	await crawler.run([urlDoc.url]);

	// Index all crawled pages
	for (const pageData of pages) {
		try {
			await indexDocument(hostId, 'pages', {
				id: `${urlDoc._id}_${Buffer.from(pageData.url).toString('base64url')}`,
				url: pageData.url,
				parent_url_id: urlDoc._id.toString(),
				title: pageData.title,
				text_content: pageData.text_content,
				project_id: projectId,
				crawled_at: Math.floor(Date.now() / 1000),
			});
		} catch (err) {
			console.error(`Page index error (${pageData.url}):`, err.message);
		}
	}

	// Update last_crawled
	urlDoc.last_crawled = new Date();
	await urlDoc.save();

	console.log(`Crawled ${pages.length} pages for ${urlDoc.url}`);
	return pages.length;
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
