# 2026-10-11: weekend network-cost fix

- The main monitor runs every 15 minutes **Monday through Friday (UTC)** instead of 7 days a week.
- A small additional Sunday UTC schedule (21:00-23:45) covers the New York FX session reopening in either DST regime.
- Both entry points check market hours in `America/New_York` before Blobs, calendar, Twelve Data and OneSignal calls.
- The guard returns `skipped: true` when closed and does not modify any stored trades.
- The strategy version, scores, five monitored pairs and stored trade history are not changed.
- Note: Netlify still incurs scheduled invocations close to Friday evening and Sunday reopening while the guard avoids network calls. Holidays and unusual market closures are not covered.
