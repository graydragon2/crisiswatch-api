// utils/dataCollector.js
//
// Single shared self-fetch of this server's own /api/threats, used once
// per monitoring tick by both the history snapshotter and (as a shared
// input) the per-user alert detection pass (see server.js). Splitting this
// out means each tick does one AI-scoring pass for feed threats, not one
// per user.
//
// Used to also self-fetch /api/locations here, but that route is per-user
// as of Phase 2 (auth-gated, scoped to req.user.id) — watched-location news
// is now fetched per user directly in runMonitorTick via
// getWatchedLocationsWithNews(), not through this shared global snapshot.
// The Threat Score / history summary is therefore feed-only going forward,
// not folded together with any one user's watched locations.

import fetch from 'node-fetch';

/**
 * @param {number} port
 * @returns {Promise<{threats: object[]}>}
 */
export async function collectSnapshotData(port) {
  const base = `http://localhost:${port}`;
  const threatsRes = await fetch(`${base}/api/threats?useAI=true`).then((r) => r.json()).catch(() => ({ threats: [] }));
  return { threats: threatsRes.threats || [] };
}
