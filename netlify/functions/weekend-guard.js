"use strict";
const { isFxMarketOpen } = require("./fx-market-hours");
const STEP_MS = 15 * 60 * 1000;
// Do not credit a weekend opening gap as a normal trade win or loss.
function crossedMarketClosure(entryAt, asOf) {
  if (!Number.isFinite(entryAt) || !Number.isFinite(asOf) || asOf <= entryAt) return false;
  for (let t = entryAt + STEP_MS; t <= asOf; t += STEP_MS) {
    if (!isFxMarketOpen(new Date(t))) return true;
  }
  return !isFxMarketOpen(new Date(asOf));
}
function canStartSixHourTrade(now = Date.now()) {
  if (!isFxMarketOpen(new Date(now))) return false;
  // Friday New York 11:00 onward: fewer than 6 trading hours remain.
  return !crossedMarketClosure(now, now + 6*60*60*1000);
}
module.exports = { crossedMarketClosure, canStartSixHourTrade };
