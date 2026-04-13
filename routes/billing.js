import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireTenant } from '../modules/tenancy.js';
import { User } from '../model/user.js';
import { createCheckoutSession, createPortalSession, handleWebhook } from '../services/billing_service.js';
import config from '../config.js';
import express from 'express';

const router = Router();

// ---- Webhook (raw body, no auth — Stripe verifies via signature) ----

router.post(
    '/billing/webhook',
    express.raw({ type: 'application/json' }),
    async (req, res) => {
        try {
            const sig = req.headers['stripe-signature'];
            if (!sig) return res.status(400).send('Missing Stripe-Signature header');
            await handleWebhook(req.body, sig);
            res.json({ received: true });
        } catch (err) {
            console.error('Stripe webhook error:', err.message);
            res.status(400).send(`Webhook Error: ${err.message}`);
        }
    },
);

// ---- Checkout, success, cancel, portal (authenticated) ----

router.get('/billing/checkout', requireAuth, requireTenant, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select('+stripe_customer_id');
        if (!user) return res.redirect('/login');

        // Already has active subscription — skip checkout
        if (['trialing', 'active'].includes(user.subscription_status)) {
            return res.redirect('/dashboard');
        }

        const checkoutUrl = await createCheckoutSession(user);
        res.redirect(checkoutUrl);
    } catch (err) {
        console.error('Checkout error:', err);
        res.status(500).render('billing/checkout_cancel', {
            title: 'Checkout Error',
            message: 'Something went wrong starting checkout. Please try again.',
        });
    }
});

router.get('/billing/success', requireAuth, requireTenant, async (req, res) => {
    // Stripe redirects here after successful checkout.
    // The webhook will update subscription_status async, but it may arrive before or after this.
    // We do a quick poll of the user record — if still incomplete, give it a moment.
    const maxWait = 5000;
    const interval = 500;
    let waited = 0;

    while (waited < maxWait) {
        const user = await User.findById(req.userId);
        if (user && ['trialing', 'active'].includes(user.subscription_status)) {
            return res.redirect('/dashboard');
        }
        await new Promise((r) => setTimeout(r, interval));
        waited += interval;
    }

    // Fallback: redirect to dashboard anyway — webhook will update status shortly
    res.redirect('/dashboard');
});

router.get('/billing/cancel', (req, res) => {
    res.render('billing/checkout_cancel', {
        title: 'Checkout Canceled',
        message: 'You canceled the checkout. You can try again anytime.',
    });
});

router.get('/billing/portal', requireAuth, requireTenant, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select('+stripe_customer_id');
        if (!user) return res.redirect('/login');

        const portalUrl = await createPortalSession(user);
        res.redirect(portalUrl);
    } catch (err) {
        console.error('Portal error:', err);
        res.redirect('/settings/subscription');
    }
});

export default router;
