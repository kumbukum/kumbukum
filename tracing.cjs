////////////////////////////////////////////////////////////////////////////////
// OTEL TRACING, METRICS & LOGS - OTLP gRPC CONFIGURATION
// Loaded via --require ./tracing.cjs BEFORE the ESM app starts.
// Only active when ENABLE_OTEL=true.
////////////////////////////////////////////////////////////////////////////////

const process = require('process');
const EventEmitter = require('events');

// OTel instrumentations add multiple listeners per request (Express + Router + HTTP).
// Raise the default to avoid MaxListenersExceededWarning under load.
EventEmitter.defaultMaxListeners = 50;

// Only load OpenTelemetry if ENABLE_OTEL is true
if (process.env.ENABLE_OTEL !== 'true') {
    const noop = () => {};
    const noOpSpan = { setAttribute: noop, setStatus: noop, end: noop, recordException: noop, addEvent: noop };
    module.exports = {
        createCustomSpan: (name, fn, attributes = {}) => {
            try {
                const result = fn(noOpSpan);
                return result && typeof result.then === 'function' ? result : result;
            } catch (error) {
                throw error;
            }
        },
        createChildSpan: (name, fn, attributes = {}) => {
            try {
                const result = fn(noOpSpan);
                return result && typeof result.then === 'function' ? result : result;
            } catch (error) {
                throw error;
            }
        },
        getCurrentTraceInfo: () => ({ traceId: null, spanId: null }),
    };
    return;
}

let opentelemetry, getNodeAutoInstrumentations, IORedisInstrumentation, PeriodicExportingMetricReader;
let OTLPTraceExporter, OTLPMetricExporter;
let OTLPLogExporter, BatchLogRecordProcessor;
let trace, context;
let sdk;

try {
    opentelemetry = require('@opentelemetry/sdk-node');
    getNodeAutoInstrumentations = require('@opentelemetry/auto-instrumentations-node').getNodeAutoInstrumentations;
    IORedisInstrumentation = require('@opentelemetry/instrumentation-ioredis').IORedisInstrumentation;
    PeriodicExportingMetricReader = require('@opentelemetry/sdk-metrics').PeriodicExportingMetricReader;

    OTLPTraceExporter = require('@opentelemetry/exporter-trace-otlp-grpc').OTLPTraceExporter;
    OTLPMetricExporter = require('@opentelemetry/exporter-metrics-otlp-grpc').OTLPMetricExporter;

    OTLPLogExporter = require('@opentelemetry/exporter-logs-otlp-grpc').OTLPLogExporter;
    BatchLogRecordProcessor = require('@opentelemetry/sdk-logs').BatchLogRecordProcessor;

    var { resourceFromAttributes } = require('@opentelemetry/resources');
    var { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION, ATTR_SERVICE_NAMESPACE } = require('@opentelemetry/semantic-conventions');
} catch (err) {
    console.warn('OpenTelemetry packages not available, tracing disabled:', err.message);
    const noop = () => {};
    const noOpSpan = { setAttribute: noop, setStatus: noop, end: noop, recordException: noop, addEvent: noop };
    module.exports = {
        createCustomSpan: (name, fn, attributes = {}) => {
            try {
                const result = fn(noOpSpan);
                return result && typeof result.then === 'function' ? result : result;
            } catch (error) {
                throw error;
            }
        },
        createChildSpan: (name, fn, attributes = {}) => {
            try {
                const result = fn(noOpSpan);
                return result && typeof result.then === 'function' ? result : result;
            } catch (error) {
                throw error;
            }
        },
        getCurrentTraceInfo: () => ({ traceId: null, spanId: null }),
    };
    return;
}

// Wrapper exporter that strips known benign exceptions so they don't
// appear in SigNoz's Exceptions tab.
const SUPPRESSED_EXCEPTION_TYPES = ['AlreadyExistsException', '11000'];

class FilteredTraceExporter {
    constructor(delegate) {
        this._delegate = delegate;
    }

    export(spans, resultCallback) {
        for (const span of spans) {
            if (span.events && span.events.length > 0) {
                const originalLength = span.events.length;
                span.events = span.events.filter(event => {
                    return !(event.name === 'exception' &&
                        event.attributes &&
                        SUPPRESSED_EXCEPTION_TYPES.includes(event.attributes['exception.type']));
                });
                if (span.events.length < originalLength &&
                    !span.events.some(e => e.name === 'exception') &&
                    span.status && span.status.code === 2) {
                    span.status = { code: 1 };
                }
            }
        }
        this._delegate.export(spans, resultCallback);
    }

    shutdown() { return this._delegate.shutdown(); }
    forceFlush() { return this._delegate.forceFlush ? this._delegate.forceFlush() : Promise.resolve(); }
}

