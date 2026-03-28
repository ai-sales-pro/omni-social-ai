const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

function buildSalesReply(message = "", platform = "general") {
  const text = String(message).toLowerCase();

  if (text.includes("price") || text.includes("how much") || text.includes("cost")) {
    return `Thanks for your message! 👋

This is a premium solution designed to help you get results faster.

Pricing depends on the package and features you need. If you want, I can recommend the best option for your business and get you started today. 🚀`;
  }

  if (text.includes("interested") || text.includes("info") || text.includes("details")) {
    return `Awesome — thanks for reaching out! 🔥

This system helps businesses save time, reply faster, and turn more conversations into paying customers.

Tell me your goal and I’ll guide you to the best package for you.`;
  }

  if (text.includes("buy") || text.includes("order") || text.includes("start") || text.includes("ready")) {
    return `Perfect! ✅

You're ready to move forward.
Please send:
1. Your business type
2. Your preferred platform (${platform})
3. Your target customers

Once I have that, I can recommend the best setup and help you get started immediately.`;
  }

  return `Hi! 👋

Thanks for your message.
This is a premium AI auto-reply sales system built to help businesses reply faster and close more customers automatically.

Tell me what you need, and I’ll guide you to the best option for your business. 🚀`;
}

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "full-auto-sales-v2" });
});

app.post("/api/generate-reply", (req, res) => {
  const { message, platform } = req.body || {};
  const reply = buildSalesReply(message, platform);
  res.json({ ok: true, reply });
});

// Telegram webhook example
app.post("/webhook/telegram", async (req, res) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const body = req.body || {};
  const chatId = body?.message?.chat?.id;
  const messageText = body?.message?.text || "";
  const reply = buildSalesReply(messageText, "Telegram");

  if (!token || !chatId) {
    return res.json({ ok: true, note: "Webhook received, but TELEGRAM_BOT_TOKEN or chat id is missing.", preview_reply: reply });
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: reply })
    });

    const data = await response.json();
    res.json({ ok: true, telegram_response: data });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) });
  }
});

// Meta webhook verification
app.get("/webhook/meta", (req, res) => {
  const verifyToken = process.env.META_VERIFY_TOKEN || "my_verify_token";
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === verifyToken) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Instagram / WhatsApp incoming webhook preview
app.post("/webhook/meta", (req, res) => {
  const body = req.body || {};
  res.json({
    ok: true,
    note: "Meta webhook received. To make Instagram / WhatsApp fully auto-reply, add your Meta tokens and outbound messaging logic.",
    received: body
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
