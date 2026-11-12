"use strict";
// Prefer current subscription IDs configured in Netlify; keep existing targets
// as a compatibility fallback until the owner migrates them.
const LEGACY_SUBSCRIPTIONS = [
  "f7a8344c-34f9-44f8-8bb5-03f97a2fd645",
  "92a734ef-c592-4c77-b214-942cf28ce03a"
];
const DEFAULT_APP_ID = "1e68f659-0220-4409-a00d-fd9905b529db";
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
function getPushConfig(env = process.env) {
  const explicitlyConfigured = String(env.ONESIGNAL_SUBSCRIPTION_IDS || "").trim();
  const ids = explicitlyConfigured
    ? explicitlyConfigured.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean)
    : LEGACY_SUBSCRIPTIONS;
  const valid = [...new Set(ids.filter(id => UUID.test(id)))];
  return {
    appId: String(env.ONESIGNAL_APP_ID || DEFAULT_APP_ID).trim(),
    subscriptions: valid,
    configured: Boolean(explicitlyConfigured),
    invalidCount: ids.length - valid.length,
    ready: UUID.test(String(env.ONESIGNAL_APP_ID || DEFAULT_APP_ID).trim()) && valid.length > 0
  };
}
module.exports = {getPushConfig};