// Configure exporters (OTLP gRPC) — endpoint via OTEL_EXPORTER_OTLP_ENDPOINT env var
const traceExporter = new FilteredTraceExporter(new OTLPTraceExporter({}));
const metricExporter = new OTLPMetricExporter({});
const logExporter = new OTLPLogExporter({});
const logRecordProcessors = [new BatchLogRecordProcessor(logExporter)];

const metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: parseInt(process.env.OTEL_METRIC_EXPORT_INTERVAL || '15000', 10),
});

// Service identity
var _serviceName = process.env.OTEL_SERVICE_NAME || 'kumbukum';
var _resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: _serviceName,
    [ATTR_SERVICE_VERSION]: process.env.npm_package_version || '0',
    [ATTR_SERVICE_NAMESPACE]: 'kumbukum',
    'deployment.environment': process.env.NODE_ENV || 'production',
});

console.log('[OTEL] Initializing gRPC exporters → endpoint:', process.env.OTEL_EXPORTER_OTLP_ENDPOINT, '| service:', _serviceName);

try {
    sdk = new opentelemetry.NodeSDK({
        resource: _resource,
        traceExporter,
        metricReader,
        logRecordProcessors,
        instrumentations: [getNodeAutoInstrumentations(), new IORedisInstrumentation()],
    });

    sdk.start();
    console.log('[OTEL] SDK started successfully');
} catch (err) {
    console.warn('Failed to initialize OpenTelemetry SDK:', err.message);
    const noop = () => {};
    const noOpSpan = { setAttribute: noop, setStatus: noop, end: noop, recordException: noop, addEvent: noop };
    module.exports = {
        createCustomSpan: (name, fn, attributes = {}) => {
            try {
                const result = fn(noOpSpan);
                return result && typeof result.then === 'function' ? result : result;
            } catch (error) {
                throw error;
            }
        },
        createChildSpan: (name, fn, attributes = {}) => {
            try {
                const result = fn(noOpSpan);
                return result && typeof result.then === 'function' ? result : result;
            } catch (error) {
                throw error;
            }
        },
        getCurrentTraceInfo: () => ({ traceId: null, spanId: null }),
    };
    return;
}

// Export utilities for manual tracing
try {
    const otelApi = require('@opentelemetry/api');
    trace = otelApi.trace;
    context = otelApi.context;
} catch (err) {
    console.warn('OpenTelemetry API not available, tracing disabled:', err.message);
    const noop = () => {};
    const noOpSpan = { setAttribute: noop, setStatus: noop, end: noop, recordException: noop, addEvent: noop };
    module.exports = {
        createCustomSpan: (name, fn, attributes = {}) => {
            try {
                const result = fn(noOpSpan);
                return result && typeof result.then === 'function' ? result : result;
            } catch (error) {
                throw error;
            }
        },
        createChildSpan: (name, fn, attributes = {}) => {
            try {
                const result = fn(noOpSpan);
                return result && typeof result.then === 'function' ? result : result;
            } catch (error) {
                throw error;
            }
        },
        getCurrentTraceInfo: () => ({ traceId: null, spanId: null }),
    };
    return;
}

function createCustomSpan(name, fn, attributes = {}) {
    const tracer = trace.getTracer('kumbukum-custom');
    const span = tracer.startSpan(name, { attributes });
    const ctx = trace.setSpan(context.active(), span);

    try {
        const result = context.with(ctx, () => fn(span));

        if (result && typeof result.then === 'function') {
            return result.then((value) => {
                span.setStatus({ code: 1 });
                span.end();
                return value;
            }).catch((error) => {
                span.recordException(error);
                span.setStatus({ code: 2, message: error.message });
                span.end();
                throw error;
            });
        }

        span.setStatus({ code: 1 });
        span.end();
        return result;
    } catch (error) {
        span.recordException(error);
        span.setStatus({ code: 2, message: error.message });
        span.end();
        throw error;
    }
}

function getCurrentTraceInfo() {
    const currentSpan = trace.getSpan(context.active());
    if (currentSpan) {
        const spanContext = currentSpan.spanContext();
        return { traceId: spanContext.traceId, spanId: spanContext.spanId };
    }
    return { traceId: null, spanId: null };
}

function createChildSpan(name, fn, attributes = {}) {
    return createCustomSpan(name, fn, attributes);
}

module.exports = { createCustomSpan, createChildSpan, getCurrentTraceInfo };

// Graceful shutdown — do NOT call process.exit() so the app manages its own lifecycle
if (sdk) {
    let isShuttingDown = false;

    const shutdown = async () => {
        if (isShuttingDown) return;
        isShuttingDown = true;
        try {
            await sdk.shutdown();
            console.log('OpenTelemetry tracing terminated gracefully');
        } catch (error) {
            console.log('Error terminating tracing', error);
        }
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}
