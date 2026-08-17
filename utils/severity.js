// utils/severity.js
//
// Single source of truth for mapping a 1-10 AI severity score to a named
// band + color. Used by history/scoring logic here, and meant to be read
// by the frontend too, so band names/colors never drift out of sync across
// the app the way they have before (each component picking its own
// thresholds ad hoc).

export const SEVERITY_BANDS = [
  { name: 'Critical', min: 9, color: '#ef4444' },
  { name: 'High', min: 7, color: '#f97316' },
  { name: 'Medium', min: 4, color: '#eab308' },
  { name: 'Low', min: 2, color: '#22c55e' },
  { name: 'Informational', min: 0, color: '#3b82f6' }
];

/**
 * @param {number} score 1-10
 * @returns {{name: string, min: number, color: string}}
 */
export function getSeverityBand(score) {
  return SEVERITY_BANDS.find((b) => score >= b.min) || SEVERITY_BANDS[SEVERITY_BANDS.length - 1];
}
