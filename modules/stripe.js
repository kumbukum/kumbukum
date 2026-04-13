import Stripe from 'stripe';
import config from '../config.js';

let stripe;

export function getStripe() {
    if (!stripe) {
        if (!config.stripe.secretKey) {
            throw new Error('STRIPE_SECRET_KEY not configured');
        }
        stripe = new Stripe(config.stripe.secretKey);
    }
    return stripe;
}
