// utils/dataCollector.js
//
// Single shared self-fetch of this server's own /api/threats and
// /api/locations, used once per monitoring tick by both the alert checker
// and the history snapshotter (see server.js). Splitting this out means
// each tick does one AI-scoring pass, not two — before this, alerting and
// history logging would have each self-fetched independently and doubled
// the Claude API usage for no reason, since both need the same data.

import fetch from 'node-fetch';

/**
 * @param {number} port
 * @returns {Promise<{threats: object[], locations: object[]}>}
 */
export async function collectSnapshotData(port) {
  const base = `http://localhost:${port}`;
  const [threatsRes, locationsRes] = await Promise.all([
    fetch(`${base}/api/threats?useAI=true`).then((r) => r.json()).catch(() => ({ threats: [] })),
    fetch(`${base}/api/locations?useAI=true`).then((r) => r.json()).catch(() => ({ locations: [] }))
  ]);
  return {
    threats: threatsRes.threats || [],
    locations: locationsRes.locations || []
  };
}
