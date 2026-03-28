const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

function buildReply(message = "", platform = "Telegram") {
  const text = String(message || "").toLowerCase().trim();

  if (!text) {
    return `Hi! 👋

Thanks for reaching out.
This is a premium AI auto-reply sales system designed to help businesses close more customers automatically.

Tell me what you need and I’ll guide you to the best option for your business. 🚀`;
  }

  if (text.includes("price") || text.includes("how much") || text.includes("cost") || text.includes("pricing")) {
    return `Absolutely — here’s a quick overview. 💼

Our pricing depends on the level of setup and automation you need:

• Starter: basic setup
• Growth: smarter automation + better conversion flow
• Premium: full auto-reply sales system

Tell me your business type and goal, and I’ll recommend the best package for you.`;
  }

  if (text.includes("interested") || text.includes("details") || text.includes("info") || text.includes("tell me more")) {
    return `Awesome — happy to help. 🔥

This system is built to:
• reply instantly
• handle customer questions
• guide leads toward purchase
• save you time while increasing conversions

Reply with:
1. Your business type
2. Your target customers
3. Your main goal

and I’ll recommend the best setup for you.`;
  }

  if (text.includes("buy") || text.includes("start") || text.includes("ready") || text.includes("order")) {
    return `Perfect — you’re ready to move forward. ✅

Please send:
1. Your business type
2. Your preferred platform (${platform})
3. Your target customers

Once I have that, I’ll recommend the best setup and help you get started immediately.`;
  }

  if (text.includes("restaurant") || text.includes("agency") || text.includes("coach") || text.includes("clinic") || text.includes("shop") || text.includes("ecommerce")) {
    return `That sounds like a great fit for this system. 🚀

For your business, I’d recommend a sales flow that:
• answers fast
• builds trust
• qualifies the customer
• moves them toward booking or payment

If you want, I can outline the best package for your business right now.`;
  }

  if (text.includes("book") || text.includes("appointment") || text.includes("schedule") || text.includes("call")) {
    const booking = process.env.BOOKING_LINK || "your-booking-link";
    return `Great — the fastest next step is to book a quick call here:

${booking}

Once booked, we can discuss your goals and recommend the best setup for you.`;
  }

  if (text.includes("pay") || text.includes("payment") || text.includes("checkout")) {
    const checkout = process.env.CHECKOUT_LINK || "your-checkout-link";
    return `Perfect — you can move forward here:

${checkout}

Once payment is completed, we can begin the setup right away. ✅`;
  }

  return `Hi! 👋

Thanks for your message.
This is a premium AI auto-reply sales system built to help businesses reply faster and close more customers automatically.

Tell me what you need, and I’ll guide you to the best option for your business. 🚀`;
}

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "telegram-sales-closer-upgrade" });
});

app.post("/api/generate-reply", (req, res) => {
  const { message, platform } = req.body || {};
  const reply = buildReply(message, platform || "Telegram");
  res.json({ ok: true, reply });
});

app.post("/webhook/telegram", async (req, res) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const body = req.body || {};
  const chatId = body?.message?.chat?.id;
  const messageText = body?.message?.text || "";
  const reply = buildReply(messageText, "Telegram");

  if (!token || !chatId) {
    return res.json({ ok: true, note: "Missing TELEGRAM_BOT_TOKEN or chat ID.", preview_reply: reply });
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});\n