require("dotenv").config();

const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const { checkMessage } = require("./text");

const app = express();
app.use(express.json());

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error("❌ TELEGRAM_BOT_TOKEN is missing in environment variables.");
  process.exit(1);
}

const bot = new TelegramBot(token);

const PORT = process.env.PORT || 3000;

/**
 * Health check endpoint
 * Render and other platforms use this
 */
app.get("/", (req, res) => {
  res.status(200).send("Telegram bot is running.");
});

/**
 * Telegram Webhook Endpoint
 */
app.post(`/bot${token}`, async (req, res) => {
  try {
    await bot.processUpdate(req.body);
    res.sendStatus(200);
  } catch (error) {
    console.error("Error processing update:", error);
    res.sendStatus(500);
  }
});

/**
 * Handle Telegram messages
 */
bot.on("message", async (msg) => {
  try {
    if (!msg.text) return;

    await checkMessage(msg.text, msg, bot);
  } catch (error) {
    console.error("Message handling error:", error);
  }
});

/**
 * Start server
 */
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});