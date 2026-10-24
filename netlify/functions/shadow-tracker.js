"use strict";
const { outcome } = require("./strategy");
const { crossedMarketClosure } = require("./weekend-guard");
const MAX_HISTORY = 300;
const MAX_OPEN = 5;
const MAX_AGE = 6 * 60 * 60 * 1000;
const CATEGORIES = ["below60", "otherFilter"];
function ensure(tracker) {
  if (!Array.isArray(tracker.shadowOpen)) tracker.shadowOpen = [];
  if (!Array.isArray(tracker.shadowHistory)) tracker.shadowHistory = [];
  if (!tracker.shadowStats || typeof tracker.shadowStats !== "object") tracker.shadowStats = {};
  if (!tracker.shadowLastBar || typeof tracker.shadowLastBar !== "object") tracker.shadowLastBar = {};
}
function classify(analysis, gate, eligible) {
  if (eligible) return null;
  return !gate.passes ? "below60" : "otherFilter";
}
function trackShadow(tracker, pair, a, gate, eligible, latest, now = Date.now()) {
  ensure(tracker);
  const category = classify(a, gate, eligible);
  if (!category || !["買い", "売り"].includes(a.direction)) return false;
  if (!Number.isFinite(a.entryPrice) || !Number.isFinite(a.takeProfit) || !Number.isFinite(a.stopLoss) ||
    !(a.riskReward > 0) || !(a.entryPrice > 0) ||
    (a.direction === "買い" && !(a.stopLoss < a.entryPrice && a.entryPrice < a.takeProfit)) ||
    (a.direction === "売り" && !(a.takeProfit < a.entryPrice && a.entryPrice < a.stopLoss))) return false;
  if (!Number.isFinite(latest.endTime) || latest.endTime > now + 60000 || now - latest.endTime > 30 * 60000) return false;
  // At most one concurrent paper trade per pair; don't flood on repeated polling.
  if (tracker.shadowOpen.some(s => s.pair === pair) || tracker.shadowOpen.length >= MAX_OPEN ||
    tracker.shadowLastBar[pair] === latest.endTime) return false;
  tracker.shadowLastBar[pair] = latest.endTime;
  tracker.shadowOpen.push({pair, category, direction:a.direction, entryPrice:a.entryPrice,
    takeProfit:a.takeProfit, stopLoss:a.stopLoss, score:a.score,
    provisionalIndex:gate.estimatedScore, entryAt:latest.endTime,
    candleTime:latest.datetime, createdAt:now});
  return true;
}
function settleShadows(tracker, pair, candles, now = Date.now()) {
  ensure(tracker);
  const remaining=[];
  for(const s of tracker.shadowOpen) {
    if(s.pair!==pair) {remaining.push(s); continue;}
    let result=null;
    // outcome ignores entry candle and uses only following price action.
    for(const c of candles) {
      if(c.time < s.entryAt) continue;
      if(crossedMarketClosure(Number(s.entryAt),Number(c.time))) {result="weekendExcluded";break;}
      if(c.time >= s.entryAt + MAX_AGE) continue;
      result=outcome(s,c);
      if(result) break;
    }
    if(!result && crossedMarketClosure(Number(s.entryAt),now)) result="weekendExcluded";
    if(!result && now >= s.entryAt + MAX_AGE) result="expired";
    if(!result) {remaining.push(s); continue;}
    const bucket = ((tracker.shadowStats[pair] ||= {})[s.category] ||= {wins:0,losses:0,ambiguous:0,expired:0,weekendExcluded:0});
    bucket[result]=(bucket[result]||0)+1;
    tracker.shadowHistory.push({...s,result,settledAt:now});
  }
  tracker.shadowOpen=remaining;
  if(tracker.shadowHistory.length>MAX_HISTORY) tracker.shadowHistory=tracker.shadowHistory.slice(-MAX_HISTORY);
}
function shadowSummary(tracker,pair) {
  ensure(tracker);
  const pairStats=tracker.shadowStats[pair] || {};
  return {open: tracker.shadowOpen.filter(s=>s.pair===pair).length,
    categories:Object.fromEntries(CATEGORIES.map(category=>{
      const b=pairStats[category] || {wins:0,losses:0,ambiguous:0,expired:0,weekendExcluded:0};
      const decided=b.wins+b.losses;
      return [category,{...b,decided,winRate:decided?Math.round(b.wins/decided*1000)/10:null}];
    }))};
}
module.exports={trackShadow,settleShadows,shadowSummary};
