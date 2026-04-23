import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseEmailInput, getEmailThread } from '../services/email_ingest_service.js';
import { Email } from '../model/email.js';

describe('Email ingest service', () => {
	it('normalizes parsed payload fields', async () => {
		const normalized = await parseEmailInput({
			parsed_email: {
				message_id: '<Msg-123@Example.COM>',
				references: '<Root@Example.com> <Prev@Example.com>',
				to: 'a@example.com, b@example.com',
				cc: [{ address: 'CC@Example.com' }],
				bcc: [{ value: [{ address: 'hidden@example.com' }] }],
				subject: '  Hello world  ',
				html: '<p>Hello <b>Team</b></p>',
				attachments: [],
			},
		});

		assert.equal(normalized.message_id, 'msg-123@example.com');
		assert.deepEqual(normalized.references, ['root@example.com', 'prev@example.com']);
		assert.deepEqual(normalized.to, ['a@example.com', 'b@example.com']);
		assert.deepEqual(normalized.cc, ['cc@example.com']);
		assert.deepEqual(normalized.bcc, ['hidden@example.com']);
		assert.equal(normalized.subject, 'Hello world');
		assert.equal(normalized.text_content, 'Hello Team');
	});

	it('builds thread via message_id and references', async () => {
		const root = {
			_id: { toString: () => '1' },
			message_id: 'msg-a@example.com',
			references: ['msg-b@example.com'],
			createdAt: '2026-01-01T10:00:00.000Z',
		};
		const parent = {
			_id: { toString: () => '2' },
			message_id: 'msg-b@example.com',
			references: [],
			createdAt: '2026-01-01T09:00:00.000Z',
		};
		const reply = {
			_id: { toString: () => '3' },
			message_id: 'msg-c@example.com',
			references: ['msg-a@example.com'],
			createdAt: '2026-01-01T11:00:00.000Z',
		};

		const originalFindOne = Email.findOne;
		const originalFind = Email.find;

		Email.findOne = () => ({
			lean: async () => root,
		});
		Email.find = (query) => ({
			lean: async () => {
				const messageId = query?.$or?.[0]?.message_id || query?.$or?.[1]?.references;
				if (messageId === 'msg-a@example.com') return [root, reply];
				if (messageId === 'msg-b@example.com') return [parent];
				return [];
			},
		});

		try {
			const thread = await getEmailThread('host-1', '1');
			assert.equal(thread.length, 3);
			assert.equal(thread[0].message_id, 'msg-b@example.com');
			assert.equal(thread[1].message_id, 'msg-a@example.com');
			assert.equal(thread[2].message_id, 'msg-c@example.com');
		} finally {
			Email.findOne = originalFindOne;
			Email.find = originalFind;
		}
	});
});
