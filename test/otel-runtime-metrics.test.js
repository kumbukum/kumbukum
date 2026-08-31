import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const rootPath = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const closeServer = function(server) {
	return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
};

describe('OpenTelemetry runtime metrics', function() {
	it('exports Node.js runtime metrics without breaking HTTP traces', { timeout: 10000 }, async function() {
		const payloads = [];
		const collector = http.createServer(function(request, response) {
			const chunks = [];
			request.on('data', (chunk) => chunks.push(chunk));
			request.on('end', function() {
				payloads.push({ path: request.url, body: Buffer.concat(chunks) });
				response.writeHead(200);
				response.end();
			});
		});

		await new Promise((resolve) => collector.listen(0, '127.0.0.1', resolve));
		const endpoint = `http://127.0.0.1:${collector.address().port}/collector`;
		const childEnv = {
			...process.env,
			ENABLE_OTEL: 'true',
			ENABLED_OTEL: 'true',
			HDX_NODE_CONSOLE_CAPTURE: '0',
			HDX_NODE_STOP_ON_TERMINATION_SIGNALS: 'false',
			HDX_STARTUP_LOGS: 'false',
			HYPERDX_API_KEY: 'test-key',
			NODE_ENV: 'test',
			OTEL_BSP_SCHEDULE_DELAY: '500',
			OTEL_EXPORTER_OTLP_ENDPOINT: endpoint,
			OTEL_EXPORTER_OTLP_HEADERS: 'authorization=test-key',
			OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf',
			OTEL_LOGS_EXPORTER: 'none',
			OTEL_METRICS_EXPORTER: 'otlp',
			OTEL_METRIC_EXPORT_INTERVAL: '1000',
			OTEL_METRIC_EXPORT_TIMEOUT: '500',
			OTEL_SERVICE_NAME: 'streamient-runtime-metrics-test',
			OTEL_TRACES_EXPORTER: 'otlp',
		};
		delete childEnv.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT;
		delete childEnv.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT;
		delete childEnv.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;

		const childScript = `await import('./tracing.js'); const http = await import('node:http'); const app = http.createServer(function(request, response) { response.end('ok'); }); await new Promise(function(resolve) { app.listen(0, '127.0.0.1', resolve); }); await new Promise(function(resolve, reject) { const request = http.get('http://127.0.0.1:' + app.address().port + '/trace-smoke', function(response) { response.resume(); response.on('end', resolve); }); request.on('error', reject); }); await new Promise(function(resolve) { app.close(resolve); }); await new Promise(function(resolve) { setTimeout(resolve, 3200); }); const runtime = await import('./modules/hyperdx_runtime.js'); await runtime.getHyperDX().shutdown(); process.exit(0);`;
		const child = spawn(process.execPath, ['--input-type=module', '-e', childScript], { cwd: rootPath, env: childEnv, stdio: ['ignore', 'ignore', 'pipe'] });
		let stderr = '';
		child.stderr.on('data', (chunk) => stderr += chunk.toString());

		try {
			const exitCode = await new Promise((resolve) => child.on('close', resolve));
			assert.equal(exitCode, 0, stderr);
			const metricPayloads = payloads.filter((payload) => payload.path === '/collector/v1/metrics' && payload.body.length > 2);
			const tracePayloads = payloads.filter((payload) => payload.path === '/collector/v1/traces' && payload.body.length > 2);
			assert(metricPayloads.some((payload) => payload.body.includes(Buffer.from('nodejs.eventloop'))), 'Node.js runtime metrics missing');
			assert(tracePayloads.some((payload) => payload.body.includes(Buffer.from('trace-smoke'))), 'HTTP trace missing');
		} finally {
			await closeServer(collector);
		}
	});
});
