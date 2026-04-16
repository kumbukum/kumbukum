import mongoose from 'mongoose';

const gitRepoSchema = new mongoose.Schema(
	{
		project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
		owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
		host_id: { type: String, required: true, index: true },
		name: { type: String, default: '' }, // friendly label
		repo_url: { type: String, required: true },
		branch: { type: String, default: 'main' },
		auth_token: { type: String, default: '' }, // encrypted PAT
		sync_interval: { type: Number, default: 10, min: 5 }, // minutes
		enabled: { type: Boolean, default: true },
		notes_path: { type: String, default: 'notes' },
		memories_path: { type: String, default: 'memories' },
		sync_path: { type: String, default: '/' }, // subfolder within repo
		trash_on_delete: { type: Boolean, default: true },
		last_synced_at: { type: Date, default: null },
		last_sync_status: { type: String, enum: ['success', 'failed', 'in_progress', null], default: null },
		last_sync_error: { type: String, default: '' },
	},
	{ timestamps: true },
);

gitRepoSchema.index({ host_id: 1, project: 1 });

export const GitRepo = mongoose.model('GitRepo', gitRepoSchema);
