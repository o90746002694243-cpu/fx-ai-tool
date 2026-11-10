const assert = require("node:assert/strict");
const { test } = require("node:test");
const { notificationId } = require("../notification-id");
const { notificationId: deployedNotificationId } = require("../netlify/functions/notification-id");
const args = ["mtf-v3-minrange", "AUD/JPY", "買い", "2026-10-23 19:15:00"];
test("OneSignal idempotency key is stable, valid version-5 UUID", () => {
  const a = notificationId(...args);
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(a, notificationId(...args));
  assert.equal(a, deployedNotificationId(...args));
  assert.notEqual(a, notificationId(args[0],args[1],args[2],"2026-10-23 19:30:00"));
  assert.notEqual(a, notificationId(args[0],args[1],"売り",args[3]));
});
