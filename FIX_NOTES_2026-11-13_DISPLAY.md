# ZIP26 display consistency hotfix

The monitor UI already requires `activeStrategyVersion` and `snapshotVersionMatches` from the `market-status` API. The API did not supply either field, so even a current v6 snapshot appeared as an old version with the active version 'unknown'.

Fix: return the actual `STRATEGY_VERSION` imported from the running strategy module and compute a version-match flag for each saved snapshot. Old v4 snapshots remain marked old; new v6 snapshots show the existing detailed decision and skip reasons. No push, trade, scoring or monitoring logic was changed.

Local automated tests pass. Real Netlify/OneSignal delivery and current snapshot persistence require post-deploy verification.
