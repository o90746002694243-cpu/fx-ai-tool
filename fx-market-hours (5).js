// Retail FX is normally closed from Friday 17:00 to Sunday 17:00 New York time.
// Intl handles US daylight-saving time automatically.
const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", weekday: "short", hour: "2-digit",
  minute: "2-digit", hourCycle: "h23"
});
function isFxMarketOpen(when = new Date()) {
  const parts = Object.fromEntries(formatter.formatToParts(when)
    .filter(part => part.type !== "literal")
    .map(part => [part.type, part.value]));
  const hour = Number(parts.hour);
  if (parts.weekday === "Sat") return false;
  if (parts.weekday === "Sun") return hour >= 17;
  if (parts.weekday === "Fri") return hour < 17;
  return true;
}
module.exports = { isFxMarketOpen };
