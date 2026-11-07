const test = require('node:test');
const assert = require('node:assert/strict');
const {outcome, BAR_MS, EXPIRY_MS, STRATEGY_VERSION} = require('../netlify/functions/strategy');
const {settlePairSignals, addSignal} = require('../netlify/functions/trade-tracker');

test('an in-window candle can settle at the expiry boundary', () => {
  const entryAt = 100 * BAR_MS;
  const signal = {direction:'買い', entryAt, entryPrice:100, takeProfit:101, stopLoss:99};
  assert.equal(outcome(signal,{time: entryAt + EXPIRY_MS - BAR_MS, endTime: entryAt + EXPIRY_MS,high:102,low:99.5}), 'wins');
  assert.equal(outcome(signal,{time: entryAt + EXPIRY_MS, endTime: entryAt + EXPIRY_MS + BAR_MS,high:102,low:99.5}), null);
});

test('new strategy notification enters pending queue then resolves once', () => {
  const t={openSignals:[],stats:{},strategyStats:{}};
  const entryAt=100*BAR_MS;
  const sig={pair:'USD/JPY',direction:'買い',entryAt,entryPrice:150,takeProfit:151,stopLoss:149,candleTime:'x',strategyVersion:STRATEGY_VERSION};
  assert.equal(addSignal(t,sig),true);
  assert.equal(addSignal(t,sig),false);
  settlePairSignals(t,'USD/JPY',[{time:entryAt,endTime:entryAt+BAR_MS,high:151.1,low:149.9}],entryAt+BAR_MS);
  assert.equal(t.openSignals.length,0);
  assert.equal(t.strategyStats[STRATEGY_VERSION]['USD/JPY'].wins,1);
  settlePairSignals(t,'USD/JPY',[],entryAt+2*BAR_MS);
  assert.equal(t.strategyStats[STRATEGY_VERSION]['USD/JPY'].wins,1);
});


test('new notifications use 3h while legacy saved trades retain 6h',()=>{
 const t={openSignals:[],stats:{},strategyStats:{}};
 const at=Date.UTC(2026,9,27,0,0,0);
 addSignal(t,{pair:'USD/JPY',direction:'買い',entryAt:at,entryPrice:150,takeProfit:151,stopLoss:149,candleTime:'x',strategyVersion:STRATEGY_VERSION});
 assert.equal(t.openSignals[0].maxAgeMs,3*3600000);
 assert.equal(outcome(t.openSignals[0],{time:at+3*3600000,endTime:at+3*3600000+BAR_MS,high:152,low:150}),null);
 settlePairSignals(t,'USD/JPY',[],at+3*3600000);
 assert.equal(t.openSignals.length,0);
 assert.equal(t.strategyStats[STRATEGY_VERSION]['USD/JPY'].expired,1);
 const legacy={pair:'AUD/JPY',direction:'買い',entryAt:at,entryPrice:100,takeProfit:101,stopLoss:99,candleTime:'x',strategyVersion:STRATEGY_VERSION};
 t.openSignals.push(legacy);
 settlePairSignals(t,'AUD/JPY',[],at+3*3600000);
 assert.equal(t.openSignals.length,1);
 settlePairSignals(t,'AUD/JPY',[],at+6*3600000);
 assert.equal(t.openSignals.length,0);
 assert.equal(t.strategyStats[STRATEGY_VERSION]['AUD/JPY'].expired,1);
});

test('3h timeout cannot turn a profitable but TP-unreached signal into a win',()=>{
 const t={openSignals:[],stats:{}};
 const at=Date.UTC(2026,9,27,0,0,0);
 addSignal(t,{pair:'CAD/JPY',direction:'買い',entryAt:at,entryPrice:100,takeProfit:102,stopLoss:99,candleTime:'x'});
 settlePairSignals(t,'CAD/JPY',[{datetime:'after',time:at+BAR_MS,endTime:at+2*BAR_MS,high:100.5,low:100.1,close:100.4}],at+3*3600000);
 assert.equal(t.stats['CAD/JPY'].wins||0,0);
 assert.equal(t.stats['CAD/JPY'].expired,1);
});
