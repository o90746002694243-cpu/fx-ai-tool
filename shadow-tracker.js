"use strict";
const { outcome } = require("./strategy");
const { crossedMarketClosure } = require("./weekend-guard");
const MAX_HISTORY = 300;
const MAX_OPEN = 5;
const MAX_AGE = 3 * 60 * 60 * 1000;
const LEGACY_MAX_AGE = 6 * 60 * 60 * 1000;
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
function explainShadow(tracker, pair, a, gate, eligible, latest, now = Date.now()) {
  ensure(tracker);
  const category = classify(a, gate, eligible);
  if (!category) return {recorded:false, reason:"eligibleForNotification"};
  if (!["買い", "売り"].includes(a.direction)) return {recorded:false, reason:"invalidDirection"};
  if (!Number.isFinite(a.entryPrice) || !Number.isFinite(a.takeProfit) || !Number.isFinite(a.stopLoss) ||
    !(a.riskReward > 0) || !(a.entryPrice > 0) ||
    (a.direction === "買い" && !(a.stopLoss < a.entryPrice && a.entryPrice < a.takeProfit)) ||
    (a.direction === "売り" && !(a.takeProfit < a.entryPrice && a.entryPrice < a.stopLoss)))
    return {recorded:false, reason:"invalidPriceLevels"};
  if (!latest || !Number.isFinite(latest.endTime) || latest.endTime > now + 60000 || now - latest.endTime > 30 * 60000)
    return {recorded:false, reason:"staleOrInvalidCandle"};
  const existing = tracker.shadowOpen.find(s => s.pair === pair);
  if (existing) return {recorded:false, reason:"existingOpenTrade", existingEntryAt:existing.entryAt,
    existingEntryPrice:existing.entryPrice, existingTakeProfit:existing.takeProfit, existingStopLoss:existing.stopLoss};
  if (tracker.shadowOpen.length >= MAX_OPEN) return {recorded:false, reason:"maxOpenTrades"};
  if (tracker.shadowLastBar[pair] === latest.endTime) return {recorded:false, reason:"alreadyRecordedThisBar"};
  tracker.shadowLastBar[pair] = latest.endTime;
  tracker.shadowOpen.push({pair, category, direction:a.direction, entryPrice:a.entryPrice,
    takeProfit:a.takeProfit, stopLoss:a.stopLoss, score:a.score,
    provisionalIndex:gate.estimatedScore, entryAt:latest.endTime,
    candleTime:latest.datetime, createdAt:now, maxAgeMs:MAX_AGE});
  return {recorded:true, reason:"recorded"};
}
function trackShadow(tracker, pair, a, gate, eligible, latest, now = Date.now()) {
  return explainShadow(tracker, pair, a, gate, eligible, latest, now).recorded;
}
function resolveCandle(s,c) {
  const buy=s.direction === "買い";
  const tp=buy ? c.high >= s.takeProfit : c.low <= s.takeProfit;
  const sl=buy ? c.low <= s.stopLoss : c.high >= s.stopLoss;
  if(tp && sl) return "ambiguous";
  if(sl) return "losses";
  if(tp) return "wins";
  return null;
}
function settleShadows(tracker, pair, candles, now = Date.now()) {
  ensure(tracker);
  const remaining=[];
  for(const s of tracker.shadowOpen) {
    if(s.pair!==pair) {remaining.push(s); continue;}
    // Existing paper trades preserve their original 6-hour window.
    const maxAge=Number.isFinite(s.maxAgeMs) && s.maxAgeMs>0 ? s.maxAgeMs : LEGACY_MAX_AGE;
    const deadline=Number(s.entryAt)+maxAge;
    let result=null, exitCandle=null;
    const bars=[...candles].filter(c=>Number.isFinite(c.time) && Number.isFinite(c.endTime))
      .sort((a,b)=>a.time-b.time);
    for(const c of bars) {
      if(c.time < s.entryAt || c.endTime > now) continue;
      if(crossedMarketClosure(Number(s.entryAt),Number(c.endTime))) {result="weekendExcluded";break;}
      if(c.endTime > deadline) break; // Never settle using price action after the cutoff.
      result=resolveCandle(s,c);
      if(result) {exitCandle=c;break;}
    }
    if(!result && crossedMarketClosure(Number(s.entryAt),Math.min(now,deadline))) result="weekendExcluded";
    if(!result && now>=deadline) {
      // Only finalise on a fully observed candle ending at the cutoff;
      // missing candles must not silently become a profitable/loss trade.
      const last=bars.filter(c=>c.endTime<=deadline && c.endTime>Number(s.entryAt)).at(-1);
      result="expired";
      if(last && last.endTime===deadline) exitCandle=last;
      else console.warn("FX shadow expiry without matching candle:",JSON.stringify({pair,entryAt:s.entryAt,deadline}));
    }
    if(!result) {remaining.push(s);continue;}
    const bucket=((tracker.shadowStats[pair] ||= {})[s.category] ||= {wins:0,losses:0,ambiguous:0,expired:0,weekendExcluded:0});
    bucket[result]=(bucket[result]||0)+1;
    const exitPrice=exitCandle && Number.isFinite(exitCandle.close) ? exitCandle.close : null;
    const grossPips=exitPrice===null?null:Math.round((s.direction==="買い"?exitPrice-s.entryPrice:s.entryPrice-exitPrice)*10000)/100;
    tracker.shadowHistory.push({...s,result,settledAt:now,expiryAt:deadline,
      outcomeCandleEndTime:exitCandle?.endTime||null,expiryQuoteMissing:result==="expired" && !exitCandle,exitReferencePrice:exitPrice,grossPips,
      // This is a reference quote P/L, NOT broker-specific net P/L.
      costAdjustedPips:null});
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
      const total=decided+b.ambiguous+b.expired;
      return [category,{...b,decided,total,conditionalWinRate:decided?Math.round(b.wins/decided*1000)/10:null, winRate:total?Math.round(b.wins/total*1000)/10:null, successRate:total?Math.round(b.wins/total*1000)/10:null}];
    }))};
}
module.exports={trackShadow,explainShadow,settleShadows,shadowSummary};
