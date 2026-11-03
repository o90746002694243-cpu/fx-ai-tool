"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const monitor = fs.readFileSync(path.join(__dirname, '../netlify/functions/monitor-market.js'), 'utf8');
const { provisional60Gate } = require('../netlify/functions/probability');

test('JST 02:00-08:00 no longer blocks notifications outright', () => {
  assert.doesNotMatch(monitor, /isJstQuietHours\(/);
  assert.doesNotMatch(monitor, /!quietHoursBlocked\s*&&/);
  assert.match(monitor, /const quietHoursBlocked = false/);
});
test('quality, market and event restrictions remain active', () => {
  for (const term of ['canStartSixHourTrade()', '!reopeningBlocked', 'pushGate.allowed', 'signalEligible', '!stale', '!alreadyTracking', '!importantEvent', 'Boolean(tradeStore)']) {
    assert.ok(monitor.includes(term), 'Missing guard ' + term);
  }
});
test('provisional gate is not equivalent to calibrated empirical win rate', () => {
  const sample = {sampleSize:19, empiricalWinRate:31.6};
  const result = provisional60Gate({score:90}, sample);
  assert.equal(result.estimatedScore,55.1);
  assert.equal(result.passes,false);
});
