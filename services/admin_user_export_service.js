import { User } from '../model/user.js';

export function splitAdminUserName(value) {
	const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
	return {
		first_name: parts[0] || '',
		last_name: parts.slice(1).join(' '),
	};
}

export function escapeAdminCsvCell(value) {
	const normalized = String(value ?? '');
	const safe = /^[=+\-@\t\r]/.test(normalized) ? `'${normalized}` : normalized;
	return `"${safe.replaceAll('"', '""')}"`;
}

export function serializeAdminUsersCsv(users = []) {
	const rows = ['first_name,last_name,email'];
	for (const user of users) {
		const name = splitAdminUserName(user?.name);
		rows.push([name.first_name, name.last_name, user?.email || ''].map(escapeAdminCsvCell).join(','));
	}
	return `\uFEFF${rows.join('\r\n')}\r\n`;
}

export async function buildAdminUsersCsv() {
	const users = await User.find({}).select('name email').sort({ email: 1 }).lean();
	return serializeAdminUsersCsv(users);
}
