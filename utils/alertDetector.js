// utils/alertDetector.js
//
// Finds newly-alertable items — high-severity threats, severe weather
// alerts, high-severity local news, and new dark-web exposure hits — that
// haven't been flagged on a previous tick, and marks them seen. Meant to
// run exactly once per monitor tick (see server.js) so email alerts and
// in-app notifications consume the same detection pass instead of each
// doing their own seen-tracking, which would either double-count items or
// race on markSeen.

import { filterUnseen, markSeen } from './alertStore.js';
import { getSeverityBand } from './severity.js';

const SCORE_THRESHOLD = Number(process.env.ALERT_SCORE_THRESHOLD) || 8;
const NWS_ALERT_SEVERITIES = new Set(['Extreme', 'Severe']);

/**
 * @param {string} userId
 * @param {{threats: object[], locations: object[], monitoredEmails: object[]}} data
 */
export async function detectNewAlertableItems(userId, { threats: allThreats, locations: allLocations, monitoredEmails }) {
  const candidateThreats = allThreats.filter((t) => typeof t.score === 'number' && t.score >= SCORE_THRESHOLD);
  const threatKeys = candidateThreats.map((t) => t.link).filter(Boolean);
  const newThreatKeys = new Set(await filterUnseen(userId, threatKeys));
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
  const newWeatherKeys = new Set(await filterUnseen(userId, weatherAlertCandidates.map((a) => a.key)));
  const newNewsKeys = new Set(await filterUnseen(userId, newsCandidates.map((n) => n.key)));
  const weatherAlerts = weatherAlertCandidates.filter((a) => newWeatherKeys.has(a.key));
  const localNews = newsCandidates.filter((n) => newNewsKeys.has(n.key));

  // Keyed on email+exposureCount so a re-check that finds the *same* count
  // doesn't re-alert, but a fresh breach that bumps the count does.
  const darkWebCandidates = (monitoredEmails || [])
    .filter((e) => e.status === 'active' && e.found && e.exposureCount > 0)
    .map((e) => ({ ...e, key: `darkweb:${e.email}:${e.exposureCount}` }));
  const newDarkWebKeys = new Set(await filterUnseen(userId, darkWebCandidates.map((e) => e.key)));
  const darkWebHits = darkWebCandidates.filter((e) => newDarkWebKeys.has(e.key));

  await markSeen(userId, [
    ...threats.map((t) => t.link),
    ...weatherAlerts.map((a) => a.key),
    ...localNews.map((n) => n.key),
    ...darkWebHits.map((e) => e.key)
  ]);

  return { threats, weatherAlerts, localNews, darkWebHits };
}

// Collapses the 1-10 severity scale down to the notification center's four
// categories (Critical/High/Medium/Informational — no "Low", per spec).
function categoryForScore(score) {
  const band = getSeverityBand(score).name;
  if (band === 'Critical' || band === 'High' || band === 'Medium') return band;
  return 'Informational';
}

/**
 * Maps a detectNewAlertableItems() result to the shape notificationStore
 * expects. Deliberately omits the actual monitored email address from
 * dark-web notification text — same "don't display sensitive info
 * unnecessarily" posture used elsewhere in this project.
 */
export function buildNotificationItems({ threats, weatherAlerts, localNews, darkWebHits }) {
  const items = [];

  for (const t of threats) {
    items.push({
      category: categoryForScore(t.score),
      title: t.title,
      message: `Severity ${t.score}/10${t.source ? ` — ${t.source}` : ''}`,
      link: t.link
    });
  }
  for (const a of weatherAlerts) {
    items.push({
      category: a.severity === 'Extreme' ? 'Critical' : 'High',
      title: a.title,
      message: `${a.city}, ${a.state}`,
      link: a.link
    });
  }
  for (const n of localNews) {
    items.push({
      category: categoryForScore(n.score),
      title: n.title,
      message: `${n.city}, ${n.state} — severity ${n.score}/10`,
      link: n.link
    });
  }
  for (const e of darkWebHits) {
    items.push({
      category: e.riskLevel === 'High' ? 'Critical' : e.riskLevel === 'Medium' ? 'High' : 'Medium',
      title: 'Dark web exposure detected',
      message: `${e.exposureCount} exposure${e.exposureCount === 1 ? '' : 's'} found for a monitored email (risk: ${e.riskLevel})`,
      link: null
    });
  }

  return items;
}
