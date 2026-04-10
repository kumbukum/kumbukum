import mongoose from 'mongoose';

const noteSchema = new mongoose.Schema(
	{
		title: { type: String, default: 'Untitled', trim: true },
		content: { type: String, default: '' }, // HTML from TipTap
		text_content: { type: String, default: '' }, // Plain text for indexing
		tags: [{ type: String, trim: true }],
		project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
		owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
		host_id: { type: String, required: true, index: true },
	},
	{ timestamps: true },
);

noteSchema.index({ host_id: 1, project: 1 });

export const Note = mongoose.model('Note', noteSchema);
