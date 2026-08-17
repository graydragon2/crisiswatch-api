// utils/alertChecker.js
//
// Checks a snapshot of threats/watched-location data (gathered once per
// tick by dataCollector.js and shared with historyStore's snapshotter — see
// server.js) for high-severity items and severe weather alerts, and emails
// the configured recipient when something new (not already alerted) shows
// up.

import { getAlertSettings, filterUnseen, markSeen } from './alertStore.js';
import { isMailerConfigured, sendMail } from './mailer.js';

const SCORE_THRESHOLD = Number(process.env.ALERT_SCORE_THRESHOLD) || 8;
const NWS_ALERT_SEVERITIES = new Set(['Extreme', 'Severe']);

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderEmail({ threats, weatherAlerts, localNews }) {
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

  return `
    <p>CrisisWatch found new items that may warrant attention:</p>
    ${section('High-Severity Threats', threatRows)}
    ${section('Weather / Emergency Alerts', weatherRows)}
    ${section('Local News', newsRows)}
  `;
}

/**
 * @param {{threats: object[], locations: object[]}} data from dataCollector.collectSnapshotData
 */
export async function runAlertCheck({ threats: allThreats, locations: allLocations }) {
  const { enabled, recipient } = getAlertSettings();
  if (!enabled || !recipient || !isMailerConfigured()) return;

  try {
    const candidateThreats = allThreats.filter((t) => typeof t.score === 'number' && t.score >= SCORE_THRESHOLD);
    const threatKeys = candidateThreats.map((t) => t.link).filter(Boolean);
    const newThreatKeys = new Set(filterUnseen(threatKeys));
    const threats = candidateThreats.filter((t) => newThreatKeys.has(t.link));

    const weatherAlertCandidates = [];
    const newsCandidates = [];
    for (const loc of allLocations) {
      for (const a of loc.alerts || []) {
        if (NWS_ALERT_SEVERITIES.has(a.severity) && a.link) {
          weatherAlertCandidates.push({ ...a, city: loc.city, state: loc.state, key: a.link });
        }
      }
      for (const n of loc.news || []) {
        if (typeof n.score === 'number' && n.score >= SCORE_THRESHOLD && n.link) {
          newsCandidates.push({ ...n, city: loc.city, state: loc.state, key: n.link });
        }
      }
    }
    const newWeatherKeys = new Set(filterUnseen(weatherAlertCandidates.map((a) => a.key)));
    const newNewsKeys = new Set(filterUnseen(newsCandidates.map((n) => n.key)));
    const weatherAlerts = weatherAlertCandidates.filter((a) => newWeatherKeys.has(a.key));
    const localNews = newsCandidates.filter((n) => newNewsKeys.has(n.key));

    if (!threats.length && !weatherAlerts.length && !localNews.length) return;

    const total = threats.length + weatherAlerts.length + localNews.length;
    await sendMail(
      recipient,
      `CrisisWatch: ${total} new item${total === 1 ? '' : 's'} flagged`,
      renderEmail({ threats, weatherAlerts, localNews })
    );

    markSeen([...threats.map((t) => t.link), ...weatherAlerts.map((a) => a.key), ...localNews.map((n) => n.key)]);
  } catch (err) {
    console.error('Alert check failed:', err.message);
  }
}
