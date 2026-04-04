import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import cors from "cors";
import Stripe from "stripe";

import {
  analyzeCustomer,
  generateReply,
  shouldOfferPayment,
  generatePlatformReply
} from "./ai.js";

import {
  saveCustomer,
  getPaymentLink,
  createOrder,
  markOrderPaid
} from "./db.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/* =========================
   ✅ 測試
========================= */
app.get("/", (req, res) => {
  res.send("AI Sales System Running 🚀");
});

/* =========================
   🤖 Telegram（最穩版）
========================= */
app.post("/webhook/telegram", async (req, res) => {
  try {
    const chatId = req.body?.message?.chat?.id;
    const text = req.body?.message?.text;

    if (!chatId || !text) return res.sendStatus(200);

    console.log("📩 Telegram:", text);

    const analysis = await analyzeCustomer(text);
    const reply = await generateReply(text, analysis);

    await axios.post(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: chatId,
        text: reply
      }
    );

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Telegram error:", err.message);
    res.sendStatus(200);
  }
});

/* =========================
   📸 IG / FB
========================= */
app.post("/webhook/meta", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const messaging = entry?.messaging?.[0];

    if (!messaging) return res.sendStatus(200);

    const senderId = messaging.sender.id;
    const text = messaging.message?.text;

    if (!text) return res.sendStatus(200);

    console.log("📩 IG:", text);

    await saveCustomer({
      platform_id: senderId,
      message: text
    });

    const analysis = await analyzeCustomer(text);
    let reply = await generatePlatformReply(text, analysis);

    if (await shouldOfferPayment(analysis)) {
      const link = await getPaymentLink("growth");
      reply += `\n\n👉 立即開始：\n${link}`;
    }

    await axios.post(
      `https://graph.facebook.com/v18.0/me/messages?access_token=${process.env.PAGE_ACCESS_TOKEN}`,
      {
        recipient: { id: senderId },
        message: { text: reply }
      }
    );

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ IG error:", err.message);
    res.sendStatus(200);
  }
});

/* =========================
   💰 Stripe 建立付款
========================= */
app.post("/create-checkout", async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: "AI Service" },
            unit_amount: 1000 * 100
          },
          quantity: 1
        }
      ],
      mode: "payment",
      success_url: `${process.env.BASE_URL}/success`,
      cancel_url: `${process.env.BASE_URL}/cancel`
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("❌ Stripe:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   💳 Stripe Webhook
========================= */
app.post(
  "/stripe-webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        req.headers["stripe-signature"],
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("❌ Webhook:", err.message);
      return res.sendStatus(400);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      console.log("💰 Payment success:", session.id);

      await markOrderPaid(session.id);
    }

    res.sendStatus(200);
  }
);

/* =========================
   🚀 啟動
========================= */
app.listen(PORT, () => {
  console.log(`🔥 Server running on ${PORT}`);
});
