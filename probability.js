const { crossedMarketClosure } = require("./weekend-guard");
"use strict";
// A historical hit rate is not a calibrated forward-looking probability.
// Keep it labelled as an empirical estimate, with a confidence lower bound.
const { evaluate, outcome } = require("./strategy");
const MIN_COMPARABLE = 30;
function qualifies(a) {
  return a && a.direction !== "見送り" && !a.isRsiExtreme && !a.isSharpMove &&
    !a.isRangeTooSmall && !a.isCandleOpposed &&
    a.candleSignal !== "十字線" && a.netRewardPips > 0 &&
    a.riskReward >= 1.5 && a.score >= 70;
}
// Broader observation pool: preserve paper-only research below the push RR floor.
function qualifiesCandidate(a) {
  return !!a && a.direction !== "見送り" && !a.isRsiExtreme && !a.isSharpMove &&
    !a.isRangeTooSmall && !a.isCandleOpposed && a.candleSignal !== "十字線" &&
    a.netRewardPips > 0 && a.riskReward >= 1.2 && a.score >= 70;
}
function matchGroup(a) {
  return a.direction + "|" + (a.score >= 90 ? "high" : a.score >= 80 ? "medium" : "low");
}
function wilsonLower(wins, n, z=1.645) {
  if (!n) return 0;
  const p=wins/n, zz=z*z;
  return (p+zz/(2*n)-z*Math.sqrt((p*(1-p)+zz/(4*n))/n))/(1+zz/n);
}
function estimateProbability(tracker, pair, a) {
  const key=matchGroup(a);
  // Merge legacy H1/H4-split results without requiring their agreement.
  const all=tracker.candidateStats?.[pair] || {};
  const suffix=key.slice(a.direction.length);
  const buckets=[key,a.direction+"|aligned"+suffix,a.direction+"|mixed"+suffix];
  const sums=buckets.reduce((acc,k)=>{const s=all[k]||{}; for(const x of ["wins","losses","ambiguous","expired"]) acc[x]+=(s[x]||0);return acc;},{wins:0,losses:0,ambiguous:0,expired:0});
  const wins=sums.wins, n=wins+sums.losses+sums.ambiguous+sums.expired;
  return { empiricalWinRate: n ? Math.round(wins/n*1000)/10 : null,
    lowerBound90: n ? Math.round(wilsonLower(wins,n)*1000)/10 : null,
    sampleSize:n, requiredSamples:MIN_COMPARABLE, isValidated:n>=MIN_COMPARABLE,
    group:key, note:"実績の観測勝率（予測勝率の保証ではありません）。90%片側信頼下限は参考値。" };
}
// A provisional screening index, NOT a calibrated forecast probability.
// It bridges the first 30 completed comparable hypothetical cases without
// inventing wins when the history is empty. Prior is deliberately disclosed.
function provisional60Gate(analysis, empirical) {
  const score = Number(analysis.score);
  const prior = Number.isFinite(score) ? Math.max(0, Math.min(100, 60 + (score - 70) * 0.5)) : 0;
  const n = empirical.sampleSize;
  const rate = n ? (30 * prior + n * empirical.empiricalWinRate) / (30 + n) : prior;
  return { estimatedScore: Math.round(rate * 10) / 10, passes: rate >= 60,
    status: n >= MIN_COMPARABLE ? "実績併用・暫定指数" : "30件未満・暫定指数",
    note: "スコア換算の暫定60%指数。校正済み予測勝率ではなく、実勝率60%を保証しません。" };
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
    for (const c of newer) {
      if(crossedMarketClosure(Number(s.entryAt),Number(c.time))) {result="weekendExcluded";break;}
      result=outcome(s,c);if(result)break;
    }
    if(!result && crossedMarketClosure(Number(s.entryAt),now)) result="weekendExcluded";
    if (!result && now>=s.entryAt+6*60*60*1000) result="expired";
    if (!result) {rest.push(s);continue;}
    const b=tracker.candidateStats[pair][s.group] ||= {wins:0,losses:0,ambiguous:0,expired:0};
    b[result]=(b[result]||0)+1;
  }
  tracker.openCandidates=rest;
}
function trackCandidate(tracker,pair,a) {
  if (!qualifiesCandidate(a))return false;
  tracker.openCandidates ||= [];
  const key=matchGroup(a);
  // One open hypothetical trade per pair, so 15m repeated checks won't dominate.
  if (tracker.openCandidates.some(s=>s.pair===pair)) return false;
  tracker.openCandidates.push({pair,group:key,direction:a.direction,
    entryAt:a.entryAt,entryPrice:a.entryPrice,takeProfit:a.takeProfit,stopLoss:a.stopLoss,
    candleTime:a.candleTime});
  return true;
}
module.exports={MIN_COMPARABLE,qualifies,qualifiesCandidate,matchGroup,estimateProbability,provisional60Gate,settleCandidates,trackCandidate};
