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
