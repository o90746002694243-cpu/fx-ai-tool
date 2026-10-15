const test = require("node:test");
const assert = require("node:assert/strict");
const {isFxMarketOpen} = require("./netlify/functions/fx-market-hours");
const cases = [
  ["2026-10-11T04:00:00Z", false], // Saturday midnight NY
  ["2026-10-11T20:59:00Z", false], // Sunday before DST open
  ["2026-10-11T21:00:00Z", true],  // Sunday DST open
  ["2026-10-16T20:59:00Z", true],
  ["2026-10-16T21:00:00Z", false], // Friday DST close
  ["2026-11-01T21:59:00Z", false], // Sunday winter before open
  ["2026-11-01T22:00:00Z", true],
  ["2026-11-06T22:00:00Z", false]  // Friday winter close
];
for (const [timestamp, expected] of cases) test(`FX session ${timestamp}`, () => {
  assert.equal(isFxMarketOpen(new Date(timestamp)), expected);
});
