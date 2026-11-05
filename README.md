# FX AI Tool – Simple deployment edition (2026-11-06)

## 構成
- `index.html`, `manifest.json`, `OneSignalSDKWorker.js`: 表示とプッシュ通知
- `netlify/functions/`: **唯一の本番実装**。同名コードのルート複製は削除
- `netlify.toml`: Netlifyのデプロイ・定期実行設定
- `tests/`: 保存・通知・相場休場などの回帰テスト

## 今回の整理
旧バージョンの重複JS、履歴Markdown、古いコピーのテストをZIPから除去。
実行中の戦略ロジック、監視対象5通貨、15分間隔、OneSignal、Netlify Blobs、仮想トレード保存には変更なし。
暫定指数70点→60は実測勝率ではないことを明示し、テスト期待値を実コードの仕様に修正。
**注意**: この版はファイルとデプロイ構成の整理版であり、通知頻度や実勝率の改善を実証したものではありません。

## 入れ替え方法
GitHubリポジトリのルートをこのZIPの中身で完全に置き換えてください。**既存ファイルに追加・上書きするだけでは、古い重複ファイルが残ります。** `.git` とNetlifyの環境変数は削除しないでください。ZIPはGit管理情報と秘密鍵を含みません。
`node --test tests/*.test.js` でテスト。

## 現行設定
- 監視: USD/JPY, AUD/JPY, NZD/JPY, CAD/JPY, EUR/JPY
- 通知条件: スプレッド控除後RR >= 1.5、暫定指数>=60、その他現行安全フィルター
- 検証目標: 1日5–10通知・実勝率60%以上・RR 1:1.5（目標であり保証ではありません）
