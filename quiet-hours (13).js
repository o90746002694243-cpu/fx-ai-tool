// Quiet window affects push notifications only; all settlement and shadow
// tracking continues in monitor-market every scheduled execution.
function isJstQuietHours(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(date.getTime())) throw new TypeError('Invalid time');
  const jstHour = (date.getUTCHours() + 9) % 24;
  return jstHour >= 2 && jstHour < 8;
}
module.exports = { isJstQuietHours };
