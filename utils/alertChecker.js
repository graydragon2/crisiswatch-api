// utils/alertChecker.js
//
// Emails the configured recipient when the shared per-tick detection pass
// (utils/alertDetector.js) found new high-severity items, severe weather
// alerts, or dark-web exposure hits. Detection/dedup itself lives in
// alertDetector.js — this module only renders and sends.

import { getAlertSettings } from './alertStore.js';
import { isMailerConfigured, sendMail } from './mailer.js';

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderEmail({ threats, weatherAlerts, localNews, darkWebHits }) {
  const section = (title, rows) =>
    rows.length
      ? `<h3>${title}</h3><ul>${rows.map((r) => `<li>${r}</li>`).join('')}</ul>`
      : '';

  const threatRows = threats.map(
    (t) => `<a href="${escapeHtml(t.link)}">${escapeHtml(t.title)}</a> — severity ${t.score}/10 (${escapeHtml(t.source || '')})`
  );
  const weatherRows = weatherAlerts.map(
    (a) => `<strong>${escapeHtml(a.title)}</strong> (${escapeHtml(a.severity)}) — ${escapeHtml(a.city)}, ${escapeHtml(a.state)}: ${escapeHtml(a.description || '')}`
  );
  const newsRows = localNews.map(
    (n) => `<a href="${escapeHtml(n.link)}">${escapeHtml(n.title)}</a> — severity ${n.score}/10 (${escapeHtml(n.city)}, ${escapeHtml(n.state)})`
  );
  // Deliberately doesn't include the monitored email address itself, or any
  // breach credentials — just that exposure was found and roughly how bad.
  const darkWebRows = (darkWebHits || []).map(
    (e) => `<strong>Dark Web Exposure</strong> — ${e.exposureCount} exposure${e.exposureCount === 1 ? '' : 's'} found for a monitored email (risk: ${escapeHtml(e.riskLevel)})`
  );

  return `
    <p>CrisisWatch found new items that may warrant attention:</p>
    ${section('High-Severity Threats', threatRows)}
    ${section('Weather / Emergency Alerts', weatherRows)}
    ${section('Local News', newsRows)}
    ${section('Dark Web Exposure', darkWebRows)}
  `;
}

/**
 * @param {{threats: object[], weatherAlerts: object[], localNews: object[], darkWebHits: object[]}} detected
 *   result of alertDetector.detectNewAlertableItems
 */
export async function sendAlertEmail({ threats, weatherAlerts, localNews, darkWebHits }) {
  const { enabled, recipient } = getAlertSettings();
  if (!enabled || !recipient || !isMailerConfigured()) return;

  const total = threats.length + weatherAlerts.length + localNews.length + darkWebHits.length;
  if (!total) return;

  try {
    await sendMail(
      recipient,
      `CrisisWatch: ${total} new item${total === 1 ? '' : 's'} flagged`,
      renderEmail({ threats, weatherAlerts, localNews, darkWebHits })
    );
  } catch (err) {
    console.error('Alert email failed:', err.message);
  }
}
