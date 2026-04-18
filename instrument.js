import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

// When ENABLE_OTEL=true, Sentry is initialized in tracing.cjs with
// skipOpenTelemetrySetup so it integrates with the existing OTel SDK.
if (process.env.SENTRY_DSN && process.env.ENABLE_OTEL !== 'true') {
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
