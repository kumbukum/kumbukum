import { open } from 'node:fs/promises';
import { fileTypeFromBuffer } from 'file-type';

function looksLikeText(buffer) {
	if (!buffer.length) return true;
	let controlBytes = 0;
	for (const value of buffer) {
		if (value === 0) return false;
		if (value < 9 || (value > 13 && value < 32)) controlBytes++;
	}
	return controlBytes / buffer.length < 0.03;
}

/**
 * Detect file type using magic bytes (first 4100 bytes).
 * Returns { mimeType, extension }.
 * Falls back to text/plain when magic bytes are absent (text files, unknown).
 * Never throws — always returns an object.
 */
export async function detectFileType(filePath) {
	let handle;
	try {
		handle = await open(filePath, 'r');
		const buffer = Buffer.alloc(4100);
		const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
		const header = buffer.subarray(0, bytesRead);
		const result = await fileTypeFromBuffer(header);
		if (result) return { mimeType: result.mime, extension: result.ext };
		return looksLikeText(header) ? { mimeType: 'text/plain', extension: 'txt' } : { mimeType: 'application/octet-stream', extension: 'bin' };
	} catch {
		return { mimeType: 'text/plain', extension: 'txt' };
	} finally {
		await handle?.close().catch(() => {});
	}
}
