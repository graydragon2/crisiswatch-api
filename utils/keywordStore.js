// utils/keywordStore.js
//
// Tracks a watchlist of keywords for the "Keywords Alert" dashboard
// feature. Same persistence pattern as feedStore.js.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const keywordsFilePath = path.join(__dirname, '../data/keywords.json');

function readKeywords() {
  try {
    return JSON.parse(fs.readFileSync(keywordsFilePath, 'utf-8'));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    console.error('Failed to read keywords file:', err);
    return [];
  }
}

function writeKeywords(keywords) {
  fs.writeFileSync(keywordsFilePath, JSON.stringify(keywords, null, 2));
}

export function getKeywords() {
  return readKeywords();
}

export function addKeyword(keyword) {
  const keywords = readKeywords();
  const normalized = keyword.trim().toLowerCase();
  if (!normalized || keywords.includes(normalized)) return keywords;
  keywords.push(normalized);
  writeKeywords(keywords);
  return keywords;
}

export function removeKeyword(keyword) {
  const normalized = keyword.trim().toLowerCase();
  const keywords = readKeywords().filter((k) => k !== normalized);
  writeKeywords(keywords);
  return keywords;
}
