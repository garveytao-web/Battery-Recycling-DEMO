'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { date } = require('../miniprogram/utils/date');

// Every page goes through the same date exported by the mini-program API.
test('UTC timestamps display as Beijing time instead of UTC', () => {
  assert.equal(date('2026-10-14T14:33:00.000Z'), '2026-10-14 22:33 北京时间');
  assert.equal(date('2026-10-14T16:30:00Z'), '2026-10-15 00:30 北京时间');
  assert.equal(date('2026-10-14T00:30:00Z'), '2026-10-14 08:30 北京时间');
});

test('explicit timezone offsets and legacy timezone-less values are handled consistently', () => {
  assert.equal(date('2026-10-14T22:33:00+08:00'), '2026-10-14 22:33 北京时间');
  assert.equal(date('2026-10-14T09:33:00-05:00'), '2026-10-14 22:33 北京时间');
  assert.equal(date('2026-10-14 14:33:00'), '2026-10-14 22:33 北京时间');
  assert.equal(date('2026-10-14T14:33:00'), '2026-10-14 22:33 北京时间');
  assert.equal(date(''), '');
  assert.equal(date('not a date'), '时间无效');
});

test('history, trade, report and offer pages all use shared Beijing formatter', () => {
  const root = path.resolve(__dirname, '../miniprogram/pages');
  for (const name of ['history', 'trade', 'report', 'me']) {
    const source = fs.readFileSync(path.join(root, name, 'index.js'), 'utf8');
    assert.match(source, /\bdate\(/, `${name} page must use the shared formatter`);
  }
  const api = fs.readFileSync(path.resolve(__dirname, '../miniprogram/utils/api.js'), 'utf8');
  assert.match(api, /require\('\.\/date'\)/);
  assert.doesNotMatch(api, /\+ ' UTC'/);
});

test('legacy H5 times use the Asia/Shanghai timezone explicitly', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../dist/app.js'), 'utf8');
  assert.match(source, /timeZone:'Asia\/Shanghai'/);
});
