const test=require('node:test');
const assert=require('node:assert/strict');
const {trackShadow,settleShadows,shadowSummary}=require('../shadow-tracker');
const pair='USD/JPY';
const start=Date.UTC(2026,9,21,0,15);
const bar={endTime:start,datetime:'2026-10-21 00:00:00'};
const analysis={direction:'買い',entryPrice:100,takeProfit:100.15,stopLoss:99.9,riskReward:1.5,score:65};
test('low-confidence paper trade tracks once, independently of live results',()=>{
 const t={openSignals:[],stats:{}};
 assert.equal(trackShadow(t,pair,analysis,{passes:false,estimatedScore:57},false,bar,start+1000),true);
 assert.equal(trackShadow(t,pair,analysis,{passes:false,estimatedScore:57},false,bar,start+1000),false);
 assert.equal(t.openSignals.length,0);
 assert.equal(t.shadowOpen[0].category,'below60');
 settleShadows(t,pair,[{time:start,endTime:start+900000,high:100.16,low:100}],start+900000);
 assert.equal(shadowSummary(t,pair).categories.below60.wins,1);
 assert.equal(t.shadowHistory[0].result,'wins');
});
test('not eligible despite passing threshold is separately categorized',()=>{
 const t={};
 assert.equal(trackShadow(t,pair,analysis,{passes:true,estimatedScore:63},false,bar,start+1000),true);
 assert.equal(t.shadowOpen[0].category,'otherFilter');
});
test('untradeable direction and stale data are not invented',()=>{
 assert.equal(trackShadow({},pair,{...analysis,direction:'見送り'},{passes:false},false,bar,start+1),false);
 assert.equal(trackShadow({},pair,analysis,{passes:false},false,bar,start+3600000),false);
});
test('same candle both TP and SL is ambiguous not a win',()=>{
 const t={};trackShadow(t,pair,analysis,{passes:false},false,bar,start+1);
 settleShadows(t,pair,[{time:start,endTime:start+900000,high:100.2,low:99.8}],start+900000);
 assert.equal(shadowSummary(t,pair).categories.below60.ambiguous,1);
 assert.equal(shadowSummary(t,pair).categories.below60.winRate,null);
});

test('summary exposes buy/sell direction on open and settled trades',()=>{
 const t={};
 const sell={direction:'売り',entryPrice:100,takeProfit:99.85,stopLoss:100.1,riskReward:1.5,score:65};
 assert.equal(trackShadow(t,pair,sell,{passes:false,estimatedScore:55},false,bar,start+1),true);
 assert.equal(shadowSummary(t,pair).openTrades[0].direction,'売り');
 settleShadows(t,pair,[{time:start,endTime:start+900000,high:100.0,low:99.8}],start+900000);
 const summary=shadowSummary(t,pair);
 assert.equal(summary.openTrades.length,0);
 assert.equal(summary.recentTrades[0].direction,'売り');
 assert.equal(summary.recentTrades[0].result,'wins');
});
