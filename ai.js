// 💎 神級 AI 成交版本（Gemini 免費版）

export async function getAIReply({ userMessage, customerName = "客戶" }) {
  try {
    const apiKey = "AIzaSy你的KEY"; //"AIzaSyAF19Q7nK-T1i86GTG5uivirH6PXapwhV0
    // 🔥 判斷客戶類型
    function detectIntent(msg) {
      msg = msg.toLowerCase();

      if (msg.includes("多少") || msg.includes("價格") || msg.includes("費用")) return "price";
      if (msg.includes("考慮") || msg.includes("看看")) return "hesitate";
      if (msg.includes("想") || msg.includes("要") || msg.includes("可以")) return "interested";
      return "normal";
    }

    const intent = detectIntent(userMessage);

    // 💰 自動成交（價格直接丟）
    if (intent === "price") {
      return `目前有幾個方案，我幫你整理最適合你的👇  
      
💰 基本方案：$3000  
💰 進階方案：$8000  

👉 這邊可以直接幫你安排：  
https://your-payment-link.com  

你比較想先改善哪一塊？我幫你直接看最適合的方式`;
    }

    // 🤔 猶豫 → 推一把
    if (intent === "hesitate") {
      return `其實很多人一開始也會這樣想 🤍  
但通常真正卡住的地方，不處理會拖更久  

你現在這個狀況是「可以調整」的  
只是要用對方法  

👉 我可以幫你先看一個最適合你的方向`;
    }

    // 🔥 有興趣 → 引導成交
    if (intent === "interested") {
      return `OK👌我懂你現在的狀況  

其實這種情況很多人都有  
重點是「現在處理還來得及」  

👉 我可以幫你直接安排處理  
你是比較偏向感情還是財運這一塊？`;
    }

    // 🤖 正常聊天 → AI生成
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `
你是一個頂級成交型AI銷售（像真人聊天）

【風格】
- 像朋友聊天
- 有溫度
- 不官方
- 不要長篇大論
- 讓對方願意繼續聊

【目標】
- 引導對方講更多
- 找出需求
- 慢慢導向成交

【重要】
- 客戶用什麼語言 → 你就用什麼語言
- 不要一次講太多
- 保持神秘感一點

客戶名稱：${customerName}
客戶訊息：${userMessage}
`
                }
              ]
            }
          ]
        })
      }
    );

    const data = await res.json();

    return (
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "我幫你看了一下，你這個其實是可以處理的 🙌"
    );

  } catch (error) {
    console.error("Gemini error:", error);
    return "剛剛訊息有點卡住，我再幫你看一下 🙏";
  }
}