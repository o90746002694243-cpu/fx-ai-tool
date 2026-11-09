"use strict";
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {evaluate, normalizeCandles, BAR_MS} = require('../netlify/functions/strategy');
const {qualifies} = require('../netlify/functions/probability');
const {addSignal, settlePairSignals, hasOpenSignal} = require('../netlify/functions/trade-tracker');

test('display eligibility equals actual base alert eligibility on representative price histories',()=>{
  for (const drift of [-0.015, -0.003, 0, 0.004, 0.018]) {
    let price=150, seed=727;
    const rows=Array.from({length:240},(_,i)=>{
      seed=(seed*16807)%2147483647;
      const open=price;
      price+=drift+(seed/2147483647-0.5)*0.12;
      return {datetime:new Date(Date.UTC(2026,8,1)+i*BAR_MS).toISOString().slice(0,19).replace('T',' '),open,close:price,high:Math.max(open,price)+0.03,low:Math.min(open,price)-0.03};
    });
    const bars=normalizeCandles(rows,Infinity);
    for(let i=80;i<bars.length;i+=7) {
      const a=evaluate(bars.slice(0,i),undefined, 'USD/JPY');
      assert.equal(a.eligible,qualifies(a),`drift=${drift}, i=${i}, score=${a.score}, RR=${a.riskReward}`);
      if(a.eligible) assert(a.riskReward>=1.5);
    }
  }
});

test('unresolved signal expires after three hours and does not block a later signal',()=>{
  const tracker={openSignals:[],stats:{}};
  const now=Date.UTC(2026,10,9,12,0,0);
  assert.equal(addSignal(tracker,{pair:'USD/JPY',direction:'買い',entryPrice:150,takeProfit:151,stopLoss:149,score:90,strategyVersion:'test-version',entryAt:now}),true);
  assert.equal(hasOpenSignal(tracker,'USD/JPY'),true);
  assert.equal(addSignal(tracker,{pair:'USD/JPY',direction:'買い',entryPrice:150,takeProfit:151,stopLoss:149,score:90,entryAt:now+60000}),false);
  settlePairSignals(tracker,'USD/JPY',[],now+3*60*60*1000+1000);
  assert.equal(hasOpenSignal(tracker,'USD/JPY'),false);
  assert.equal(tracker.strategyStats['test-version']['USD/JPY'].expired,1);
  assert.equal(addSignal(tracker,{pair:'USD/JPY',direction:'買い',entryPrice:150,takeProfit:151,stopLoss:149,score:90,strategyVersion:'test-version',entryAt:now+3*60*60*1000+2000}),true);
});
