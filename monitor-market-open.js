// Sunday 21:00-23:45 UTC covers 17:00 New York after DST adjustment.
// The main monitor checks America/New_York market hours before any network calls.
exports.handler = (...args) => require("./monitor-market").handler(...args);
