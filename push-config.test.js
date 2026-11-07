const test = require('node:test');
const assert = require('node:assert/strict');
const {getPushConfig} = require('../netlify/functions/push-config');
const a='11111111-1111-4111-8111-111111111111';
const b='22222222-2222-4222-8222-222222222222';
test('supports existing targets when env not configured',()=>{
 const c=getPushConfig({}); assert.equal(c.ready,true);assert.equal(c.configured,false);assert.equal(c.subscriptions.length,2);
});
test('overrides stale IDs with unique env subscription IDs',()=>{
 const c=getPushConfig({ONESIGNAL_SUBSCRIPTION_IDS:`${a}, ${b};${a}`});
 assert.deepEqual(c.subscriptions,[a,b]);assert.equal(c.configured,true);assert.equal(c.ready,true);
});
test('rejects invalid explicit recipient list rather than silently falling back',()=>{
 const c=getPushConfig({ONESIGNAL_SUBSCRIPTION_IDS:'not-an-id'});
 assert.equal(c.ready,false); assert.equal(c.subscriptions.length,0);assert.equal(c.invalidCount,1);
});
test('rejects invalid app ID',()=>{
 assert.equal(getPushConfig({ONESIGNAL_APP_ID:'invalid'}).ready,false);
});
