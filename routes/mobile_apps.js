import QRCode from 'qrcode';
import { createLogger } from '../modules/logger.js';

const log = createLogger('mobile-apps');

export const IOS_BETA_URL = 'https://testflight.apple.com/join/yhXgWbKy';
export const ANDROID_BETA_URL = 'https://play.google.com/apps/testing/com.streamient.mobile';

export async function renderMobileAppsModal(req, res) {
	try {
		const [iosQrcode, androidQrcode] = await Promise.all([
			QRCode.toString(IOS_BETA_URL, { type: 'svg', margin: 1, width: 180 }),
			QRCode.toString(ANDROID_BETA_URL, { type: 'svg', margin: 1, width: 180 }),
		]);
		return res.render('ajax/mobile_apps_modal', {
			model: {
				ios: {
					url: IOS_BETA_URL,
					qrcode: iosQrcode,
				},
				android: {
					url: ANDROID_BETA_URL,
					qrcode: androidQrcode,
				},
			},
		});
	} catch (err) {
		log.error({ err }, 'Could not generate the Streamient mobile app QR codes');
		return res.sendStatus(500);
	}
}
