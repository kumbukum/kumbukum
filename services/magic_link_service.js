import { MagicLink } from '../model/magic_link.js';
import { sendMagicLinkEmail } from './email_service.js';
import { User } from '../model/user.js';

export async function sendMagicLink(email) {
	const user = await User.findOne({ email, is_active: true });
	if (!user) return; // silent fail to prevent enumeration

	const link = await MagicLink.generate(user._id);
	await sendMagicLinkEmail(email, link.token);
}

export async function verifyMagicLink(token) {
	const link = await MagicLink.verify(token);
	if (!link) return null;

	const user = await User.findById(link.user);
	if (!user || !user.is_active) return null;

	return user;
}
