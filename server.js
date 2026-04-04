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
  markOrderPaid,
  getFollowUpCustomers3Min,
  getFollowUpCustomers1Day,
  updateFollowUp
} from "./db.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

/* 🔥 Stripe webhook 必須 */
app.use((req, res, next) => {
  if (req.originalUrl === "/stripe-webhook") {
    next();
  } else {
    express.json()(req, res, next);
  }
});

app.use(cors());

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/* =========================
   🔥 基本測試
========================= */
app.get("/", (req, res) => {
  res.send("🔥 AI Sales System PRO Running");
});

/* =========================
   🤖 Telegram
========================= */
app.post("/webhook/telegram", async (req, res) => {
  try {
    const chatId = req.body?.message?.chat?.id;
    const text = req.body?.message?.text;

    if (!chatId || !text) return res.sendStatus(200);

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
    console.error("Telegram:", err.message);
    res.sendStatus(200);
  }
});

/* =========================
   📸 IG / FB 自動成交
========================= */
app.post("/webhook/meta", async (req, res) => {
  try {
    const messaging = req.body.entry?.[0]?.messaging?.[0];
    if (!messaging) return res.sendStatus(200);

    const senderId = messaging.sender.id;
    const text = messaging.message?.text;

    if (!text) return res.sendStatus(200);

    console.log("IG:", text);

    // 🔥 存客戶
    await saveCustomer({
      platform_id: senderId,
      message: text,
      status: "new"
    });

    // 🔥 AI 分析
    const analysis = await analyzeCustomer(text);

    // 🔥 判斷客戶等級
    let level = "cold";
    if (analysis.includes("想") || analysis.includes("多少")) level = "hot";
    if (analysis.includes("可以") || analysis.includes("好")) level = "ready";

    // 🔥 AI 回覆
    let reply = await generatePlatformReply(text, analysis);

    // 🔥 自動推付款（高轉換）
    if (level === "ready" || (await shouldOfferPayment(analysis))) {
      const link = await getPaymentLink("growth");

      reply += `\n\n👉 現在就可以幫你處理\n👉 這裡直接開始：\n${link}`;
    }

    // 🔥 回訊息
    await axios.post(
      `https://graph.facebook.com/v18.0/me/messages?access_token=${process.env.PAGE_ACCESS_TOKEN}`,
      {
        recipient: { id: senderId },
        message: { text: reply }
      }
    );

    res.sendStatus(200);
  } catch (err) {
    console.error("IG:", err.message);
    res.sendStatus(200);
  }
});

/* =========================
   💰 Stripe Checkout
========================= */
app.post("/create-checkout", async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "AI Service"
            },
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
    console.error("Stripe:", err.message);
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
      console.error("Webhook:", err.message);
      return res.sendStatus(400);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      console.log("💰 成交:", session.id);

      await markOrderPaid(session.id);
    }

    res.sendStatus(200);
  }
);

/* =========================
   🔥 自動追單系統
========================= */
setInterval(async () => {
  try {
    // 🔥 3分鐘追單
    const list3Min = await getFollowUpCustomers3Min();

    for (const c of list3Min) {
      await axios.post(
        `https://graph.facebook.com/v18.0/me/messages?access_token=${process.env.PAGE_ACCESS_TOKEN}`,
        {
          recipient: { id: c.platform_id },
          message: {
            text: "剛剛有看到你的狀況，其實這個很多人都有遇到，我可以幫你看看適合怎麼處理👉"
          }
        }
      );

      await updateFollowUp(c.id, "3min");
    }

    // 🔥 1天追單
    const list1Day = await getFollowUpCustomers1Day();

    for (const c of list1Day) {
      await axios.post(
        `https://graph.facebook.com/v18.0/me/messages?access_token=${process.env.PAGE_ACCESS_TOKEN}`,
        {
          recipient: { id: c.platform_id },
          message: {
            text: "昨天有看到你的訊息，如果你還在考慮，我這邊可以幫你分析最適合的方式🙏"
          }
        }
      );

      await updateFollowUp(c.id, "1day");
    }
  } catch (err) {
    console.error("FollowUp:", err.message);
  }
}, 60000);

/* =========================
   🚀 啟動
========================= */
app.listen(PORT, () => {
  console.log(`🔥 PRO Server running on ${PORT}`);
});
