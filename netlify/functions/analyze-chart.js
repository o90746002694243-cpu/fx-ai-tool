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
添付されたチャート画像と入力情報を使って、短期トレード向けに分析してください。

通貨ペア: ${pair}
現在価格: ${price}
時間足: ${timeframe}

最優先ルール:
・画像から読み取れる情報を最大限使ってください。
・現在価格が入力されている場合は、その価格を基準に数値を出してください。
・画像が多少見づらくても、可能な範囲でエントリー、利確、損切りを具体的な価格で提示してください。
・本当に判断できない場合だけ「判断困難」としてください。
・無理に売買を推奨せず、根拠が弱い場合は「見送り」にしてください。
・買い、売り、見送りのいずれかを必ず選んでください。
・参考スコアは0〜100の整数にしてください。
・80点未満は原則「見送り」としてください。
・80点以上でも、損切り位置が不明確な場合は見送りにしてください。
・エントリー、利確、損切りは、可能な限り具体的な数値で出してください。
・買いの場合は原則として「損切り < エントリー < 利確」の順にしてください。
・売りの場合は原則として「利確 < エントリー < 損切り」の順にしてください。
・リスクリワードは最低でもおおむね1:1.5以上を目安にしてください。
・画像内の移動平均線、直近高値安値、サポート、レジスタンス、ローソク足の勢いを重視してください。

以下を分析してください:
・現在のトレンド
・買い / 売り / 見送り
・エントリー候補
・利確候補
・損切り候補
・サポートライン
・レジスタンスライン
・判断理由
・参考スコア
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
