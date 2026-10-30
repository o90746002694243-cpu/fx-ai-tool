const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const {evaluate, PAIR_SETTINGS} = require('../netlify/functions/strategy');
const {qualifies} = require('../netlify/functions/probability');
test('production strategy equals root strategy', () => {
  assert.equal(fs.readFileSync(path.join(root,'strategy.js'),'utf8'),fs.readFileSync(path.join(root,'netlify/functions/strategy.js'),'utf8'));
});
test('net RR target includes cost on both sides of trade', () => {
  for (const pair of ['USD/JPY','AUD/JPY','NZD/JPY','CAD/JPY','EUR/JPY']) {
    const s = PAIR_SETTINGS[pair];
    const spread = s.spreadPips * 0.01;
    for (const risk of [0.05, 0.1, 0.25]) {
      const targetDistance = 1.55 * (risk + spread) + spread;
      const net = (targetDistance-spread)/(risk+spread);
      assert.ok(net >= 1.5, `${pair}: ${net}`);
    }
  }
});
test('net RR threshold still rejects low-return signals',()=>{
  assert.equal(qualifies({direction:'買い',riskReward:1.49,netRewardPips:20,isRsiExtreme:false,isSharpMove:false,isRangeTooSmall:false}),false);
});
