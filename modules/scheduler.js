import { Cron } from 'croner';
import { reindexAll } from './crawler.js';
import { indexMissing } from './typesense.js';
import { User } from '../model/user.js';
import { Note } from '../model/note.js';
import { Memory } from '../model/memory.js';
import { Url } from '../model/url.js';
import { sendTrialEndingEmail } from '../services/email_service.js';
import { cleanupExpiredExports } from '../services/export_service.js';
import { runScheduledSync } from '../services/git_sync_service.js';

/**
 * Schedule crawl reindexing every 24 hours at 3 AM.
 * Schedule trial-ending reminders daily at 9 AM.
 * Schedule Typesense catch-up indexing every 5 minutes.
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

			if (users.length > 0) {
				console.log(`Sent ${users.length} trial-ending reminder(s)`);
			}
		} catch (err) {
			console.error('Trial reminder error:', err);
		}
	});

	// Batch indexing: find documents with is_indexed:false and batch-import to Typesense
	new Cron('*/20 * * * * *', async () => {
		try {
			await indexMissing({ Note, Memory, Url });
		} catch (err) {
			console.error('Index batch error:', err);
		}
	});

	// Cleanup expired export files every hour
	new Cron('0 * * * *', async () => {
		try {
			await cleanupExpiredExports();
		} catch (err) {
			console.error('Export cleanup error:', err);
		}
	});

	// Git repo sync every 10 minutes
	new Cron('*/10 * * * *', async () => {
		try {
			await runScheduledSync();
		} catch (err) {
			console.error('Git sync scheduler error:', err);
		}
	});

	console.log('Scheduler started: reindex at 03:00, trial reminders at 09:00, batch index every 20s, export cleanup hourly, git sync every 10min');
}
