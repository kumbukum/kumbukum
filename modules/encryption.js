import crypto from 'node:crypto';
import config from '../config.js';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey() {
	const raw = config.gitEncryptionKey;
	if (!raw) throw new Error('GIT_ENCRYPTION_KEY is not configured');
	// Accept hex (64 chars) or raw 32-byte string
	if (raw.length === 64) return Buffer.from(raw, 'hex');
	if (raw.length === 32) return Buffer.from(raw, 'utf8');
	throw new Error('GIT_ENCRYPTION_KEY must be 32 bytes (or 64 hex chars)');
}

export function encrypt(plaintext) {
	if (!plaintext) return '';
	const key = getKey();
	const iv = crypto.randomBytes(IV_LEN);
	const cipher = crypto.createCipheriv(ALGO, key, iv);
	const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	// iv:tag:ciphertext  (all hex)
	return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(ciphertext) {
	if (!ciphertext) return '';
	const key = getKey();
	const [ivHex, tagHex, encHex] = ciphertext.split(':');
	if (!ivHex || !tagHex || !encHex) throw new Error('Invalid encrypted value');
	const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'));
	decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
	return decipher.update(encHex, 'hex', 'utf8') + decipher.final('utf8');
}
