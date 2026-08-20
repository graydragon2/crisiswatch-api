// utils/billing.js
//
// Stripe subscription billing — a single $9/mo tier (STRIPE_PRICE_ID).
// Checkout/portal session creation happen server-side so the raw Stripe
// secret key never reaches the frontend. Subscription state lives on the
// User row (see prisma/schema.prisma) and is kept in sync exclusively by
// handleWebhookEvent() below — never trust a client-reported checkout
// success, always wait for Stripe's own event.

import Stripe from 'stripe';
import { getDb } from './db.js';

let client;
function getClient() {
  if (!client) {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not configured on the server');
    client = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return client;
}

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

/**
 * Ensures this user has a Stripe Customer, creating one on first use.
 * Created eagerly (not deferred to checkout completion) so the customer
 * ID is stable and available immediately — e.g. the billing portal needs
 * one even before a subscription exists.
 */
async function getOrCreateStripeCustomer(userId) {
  const db = getDb();
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');
  if (user.stripeCustomerId) return user.stripeCustomerId;

  const customer = await getClient().customers.create({
    email: user.email,
    metadata: { userId: user.id }
  });
  await db.user.update({ where: { id: user.id }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}

/**
 * @param {string} userId
 * @returns {Promise<string>} Stripe Checkout URL
 */
export async function createCheckoutSession(userId) {
  const customerId = await getOrCreateStripeCustomer(userId);
  const session = await getClient().checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
    success_url: `${FRONTEND_URL}/subscribe?success=true`,
    cancel_url: `${FRONTEND_URL}/subscribe?canceled=true`
  });
  return session.url;
}

/**
 * @param {string} userId
 * @returns {Promise<string>} Stripe Billing Portal URL
 */
export async function createPortalSession(userId) {
  const customerId = await getOrCreateStripeCustomer(userId);
  const session = await getClient().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${FRONTEND_URL}/profile`
  });
  return session.url;
}

/**
 * Applies a Stripe Subscription object's canonical state onto whichever
 * User row owns its Stripe Customer.
 * @param {import('stripe').Stripe.Subscription} subscription
 */
async function syncSubscription(subscription) {
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
  await getDb().user.updateMany({
    where: { stripeCustomerId: customerId },
    data: {
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000)
    }
  });
}

/**
 * Verifies and applies a Stripe webhook event. Throws on an invalid
 * signature or missing config — the caller (server.js) is responsible
 * for responding with an error status so Stripe retries.
 * @param {Buffer} rawBody
 * @param {string} signature
 */
export async function handleWebhookEvent(rawBody, signature) {
  if (!process.env.STRIPE_WEBHOOK_SECRET) throw new Error('STRIPE_WEBHOOK_SECRET is not configured on the server');
  const event = getClient().webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      if (session.mode === 'subscription' && session.subscription) {
        const subscription = await getClient().subscriptions.retrieve(session.subscription);
        await syncSubscription(subscription);
      }
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await syncSubscription(event.data.object);
      break;
    default:
      // Stripe sends dozens of event types — only subscription lifecycle
      // events affect access here, everything else is a no-op.
      break;
  }
}

/**
 * @param {string} userId
 * @returns {Promise<{status: string|null, currentPeriodEnd: string|null}>}
 */
export async function getSubscriptionStatus(userId) {
  const user = await getDb().user.findUnique({
    where: { id: userId },
    select: { subscriptionStatus: true, currentPeriodEnd: true }
  });
  return {
    status: user?.subscriptionStatus || null,
    currentPeriodEnd: user?.currentPeriodEnd ? user.currentPeriodEnd.toISOString() : null
  };
}
