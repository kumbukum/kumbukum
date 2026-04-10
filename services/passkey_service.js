import {
	generateRegistrationOptions,
	verifyRegistrationResponse,
	generateAuthenticationOptions,
	verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { UserPasskey } from '../model/user_passkey.js';
import config from '../config.js';

const rpName = 'Kumbukum';
const rpID = new URL(config.appUrl).hostname;
const origin = config.appUrl;

export async function getRegistrationOptions(user) {
	const passkeys = await UserPasskey.find({ user: user._id });
	const excludeCredentials = passkeys.map((pk) => ({
		id: pk.credential_id,
		type: 'public-key',
		transports: pk.transports,
	}));

	return generateRegistrationOptions({
		rpName,
		rpID,
		userID: user._id.toString(),
		userName: user.email,
		userDisplayName: user.name,
		excludeCredentials,
		attestationType: 'none',
		authenticatorSelection: {
			residentKey: 'preferred',
			userVerification: 'preferred',
		},
	});
}

export async function verifyAndSaveRegistration(user, response, challenge) {
	const verification = await verifyRegistrationResponse({
		response,
		expectedChallenge: challenge,
		expectedOrigin: origin,
		expectedRPID: rpID,
	});

	if (!verification.verified || !verification.registrationInfo) {
		throw new Error('Passkey registration verification failed');
	}

	const { credential, credentialDeviceType, credentialBackedUp } =
		verification.registrationInfo;

	await UserPasskey.create({
		user: user._id,
		credential_id: credential.id,
		public_key: Buffer.from(credential.publicKey),
		counter: credential.counter,
		device_type: credentialDeviceType,
		backed_up: credentialBackedUp,
		transports: response.response.transports || [],
	});

	return verification;
}

export async function getAuthenticationOptions(user) {
	const passkeys = await UserPasskey.find({ user: user._id });
	const allowCredentials = passkeys.map((pk) => ({
		id: pk.credential_id,
		type: 'public-key',
		transports: pk.transports,
	}));

	return generateAuthenticationOptions({
		rpID,
		allowCredentials,
		userVerification: 'preferred',
	});
}

export async function verifyAuthentication(user, response, challenge) {
	const passkey = await UserPasskey.findOne({ credential_id: response.id });
	if (!passkey) throw new Error('Passkey not found');

	const verification = await verifyAuthenticationResponse({
		response,
		expectedChallenge: challenge,
		expectedOrigin: origin,
		expectedRPID: rpID,
		credential: {
			id: passkey.credential_id,
			publicKey: passkey.public_key,
			counter: passkey.counter,
			transports: passkey.transports,
		},
	});

	if (verification.verified) {
		passkey.counter = verification.authenticationInfo.newCounter;
		await passkey.save();
	}

	return verification;
}
