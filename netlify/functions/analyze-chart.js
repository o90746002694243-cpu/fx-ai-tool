exports.handler = async function (event) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8"
  };

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        error: "POSTで送信してください。"
      })
    };
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: "OPENAI_API_KEYが設定されていません。"
        })
      };
    }

    const body = JSON.parse(event.body || "{}");

    const {
      image,
      pair = "不明",
      price = "不明",
      timeframe = "不明"
    } = body;

    if (!image) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: "チャート画像がありません。"
        })
      };
    }

const prompt = `
あなたはFXチャート分析アシスタントです。
添付されたチャート画像を最優先で読み取り、短期トレード向けに分析してください。

重要:
- 通貨ペア、現在価格、時間足は、まず画像内の表示から読み取ってください。
- 入力値の pair / price / timeframe が "不明" の場合でも、画像から判定してください。
- 画像内で文字や数字が確認できない項目だけ "不明" としてください。
- 現在価格は、チャート右端の現在値・価格ラベル・最新ローソク足付近の数値を優先してください。
- 時間足は、画像内の 1分、5分、15分、30分、1時間、4時間、日足などの表示から判断してください。
- 通貨ペアは AUD/JPY、USD/JPY、NZD/JPY、CAD/JPY など、画像内の銘柄名から判断してください。
- 画像から読み取れない情報を勝手に作らないでください。

分析ルール:
- 画像内の移動平均線、直近高値安値、サポート、レジスタンス、ローソク足の勢いを重視してください。
- 買い・売り・見送りのいずれかを必ず選んでください。
- エントリー候補、利確候補、損切り候補を具体的な価格で出してください。
- 買いの場合は原則「損切り < エントリー < 利確」。
- 売りの場合は原則「利確 < エントリー < 損切り」。
- リスクリワードは最低でもおおむね1:1.5以上を目安にしてください。
- 無理に売買を提案せず、根拠が弱い場合は見送りにしてください。
- 参考スコアは0〜100点。
- 80点未満は原則「見送り」としてください。
- 80点以上でも、損切り位置が不明確な場合は見送りにしてください。

必ず以下を分析して返してください:
- 通貨ペア
- 現在価格
- 時間足
- 現在のトレンド
- 買い / 売り / 見送り
- エントリー候補
- 利確候補
- 損切り候補
- 買い待ち価格
- 売り待ち価格
- 発動条件
- サポートライン
- レジスタンスライン
- 判断理由
- 参考スコア
`;   
    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",

          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: prompt
                },
                {
                  type: "input_image",
                  image_url: image
                }
              ]
            }
          ],

          text: {
            format: {
              type: "json_schema",
              name: "fx_chart_analysis",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  pair: {
                    type: "string"
                  },
                  price: {
                    type: "string"
                  },
                  timeframe: {
                    type: "string"
                  },
                  direction: {
                     type: "string",
                     enum: ["買い", "売り", "見送り"]
                  },
                  trend: {
                    type: "string",
                    enum: ["上昇", "下降", "レンジ", "判断困難"]
                  },
                  score: {
                    type: "integer",
                    minimum: 0,
                    maximum: 100
                  },
                  entry: {
                    type: "string"
                  },
                  takeProfit: {
                    type: "string"
                  },
                  stopLoss: {
                    type: "string"
                  },
                  buyTrigger: {
                    type: "string"
                  },
                  sellTrigger: {
                    type: "string"
                  },
                  triggerReason: {
                    type: "string"
                  },
                  support: {
                    type: "string"
                  },
                  resistance: {
                    type: "string"
                  },
                  reason: {
                    type: "string"
                  }
                },
                required: [
                  "pair",
                  "price",
                  "timeframe",
                  "direction",
                  "trend",
                  "score",
                  "entry",
                  "takeProfit",
                  "stopLoss",  
                  "buyTrigger",
                  "sellTrigger",
                  "triggerReason",
                  "support",
                  "resistance",
                  "reason"
                ],
                additionalProperties: false
              }
            }
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenAI API error:", data);

      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({
          error: "AI解析でエラーが発生しました。",
          detail: data
        })
      };
    }

    let text = "";

    if (data.output) {
      for (const item of data.output) {
        if (item.content) {
          for (const content of item.content) {
            if (content.type === "output_text") {
              text += content.text;
            }
          }
        }
      }
    }

    let analysis;

    try {
      analysis = JSON.parse(text);
    } catch (error) {
      console.error("JSON parse error:", error, text);

      analysis = {
        direction: "見送り",
        trend: "判断困難",
        score: 0,
        entry: "判断困難",
        takeProfit: "判断困難",
        stopLoss: "判断困難",
        support: "判断困難",
        resistance: "判断困難",
        reason: "AIの分析結果を読み取れませんでした。"
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        analysis
      })
    };

  } catch (error) {
    console.error(error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "サーバーエラーが発生しました。",
        detail: error.message
      })
    };
  }
};                
