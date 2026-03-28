const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const users = {};

async function notifyAdmin(text) {
  const token = process.env.ADMIN_BOT_TOKEN;
  const chatId = process.env.ADMIN_CHAT_ID;

  if (!token || !chatId) return;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      chat_id: chatId,
      text: text
    })
  });
}

function buildReply(message = "", userId = "web") {
  const text = String(message || "").toLowerCase();

  const starter = process.env.STARTER_LINK;
  const growth = process.env.GROWTH_LINK;
  const premium = process.env.PREMIUM_LINK;

  if (!users[userId]) {
    users[userId] = {
      paid: false,
      lastTime: Date.now()
    };
  }

  const user = users[userId];
  user.lastTime = Date.now();

  // 價格
  if (text.includes("price")) {
    return `🔥 選一個方案：

Starter：
${starter}

Growth：
${growth}

Premium：
${premium}`;
  }

  // 買
  if (text.includes("buy") || text.includes("付款")) {
    return `👉 直接付款👇

Starter：
${starter}

Growth：
${growth}

Premium：
${premium}`;
  }

  // 已付款（通知你🔥）
  if (text.includes("已付款")) {
    user.paid = true;

    notifyAdmin(`💰 有新客戶付款！

User: ${userId}
Message: ${message}`);

    return `🔥 已收到！

我們會馬上處理 🚀`;
  }

  return `輸入 price 開始 💰`;
}

// Web API
app.get("/chat", (req, res) => {
  const message = req.query.message || "";
  const userId = req.query.user || "web";

  res.send(buildReply(message, userId));
});

// Telegram Bot
app.post("/webhook/telegram", async (req, res) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = req.body?.message?.chat?.id;
  const text = req.body?.message?.text || "";

  const reply = buildReply(text, chatId);

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      chat_id: chatId,
      text: reply
    })
  });

  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log("🔥 AI Sales 10.0 Running");
});
