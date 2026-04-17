import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

if (process.env.SENTRY_DSN) {
    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        integrations: [
            nodeProfilingIntegration(),
        ],
        enableLogs: true,
        tracesSampleRate: 1.0,
        profileSessionSampleRate: 1.0,
        profileLifecycle: 'trace',
        sendDefaultPii: true,
    });
}
