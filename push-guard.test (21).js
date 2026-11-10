const assert = require('node:assert/strict');
const test = require('node:test');
const {reopenCooldown,allowedToPush,recordPush} = require('../netlify/functions/push-guard');
test('90 minute window after NY Sunday reopening blocks notifications',()=>{
  assert.equal(reopenCooldown(new Date('2026-10-25T21:30:00Z')),true);
  assert.equal(reopenCooldown(new Date('2026-10-25T22:29:00Z')),true);
  assert.equal(reopenCooldown(new Date('2026-10-25T22:30:00Z')),false);
});
test('DST Sunday reopening window adapts to NY winter time',()=>{
  assert.equal(reopenCooldown(new Date('2026-11-01T22:30:00Z')),true);
  assert.equal(reopenCooldown(new Date('2026-11-01T23:30:00Z')),false);
});
test('pair 90min and cross-pair 20min cooldown',()=>{
 const t=Date.parse('2026-10-26T01:00:00Z');
 const log=recordPush(null,'USD/JPY',t);
 assert.equal(allowedToPush(log,'USD/JPY',t+60*60000).allowed,false);
 assert.equal(allowedToPush(log,'NZD/JPY',t+10*60000).allowed,false);
 assert.equal(allowedToPush(log,'NZD/JPY',t+21*60000).allowed,true);
 assert.equal(allowedToPush(log,'USD/JPY',t+91*60000).allowed,true);
});
