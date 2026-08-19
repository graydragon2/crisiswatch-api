// utils/mailer.js
//
// Sends email via Resend's HTTP API. This app used to use Gmail SMTP via
// Nodemailer, which worked fine locally but silently hangs (not fails —
// hangs, for a full connection timeout) in production on Railway: Railway
// blocks outbound SMTP entirely on Free/Trial/Hobby plans and only allows
// it on Pro — see https://docs.railway.com/networking/outbound-networking.
// Resend's own docs list it as their top recommended fix for exactly this,
// since it's plain HTTPS rather than SMTP and works on every plan.
//
// Built lazily on first use, same reasoning as the Anthropic client:
// constructing it eagerly at module load would crash the whole process at
// startup on any deploy without RESEND_API_KEY set yet.

import { Resend } from 'resend';

// No verified custom domain yet — this is Resend's shared sandbox sender,
// which works without any domain setup but can only deliver to the email
// address on the Resend account itself, not arbitrary recipients. Fine for
// now (single-recipient alerts, and testing magic-link auth against our
// own inbox); switch to a verified sender on the eventual product domain
// before real subscribers need to receive mail from this.
const FROM_ADDRESS = process.env.MAIL_FROM || 'Contingency Brief <onboarding@resend.dev>';

let client;
function getClient() {
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

export function isMailerConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

/**
 * @param {string} to
 * @param {string} subject
 * @param {string} html
 */
export async function sendMail(to, subject, html) {
  if (!isMailerConfigured()) {
    throw new Error('RESEND_API_KEY is not configured on the server');
  }
  // Resend's SDK returns { data, error } rather than throwing on API-level
  // failures (invalid recipient, quota exceeded, etc.) — has to be checked
  // explicitly, a try/catch alone won't see these.
  const { error } = await getClient().emails.send({ from: FROM_ADDRESS, to, subject, html });
  if (error) {
    throw new Error(`${error.name}: ${error.message}`);
  }
}
