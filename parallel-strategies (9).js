"use strict";
// Research-only comparison; never feeds the live notification gate.
const HORIZON = 3 * 60 * 60 * 1000;
const MAX_HISTORY = 1200;
const round = n => Math.round(n * 10000) / 10000;
function ensure(tracker) {
  if (!tracker.parallelStrategies || typeof tracker.parallelStrategies !== "object")
    tracker.parallelStrategies = {open:[], history:[], lastBar:{}};
  const s = tracker.parallelStrategies;
  if (!Array.isArray(s.open)) s.open=[];
  if (!Array.isArray(s.history)) s.history=[];
  if (!s.lastBar || typeof s.lastBar !== "object") s.lastBar={};
  return s;
}
function propose(analysis, latest) {
  const a=analysis, price=Number(latest.close), atr=Number(a.atr);
  if (!(price>0 && atr>0 && Number.isFinite(a.sma5) && Number.isFinite(a.sma20) &&
    Number.isFinite(a.rsi) && Number.isFinite(a.adx))) return [];
  // Fixed hypotheses, not empirically calibrated win probabilities.
  const candidates=[];
  const trendDirection=a.sma5>a.sma20?"買い":a.sma5<a.sma20?"売り":null;
  if (a.adx>=20 && trendDirection && a.rsi>=35 && a.rsi<=65)
    candidates.push({strategy:"trend",direction:trendDirection});
  if (a.adx<20 && a.rsi<=38) candidates.push({strategy:"range",direction:"買い"});
  if (a.adx<20 && a.rsi>=62) candidates.push({strategy:"range",direction:"売り"});
  return candidates.map(c=>{
    const risk=Math.max(atr*.8,.05), reward=risk*1.5;
    const buy=c.direction==="買い";
    return {...c,entryPrice:round(price),stopLoss:round(price+(buy?-risk:risk)),takeProfit:round(price+(buy?reward:-reward)),riskReward:1.5,
      adx:round(a.adx),rsi:round(a.rsi),spreadPips:Number(a.spreadPips)||0};
  });
}
function settle(tracker,pair,candles,now=Date.now()) {
  const s=ensure(tracker), keep=[];
  const sorted=[...candles].sort((a,b)=>a.time-b.time);
  for(const t of s.open){
    if(t.pair!==pair){keep.push(t);continue;}
    const deadline=t.entryAt+HORIZON;
    let result=null, finalBar=null;
    for(const c of sorted){
      if(c.time<t.entryAt || c.endTime>now || c.endTime>deadline) continue;
      const buy=t.direction==="買い";
      const tp=buy?c.high>=t.takeProfit:c.low<=t.takeProfit;
      const sl=buy?c.low<=t.stopLoss:c.high>=t.stopLoss;
      if(tp||sl){result=tp&&sl?"ambiguous":tp?"wins":"losses";finalBar=c;break;}
    }
    if(!result && now>=deadline){
      result="expired";
      finalBar=sorted.find(c=>c.endTime===deadline && c.endTime<=now)||null;
    }
    if(!result){keep.push(t);continue;}
    const direction=t.direction==="買い"?1:-1;
    const mark=finalBar?finalBar.close:null;
    const netPips=mark==null?null:Math.round(((mark-t.entryPrice)*direction/0.01-t.spreadPips)*100)/100;
    s.history.push({...t,result,settledAt:now,outcomeCandleEndTime:finalBar?.endTime||null,
      expiryQuoteMissing:result==="expired"&&!finalBar,referenceNetPips:netPips,
      note:"参考損益。固定スプレッド仮定・スリッページ未反映。TP/SL約定損益ではない。"});
  }
  s.open=keep;s.history=s.history.slice(-MAX_HISTORY);
}
function record(tracker,pair,analysis,latest,now=Date.now()){
  const s=ensure(tracker);
  if (!latest || now-latest.endTime>30*60000 || latest.endTime>now+60000) return [];
  const newTrades=[];
  for(const proposal of propose(analysis,latest)){
    const key=pair+":"+proposal.strategy;
    if(s.lastBar[key]===latest.endTime)continue;
    s.lastBar[key]=latest.endTime;
    const trade={...proposal,pair,entryAt:latest.endTime,expiresAt:latest.endTime+HORIZON,candleTime:latest.datetime,
      recordedAt:now,model:"parallel-v1",researchOnly:true};
    s.open.push(trade);newTrades.push(trade);
  }
  return newTrades;
}
function summary(tracker,pair){
  const s=ensure(tracker);const out={};
  for(const strategy of ["trend","range"]){
    const trades=s.history.filter(t=>t.pair===pair&&t.strategy===strategy);
    const counts={wins:0,losses:0,expired:0,ambiguous:0};
    for(const t of trades)counts[t.result]=(counts[t.result]||0)+1;
    const n=trades.length;
    out[strategy]={...counts,total:n,open:s.open.filter(t=>t.pair===pair&&t.strategy===strategy).length,
      tpRate:n?Math.round(counts.wins/n*1000)/10:null,calibrated:false};
  }
  return out;
}
module.exports={ensure,propose,settle,record,summary,HORIZON};
