// utils/auth.js
//
// Magic-link authentication: no passwords, so no password hashing/reset/
// breach-list-checking surface to build or maintain. A user requests a
// link, we email a one-time token, redeeming it issues a long-lived JWT
// the frontend stores and sends back as `Authorization: Bearer <token>`.
//
// Bearer-token-in-header rather than an httpOnly cookie is a deliberate
// choice here, not an oversight: crisiswatch-frontend (Vercel) and
// crisiswatch-api (Railway) are different origins, and cross-origin
// cookies need credentialed CORS with an explicit allowed origin (the
// current `app.use(cors())` is wide open) plus SameSite=None; Secure.
// A bearer token sidesteps all of that. The tradeoff is that a token
// sitting in the frontend's storage is readable by any script that runs
// on that origin (XSS risk) rather than being inaccessible to JS the way
// an httpOnly cookie would be — acceptable for this app's threat model
// and scale, but worth reconsidering if that changes.

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { getDb } from './db.js';

const TOKEN_TTL_MS = 15 * 60 * 1000; // magic link expires in 15 minutes
const SESSION_TTL = '30d';

function requireJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured on the server');
  return secret;
}

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Finds or creates the user for this email, then issues a one-time
 * magic-link token for them.
 * @param {string} email
 * @returns {Promise<{user: {id: string, email: string}, rawToken: string}>}
 */
export async function createMagicLinkToken(email) {
  const normalized = email.trim().toLowerCase();
  const db = getDb();

  const user = await db.user.upsert({
    where: { email: normalized },
    update: {},
    create: { email: normalized }
  });

  const rawToken = crypto.randomBytes(32).toString('hex');
  await db.magicLinkToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS)
    }
  });

  return { user, rawToken };
}

/**
 * Redeems a magic-link token: must exist, be unexpired, and unused.
 * Marks it used so it can't be replayed.
 * @param {string} rawToken
 * @returns {Promise<{id: string, email: string}>}
 */
export async function redeemMagicLinkToken(rawToken) {
  const db = getDb();
  const record = await db.magicLinkToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { user: true }
  });

  if (!record) throw new Error('Invalid or already-used link');
  if (record.usedAt) throw new Error('This link has already been used');
  if (record.expiresAt < new Date()) throw new Error('This link has expired — request a new one');

  await db.magicLinkToken.update({
    where: { id: record.id },
    data: { usedAt: new Date() }
  });

  return { id: record.user.id, email: record.user.email };
}

/**
 * @param {{id: string, email: string}} user
 * @returns {string} signed session JWT
 */
export function signSession(user) {
  return jwt.sign({ email: user.email }, requireJwtSecret(), { subject: user.id, expiresIn: SESSION_TTL });
}

/**
 * Express middleware — requires a valid `Authorization: Bearer <jwt>`
 * header, attaches `{ id, email }` to req.user.
 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing bearer token' });

  try {
    const payload = jwt.verify(token, requireJwtSecret());
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired session', debug: err.message });
  }
}
