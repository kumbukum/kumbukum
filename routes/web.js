import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireTenant } from '../modules/tenancy.js';
import { User } from '../model/user.js';
import { listProjects, getProject, getProjectCounts } from '../services/project_service.js';
import config from '../config.js';

const is_hosted = new URL(config.appUrl).hostname.endsWith('kumbukum.com');

const router = Router();

router.use(requireAuth, requireTenant);

// Inject user + sidebar data into all views
router.use(async (req, res, next) => {
	const [user, projects] = await Promise.all([
		User.findById(req.userId),
		listProjects(req.host_id),
	]);
	res.locals.user = user;
	res.locals.projects = projects;
	res.locals.host_id = req.host_id;
	res.locals.impersonating = req.session.impersonating || false;
	res.locals.impersonatingName = req.session.impersonatingName || '';
	res.locals.is_hosted = is_hosted;
	next();
});

router.get('/dashboard', (req, res) => res.render('dashboard', { title: 'Dashboard' }));
router.get('/notes', (req, res) => res.render('notes', { title: 'Notes' }));
router.get('/memories', (req, res) => res.render('memories', { title: 'Memory' }));
router.get('/urls', (req, res) => res.render('urls', { title: 'URLs' }));
router.get('/trash', (req, res) => res.render('trash', { title: 'Trash' }));
router.get('/graph', (req, res) => res.render('graph', { title: 'Knowledge Graph' }));
router.get('/settings', (req, res) => res.redirect('/settings/profile'));
router.get('/settings/profile', (req, res) => res.render('settings/profile', { title: 'Profile' }));
router.get('/settings/security', (req, res) => res.render('settings/security', { title: 'Security' }));
router.get('/settings/tokens', (req, res) => res.render('settings/tokens', { title: 'Access Tokens' }));
router.get('/settings/typesense', (req, res) => res.render('settings/typesense', { title: 'Typesense' }));
router.get('/settings/usage', (req, res) => res.render('settings/usage', { title: 'Usage' }));
if (is_hosted) {
	router.get('/settings/subscription', (req, res) => res.render('settings/subscription', { title: 'Subscription' }));
}

// ---- Ajax partials ----

router.get('/ajax/project-list', async (req, res) => {
	const [projects, counts] = await Promise.all([
		listProjects(req.host_id),
		getProjectCounts(req.host_id).catch(() => ({})),
	]);
	res.render('ajax/project_list', { projects, counts, activeProjectId: req.query.active || '' });
});

router.get('/ajax/project-overview/:id', async (req, res) => {
	try {
		const [project, counts] = await Promise.all([
			getProject(req.host_id, req.params.id),
			getProjectCounts(req.host_id).catch(() => ({})),
		]);
		if (!project) return res.status(404).send('');
		res.render('ajax/project_overview', { project, counts });
	} catch (err) {
		res.status(500).send('<div class="text-danger">Failed to load project</div>');
	}
});

export default router;
