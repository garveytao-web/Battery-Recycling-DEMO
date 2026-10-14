'use strict';

// Backend timestamps are UTC ISO 8601 instants. Keep those original values for
// storage and ordering; convert only when presenting times to Chinese users.
// Use UTC getters after adding eight hours so the output does not depend on the
// timezone of the phone, WeChat DevTools, or the computer running the tests.
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const pad2 = value => String(value).padStart(2, '0');

function date(timestamp) {
  if (timestamp === null || timestamp === undefined || timestamp === '') return '';
  let source = timestamp;
  if (typeof source === 'string') {
    source = source.trim();
    if (!source) return '';
    // Older timezone-less records are interpreted as UTC, never in the
    // device's local timezone. All new server records already include Z.
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(source)) {
      source = source.replace(' ', 'T') + 'Z';
    }
  }
  const instant = new Date(source);
  if (!Number.isFinite(instant.getTime())) return '时间无效';
  const beijing = new Date(instant.getTime() + BEIJING_OFFSET_MS);
  return `${beijing.getUTCFullYear()}-${pad2(beijing.getUTCMonth() + 1)}-${pad2(beijing.getUTCDate())} ${pad2(beijing.getUTCHours())}:${pad2(beijing.getUTCMinutes())} 北京时间`;
}

module.exports = { date };
