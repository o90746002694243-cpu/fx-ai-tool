"use strict";
const { createHash } = require("node:crypto");
// Deterministic UUIDv5: same strategy/pair/direction/candle -> same key.
// Namespace UUID is a project-scoped constant; do not change it between deploys.
const NAMESPACE = "6b485cd4-6599-4bb3-8c36-799161118a3d";
function notificationId(strategy, pair, direction, candleTime) {
  const namespaceBytes = Buffer.from(NAMESPACE.replace(/-/g, ""), "hex");
  const name = [strategy, pair, direction, candleTime].join("|");
  const bytes = createHash("sha1")
    .update(namespaceBytes).update(Buffer.from(name, "utf8")).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = bytes.toString("hex");
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
module.exports = { notificationId };
