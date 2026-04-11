import mongoose from 'mongoose';

const systemSettingSchema = new mongoose.Schema(
	{
		key: { type: String, required: true, unique: true, trim: true, index: true },
		category: { type: String, default: 'general', trim: true, index: true },
		value: { type: mongoose.Schema.Types.Mixed, required: true },
		description: { type: String, default: '' },
	},
	{ timestamps: true },
);

systemSettingSchema.index({ category: 1 });

export const SystemSetting = mongoose.model('SystemSetting', systemSettingSchema);
