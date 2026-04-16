import { Project } from '../model/project.js';
import { Note } from '../model/note.js';
import { Memory } from '../model/memory.js';
import { Url } from '../model/url.js';
import { emitToTenant } from '../modules/socket.js';
import * as audit from './audit_service.js';

export async function createDefaultProject(userId, host_id) {
	return Project.create({
		name: 'Default',
		owner: userId,
		host_id,
		is_default: true,
	});
}

export async function createProject(userId, host_id, data, ctx = {}) {
	const project = await Project.create({
		name: data.name,
		owner: userId,
		host_id,
		color: data.color,
	});
	emitToTenant(host_id, 'project:created', project);
	audit.log({ action: 'create', resource: 'project', resource_id: project._id.toString(), user_id: userId, host_id, ...ctx });
	return project;
}

export async function listProjects(host_id) {
	return Project.find({ host_id, is_active: true }).sort({ is_default: -1, name: 1 });
}

export async function getProject(host_id, projectId) {
	return Project.findOne({ _id: projectId, host_id });
}

export async function updateProject(host_id, projectId, data, ctx = {}) {
	const before = ctx.user_id ? await Project.findOne({ _id: projectId, host_id }).lean() : null;

	const project = await Project.findOneAndUpdate(
		{ _id: projectId, host_id },
		{ $set: { name: data.name, color: data.color } },
		{ returnDocument: 'after' },
	);
	if (project) {
		emitToTenant(host_id, 'project:updated', project);
		if (ctx.user_id) {
			const details = audit.diffSnapshot(before, project);
			audit.log({ action: 'update', resource: 'project', resource_id: projectId, host_id, details, ...ctx });
		}
	}
	return project;
}

export async function deleteProject(host_id, projectId, ctx = {}) {
	const project = await Project.findOne({ _id: projectId, host_id });
	if (!project) return null;
	if (project.is_default) throw new Error('Cannot delete the default project');

	project.is_active = false;
	await project.save();
	emitToTenant(host_id, 'project:deleted', { _id: projectId });
	if (ctx.user_id) audit.log({ action: 'delete', resource: 'project', resource_id: projectId, host_id, ...ctx });
	return project;
}

/**
 * Get per-project document counts from MongoDB.
 * Returns { projectId: { notes: N, memory: N, urls: N }, ... }
 */
export async function getProjectCounts(host_id) {
	const [noteCounts, memoryCounts, urlCounts] = await Promise.all([
		Note.aggregate([
			{ $match: { host_id, in_trash: { $ne: true } } },
			{ $group: { _id: '$project', count: { $sum: 1 } } },
		]),
		Memory.aggregate([
			{ $match: { host_id, in_trash: { $ne: true } } },
			{ $group: { _id: '$project', count: { $sum: 1 } } },
		]),
		Url.aggregate([
			{ $match: { host_id, in_trash: { $ne: true } } },
			{ $group: { _id: '$project', count: { $sum: 1 } } },
		]),
	]);

	const counts = {};
	for (const { _id, count } of noteCounts) {
		const pid = _id.toString();
		if (!counts[pid]) counts[pid] = { notes: 0, memory: 0, urls: 0 };
		counts[pid].notes = count;
	}
	for (const { _id, count } of memoryCounts) {
		const pid = _id.toString();
		if (!counts[pid]) counts[pid] = { notes: 0, memory: 0, urls: 0 };
		counts[pid].memory = count;
	}
	for (const { _id, count } of urlCounts) {
		const pid = _id.toString();
		if (!counts[pid]) counts[pid] = { notes: 0, memory: 0, urls: 0 };
		counts[pid].urls = count;
	}

	return counts;
}
