import crypto from 'node:crypto';
import config from '../config.js';

/**
 * Check if the given credentials match the sysadmin env vars.
 * Uses timing-safe comparison for the password.
 */
export function isSysadminCredentials(email, password) {
    const cfgEmail = config.sysadmin.email;
    const cfgPass = config.sysadmin.password;
    if (!cfgEmail || !cfgPass) return false;

    const emailMatch = email.toLowerCase().trim() === cfgEmail.toLowerCase().trim();
    if (!emailMatch) return false;

    const a = Buffer.from(password);
    const b = Buffer.from(cfgPass);
    if (a.length !== b.length) return false;

    return crypto.timingSafeEqual(a, b);
}

/**
 * Middleware: require a sysadmin session (isSysadmin flag).
 * Used for the frontend impersonation endpoints.
 */
export function requireSysadmin(req, res, next) {
    if (!req.session?.isSysadmin) {
        if (req.accepts('html')) return res.redirect('/login');
        return res.status(403).json({ error: 'Forbidden' });
    }
    next();
}

/**
 * Middleware: require an admin session (isAdmin flag).
 * Used for the /admin backend panel.
 */
export function requireAdmin(req, res, next) {
    if (!req.session?.isAdmin) {
        if (req.accepts('html')) return res.redirect('/admin/login');
        return res.status(403).json({ error: 'Forbidden' });
    }
    next();
}
