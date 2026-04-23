import { Cron } from 'croner';
import { reindexDue } from './crawler.js';
import { indexMissing } from './typesense.js';
import { User } from '../model/user.js';
import { Note } from '../model/note.js';
import { Memory } from '../model/memory.js';
import { Url } from '../model/url.js';
import { sendTrialEndingEmail } from '../services/email_service.js';
import { cleanupExpiredExports } from '../services/export_service.js';
import { runScheduledSync } from '../services/git_sync_service.js';

/**
 * Schedule crawl reindexing for due URLs every 10 minutes.
 * Schedule trial-ending reminders daily at 9 AM.
 * Schedule Typesense catch-up indexing every 5 minutes.
 */
export function startScheduler() {
	let crawlReindexRunning = false;
	new Cron('*/10 * * * *', async () => {
		if (crawlReindexRunning) return;
		crawlReindexRunning = true;
		try {
			const crawled = await reindexDue({ intervalHours: 24 });
			if (crawled > 0) console.log(`Scheduled due crawl complete: crawled ${crawled} URL(s)`);
		} catch (err) {
			console.error('Scheduled due crawl error:', err);
		} finally {
			crawlReindexRunning = false;
		}
	});

	// Trial ending reminder: notify users whose trial ends in exactly 3 days
	new Cron('0 9 * * *', async () => {
		try {
			const now = new Date();
			const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
			const fourDaysFromNow = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);

			const users = await User.find({
				subscription_status: 'trialing',
				trial_ends_at: { $gte: threeDaysFromNow, $lt: fourDaysFromNow },
			});

			for (const user of users) {
				const endDate = new Date(user.trial_ends_at).toLocaleDateString();
				sendTrialEndingEmail(user.email, user.name, 3, endDate).catch((e) =>
					console.warn(`Trial reminder failed for ${user.email}:`, e.message),
				);
			}

			console.log(`Trial reminder run complete: sent ${users.length} reminder(s)`);
		} catch (err) {
			console.error('Trial reminder error:', err);
		}
	});

	// Batch indexing: find documents with is_indexed:false and batch-import to Typesense
	new Cron('*/20 * * * * *', async () => {
		try {
			const indexed = await indexMissing({ Note, Memory, Url });
			if (indexed > 0) console.log(`Index batch complete: indexed ${indexed} document(s)`);
		} catch (err) {
			console.error('Index batch error:', err);
		}
	});

	// Cleanup expired export files every hour
	new Cron('0 * * * *', async () => {
		try {
			const cleaned = await cleanupExpiredExports();
			console.log(`Export cleanup complete: removed ${cleaned} export(s)`);
		} catch (err) {
			console.error('Export cleanup error:', err);
		}
	});

	// Git repo sync every 10 minutes
	new Cron('*/10 * * * *', async () => {
		try {
			const summary = await runScheduledSync();
			console.log(`Git sync run complete: checked ${summary.checked} repo(s), due ${summary.due}, synced ${summary.synced}, failed ${summary.failed}`);
		} catch (err) {
			console.error('Git sync scheduler error:', err);
		}
	});

	console.log('Scheduler started: due crawl every 10min, trial reminders at 09:00, batch index every 20s, export cleanup hourly, git sync every 10min');
}
