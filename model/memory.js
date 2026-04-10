import mongoose from 'mongoose';

const memorySchema = new mongoose.Schema(
	{
		title: { type: String, required: true, trim: true },
		content: { type: String, default: '' },
		tags: [{ type: String, trim: true }],
		source: { type: String, default: '' },
		relationships: [{ type: mongoose.Schema.Types.ObjectId }],
		project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
		owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
		host_id: { type: String, required: true, index: true },
		in_trash: { type: Boolean, default: false },
		trashed_at: { type: Date, default: null },
	},
	{ timestamps: true },
);

memorySchema.index({ host_id: 1, in_trash: 1, project: 1 });
memorySchema.index({ trashed_at: 1 }, { expireAfterSeconds: 2592000, partialFilterExpression: { trashed_at: { $type: 'date' }, in_trash: true } });

export const Memory = mongoose.model('Memory', memorySchema);
