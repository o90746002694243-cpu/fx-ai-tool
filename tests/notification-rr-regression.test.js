const test=require('node:test');
const assert=require('node:assert/strict');
const {qualifies}=require('../netlify/functions/probability');
const base={direction:'買い',score:90,isRsiExtreme:false,isSharpMove:false,isRangeTooSmall:false,isCandleOpposed:false,candleSignal:'陽線',netRewardPips:18,riskReward:1.41};
test('RR 1.41 must never qualify for push',()=>assert.equal(qualifies(base),false));
test('RR 1.5 qualifies with otherwise valid candidate',()=>assert.equal(qualifies({...base,riskReward:1.5}),true));
test('a score of 50 must not qualify',()=>assert.equal(qualifies({...base,score:50,riskReward:2}),false));
