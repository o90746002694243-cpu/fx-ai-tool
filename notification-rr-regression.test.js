const test=require('node:test');
const assert=require('node:assert/strict');
const {qualifies}=require('../netlify/functions/probability');
const base={direction:'買い',score:90,isRsiExtreme:false,isSharpMove:false,isRangeTooSmall:false,isCandleOpposed:false,candleSignal:'陽線',netRewardPips:18,riskReward:1.41};
test('RR 1.41 must never qualify for push',()=>assert.equal(qualifies(base),false));
test('RR 1.5 qualifies with otherwise valid candidate',()=>assert.equal(qualifies({...base,riskReward:1.5}),true));
test('a score of 50 must not qualify',()=>assert.equal(qualifies({...base,score:50,riskReward:2}),false));

test('score 65 and opposing candle / sharp move are allowed when RR is valid',()=>assert.equal(qualifies({...base,score:65,riskReward:1.5,isSharpMove:true,isCandleOpposed:true,candleSignal:"十字線"}),true));
test('score 64 is rejected',()=>assert.equal(qualifies({...base,score:64,riskReward:1.5}),false));

test('RSI extreme is informative, not an automatic push veto',()=>assert.equal(qualifies({...base,riskReward:1.5,isRsiExtreme:true}),true));
