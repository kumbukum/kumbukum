import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

if (process.env.SENTRY_DSN !== '') {
    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        integrations: [
            nodeProfilingIntegration(),
            // send console.log, console.warn, and console.error calls as logs to Sentry
            Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] }),
        ],
        enableLogs: true,
        tracesSampleRate: 1.0,
        profileSessionSampleRate: 1.0,
        profileLifecycle: 'trace',
        sendDefaultPii: true,
    });
}
