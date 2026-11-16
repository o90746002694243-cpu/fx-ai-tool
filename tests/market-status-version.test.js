const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const status = fs.readFileSync(path.join(__dirname, '../netlify/functions/market-status.js'), 'utf8');
test('status endpoint exposes active strategy and version match', () => {
  assert.match(status, /const \{ STRATEGY_VERSION \} = require\("\.\/strategy"\)/);
  assert.match(status, /activeStrategyVersion:STRATEGY_VERSION/);
  assert.match(status, /snapshotVersionMatches: result\.strategyVersion === STRATEGY_VERSION/);
});
