// utils/frontendUrl.js
//
// Normalizes FRONTEND_URL so downstream consumers (magic-link emails,
// Stripe Checkout/Portal redirect URLs) always get a fully-qualified URL
// with an explicit scheme. Stripe's SDK validates and rejects a bare host
// with no scheme (e.g. "crisiswatch-frontend-1.onrender.com" instead of
// "https://crisiswatch-frontend-1.onrender.com") — that's what broke
// checkout when this env var was set without one; email links are more
// forgiving about it, which is why the same misconfiguration didn't show
// up there first.

export function getFrontendUrl() {
  const raw = process.env.FRONTEND_URL || 'http://localhost:3000';
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}
