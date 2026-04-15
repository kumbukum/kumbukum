import { getStripe } from '../modules/stripe.js';
import { User } from '../model/user.js';
import { Tenant } from '../modules/tenancy.js';
import config from '../config.js';

/**
 * Resolve plan name from a Stripe subscription's price ID.
 * Falls back to 'starter' if no matching price is configured.
 */
function resolvePlanFromSubscription(subscription) {
    const priceId = subscription.items?.data?.[0]?.price?.id;
    if (priceId === config.stripe.proPriceId) return 'pro';
    if (priceId === config.stripe.starterPriceId) return 'starter';
    return 'starter';
}

/**
 * Create a Stripe Checkout session with a free trial that collects the card upfront.
 * Returns the Checkout URL to redirect the user to.
 */
export async function createCheckoutSession(user) {
    if (!config.stripe.priceId) {
        throw new Error('STRIPE_PRICE_ID is not configured');
    }
    const stripe = getStripe();

    // Create or reuse Stripe customer
    let customerId = user.stripe_customer_id;
    if (!customerId) {
        const customer = await stripe.customers.create({
            email: user.email,
            name: user.name,
            metadata: { kumbukum_user_id: user._id.toString() },
        });
        customerId = customer.id;
        await User.findByIdAndUpdate(user._id, { stripe_customer_id: customerId });
    }

    const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        payment_method_collection: 'always',
        line_items: [{ price: config.stripe.priceId, quantity: 1 }],
        subscription_data: {
            trial_period_days: config.stripe.trialDays,
        },
        success_url: `${config.appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${config.appUrl}/billing/cancel`,
        metadata: { kumbukum_user_id: user._id.toString() },
    });

    return session.url;
}

/**
 * Create a Stripe Customer Portal session for subscription management.
 * Returns the portal URL.
 */
export async function createPortalSession(user) {
    const stripe = getStripe();

    if (!user.stripe_customer_id) {
        throw new Error('No Stripe customer linked to this account');
    }

    const portalSession = await stripe.billingPortal.sessions.create({
        customer: user.stripe_customer_id,
        return_url: `${config.appUrl}/settings/subscription`,
        ...(config.stripe.portalConfigId && { configuration: config.stripe.portalConfigId }),
    });

    return portalSession.url;
}

/**
 * Handle incoming Stripe webhook events.
 * rawBody must be the raw request buffer; sig is the Stripe-Signature header.
 */
export async function handleWebhook(rawBody, sig) {
    const stripe = getStripe();
    const event = stripe.webhooks.constructEvent(rawBody, sig, config.stripe.webhookSecret);

    switch (event.type) {
        case 'checkout.session.completed': {
            const session = event.data.object;
            const userId = session.metadata?.kumbukum_user_id;
            if (userId && session.subscription) {
                const subscription = await stripe.subscriptions.retrieve(session.subscription);
                const plan = resolvePlanFromSubscription(subscription);
                const user = await User.findByIdAndUpdate(userId, {
                    stripe_subscription_id: subscription.id,
                    subscription_status: subscription.status,
                    trial_ends_at: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
                }, { new: true });
                if (user?.host_id) {
                    await Tenant.findOneAndUpdate({ host_id: user.host_id }, { plan });
                }
            }
            break;
        }

        case 'customer.subscription.updated': {
            const subscription = event.data.object;
            const user = await User.findOne({ stripe_subscription_id: subscription.id });
            if (user) {
                user.subscription_status = subscription.status;
                user.trial_ends_at = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;
                await user.save();
                const plan = resolvePlanFromSubscription(subscription);
                await Tenant.findOneAndUpdate({ host_id: user.host_id }, { plan });
            }
            break;
        }

        case 'customer.subscription.deleted': {
            const subscription = event.data.object;
            const user = await User.findOne({ stripe_subscription_id: subscription.id });
            if (user) {
                user.subscription_status = 'canceled';
                await user.save();
                await Tenant.findOneAndUpdate({ host_id: user.host_id }, { plan: 'starter' });
            }
            break;
        }

        case 'invoice.payment_failed': {
            const invoice = event.data.object;
            if (invoice.subscription) {
                const user = await User.findOne({ stripe_subscription_id: invoice.subscription });
                if (user) {
                    user.subscription_status = 'past_due';
                    await user.save();
                }
            }
            break;
        }

        default:
            break;
    }
}
