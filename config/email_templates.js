const emailTemplates = {
	verification: {
		subject: 'Confirm your Kumbukum account',
		html: `<p>Hi {{name}},</p>
<p>Thanks for signing up for Kumbukum! Please confirm your email address by clicking the link below:</p>
<p><a href="{{url}}">Confirm your account</a></p>
<p>This link expires in 24 hours. If you did not create an account, you can safely ignore this email.</p>
<p>— The Kumbukum Team</p>`,
		variables: [
			{ key: 'name', description: 'User name' },
			{ key: 'url', description: 'Verification URL' },
		],
	},
	password_reset: {
		subject: 'Reset your Kumbukum password',
		html: `<p>We received a request to reset your password.</p>
<p>Click the link below to choose a new password:</p>
<p><a href="{{url}}">Reset your password</a></p>
<p>This link expires in 1 hour. If you did not request a password reset, you can safely ignore this email.</p>
<p>— The Kumbukum Team</p>`,
		variables: [
			{ key: 'url', description: 'Password reset URL' },
		],
	},
	welcome: {
		subject: 'Welcome to Kumbukum!',
		html: `<p>Hi {{name}},</p>
<p>Welcome to Kumbukum — your personal space to save, organize, and recall what matters.</p>
<p>Your account is ready. Sign in anytime to get started:</p>
<p><a href="{{loginUrl}}">Log in to Kumbukum</a></p>
<p>— The Kumbukum Team</p>`,
		variables: [
			{ key: 'name', description: 'User name' },
			{ key: 'loginUrl', description: 'Login page URL' },
		],
	},
	magic_link: {
		subject: 'Your Kumbukum login link',
		html: `<p>Click the link below to sign in to your account:</p>
<p><a href="{{url}}">Sign in to Kumbukum</a></p>
<p>This link expires in 15 minutes. If you did not request this link, you can safely ignore this email.</p>
<p>— The Kumbukum Team</p>`,
		variables: [
			{ key: 'url', description: 'Magic link sign-in URL' },
		],
	},
};

export default emailTemplates;
