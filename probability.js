"use strict";
// A historical hit rate is not a calibrated forward-looking probability.
// Keep it labelled as an empirical estimate, with a confidence lower bound.
const { evaluate, outcome } = require("./strategy");
const MIN_COMPARABLE = 30;
function qualifies(a) {
  return a && a.direction !== "見送り" && !a.isRsiExtreme && !a.isSharpMove &&
    !a.isRangeTooSmall && !a.isWeakTrend && !a.isCandleOpposed &&
    a.candleSignal !== "十字線" && a.netRewardPips > 0 &&
    a.riskReward >= 1.2 && a.score >= 70;
}
function matchGroup(a) {
  return a.direction + "|" + (a.higherAligned ? "aligned" : "mixed") + "|" +
    (a.score >= 90 ? "high" : a.score >= 80 ? "medium" : "low");
}
function wilsonLower(wins, n, z=1.645) {
  if (!n) return 0;
  const p=wins/n, zz=z*z;
  return (p+zz/(2*n)-z*Math.sqrt((p*(1-p)+zz/(4*n))/n))/(1+zz/n);
}
function estimateProbability(tracker, pair, a) {
  const key=matchGroup(a);
  const s=tracker.candidateStats?.[pair]?.[key] || {};
  const wins=s.wins || 0, n=wins+(s.losses||0)+(s.ambiguous||0)+(s.expired||0);
  return { empiricalWinRate: n ? Math.round(wins/n*1000)/10 : null,
    lowerBound90: n ? Math.round(wilsonLower(wins,n)*1000)/10 : null,
    sampleSize:n, requiredSamples:MIN_COMPARABLE, isValidated:n>=MIN_COMPARABLE,
    group:key, note:"実績の観測勝率（予測勝率の保証ではありません）。90%片側信頼下限は参考値。" };
}
function settleCandidates(tracker,pair,candles,now=Date.now()) {
  tracker.openCandidates ||= [];
  tracker.candidateStats ||= {};
  tracker.candidateStats[pair] ||= {};
  const rest=[];
  for (const s of tracker.openCandidates) {
    if (s.pair !== pair) {rest.push(s);continue;}
    // Do not evaluate the signal-forming candle against its own TP/SL.
    const newer=candles.filter(c => c.time >= s.entryAt);
    let result=null;
    for (const c of newer) {result=outcome(s,c);if(result)break;}
    if (!result && now>=s.entryAt+6*60*60*1000) result="expired";
    if (!result) {rest.push(s);continue;}
    const b=tracker.candidateStats[pair][s.group] ||= {wins:0,losses:0,ambiguous:0,expired:0};
    b[result]++;
  }
  tracker.openCandidates=rest;
}
function trackCandidate(tracker,pair,a) {
  if (!qualifies(a))return false;
  tracker.openCandidates ||= [];
  const key=matchGroup(a);
  // One open hypothetical trade per pair, so 15m repeated checks won't dominate.
  if (tracker.openCandidates.some(s=>s.pair===pair)) return false;
  tracker.openCandidates.push({pair,group:key,direction:a.direction,
    entryAt:a.entryAt,entryPrice:a.entryPrice,takeProfit:a.takeProfit,stopLoss:a.stopLoss,
    candleTime:a.candleTime});
  return true;
}
module.exports={MIN_COMPARABLE,qualifies,matchGroup,estimateProbability,settleCandidates,trackCandidate};
