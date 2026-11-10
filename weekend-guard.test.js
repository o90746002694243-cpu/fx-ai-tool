const test=require('node:test');
const assert=require('node:assert/strict');
const {crossedMarketClosure,canStartSixHourTrade}=require('../weekend-guard');
const {settlePairSignals}=require('../trade-tracker');
const {settleShadows}=require('../shadow-tracker');
const {settleCandidates}=require('../probability');
const {STRATEGY_VERSION}=require('../strategy');
const ts=x=>Date.parse(x);
test('Friday late trade rejected and Sunday reopen allowed only after six trading hours',()=>{
 assert.equal(canStartSixHourTrade(ts('2026-10-23T14:00:00Z')),true);
 assert.equal(canStartSixHourTrade(ts('2026-10-23T17:00:00Z')),false);
 assert.equal(canStartSixHourTrade(ts('2026-10-25T21:00:00Z')),true);
 assert.equal(crossedMarketClosure(ts('2026-10-23T19:00:00Z'),ts('2026-10-25T21:00:00Z')),true);
});
test('Friday live win recognized before closure; gap after closure excluded',()=>{
 const entry=ts('2026-10-23T19:00:00Z');
 const make=()=>({openSignals:[{pair:'EUR/JPY',direction:'買い',entryAt:entry,entryPrice:150,takeProfit:151,stopLoss:149,strategyVersion:STRATEGY_VERSION}],stats:{},strategyStats:{}});
 const friday={time:ts('2026-10-23T19:15:00Z'),endTime:ts('2026-10-23T19:30:00Z'),high:151.2,low:149.8};
 const sunday={time:ts('2026-10-25T21:00:00Z'),endTime:ts('2026-10-25T21:15:00Z'),high:151.2,low:150};
 let t=make();settlePairSignals(t,'EUR/JPY',[friday,sunday],ts('2026-10-25T22:00:00Z'));
 assert.equal(t.strategyStats[STRATEGY_VERSION]['EUR/JPY'].wins,1);
 t=make();settlePairSignals(t,'EUR/JPY',[sunday],ts('2026-10-25T22:00:00Z'));
 assert.equal(t.strategyStats[STRATEGY_VERSION]['EUR/JPY'].weekendExcluded,1);
 assert.equal(t.strategyStats[STRATEGY_VERSION]['EUR/JPY'].wins,0);
});
test('Sunday gap never counted as shadow or candidate win',()=>{
 const entry=ts('2026-10-23T19:00:00Z'),now=ts('2026-10-25T22:00:00Z');
 const s={pair:'EUR/JPY',direction:'買い',entryAt:entry,entryPrice:150,takeProfit:151,stopLoss:149,category:'below60',group:'test'};
 const candle={time:ts('2026-10-25T21:00:00Z'),endTime:ts('2026-10-25T21:15:00Z'),high:153,low:152};
 const t={shadowOpen:[s],shadowHistory:[],shadowStats:{},openCandidates:[s],candidateStats:{}};
 settleShadows(t,'EUR/JPY',[candle],now);settleCandidates(t,'EUR/JPY',[candle],now);
 assert.equal(t.shadowStats['EUR/JPY'].below60.weekendExcluded,1);
 assert.equal(t.candidateStats['EUR/JPY'].test.weekendExcluded,1);
});
