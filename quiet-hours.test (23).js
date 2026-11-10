const assert = require('node:assert/strict');
const { test } = require('node:test');
const { isJstQuietHours } = require('../netlify/functions/quiet-hours');
for (const [jst,expected] of [['2026-10-27T01:59:59+09:00',false], ['2026-10-27T02:00:00+09:00',true],['2026-10-27T07:59:59+09:00',true],['2026-10-27T08:00:00+09:00',false],['2026-10-27T20:00:00+09:00',false]]) {
  test(`Quiet hours ${jst}`,()=>assert.equal(isJstQuietHours(new Date(jst)),expected));
}
