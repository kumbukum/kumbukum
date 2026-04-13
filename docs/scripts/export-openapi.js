import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, '..', 'public');
const dataDir = resolve(__dirname, '..', '.vitepress', 'data');

const { default: swaggerSpec } = await import('../../swagger.js');

// Override relative server URL so vitepress-openapi can resolve it
swaggerSpec.servers = [
    { url: 'https://your-instance.example.com/api/v1', description: 'API v1' },
];

const json = JSON.stringify(swaggerSpec, null, 2);

mkdirSync(publicDir, { recursive: true });
mkdirSync(dataDir, { recursive: true });
writeFileSync(resolve(publicDir, 'openapi.json'), json);
writeFileSync(resolve(dataDir, 'openapi.json'), json);

console.log('OpenAPI spec written to public/ and .vitepress/data/');
