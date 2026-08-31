import { Router } from 'express';
import config from '../config.js';
import { createLogger } from '../modules/logger.js';
import * as productUpdateService from '../services/product_update_service.js';

const log = createLogger('product-updates');

export function isProductUpdatesEligible(req, settings = config.productUpdates) {
	return req?.isHosted === true
		&& !req.whiteLabelHostId
		&& !req.session?.impersonating
		&& !req.streamientDemoContext
		&& !req.streamientDemoFixtures
		&& !req.mailDemoContext
		&& Boolean(settings?.contentApiKey);
}

export function createProductUpdatesRouter({ service = productUpdateService, settings = config.productUpdates } = {}) {
	const router = Router();

	function eligible(req) {
		return isProductUpdatesEligible(req, settings);
	}

	async function renderNews(req, res, view) {
		if (!eligible(req)) {
			if (req.path.startsWith('/ajax/')) return res.sendStatus(404);
			return res.redirect('/dashboard');
		}
		try {
			const result = await service.listProductUpdates({ limit: 7 });
			return res.render(view, { title: "What's new", page: 'news', product_updates: result });
		} catch (err) {
			log.error({ err, user_id: req.userId }, 'Product update archive render failed');
			return res.sendStatus(err.status || 500);
		}
	}

	router.get('/news', (req, res) => renderNews(req, res, 'news'));
	router.get('/ajax/section/news', (req, res) => renderNews(req, res, 'ajax/section/news'));

	router.get('/ajax/product-updates/status', async (req, res) => {
		if (!eligible(req)) return res.sendStatus(404);
		try {
			return res.json(await service.getProductUpdateStatus(req.userId));
		} catch (err) {
			log.error({ err, user_id: req.userId }, 'Product update status failed');
			return res.status(err.status || 500).json({ error: err.message || 'Product update status failed' });
		}
	});

	router.get('/ajax/product-updates/modal', async (req, res) => {
		if (!eligible(req)) return res.sendStatus(404);
		try {
			const result = await service.getModalProductUpdates(req.userId);
			if (!result.updates.length || !result.through_update_id) return res.sendStatus(204);
			return res.render('ajax/product_updates_modal', { product_updates: result });
		} catch (err) {
			log.error({ err, user_id: req.userId }, 'Product update modal failed');
			return res.sendStatus(err.status || 500);
		}
	});

	router.get('/ajax/product-updates/items', async (req, res) => {
		if (!eligible(req)) return res.sendStatus(404);
		try {
			const result = await service.listProductUpdates({ cursor: req.query.cursor || '', limit: 7 });
			return res.render('ajax/product_update_items', { product_updates: result });
		} catch (err) {
			log.error({ err, user_id: req.userId }, 'Product update archive page failed');
			return res.sendStatus(err.status || 500);
		}
	});

	router.post('/ajax/product-updates/seen', async (req, res) => {
		if (!eligible(req)) return res.sendStatus(404);
		try {
			const result = await service.markProductUpdatesSeen(req.userId, req.body?.update_id);
			return res.json({ ok: true, seen_at: result.seen_at });
		} catch (err) {
			log.error({ err, user_id: req.userId }, 'Product update seen state failed');
			return res.status(err.status || 500).json({ error: err.message || 'Product update seen state failed' });
		}
	});

	return router;
}

export default createProductUpdatesRouter();
