import mongoose from 'mongoose';

const urlSchema = new mongoose.Schema(
	{
		url: { type: String, required: true, trim: true },
		title: { type: String, default: '' },
		description: { type: String, default: '' },
		og_image: { type: String, default: '' },
		text_content: { type: String, default: '' },
		crawl_enabled: { type: Boolean, default: false },
		last_crawled: { type: Date },
		project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
		owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
		host_id: { type: String, required: true, index: true },
	},
	{ timestamps: true },
);

urlSchema.index({ host_id: 1, project: 1 });
urlSchema.index({ crawl_enabled: 1, last_crawled: 1 });

export const Url = mongoose.model('Url', urlSchema);
