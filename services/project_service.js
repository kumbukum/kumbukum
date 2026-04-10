import { Project } from '../model/project.js';
import { emitToTenant } from '../modules/socket.js';

export async function createDefaultProject(userId, host_id) {
	return Project.create({
		name: 'Default',
		owner: userId,
		host_id,
		is_default: true,
	});
}

export async function createProject(userId, host_id, data) {
	const project = await Project.create({
		name: data.name,
		owner: userId,
		host_id,
		color: data.color,
	});
	emitToTenant(host_id, 'project:created', project);
	return project;
}

export async function listProjects(host_id) {
	return Project.find({ host_id, is_active: true }).sort({ is_default: -1, name: 1 });
}

export async function getProject(host_id, projectId) {
	return Project.findOne({ _id: projectId, host_id });
}

export async function updateProject(host_id, projectId, data) {
	const project = await Project.findOneAndUpdate(
		{ _id: projectId, host_id },
		{ $set: { name: data.name, color: data.color } },
		{ new: true },
	);
	if (project) emitToTenant(host_id, 'project:updated', project);
	return project;
}

export async function deleteProject(host_id, projectId) {
	const project = await Project.findOne({ _id: projectId, host_id });
	if (!project) return null;
	if (project.is_default) throw new Error('Cannot delete the default project');

	project.is_active = false;
	await project.save();
	emitToTenant(host_id, 'project:deleted', { _id: projectId });
	return project;
}
