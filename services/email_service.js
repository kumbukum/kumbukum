import nodemailer from 'nodemailer';
import config from '../config.js';
import emailTemplates from '../config/email_templates.js';
import { getSetting } from './system_settings_service.js';

let transporter;

function getTransporter() {
	if (!transporter) {
		if (!config.smtp.host) {
			console.warn('SMTP not configured — emails will be logged to console');
			return null;
		}
		transporter = nodemailer.createTransport({
			host: config.smtp.host,
			port: config.smtp.port,
			secure: config.smtp.port === 465,
			auth: config.smtp.user
				? { user: config.smtp.user, pass: config.smtp.pass }
				: undefined,
		});
	}
	return transporter;
}

async function sendMail({ to, subject, html }) {
	const t = getTransporter();
	const mailOptions = { from: config.smtp.from, to, subject, html };

	if (!t) {
		console.log('Email (no SMTP):', JSON.stringify({ to, subject }));
		return;
	}

	return t.sendMail(mailOptions);
}

async function resolveTemplate(templateKey) {
	const subjectOverride = await getSetting(`email_template.${templateKey}.subject`);
	const htmlOverride = await getSetting(`email_template.${templateKey}.html`);
	const defaults = emailTemplates[templateKey] || {};
	return {
		subject: subjectOverride || defaults.subject,
		html: htmlOverride || defaults.html,
	};
}

function renderTemplate(template, variables) {
	let result = template;
	for (const [key, value] of Object.entries(variables)) {
		result = result.replaceAll(`{{${key}}}`, value);
	}
	return result;
}

export async function sendVerificationEmail(email, token, name) {
	const url = `${config.appUrl}/verify?token=${encodeURIComponent(token)}`;
	const { subject, html } = await resolveTemplate('verification');
	return sendMail({
		to: email,
		subject: renderTemplate(subject, { url, name: name || '' }),
		html: renderTemplate(html, { url, name: name || '' }),
	});
}

export async function sendPasswordResetEmail(email, token) {
	const url = `${config.appUrl}/reset-password?token=${encodeURIComponent(token)}`;
	const { subject, html } = await resolveTemplate('password_reset');
	return sendMail({
		to: email,
		subject: renderTemplate(subject, { url }),
		html: renderTemplate(html, { url }),
	});
}

export async function sendMagicLinkEmail(email, token) {
	const url = `${config.appUrl}/magic?token=${encodeURIComponent(token)}`;
	const { subject, html } = await resolveTemplate('magic_link');
	return sendMail({
		to: email,
		subject: renderTemplate(subject, { url }),
		html: renderTemplate(html, { url }),
	});
}

export async function sendWelcomeEmail(email, name) {
	const loginUrl = `${config.appUrl}/login`;
	const { subject, html } = await resolveTemplate('welcome');
	return sendMail({
		to: email,
		subject: renderTemplate(subject, { name: name || '', loginUrl }),
		html: renderTemplate(html, { name: name || '', loginUrl }),
	});
}

export async function sendTrialEndingEmail(email, name, daysLeft, trialEndDate) {
	const subscriptionUrl = `${config.appUrl}/settings/subscription`;
	const { subject, html } = await resolveTemplate('trial_ending');
	return sendMail({
		to: email,
		subject: renderTemplate(subject, { name: name || '', daysLeft: String(daysLeft), trialEndDate, subscriptionUrl }),
		html: renderTemplate(html, { name: name || '', daysLeft: String(daysLeft), trialEndDate, subscriptionUrl }),
	});
}

export async function sendExportReadyEmail(email, name, token) {
	const downloadUrl = `${config.appUrl}/api/v1/export/download/${token}`;
	const { subject, html } = await resolveTemplate('export_ready');
	return sendMail({
		to: email,
		subject: renderTemplate(subject, { name: name || '', downloadUrl }),
		html: renderTemplate(html, { name: name || '', downloadUrl }),
	});
}

export async function sendTestEmail(to, templateKey, sampleVariables) {
	const { subject, html } = await resolveTemplate(templateKey);
	return sendMail({
		to,
		subject: renderTemplate(subject, sampleVariables),
		html: renderTemplate(html, sampleVariables),
	});
}
