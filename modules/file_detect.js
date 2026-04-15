import { readFile } from 'node:fs/promises';
import { fileTypeFromBuffer } from 'file-type';

/**
 * Detect file type using magic bytes (first 4100 bytes).
 * Returns { mimeType, extension }.
 * Falls back to text/plain when magic bytes are absent (text files, unknown).
 * Never throws — always returns an object.
 */
export async function detectFileType(filePath) {
    try {
        const buf = await readFile(filePath);
        const result = await fileTypeFromBuffer(buf);
        if (result) {
            return { mimeType: result.mime, extension: result.ext };
        }
        return { mimeType: 'text/plain', extension: 'txt' };
    } catch {
        return { mimeType: 'text/plain', extension: 'txt' };
    }
}
