'use strict';
// One deliberately small, auditable 15-minute rule. Goal, not promise: 60% wins,
// 1:1.5 net R:R and 5-10 alerts/day across five JPY pairs.
const VERSION='simple-m15-v1';
const MAX_AGE_MS=3*60*60*1000;
const SPREAD_PIPS=Object.freeze({'USD/JPY':2,'AUD/JPY':3,'NZD/JPY':3,'CAD/JPY':3,'EUR/JPY':2.5});
const mean = a => a.reduce((x,y)=>x+y,0)/a.length;
function rsi(values){
  const last=values.slice(-15); let gains=0,losses=0;
  for(let i=1;i<last.length;i++){const d=last[i]-last[i-1]; gains+=Math.max(0,d);losses+=Math.max(0,-d);}
  return losses===0?(gains===0?50:100):100-100/(1+gains/losses);
}
function decide(candles,pair){
  if(candles.length<22)return {direction:'見送り',reason:'確定足不足'};
  const c=candles.at(-1),closes=candles.map(x=>x.close),fast=mean(closes.slice(-5)),slow=mean(closes.slice(-20)),momentum=rsi(closes);
  const trs=candles.slice(-14).map((x,i)=>Math.max(x.high-x.low,Math.abs(x.high-(candles.at(-15+i)?.close??x.close)),Math.abs(x.low-(candles.at(-15+i)?.close??x.close))));
  const atr=mean(trs), spreadPips=SPREAD_PIPS[pair]??3;
  let direction='見送り',reason='MA/RSIの方向が不一致';
  if(fast>slow && c.close>fast && momentum>=50 && momentum<=68) direction='買い';
  else if(fast<slow && c.close<fast && momentum>=32 && momentum<=50) direction='売り';
  if(!(atr>=0.08 && Number.isFinite(atr))){direction='見送り';reason='ATR不足（8pips未満）';}
  const risk=Math.max(0.10,atr*1.1), spread=spreadPips*0.01;
  const reward=1.5*(risk+spread)+spread; // (gross reward - spread)/(gross risk + spread) = 1.5
  const sign=direction==='売り'?-1:1;
  const entryPrice=c.close;
  const stopLoss=entryPrice-sign*risk,takeProfit=entryPrice+sign*reward;
  return {direction,reason:direction==='見送り'?reason:'MA5/20・RSI・ATRが一致',score:null,
    entryPrice,takeProfit,stopLoss,riskReward:1.5,spreadPips,atrPips:atr/0.01,
    rsi:momentum,sma5:fast,sma20:slow,entryAt:c.endTime,candleTime:c.datetime};
}
function init(tracker){
  if(!tracker.simpleV1 || typeof tracker.simpleV1!=='object') tracker.simpleV1={open:[],history:[],stats:{}};
  const t=tracker.simpleV1;
  t.open ||= [];t.history ||= [];t.stats ||= {};
  return t;
}
function settle(tracker,pair,candles,now=Date.now()){
  const t=init(tracker),remaining=[];
  for(const s of t.open){
    if(s.pair!==pair){remaining.push(s);continue;}
    let result=null,settledAt=null;
    const cutoff=s.entryAt+MAX_AGE_MS;
    for(const c of candles){
      if(c.time<s.entryAt||c.time>=cutoff)continue;
      const tp=s.direction==='買い'?c.high>=s.takeProfit:c.low<=s.takeProfit;
      const sl=s.direction==='買い'?c.low<=s.stopLoss:c.high>=s.stopLoss;
      if(tp||sl){result=tp&&sl?'ambiguous':sl?'losses':'wins';settledAt=c.endTime;break;}
    }
    if(!result && now>=cutoff){result='expired';settledAt=cutoff;}
    if(!result){remaining.push(s);continue;}
    const stats=t.stats[pair]||={wins:0,losses:0,ambiguous:0,expired:0};
    stats[result]=(stats[result]||0)+1;
    t.history.push({...s,result,settledAt});
  }
  t.open=remaining;
  t.history=t.history.slice(-250);
}
function record(tracker,pair,rule){
  const t=init(tracker);
  if(rule.direction==='見送り'||t.open.some(x=>x.pair===pair))return false;
  const key=pair+'@'+rule.candleTime;
  if(t.history.some(x=>x.key===key))return false;
  t.open.push({key,pair,direction:rule.direction,entryPrice:rule.entryPrice,
    takeProfit:rule.takeProfit,stopLoss:rule.stopLoss,entryAt:rule.entryAt,
    createdAt:Date.now(),maxAgeMs:MAX_AGE_MS,ruleVersion:VERSION});
  return true;
}
function summary(tracker,pair){
  const t=init(tracker),s=t.stats[pair]||{wins:0,losses:0,ambiguous:0,expired:0};
  const completed=(s.wins||0)+(s.losses||0)+(s.ambiguous||0)+(s.expired||0);
  // Conservative: ambiguous and expired count as unsuccessful; do not cherry-pick.
  const winRate=completed?Math.round(1000*(s.wins||0)/completed)/10:null;
  return {wins:s.wins||0,losses:s.losses||0,ambiguous:s.ambiguous||0,expired:s.expired||0,
    completed,pending:t.open.filter(x=>x.pair===pair).length,winRate,history:t.history.filter(x=>x.pair===pair).length,
    paperTrade:t.open.find(x=>x.pair===pair)||t.history.filter(x=>x.pair===pair).at(-1)||null};
}
module.exports={VERSION,MAX_AGE_MS,decide,init,settle,record,summary};
