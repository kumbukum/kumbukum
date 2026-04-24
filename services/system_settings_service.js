import { SystemSetting } from '../model/system_setting.js';

export async function getSetting(key) {
	const doc = await SystemSetting.findOne({ key });
	return doc ? doc.value : null;
}

export async function setSetting(key, value, category = 'general', description = '') {
	return SystemSetting.findOneAndUpdate(
		{ key },
		{ $set: { key, value, category, description } },
		{ upsert: true, returnDocument: 'after' },
	);
}

export async function getByCategory(category) {
	return SystemSetting.find({ category }).lean();
}

export async function deleteSetting(key) {
	return SystemSetting.deleteOne({ key });
}
