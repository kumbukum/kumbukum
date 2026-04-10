import { Cron } from 'croner';
import { reindexAll } from './crawler.js';

/**
 * Schedule crawl reindexing every 24 hours at 3 AM.
 */
export function startScheduler() {
	new Cron('0 3 * * *', async () => {
		console.log('Starting scheduled reindex...');
		try {
			await reindexAll();
			console.log('Scheduled reindex complete');
		} catch (err) {
			console.error('Scheduled reindex error:', err);
		}
	});

	console.log('Scheduler started: reindex at 03:00 daily');
}
