import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const docsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(docsRoot, '.vitepress', 'dist');
const fallbackDescription = 'Documentation for Streamient — Notes, Memory, URLs, AI Chat';

function findHtmlFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) return findHtmlFiles(entryPath);
        return entry.name.endsWith('.html') ? [entryPath] : [];
    });
}

function duplicateValues(pages, field) {
    const groups = new Map();
    for (const page of pages) groups.set(page[field], [...(groups.get(page[field]) || []), page.file]);
    return [...groups.entries()].filter(([, files]) => files.length > 1);
}

const pages = findHtmlFiles(outputRoot)
    .filter(file => path.relative(outputRoot, file) !== '404.html')
    .map(file => {
        const html = fs.readFileSync(file, 'utf8');
        return {
            file: path.relative(outputRoot, file),
            title: html.match(/<title>(.*?)<\/title>/s)?.[1]?.trim() || '',
            description: html.match(/<meta name="description" content="([^"]*)"/)?.[1]?.trim() || '',
        };
    });

const errors = [];
for (const page of pages) {
    if (!page.title) errors.push(`${page.file}: missing title`);
    if (!page.description) errors.push(`${page.file}: missing meta description`);
    if (page.description === fallbackDescription) errors.push(`${page.file}: uses the site-wide fallback description`);
    if (page.description.length > 160) errors.push(`${page.file}: meta description exceeds 160 characters`);
}

for (const field of ['title', 'description']) {
    for (const [value, files] of duplicateValues(pages, field)) errors.push(`Duplicate ${field} ${JSON.stringify(value)}: ${files.join(', ')}`);
}

if (errors.length) {
    console.error(`Documentation SEO metadata check failed:\n${errors.map(error => `- ${error}`).join('\n')}`);
    process.exitCode = 1;
} else {
    console.log(`Verified unique titles and meta descriptions for ${pages.length} documentation pages.`);
}
