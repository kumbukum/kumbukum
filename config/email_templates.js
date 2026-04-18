const emailTemplates = {
	verification: {
		subject: 'Confirm your Kumbukum account',
		html: `<p>Hi {{name}},</p>
<p>Thanks for signing up for Kumbukum! Please confirm your email address by clicking the link below:</p>
<p><a href="{{url}}">Confirm your account</a></p>
<p>This link expires in 24 hours. If you did not create an account, you can safely ignore this email.</p>
<p></p>`,
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
<p></p>`,
		variables: [
			{ key: 'url', description: 'Password reset URL' },
		],
	},
	welcome: {
		subject: 'Welcome to Kumbukum!',
		html: `<p>Hi {{name}},</p>
<p>Exciting times ahead! You now have access to a powerful shared knowledge layer for your team and your AI tools.</p>
<p>Here are great resources to get you started:</p>
<ul>
<li><a href="https://app.kumbukum.com/docs/guide/">What Kumbukum can do for you</a></li>
<li><a href="https://app.kumbukum.com/docs/mcp/">Use Kumbukum with Your AI Tools</a></li>
<li><a href="https://app.kumbukum.com/docs/guide/browser-extension">Collect knowledge with the Browser Extension</a></li>
</ul>
<p>Use the Kumbukum app to add your existing documents and knowledge. Once you add the Kumbukum MCP, you can also tell your AI tools to migrate everything for you automatically.</p>
<p></p>
<p><a href="{{loginUrl}}">Log in to Kumbukum now to get going</a></p>
<p></p>`,
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
<p></p>`,
		variables: [
			{ key: 'url', description: 'Magic link sign-in URL' },
		],
	},
	trial_ending: {
		subject: 'Your Kumbukum trial ends in {{daysLeft}} days',
		html: `<p>Hi {{name}},</p>
<p>Your free trial ends on <strong>{{trialEndDate}}</strong> (in {{daysLeft}} days).</p>
<p>To keep using Kumbukum without interruption, make sure your payment method is up to date.</p>
<p><a href="{{subscriptionUrl}}">Manage your subscription</a></p>
<p>If you have any questions, just reply to this email.</p>
<p></p>`,
		variables: [
			{ key: 'name', description: 'User name' },
			{ key: 'daysLeft', description: 'Days remaining in trial' },
			{ key: 'trialEndDate', description: 'Trial end date' },
			{ key: 'subscriptionUrl', description: 'Subscription settings URL' },
		],
	},
	export_ready: {
		subject: 'Your Kumbukum export is ready',
		html: `<p>Hi {{name}},</p>
<p>Your data export is ready for download.</p>
<p><a href="{{downloadUrl}}">Download your export</a></p>
<p>This link expires in 24 hours. After that, you can request a new export from your settings.</p>
<p></p>`,
		variables: [
			{ key: 'name', description: 'User name' },
			{ key: 'downloadUrl', description: 'Export download URL' },
		],
	},
};

export default emailTemplates;
