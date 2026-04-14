/**
 * Standalone scheduler process for production (separate container).
 * Runs cron jobs without serving HTTP traffic.
 */
import { connectDB } from './db.js';
import { initTypesense } from './modules/typesense.js';
import { startScheduler } from './modules/scheduler.js';

async function start() {
    await connectDB();
    await initTypesense();
    startScheduler();
    console.log('Scheduler process running');
}

start().catch((err) => {
    console.error('Scheduler failed to start:', err);
    process.exit(1);
});
