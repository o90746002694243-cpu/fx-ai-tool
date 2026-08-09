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
添付されたチャート画像を分析してください。

通貨ペア: ${pair}
現在価格: ${price}
時間足: ${timeframe}

チャート画像から確認できる情報を優先し、
以下を分析してください。

・現在のトレンド
・買い / 売り / 見送り
・エントリー候補
・利確候補
・損切り候補
・サポートライン
・レジスタンスライン
・判断理由
・参考スコア

参考スコアは0〜100の整数にしてください。

重要:
根拠が弱い場合は無理にエントリーを勧めず、
「見送り」にしてください。
画像から判断できない価格は推測せず
「判断困難」としてください。
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
