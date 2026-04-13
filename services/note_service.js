import { Note } from '../model/note.js';
import { searchCollection, removeDocument } from '../modules/typesense.js';
import { emitToTenant } from '../modules/socket.js';

export async function createNote(userId, host_id, data) {
	const note = await Note.create({
		title: data.title,
		content: data.content || '',
		text_content: data.text_content || '',
		tags: data.tags || [],
		project: data.project,
		owner: userId,
		host_id,
	});

	emitToTenant(host_id, 'note:created', note);
	return note;
}

export async function listNotes(host_id, projectId, { page = 1, limit = 50 } = {}) {
	const query = { host_id, in_trash: { $ne: true } };
	if (projectId) query.project = projectId;

	return Note.find(query)
		.select('-content')
		.sort({ updatedAt: -1 })
		.skip((page - 1) * limit)
		.limit(limit);
}

export async function getNote(host_id, noteId) {
	return Note.findOne({ _id: noteId, host_id });
}

export async function updateNote(host_id, noteId, data) {
	const update = {};
	if (data.title !== undefined) update.title = data.title;
	if (data.content !== undefined) update.content = data.content;
	if (data.text_content !== undefined) update.text_content = data.text_content;
	if (data.tags !== undefined) update.tags = data.tags;
	if (data.project !== undefined) update.project = data.project;

	const note = await Note.findOneAndUpdate(
		{ _id: noteId, host_id },
		{ $set: update },
		{ new: true },
	);

	if (note) {
		emitToTenant(host_id, 'note:updated', note);
	}

	return note;
}

export async function deleteNote(host_id, noteId) {
	const note = await Note.findOneAndUpdate(
		{ _id: noteId, host_id, in_trash: { $ne: true } },
		{ $set: { in_trash: true, trashed_at: new Date() } },
		{ new: true },
	);
	if (note) {
		removeDocument(host_id, 'notes', noteId).catch((err) => console.error('Typesense remove error:', err.message));
		emitToTenant(host_id, 'note:deleted', { _id: noteId });
	}
	return note;
}

export async function searchNotes(host_id, query, options = {}) {
	return searchCollection(host_id, 'notes', query, {
		queryBy: 'title,text_content,embedding',
		...options,
	});
}

export async function countNotes(host_id) {
	return Note.countDocuments({ host_id, in_trash: { $ne: true } });
}
