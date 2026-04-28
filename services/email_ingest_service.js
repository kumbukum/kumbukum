import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import striptags from 'striptags';
import { simpleParser } from 'mailparser';

import { Email } from '../model/email.js';
import { GraphLink } from '../model/graph_link.js';
import { extractText } from './import_service.js';
import { detectFileType } from '../modules/file_detect.js';
import { searchCollection, removeDocument } from '../modules/typesense.js';
import { emitToTenant } from '../modules/socket.js';
import { invalidateGraphCache, removeLinksForItem } from './graph_service.js';
import * as audit from './audit_service.js';

const MAX_ATTACHMENT_SIZE = 50 * 1024 * 1024;

function canonicalMessageId(value) {
	const raw = String(value || '').trim();
	if (!raw) return '';
	return raw.replace(/^<+|>+$/g, '').trim().toLowerCase();
}

function getHeaderValue(headers, name) {
	if (!headers) return '';
	if (typeof headers.get === 'function') return headers.get(name) || headers.get(name.toLowerCase()) || '';
	const lowerName = name.toLowerCase();
	if (Array.isArray(headers)) {
		const found = headers.find((entry) => {
			const key = entry?.key || entry?.name || entry?.[0];
			return String(key || '').toLowerCase() === lowerName;
		});
		return found?.value || found?.[1] || '';
	}
	if (typeof headers === 'object') {
		for (const [key, value] of Object.entries(headers)) {
			if (key.toLowerCase() === lowerName) return value;
		}
	}
	return '';
}

function parseReferences(value) {
	if (!value) return [];
	if (Array.isArray(value)) {
		return [...new Set(value.map(canonicalMessageId).filter(Boolean))];
	}
	const text = String(value);
	const matches = text.match(/<[^>]+>/g) || text.split(/[\s,]+/g);
	return [...new Set(matches.map(canonicalMessageId).filter(Boolean))];
}

function extractEmailAddress(value) {
	const text = String(value || '').trim();
	if (!text) return '';
	const bracketMatch = text.match(/<([^<>]+)>/);
	const address = bracketMatch ? bracketMatch[1] : text;
	const emailMatch = address.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
	return String(emailMatch ? emailMatch[0] : address).trim().toLowerCase();
}

function normalizeRecipientList(value) {
	if (!value) return [];
	if (Array.isArray(value)) {
		return value
			.flatMap((entry) => {
				if (typeof entry === 'string') return extractEmailAddress(entry);
				if (entry?.address) return extractEmailAddress(entry.address);
				if (Array.isArray(entry?.value)) {
					return entry.value
						.map((item) => extractEmailAddress(item?.address || item?.text || item))
						.filter(Boolean);
				}
				if (entry?.value?.address) return extractEmailAddress(entry.value.address);
				return '';
			})
			.filter(Boolean);
	}
	if (typeof value === 'string') {
		return value
			.split(',')
			.map((v) => extractEmailAddress(v))
			.filter(Boolean);
	}
	if (value?.value && Array.isArray(value.value)) {
		return value.value
			.map((entry) => extractEmailAddress(entry?.address || entry?.text || entry))
			.filter(Boolean);
	}
	if (value?.address) return [extractEmailAddress(value.address)].filter(Boolean);
	return [];
}

function normalizeBodyText(parsed) {
	const text = String(parsed?.text || '').trim();
	if (text) return text;
	const html = String(parsed?.html || '').trim();
	if (!html) return '';
	return striptags(html, [], ' ').replace(/\s+/g, ' ').trim();
}

function normalizeForwardedBodyText(parsed) {
	return String(parsed?.text || parsed?.text_content || parsed?.body_text || '').trim();
}

function toBuffer(content, transferEncoding) {
	if (!content) return null;
	if (Buffer.isBuffer(content)) return content;
	if (typeof content === 'string') {
		const encoding = String(transferEncoding || '').toLowerCase();
		if (encoding === 'base64') return Buffer.from(content, 'base64');
		return Buffer.from(content, 'utf8');
	}
	return null;
}

