"use strict";
// Observational audit, not a causal A/B test. Only compare settled trades
// in the same pair and strategy version; never declare harm from small samples.
const FEATURES = ["rsiExtreme", "sharpMove", "rangeTooSmall", "candleOpposed", "doji", "weakTrend"];
function snapshot(a) {
  return {
    rsiExtreme: !!a.isRsiExtreme,
    sharpMove: !!a.isSharpMove,
    rangeTooSmall: !!a.isRangeTooSmall,
    candleOpposed: !!a.isCandleOpposed,
    doji: a.candleSignal === "十字線",
    weakTrend: !!a.isWeakTrend
  };
}
function audit(history, pair, minPerGroup = 30) {
  const rows = (history || []).filter(t => t.pair === pair && t.features &&
    ["wins", "losses", "expired", "ambiguous"].includes(t.result));
  return FEATURES.map(feature => {
    const filtered = rows.filter(t => t.features[feature] === true);
    const unfiltered = rows.filter(t => t.features[feature] === false);
    const metric = arr => ({count:arr.length, wins:arr.filter(t=>t.result==="wins").length,
      winRate:arr.length?Math.round(1000*arr.filter(t=>t.result==="wins").length/arr.length)/10:null});
    const withCondition = metric(filtered), withoutCondition = metric(unfiltered);
    return {feature, whenTriggered:withCondition, whenNotTriggered:withoutCondition,
      enoughData:withCondition.count >= minPerGroup && withoutCondition.count >= minPerGroup,
      finding:"観測比較のみ。条件の廃止を判断するには同一機会の並行検証が必要"};
  });
}
module.exports = {FEATURES,snapshot,audit};
