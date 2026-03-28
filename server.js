const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const users = {};

function getUser(userId) {
  if (!users[userId]) {
    users[userId] = {
      paid: false,
      collecting: null,
      order: {
        package: "",
        name: "",
        industry: "",
        platform: ""
      },
      level: "cold",
      lastIntent: "",
      lastMessage: ""
    };
  }
  return users[userId];
}

async function sendNotify(text) {
  const token = process.env.NOTIFY_BOT_TOKEN;
  const chatId = process.env.NOTIFY_CHAT_ID;

  if (!token || !chatId) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: chatId,
        text
      })
    });
  } catch (err) {
    console.log("Notify error:", err);
  }
}

function detectLeadLevel(text) {
  const t = String(text).toLowerCase();

  if (
    t.includes("company") ||
    t.includes("agency") ||
    t.includes("clients") ||
    t.includes("many customers") ||
    t.includes("客戶很多") ||
    t.includes("公司") ||
    t.includes("品牌")
  ) {
    return "vip";
  }

  if (
    t.includes("premium") ||
    t.includes("buy") ||
    t.includes("付款") ||
    t.includes("已付款") ||
    t.includes("ready")
  ) {
    return "hot";
  }

  if (
    t.includes("price") ||
    t.includes("多少") ||
    t.includes("價錢") ||
    t.includes("growth") ||
    t.includes("starter")
  ) {
    return "warm";
  }

  return "cold";
}

function rememberPackage(user, text) {
  if (text.includes("starter")) user.order.package = "Starter";
  if (text.includes("growth")) user.order.package = "Growth";
  if (text.includes("premium")) user.order.package = "Premium";
}

function buildReply(message = "", userId = "web") {
  const text = String(message || "").toLowerCase().trim();
  const user = getUser(userId);

  const starter = process.env.STARTER_LINK || "https://paypal.me/Phakhin573/99";
  const growth = process.env.GROWTH_LINK || "https://paypal.me/Phakhin573/299";
  const premium = process.env.PREMIUM_LINK || "https://paypal.me/Phakhin573/699";

  user.lastMessage = message;
  user.lastIntent = text;
  user.level = detectLeadLevel(text);
  rememberPackage(user, text);

  if (user.collecting === "name") {
    user.order.name = message;
    user.collecting = "industry";
    return "請問你的行業是什麼？（例如：電商 / 教育 / 房地產）";
  }

  if (user.collecting === "industry") {
    user.order.industry = message;
    user.collecting = "platform";
    return "你想用在哪個平台？（Telegram / IG / WhatsApp）";
  }

  if (user.collecting === "platform") {
    user.order.platform = message;
    user.collecting = null;

    sendNotify(`💰 新成交訂單

⭐ 客戶等級: ${user.level}
📦 方案: ${user.order.package || "未標記"}
👤 名字: ${user.order.name}
📊 行業: ${user.order.industry}
📱 平台: ${user.order.platform}
🆔 User: ${userId}`);

    return `✅ 收到，資料已完整！

方案：${user.order.package || "未標記"}
我會幫你安排下一步 🚀`;
  }

  if (text.includes("已付款") || text.includes("paid")) {
    user.paid = true;
    user.collecting = "name";

    sendNotify(`💳 客戶表示已付款

⭐ 客戶等級: ${user.level}
📦 方案: ${user.order.package || "未標記"}
🆔 User: ${userId}
💬 Message: ${message}`);

    return `太好了！🎉

我已記錄你的付款。
請先給我你的名字：`;
  }

  if (
    text.includes("price") ||
    text.includes("pricing") ||
    text.includes("how much") ||
    text.includes("多少") ||
    text.includes("價錢")
  ) {
    if (user.level === "vip") {
      return `💎 以你的需求，我會直接建議 Premium

Premium — $699
👉 ${premium}

如果你要最快開始，付款後回覆：
已付款`;
    }

    return `🔥 目前方案如下：

Starter — $99
👉 ${starter}

Growth — $299（最熱門）
👉 ${growth}

Premium — $699
👉 ${premium}

直接回覆：
Starter / Growth / Premium`;
  }

  if (text.includes("starter")) {
    return `Starter — $99 ✅

適合先測試：
${starter}

付款後回覆：
已付款`;
  }

  if (text.includes("growth")) {
    return `Growth — $299 🚀

這是最多人選的方案：
${growth}

付款後回覆：
已付款`;
  }

  if (text.includes("premium")) {
    return `Premium — $699 💎

這是最高效版本：
${premium}

付款後回覆：
已付款`;
  }

  if (
    text.includes("buy") ||
    text.includes("order") ||
    text.includes("我要買") ||
    text.includes("下單") ||
    text.includes("付款")
  ) {
    if (user.level === "vip") {
      user.order.package = user.order.package || "Premium";
      return `🔥 我直接幫你走最快方案：

Premium — $699
${premium}

付款後回覆：
已付款

我會直接幫你安排。`;
    }

    user.order.package = user.order.package || "Growth";
    return `🔥 建議你直接選這個最平衡：

Growth — $299
${growth}

付款後回覆：
已付款`;
  }

  if (
    text.includes("貴") ||
    text.includes("太貴") ||
    text.includes("expensive") ||
    text.includes("考慮") ||
    text.includes("再想想")
  ) {
    return `沒問題 👍

如果你想先低風險開始，我建議先從這個：

Growth — $299
${growth}

如果你真的想先試最低成本，也可以選：

Starter — $99
${starter}`;
  }

  if (
    text.includes("agency") ||
    text.includes("company") ||
    text.includes("公司") ||
    text.includes("品牌") ||
    text.includes("客戶很多")
  ) {
    user.order.package = "Premium";
    return `你這種需求很適合直接做高轉換版本 🔥

我會建議你看 Premium：
${premium}

如果你要，我可以直接帶你開始。`;
  }

  return `Hi 👋

這是 AI 自動成交系統。

你可以直接輸入：
price

我會幫你推薦最適合的方案 💰`;
}

app.get("/", (req, res) => {
  res.send("AI Sales 15.0 Running 🚀");
});

app.get("/chat", async (req, res) => {
  const message = req.query.message || "";
  const userId = req.query.user || "web";
  const user = getUser(userId);

  const reply = buildReply(message, userId);

  await sendNotify(`📩 Web 客戶訊息

⭐ 客戶等級: ${user.level}
📦 方案: ${user.order.package || "未標記"}
🆔 User: ${userId}
💬 Message: ${message}`);

  res.send(reply);
});

app.post("/webhook/telegram", async (req, res) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = req.body?.message?.chat?.id;
  const text = req.body?.message?.text || "";

  if (!chatId) {
    return res.json({ ok: true });
  }

  const user = getUser(String(chatId));
  const reply = buildReply(text, String(chatId));

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: reply
      })
    });

    await sendNotify(`📩 Telegram 客戶

⭐ 客戶等級: ${user.level}
📦 方案: ${user.order.package || "未標記"}
🆔 User: ${chatId}
💬 Message: ${text}`);
  } catch (err) {
    console.log("Telegram error:", err);
  }

  return res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log("AI Sales 15.0 Running on port " + PORT);
})