async function extractAttachmentText(attachment) {
	const filename = attachment.filename || attachment.fileName || 'attachment.txt';
	const rawBuffer = toBuffer(
		attachment.content || attachment.contentBase64 || attachment.content_base64 || attachment.data,
		attachment.contentTransferEncoding || attachment.content_transfer_encoding || attachment.transferEncoding,
	);
	if (!rawBuffer || rawBuffer.length === 0) return '';
	if (rawBuffer.length > MAX_ATTACHMENT_SIZE) return '';

	const tmpPath = path.join(os.tmpdir(), `email-attachment-${crypto.randomUUID()}`);
	try {
		await fs.writeFile(tmpPath, rawBuffer);
		const detected = await detectFileType(tmpPath);
		const mimeType = attachment.contentType || attachment.content_type || detected.mimeType || 'text/plain';
		const { text } = await extractText(tmpPath, mimeType, filename);
		return (text || '').trim();
	} catch {
		return '';
	} finally {
		await fs.unlink(tmpPath).catch(() => {});
	}
}

async function extractAttachmentTextContent(attachments = []) {
	if (!Array.isArray(attachments) || attachments.length === 0) return '';
	const chunks = [];
	for (const attachment of attachments) {
		const text = await extractAttachmentText(attachment);
		if (text) chunks.push(text);
	}
	return chunks.join('\n\n').trim();
}

export async function parseEmailInput(data) {
	if (data?.raw_email) {
		const parsed = await simpleParser(data.raw_email);
		return {
			message_id: canonicalMessageId(parsed.messageId || getHeaderValue(parsed.headers, 'message-id')),
			references: parseReferences(parsed.references || getHeaderValue(parsed.headers, 'references')),
			in_reply_to: canonicalMessageId(parsed.inReplyTo || getHeaderValue(parsed.headers, 'in-reply-to')),
			from: normalizeRecipientList(parsed.from),
			to: normalizeRecipientList(parsed.to),
			cc: normalizeRecipientList(parsed.cc),
			bcc: normalizeRecipientList(parsed.bcc),
			subject: String(parsed.subject || '').trim(),
			text_content: normalizeBodyText(parsed),
			attachment_text_content: await extractAttachmentTextContent(parsed.attachments || []),
			raw_hash: crypto.createHash('sha256').update(data.raw_email).digest('hex'),
		};
	}

	const parsed = data?.parsed_email || data?.mailparser || data;
	if (!parsed || typeof parsed !== 'object') {
		throw new Error('Provide raw_email or parsed_email');
	}

	return {
		message_id: canonicalMessageId(parsed.messageId || parsed.message_id || getHeaderValue(parsed.headers, 'message-id')),
		references: parseReferences(parsed.references || getHeaderValue(parsed.headers, 'references')),
		in_reply_to: canonicalMessageId(parsed.inReplyTo || parsed.in_reply_to || getHeaderValue(parsed.headers, 'in-reply-to')),
		from: normalizeRecipientList(parsed.from || getHeaderValue(parsed.headers, 'from')),
		to: normalizeRecipientList(parsed.to || getHeaderValue(parsed.headers, 'to')),
		cc: normalizeRecipientList(parsed.cc || getHeaderValue(parsed.headers, 'cc')),
		bcc: normalizeRecipientList(parsed.bcc || getHeaderValue(parsed.headers, 'bcc')),
		subject: String(parsed.subject || '').trim(),
		text_content: normalizeBodyText(parsed),
		attachment_text_content: await extractAttachmentTextContent(parsed.attachments || []),
		raw_hash: parsed.raw_hash || '',
	};
}

