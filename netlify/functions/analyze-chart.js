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

チャートから確認できる範囲だけを使い、
以下を判断してください。

・トレンド
・買い優勢 / 売り優勢 / 見送り
・サポートライン
・レジスタンスライン
・エントリー候補
・利確候補
・損切り候補
・参考スコア

参考スコアは0〜100の整数です。
画像から判断できない項目は無理に推測せず
「判断困難」としてください。

必ず次のJSON形式だけで回答してください。

{
  "direction": "買い|売り|見送り",
  "trend": "上昇|下降|レンジ|判断困難",
  "score": 0,
  "entry": "数値または判断困難",
  "takeProfit": "数値または判断困難",
  "stopLoss": "数値または判断困難",
  "support": "数値または判断困難",
  "resistance": "数値または判断困難",
  "reason": "判断理由"
}
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
          ]
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

    text = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    let analysis;

    try {
      analysis = JSON.parse(text);
    } catch (e) {
      analysis = {
        direction: "見送り",
        trend: "判断困難",
        score: 0,
        entry: "判断困難",
        takeProfit: "判断困難",
        stopLoss: "判断困難",
        support: "判断困難",
        resistance: "判断困難",
        reason: text || "AIの回答を解析できませんでした。"
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
