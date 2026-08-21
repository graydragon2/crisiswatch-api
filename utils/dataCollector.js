// utils/dataCollector.js
//
// Single shared entry point into getThreats(), used once per monitoring
// tick by both the history snapshotter and (as a shared input) the
// per-user alert detection pass (see server.js). Splitting this out means
// each tick does one AI-scoring pass for feed threats, not one per user.
//
// Used to self-fetch its own /api/threats over HTTP rather than calling
// getThreats() directly — that broke once /api/threats started requiring
// auth (this internal call has no bearer token to send), and was always an
// unnecessary network hop for a same-process call. Calls the aggregator
// function directly instead.
//
// Used to also self-fetch /api/locations here, but that route is per-user
// as of Phase 2 (auth-gated, scoped to req.user.id) — watched-location news
// is now fetched per user directly in runMonitorTick via
// getWatchedLocationsWithNews(), not through this shared global snapshot.
// The Threat Score / history summary is therefore feed-only going forward,
// not folded together with any one user's watched locations.

import { getThreats } from './threatsAggregator.js';

/**
 * @returns {Promise<{threats: object[]}>}
 */
export async function collectSnapshotData() {
  try {
    const threats = await getThreats({ useAI: true });
    return { threats };
  } catch (err) {
    console.error('collectSnapshotData failed:', err.message);
    return { threats: [] };
  }
}