export function parseForwardedEmailInput(data) {
	const parsed = data?.parsed_email || data?.mailparser || data;
	if (!parsed || typeof parsed !== 'object') {
		throw new Error('Provide forwarded email JSON');
	}

	return {
		message_id: canonicalMessageId(parsed.messageId || parsed.message_id || getHeaderValue(parsed.headers, 'message-id')),
		references: parseReferences(parsed.references || getHeaderValue(parsed.headers, 'references')),
		in_reply_to: canonicalMessageId(parsed.inReplyTo || parsed.in_reply_to || getHeaderValue(parsed.headers, 'in-reply-to')),
		from: normalizeRecipientList(parsed.from || getHeaderValue(parsed.headers, 'from')),
		to: normalizeRecipientList(parsed.to || getHeaderValue(parsed.headers, 'to')),
		cc: normalizeRecipientList(parsed.cc || getHeaderValue(parsed.headers, 'cc')),
		bcc: normalizeRecipientList(parsed.bcc || getHeaderValue(parsed.headers, 'bcc')),
		subject: String(parsed.subject || getHeaderValue(parsed.headers, 'subject') || '').trim(),
		text_content: normalizeForwardedBodyText(parsed),
		attachment_text_content: '',
		raw_hash: parsed.raw_hash || '',
	};
}

async function createEmailThreadLinks(email, userId, host_id) {
	const referencedMessageIds = [...new Set([...(email.references || []), email.in_reply_to].map(canonicalMessageId).filter(Boolean))];
	if (referencedMessageIds.length === 0) return;

	const linkedEmails = await Email.find({
		host_id,
		in_trash: { $ne: true },
		message_id: { $in: referencedMessageIds },
		_id: { $ne: email._id },
	}).select('_id').lean();

	let created = false;
	for (const linkedEmail of linkedEmails) {
		const result = await GraphLink.updateOne(
			{
				host_id,
				source_id: linkedEmail._id,
				source_type: 'emails',
				target_id: email._id,
				target_type: 'emails',
			},
			{
				$setOnInsert: {
					source_id: linkedEmail._id,
					source_type: 'emails',
					target_id: email._id,
					target_type: 'emails',
					label: 'thread',
					owner: userId,
					host_id,
				},
			},
			{ upsert: true },
		);
		if (result.upsertedCount > 0) created = true;
	}

	if (created) invalidateGraphCache(host_id).catch(() => {});
}

async function persistEmail(userId, host_id, normalized, data, ctx = {}) {
	if (!normalized.subject && !normalized.text_content && !normalized.attachment_text_content) {
		throw new Error('Email content is empty after normalization');
	}

	const payload = {
		...normalized,
		source: data.source === 'emailforwarding' ? 'emailforwarding' : 'api',
		project: data.project,
		owner: userId,
		host_id,
		is_indexed: false,
		in_trash: false,
		trashed_at: null,
	};

	let email;
	if (normalized.message_id) {
		const existing = await Email.findOne({ message_id: normalized.message_id });
		if (existing && existing.host_id !== host_id) {
			throw new Error('Email message already exists');
		}
		if (existing) {
			email = await Email.findOneAndUpdate(
				{ _id: existing._id, host_id },
				{ $set: payload },
				{ returnDocument: 'after' },
			);
		} else {
			email = await Email.create(payload);
		}
	} else {
		email = await Email.create(payload);
	}

	await createEmailThreadLinks(email, userId, host_id);
	emitToTenant(host_id, 'email:created', email);
	invalidateGraphCache(host_id).catch(() => {});
	audit.log({ action: 'create', resource: 'email', resource_id: email._id.toString(), user_id: userId, host_id, ...ctx });
	removeDocument(host_id, 'emails', email._id.toString()).catch((err) => console.error('Typesense remove error:', err.message));
	return email;
}

export async function ingestEmail(userId, host_id, data, ctx = {}) {
	const normalized = await parseEmailInput(data);
	return persistEmail(userId, host_id, normalized, data, ctx);
}

export async function ingestForwardedEmail(userId, host_id, data, ctx = {}) {
	const normalized = parseForwardedEmailInput(data);
	return persistEmail(userId, host_id, normalized, { ...data, source: 'emailforwarding' }, ctx);
}

export async function listEmails(host_id, projectId, { page = 1, limit = 50 } = {}) {
	const query = { host_id, in_trash: { $ne: true } };
	if (projectId) query.project = projectId;

	return Email.find(query)
		.sort({ updatedAt: -1 })
		.skip((page - 1) * limit)
		.limit(limit);
}

export async function getEmail(host_id, emailId) {
	return Email.findOne({ _id: emailId, host_id });
}

