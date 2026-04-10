import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireTenant } from '../modules/tenancy.js';
import { User } from '../model/user.js';
import { listProjects } from '../services/project_service.js';
import { getCollectionCounts } from '../modules/typesense.js';

const router = Router();

router.use(requireAuth, requireTenant);

// Inject user + sidebar data into all views
router.use(async (req, res, next) => {
	const [user, projects, counts] = await Promise.all([
		User.findById(req.userId),
		listProjects(req.host_id),
		getCollectionCounts(req.host_id).catch(() => ({ notes: 0, memory: 0, urls: 0 })),
	]);
	res.locals.user = user;
	res.locals.projects = projects;
	res.locals.counts = counts;
	next();
});

router.get('/dashboard', (req, res) => res.render('dashboard', { title: 'Dashboard' }));
router.get('/notes', (req, res) => res.render('notes', { title: 'Notes' }));
router.get('/memories', (req, res) => res.render('memories', { title: 'Memory' }));
router.get('/urls', (req, res) => res.render('urls', { title: 'URLs' }));
router.get('/settings', (req, res) => res.redirect('/settings/profile'));
router.get('/settings/profile', (req, res) => res.render('settings/profile', { title: 'Profile' }));
router.get('/settings/security', (req, res) => res.render('settings/security', { title: 'Security' }));
router.get('/settings/tokens', (req, res) => res.render('settings/tokens', { title: 'Access Tokens' }));

export default router;
