# Three-hour notification outcome tracking

- New accepted push alerts now carry `maxAgeMs=3h`.
- Existing saved open signals without maxAgeMs remain on 6h.
- New signals not reaching TP or SL in their interval are `expired`, including if price moved favorably but did not hit TP.
- Shadow trade expiry is unchanged from the previous release (new=3h; legacy=6h).
- Netlify schedule, push gate, probability threshold, RR threshold and candidate historic backtest remain unchanged.
- For candle-only settlement, a bar overlapping the deadline still has intra-bar ambiguity; results are approximate.
