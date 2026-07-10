const { Client, GatewayIntentBits } = require("discord.js");

const token = process.env.DISCORD_TOKEN;
const channelId = process.env.DISCORD_CHANNEL_ID;

if (!token) {
  throw new Error("Missing DISCORD_TOKEN environment variable.");
}

if (!channelId) {
  throw new Error("Missing DISCORD_CHANNEL_ID environment variable.");
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

let lastSentKey = null;

async function sendReminder(text) {
  const channel = await client.channels.fetch(channelId);

  if (!channel || !channel.isTextBased()) {
    throw new Error(`Channel ${channelId} was not found or is not text-based.`);
  }

  await channel.send({
    content: `@everyone ${text}`,
    allowedMentions: { parse: ["everyone"] },
  });
}

async function checkSchedule() {
  const now = new Date();
  const minute = now.getMinutes();

  if (minute !== 55 && minute !== 59) {
    return;
  }

  const sendKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${minute}`;

  if (sendKey === lastSentKey) {
    return;
  }

  lastSentKey = sendKey;

  const message =
    minute === 55
      ? "Bosii vor aparea in urmatoarele 5 minute"
      : "Bosii vor aparea intr-un minut!";

  try {
    await sendReminder(message);
    console.log(`Sent reminder for minute ${minute}.`);
  } catch (error) {
    console.error("Failed to send reminder:", error);
  }
}

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}.`);
  checkSchedule();
  setInterval(checkSchedule, 15 * 1000);
});

client.login(token);
