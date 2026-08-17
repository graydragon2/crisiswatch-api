// utils/mailer.js
//
// Sends alert emails via Gmail SMTP (free, no new service to sign up for —
// just a Gmail account with an App Password, since Google requires that
// over a plain password for SMTP access). Built lazily on first use, same
// reasoning as the Anthropic client: constructing it eagerly at module load
// would be fine here (createTransport doesn't throw on missing auth), but
// staying consistent with the lazy pattern used everywhere else in this
// codebase avoids surprises.

import nodemailer from 'nodemailer';

let transporter;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }
  return transporter;
}

export function isMailerConfigured() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

/**
 * @param {string} to
 * @param {string} subject
 * @param {string} html
 */
export async function sendMail(to, subject, html) {
  if (!isMailerConfigured()) {
    throw new Error('SMTP_USER/SMTP_PASS are not configured on the server');
  }
  await getTransporter().sendMail({
    from: process.env.SMTP_USER,
    to,
    subject,
    html
  });
}
