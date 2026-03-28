function buildReply(message = "", platform = "Telegram") {
  const text = String(message || "").toLowerCase().trim();

  const starterLink =
    process.env.STARTER_LINK || "https://paypal.me/Phakhin573/99";
  const growthLink =
    process.env.GROWTH_LINK || "https://paypal.me/Phakhin573/299";
  const premiumLink =
    process.env.PREMIUM_LINK || "https://paypal.me/Phakhin573/699";

  if (!text) {
    return `Hi! 👋

Thanks for reaching out.
I can help you choose the best AI auto-reply sales setup for your business.

Please send:
1. Your business type
2. Your target customers
3. Your main goal`;
  }

  if (
    text.includes("price") ||
    text.includes("pricing") ||
    text.includes("how much") ||
    text.includes("cost") ||
    text.includes("多少") ||
    text.includes("價錢")
  ) {
    return `Absolutely — here are our 3 packages 💼

1. Starter — $99
• basic auto-reply setup
• simple lead reply flow

2. Growth — $299
• smarter sales replies
• lead qualification
• better conversion flow

3. Premium — $699
• full AI closing system
• advanced reply flow
• custom business setup

Reply with:
• Starter
• Growth
• Premium

and I’ll guide you to the next step.`;
  }

  if (text.includes("starter")) {
    return `Great choice — Starter ✅

Starter is best if you want a simple auto-reply system to save time and reply faster.

To continue, please send:
1. Your business type
2. Your target customers
3. Your preferred platform (${platform})

If you're ready to order now, use this secure checkout link:
${starterLink}`;
  }

  if (text.includes("growth")) {
    return `Great choice — Growth ✅

Growth is ideal if you want stronger lead qualification and better conversion replies.

To continue, please send:
1. Your business type
2. Your target customers
3. Your preferred platform (${platform})

If you're ready to order now, use this secure checkout link:
${growthLink}`;
  }

  if (text.includes("premium")) {
    return `Excellent choice — Premium 🚀

Premium is for businesses that want a full AI closing system with a more advanced setup.

To continue, please send:
1. Your business type
2. Your target customers
3. Your preferred platform (${platform})

If you're ready to order now, use this secure checkout link:
${premiumLink}`;
  }

  if (
    text.includes("interested") ||
    text.includes("details") ||
    text.includes("info") ||
    text.includes("tell me more") ||
    text.includes("了解") ||
    text.includes("想知道")
  ) {
    return `Awesome — here’s how this works 🔥

This system can:
• reply instantly
• answer customer questions
• qualify leads
• guide customers toward buying

To recommend the best package, please send:
1. Your business type
2. Your target customers
3. Your main goal
4. Your platform (Telegram / IG / WhatsApp)

If you already want to move forward now, tell me:
Starter / Growth / Premium`;
  }

  if (
    text.includes("buy") ||
    text.includes("buy now") ||
    text.includes("order") ||
    text.includes("start") ||
    text.includes("ready") ||
    text.includes("checkout") ||
    text.includes("payment") ||
    text.includes("pay") ||
    text.includes("付款") ||
    text.includes("下單")
  ) {
    return `Perfect — you're ready to move forward ✅

Please choose one package:
• Starter — $99
• Growth — $299
• Premium — $699

Then send me:
1. Your name
2. Your business type
3. Your preferred platform
4. Your package choice

I’ll send you the correct payment link right away.`;
  }

  if (
    text.includes("restaurant") ||
    text.includes("agency") ||
    text.includes("coach") ||
    text.includes("clinic") ||
    text.includes("shop") ||
    text.includes("ecommerce") ||
    text.includes("美容") ||
    text.includes("餐廳") ||
    text.includes("電商")
  ) {
    return `That sounds like a strong fit for this AI system 🚀

For your business, I recommend a setup that:
• replies fast
• builds trust
• qualifies customers
• guides them toward payment

Now send me:
1. Your target customers
2. Your main goal
3. Your platform
4. Your preferred package (Starter / Growth / Premium)`;
  }

  return `Thanks for your message 👋

I can help you choose the best AI auto-reply sales setup.

Please send:
1. Your business type
2. Your target customers
3. Your main goal
4. Your preferred platform

Or reply with:
Starter / Growth / Premium`;
}