export async function updateEmail(host_id, emailId, data, ctx = {}) {
	const update = {};
	if (data.subject !== undefined) update.subject = data.subject;
	if (data.text_content !== undefined) update.text_content = data.text_content;
	if (data.from !== undefined) update.from = normalizeRecipientList(data.from);
	if (data.to !== undefined) update.to = normalizeRecipientList(data.to);
	if (data.cc !== undefined) update.cc = normalizeRecipientList(data.cc);
	if (data.bcc !== undefined) update.bcc = normalizeRecipientList(data.bcc);
	if (data.project !== undefined) update.project = data.project;
	update.is_indexed = false;

	const before = ctx.user_id ? await Email.findOne({ _id: emailId, host_id }).lean() : null;
	const email = await Email.findOneAndUpdate(
		{ _id: emailId, host_id },
		{ $set: update },
		{ returnDocument: 'after' },
	);

	if (email) {
		removeDocument(host_id, 'emails', emailId).catch((err) => console.error('Typesense remove error:', err.message));
		emitToTenant(host_id, 'email:updated', email);
		invalidateGraphCache(host_id).catch(() => {});
		if (ctx.user_id) {
			const details = audit.diffSnapshot(before, email);
			audit.log({ action: 'update', resource: 'email', resource_id: emailId, host_id, details, ...ctx });
		}
	}

	return email;
}

export async function deleteEmail(host_id, emailId, ctx = {}) {
	const email = await Email.findOneAndUpdate(
		{ _id: emailId, host_id, in_trash: { $ne: true } },
		{ $set: { in_trash: true, trashed_at: new Date() } },
		{ returnDocument: 'after' },
	);
	if (email) {
		removeDocument(host_id, 'emails', emailId).catch((err) => console.error('Typesense remove error:', err.message));
		removeLinksForItem(host_id, emailId).catch((err) => console.error('Remove links error:', err.message));
		emitToTenant(host_id, 'email:deleted', { _id: emailId });
		invalidateGraphCache(host_id).catch(() => {});
		if (ctx.user_id) audit.log({ action: 'delete', resource: 'email', resource_id: emailId, host_id, ...ctx });
	}
	return email;
}

export async function searchEmails(host_id, query, options = {}) {
	return searchCollection(host_id, 'emails', query, {
		queryBy: 'subject,text_content,attachment_text_content,from,to,cc,bcc,embedding',
		...options,
	});
}

export async function countEmails(host_id) {
	return Email.countDocuments({ host_id, in_trash: { $ne: true } });
}

export async function getEmailThread(host_id, emailId) {
	const root = await Email.findOne({ _id: emailId, host_id, in_trash: { $ne: true } }).lean();
	if (!root) return [];

	const seenIds = new Set();
	const seenMessageIds = new Set();
	const queue = [];

	function enqueueMessageId(messageId) {
		const canonical = canonicalMessageId(messageId);
		if (!canonical || seenMessageIds.has(canonical)) return;
		seenMessageIds.add(canonical);
		queue.push(canonical);
	}

	enqueueMessageId(root.message_id);
	for (const ref of root.references || []) enqueueMessageId(ref);
	enqueueMessageId(root.in_reply_to);

	const threadDocs = [];
	if (!seenIds.has(root._id.toString())) {
		threadDocs.push(root);
		seenIds.add(root._id.toString());
	}

	while (queue.length > 0) {
		const currentMessageId = queue.shift();
		const linked = await Email.find({
			host_id,
			in_trash: { $ne: true },
			$or: [
				{ message_id: currentMessageId },
				{ references: currentMessageId },
				{ in_reply_to: currentMessageId },
			],
		}).lean();

		for (const doc of linked) {
			const docId = doc._id.toString();
			if (!seenIds.has(docId)) {
				seenIds.add(docId);
				threadDocs.push(doc);
			}
			enqueueMessageId(doc.message_id);
			for (const ref of doc.references || []) enqueueMessageId(ref);
			enqueueMessageId(doc.in_reply_to);
		}
	}

	return threadDocs.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}
