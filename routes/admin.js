import { Router } from 'express';
import { User } from '../model/user.js';
import { Tenant } from '../modules/tenancy.js';
import { Note } from '../model/note.js';
import { Memory } from '../model/memory.js';
import { Url } from '../model/url.js';
import { Project } from '../model/project.js';
import { getTypesenseClient } from '../modules/typesense.js';
import { isSysadminCredentials, requireAdmin } from '../middleware/sysadmin.js';

const router = Router();

// ---- Admin login ----

router.get('/login', (req, res) => {
    if (req.session?.isAdmin) return res.redirect('/admin');
    res.render('admin/login');
});

router.post('/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.render('admin/login', { error: 'Email and password required' });
    }

    if (!isSysadminCredentials(email, password)) {
        return res.render('admin/login', { error: 'Invalid credentials' });
    }

    req.session.isAdmin = true;
    res.redirect('/admin');
});

router.post('/logout', (req, res) => {
    delete req.session.isAdmin;
    res.redirect('/admin/login');
});

// ---- Protected admin pages ----

router.use(requireAdmin);

router.get('/', (req, res) => {
    res.render('admin/accounts', { title: 'Accounts', activeNav: 'accounts' });
});

router.get('/accounts/:id/edit', async (req, res) => {
    try {
        const user = await User.findById(req.params.id).populate('tenant');
        if (!user) return res.redirect('/admin');
        res.render('admin/account_edit', {
            title: 'Edit Account',
            activeNav: 'accounts',
            account: user,
        });
    } catch (err) {
        console.error('Admin account edit page error:', err);
        res.redirect('/admin');
    }
});

// ---- Admin API ----

router.get('/api/accounts', async (req, res) => {
    try {
        const status = req.query.status || 'active';
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = 50;

        const filter = status === 'inactive' ? { is_active: false } : { is_active: true };

        const [users, total] = await Promise.all([
            User.find(filter)
                .select('name email is_active host_id createdAt last_login')
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            User.countDocuments(filter),
        ]);

        // Gather counts for each user in parallel
        const enriched = await Promise.all(
            users.map(async (u) => {
                if (!u.host_id) {
                    return { ...u, projectCount: 0, itemCount: 0 };
                }
                const [projectCount, noteCount, memoryCount, urlCount] = await Promise.all([
                    Project.countDocuments({ host_id: u.host_id }),
                    Note.countDocuments({ host_id: u.host_id, in_trash: { $ne: true } }),
                    Memory.countDocuments({ host_id: u.host_id, in_trash: { $ne: true } }),
                    Url.countDocuments({ host_id: u.host_id, in_trash: { $ne: true } }),
                ]);
                return {
                    ...u,
                    projectCount,
                    itemCount: noteCount + memoryCount + urlCount,
                };
            }),
        );

        res.json({ accounts: enriched, total, page, pages: Math.ceil(total / limit) });
    } catch (err) {
        console.error('Admin list accounts error:', err);
        res.status(500).json({ error: 'Failed to list accounts' });
    }
});

router.get('/api/accounts/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id).lean();
        if (!user) return res.status(404).json({ error: 'Not found' });
        res.json(user);
    } catch (err) {
        console.error('Admin get account error:', err);
        res.status(500).json({ error: 'Failed to get account' });
    }
});

router.put('/api/accounts/:id', async (req, res) => {
    try {
        const { name, email, is_active } = req.body;
        const update = {};
        if (name !== undefined) update.name = name.trim();
        if (email !== undefined) update.email = email.trim().toLowerCase();
        if (is_active !== undefined) update.is_active = Boolean(is_active);

        const user = await User.findByIdAndUpdate(req.params.id, update, { new: true });
        if (!user) return res.status(404).json({ error: 'Not found' });

        // Sync is_active to tenant
        if (is_active !== undefined && user.tenant) {
            await Tenant.findByIdAndUpdate(user.tenant, { is_active: Boolean(is_active) });
        }

        res.json({ ok: true, account: user.toSafe() });
    } catch (err) {
        console.error('Admin update account error:', err);
        res.status(500).json({ error: 'Failed to update account' });
    }
});

router.delete('/api/accounts/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'Not found' });

        const host_id = user.host_id;

        // Delete all MongoDB data for this tenant
        await Promise.all([
            Note.deleteMany({ host_id }),
            Memory.deleteMany({ host_id }),
            Url.deleteMany({ host_id }),
            Project.deleteMany({ host_id }),
        ]);

        // Delete Typesense collections
        const ts = getTypesenseClient();
        const collectionTypes = ['notes', 'memory', 'urls', 'pages'];
        for (const type of collectionTypes) {
            try {
                await ts.collections(`${type}_${host_id}`).delete();
            } catch (e) {
                if (e.httpStatus !== 404) console.error(`Failed to delete Typesense collection ${type}_${host_id}:`, e.message);
            }
        }

        // Delete tenant and user
        if (user.tenant) await Tenant.findByIdAndDelete(user.tenant);
        await User.findByIdAndDelete(user._id);

        res.json({ ok: true });
    } catch (err) {
        console.error('Admin delete account error:', err);
        res.status(500).json({ error: 'Failed to delete account' });
    }
});

export default router;
