import mongoose from 'mongoose';

const memorySchema = new mongoose.Schema(
	{
		title: { type: String, required: true, trim: true },
		content: { type: String, default: '' },
		tags: [{ type: String, trim: true }],
		source: { type: String, default: '' }, // where the memory came from
		project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
		owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
		host_id: { type: String, required: true, index: true },
	},
	{ timestamps: true },
);

memorySchema.index({ host_id: 1, project: 1 });

export const Memory = mongoose.model('Memory', memorySchema);
