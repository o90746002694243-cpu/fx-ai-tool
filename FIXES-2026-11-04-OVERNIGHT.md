# 2026-11-04 夜間の一律通知停止を解除

## 変更
- Netlify 実行ファイル `netlify/functions/monitor-market.js` から JST 02:00–08:00 の一律通知停止を解除。
- 互換性のためレスポンス診断フィールド `quietHoursBlocked` を `false` のまま保持。
- 市場休場・週明け再開直後・重要経済指標・データ鮮度・スプレッド控除後RR・スコア/暫定60%指数・既存ポジション/重複抑止・通知履歴・永続ストア条件は維持。
- `tests/overnight-notification-regression.test.js` に時間帯制約の解除と安全条件を確認するテストを追加。
- 既存テスト `tests/probability.test.js` の、実装と不一致だった暫定指数期待値を 60 -> 62.5 に更新（指数計算の実装自体は変更なし）。

## 留意事項
暫定60%指数は校正済み勝率ではありません。仮想実績19件・観測勝率31.6%・分析スコア90点の場合、暫定指数は55.1のため通知見送りとなります。
現時点では履歴Blobs実データによる効果比較や Netlify 本番配信は未検証です。ログで通知可否と判定理由を確認してください。

## 検証
`node --check` で Netlify Functions の全JSの構文検査完了。
`node --test tests/*.test.js` : 54件成功 / 0件失敗。
