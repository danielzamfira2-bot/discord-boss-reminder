const path = require("node:path");
const {
  AttachmentBuilder,
  Client,
  Events,
  GatewayIntentBits,
} = require("discord.js");

const token = process.env.DISCORD_TOKEN;
const channelId = process.env.DISCORD_CHANNEL_ID;
const imageChannelId = process.env.DISCORD_IMAGE_CHANNEL_ID;
const maxReminderMessages = Number.parseInt(
  process.env.DISCORD_MAX_REMINDER_MESSAGES || "4",
  10,
);

if (!token) {
  throw new Error("Missing DISCORD_TOKEN environment variable.");
}

if (!channelId) {
  throw new Error("Missing DISCORD_CHANNEL_ID environment variable.");
}

if (!Number.isInteger(maxReminderMessages) || maxReminderMessages < 2) {
  throw new Error("DISCORD_MAX_REMINDER_MESSAGES must be a number greater than or equal to 2.");
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

let lastSentKey = null;

const bossMapCommands = [
  {
    name: "wbtarafoc",
    description: "Trimite harta bossilor pentru Tara de Foc.",
    title: "Tara de Foc",
    imagePath: path.join(__dirname, "images", "tara-foc.png"),
  },
  {
    name: "wbshoan",
    description: "Trimite harta bossilor pentru Muntele Sohan.",
    title: "Muntele Sohan",
    imagePath: path.join(__dirname, "images", "muntele-sohan.png"),
  },
  {
    name: "wbdesert",
    description: "Trimite harta bossilor pentru Desertul Yongbi.",
    title: "Desertul Yongbi",
    imagePath: path.join(__dirname, "images", "desertul-yongbi.png"),
  },
  {
    name: "wbvale",
    description: "Trimite harta bossilor pentru Valea Seungryong.",
    title: "Valea Seungryong",
    imagePath: path.join(__dirname, "images", "valea-seungryong.png"),
  },
];

async function registerCommands() {
  await client.application.commands.set(
    bossMapCommands.map(({ name, description }) => ({
      name,
      description,
    })),
  );
  console.log("Registered boss map slash commands.");
}

async function sendReminder(text) {
  const channel = await client.channels.fetch(channelId);

  if (!channel || !channel.isTextBased()) {
    throw new Error(`Channel ${channelId} was not found or is not text-based.`);
  }

  await channel.send({
    content: `@everyone ${text}`,
    allowedMentions: { parse: ["everyone"] },
  });

  await cleanupOldReminders(channel);
}

async function cleanupOldReminders(channel) {
  const messages = await channel.messages.fetch({ limit: 100 });
  const reminderMessages = messages
    .filter((message) => message.author.id === client.user.id)
    .sort((a, b) => b.createdTimestamp - a.createdTimestamp);

  const messagesToDelete = reminderMessages
    .toJSON()
    .slice(maxReminderMessages);

  for (const message of messagesToDelete) {
    try {
      await message.delete();
    } catch (error) {
      console.error(`Failed to delete old reminder ${message.id}:`, error);
    }
  }
}

async function sendBossMap(interaction) {
  const command = bossMapCommands.find(
    (bossMapCommand) => bossMapCommand.name === interaction.commandName,
  );

  if (!command) {
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const targetChannel = imageChannelId
    ? await client.channels.fetch(imageChannelId)
    : interaction.channel;

  if (!targetChannel || !targetChannel.isTextBased()) {
    await interaction.editReply("Canalul pentru poze nu a fost gasit sau nu este text.");
    return;
  }

  const attachment = new AttachmentBuilder(command.imagePath);
  await targetChannel.send({
    content: command.title,
    files: [attachment],
  });

  await interaction.editReply(`Am trimis poza pentru ${command.title}.`);
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

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}.`);
  await registerCommands();
  checkSchedule();
  setInterval(checkSchedule, 15 * 1000);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  try {
    await sendBossMap(interaction);
  } catch (error) {
    console.error("Failed to send boss map:", error);

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply("Nu am putut trimite poza.");
    } else {
      await interaction.reply({
        content: "Nu am putut trimite poza.",
        ephemeral: true,
      });
    }
  }
});

client.login(token);
