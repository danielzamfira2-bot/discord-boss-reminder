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
const eventChannelId = process.env.DISCORD_EVENT_CHANNEL_ID || channelId;
const eventTimezone = process.env.DISCORD_EVENT_TIMEZONE || "Europe/Berlin";
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
let lastSentEventKeys = new Set();
const upcomingEventMessageIds = new Map();

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

const weekdays = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

const eventSchedule = {
  MONDAY: [
    { name: "Concentrated Reading", start: "14:00" },
    { name: "Cor Daemonis", start: "19:00" },
    { name: "Tiger Coin", start: "00:00" },
    { name: "Jigsaw Event", start: "19:00" },
  ],
  TUESDAY: [
    { name: "Researcher Elixir", start: "14:00" },
    { name: "Exorcism Scroll", start: "19:00" },
    { name: "Fine Cloth", start: "00:00" },
    { name: "Mining Event", start: "19:00" },
  ],
  WEDNESDAY: [
    { name: "Blacksmith's Stone", start: "14:00" },
    { name: "Time Spiral (%50)", start: "19:00" },
    { name: "Passage Ticket", start: "00:00" },
    { name: "Metin Fever", start: "00:00" },
  ],
  THURSDAY: [
    { name: "Sun Elixir", start: "14:00" },
    { name: "Fodder", start: "19:00" },
    { name: "Inventory Expansion", start: "00:00" },
    { name: "Hexagonal Event", start: "19:00" },
  ],
  FRIDAY: [
    { name: "Small Orison", start: "14:00" },
    { name: "Robin (loot)", start: "19:00" },
    { name: "Pet Book Chest", start: "00:00" },
    { name: "Moonlight Event", start: "19:00" },
  ],
  SATURDAY: [
    { name: "Tasty Treats", start: "14:00" },
    { name: "Flame of the Dragon", start: "19:00" },
    { name: "Shard Chest", start: "00:00" },
    { name: "Football Event", start: "19:00" },
  ],
  SUNDAY: [
    { name: "Tiger Coin", start: "14:00" },
    { name: "Cor Daemonis (noble)", start: "19:00" },
    { name: "Cor Daemonis (cut)", start: "00:00" },
    { name: "Medal Event", start: "00:00" },
  ],
};

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

function getLocalDateParts(date) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: eventTimezone,
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );

  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    year: Number.parseInt(parts.year, 10),
    month: Number.parseInt(parts.month, 10),
    day: Number.parseInt(parts.day, 10),
    weekday: parts.weekday.toUpperCase(),
    hour: Number.parseInt(parts.hour, 10),
    minute: Number.parseInt(parts.minute, 10),
  };
}

function addDaysToDateKey(dateKey, days) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  const nextYear = date.getUTCFullYear();
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getUTCDate()).padStart(2, "0");

  return `${nextYear}-${nextMonth}-${nextDay}`;
}

function getTimezoneOffsetMs(timeZone, date) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );

  const localAsUtc = Date.UTC(
    Number.parseInt(parts.year, 10),
    Number.parseInt(parts.month, 10) - 1,
    Number.parseInt(parts.day, 10),
    Number.parseInt(parts.hour, 10),
    Number.parseInt(parts.minute, 10),
    Number.parseInt(parts.second, 10),
  );

  return localAsUtc - date.getTime();
}

function getUtcDateFromZonedTime(dateKey, time, timeZone) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  let utcTime = Date.UTC(year, month - 1, day, hour, minute);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const offset = getTimezoneOffsetMs(timeZone, new Date(utcTime));
    utcTime = Date.UTC(year, month - 1, day, hour, minute) - offset;
  }

  return new Date(utcTime);
}

function getTriggerTime(eventStart, minutesFromStart) {
  const [eventHour, eventMinute] = eventStart.split(":").map(Number);
  let totalMinutes = eventHour * 60 + eventMinute + minutesFromStart;
  let previousDay = false;
  let nextDay = false;

  if (totalMinutes < 0) {
    totalMinutes += 24 * 60;
    previousDay = true;
  }

  if (totalMinutes >= 24 * 60) {
    totalMinutes -= 24 * 60;
    nextDay = true;
  }

  return {
    hour: Math.floor(totalMinutes / 60),
    minute: totalMinutes % 60,
    previousDay,
    nextDay,
  };
}

function getPreviousWeekday(weekday) {
  const weekdayIndex = weekdays.indexOf(weekday);
  return weekdays[(weekdayIndex + 6) % 7];
}

function getNextWeekday(weekday) {
  const weekdayIndex = weekdays.indexOf(weekday);
  return weekdays[(weekdayIndex + 1) % 7];
}

function getEventsForTrigger(localParts, minutesFromStart) {
  const matchingEvents = [];

  for (const [eventWeekday, events] of Object.entries(eventSchedule)) {
    for (const event of events) {
      const triggerTime = getTriggerTime(event.start, minutesFromStart);
      const triggerWeekday = triggerTime.previousDay
        ? getPreviousWeekday(eventWeekday)
        : triggerTime.nextDay
          ? getNextWeekday(eventWeekday)
        : eventWeekday;

      if (
        triggerWeekday === localParts.weekday &&
        triggerTime.hour === localParts.hour &&
        triggerTime.minute === localParts.minute
      ) {
        const eventDateKey = triggerTime.previousDay
          ? addDaysToDateKey(localParts.dateKey, 1)
          : triggerTime.nextDay
            ? addDaysToDateKey(localParts.dateKey, -1)
          : localParts.dateKey;

        matchingEvents.push({ ...event, dateKey: eventDateKey, weekday: eventWeekday });
      }
    }
  }

  return matchingEvents;
}

function getEventStorageKey(event) {
  return `${event.dateKey}-${event.weekday}-${event.start}-${event.name}`;
}

function getEventStartTimestamp(event) {
  return Math.floor(
    getUtcDateFromZonedTime(event.dateKey, event.start, eventTimezone).getTime() / 1000,
  );
}

async function getEventChannel() {
  const channel = await client.channels.fetch(eventChannelId);

  if (!channel || !channel.isTextBased()) {
    throw new Error(`Channel ${eventChannelId} was not found or is not text-based.`);
  }

  return channel;
}

async function sendUpcomingEventReminder(event) {
  const channel = await getEventChannel();
  const eventStartTimestamp = getEventStartTimestamp(event);

  const message = await channel.send({
    content: `@everyone ${event.name} urmeaza sa inceapa in 10 minute! Ora ta: <t:${eventStartTimestamp}:t> (<t:${eventStartTimestamp}:R>)`,
    allowedMentions: { parse: ["everyone"] },
  });

  upcomingEventMessageIds.set(getEventStorageKey(event), message.id);
}

async function deleteUpcomingEventReminder(channel, event) {
  const eventKey = getEventStorageKey(event);
  const messageId = upcomingEventMessageIds.get(eventKey);

  if (messageId) {
    try {
      const message = await channel.messages.fetch(messageId);
      await message.delete();
      upcomingEventMessageIds.delete(eventKey);
      return;
    } catch (error) {
      console.error(`Failed to delete stored upcoming reminder for ${event.name}:`, error);
    }
  }

  const messages = await channel.messages.fetch({ limit: 100 });
  const oldUpcomingMessages = messages.filter(
    (message) =>
      message.author.id === client.user.id &&
      message.content.includes(event.name) &&
      message.content.includes("urmeaza sa inceapa"),
  );

  for (const message of oldUpcomingMessages.values()) {
    try {
      await message.delete();
    } catch (error) {
      console.error(`Failed to delete old upcoming reminder ${message.id}:`, error);
    }
  }
}

async function sendActiveEventReminder(event) {
  const channel = await getEventChannel();
  const eventStartTimestamp = getEventStartTimestamp(event);

  await deleteUpcomingEventReminder(channel, event);

  await channel.send({
    content: `@everyone ${event.name} este activ! Ora ta: <t:${eventStartTimestamp}:t>`,
    allowedMentions: { parse: ["everyone"] },
  });
}

async function checkEventSchedule() {
  const localParts = getLocalDateParts(new Date());
  const eventKeyPrefix = `${localParts.dateKey}-${localParts.hour}-${localParts.minute}`;

  if (lastSentEventKeys.size > 200) {
    lastSentEventKeys = new Set();
  }

  for (const event of getEventsForTrigger(localParts, -10)) {
    const eventKey = `${eventKeyPrefix}-upcoming-${event.weekday}-${event.start}-${event.name}`;

    if (lastSentEventKeys.has(eventKey)) {
      continue;
    }

    lastSentEventKeys.add(eventKey);

    try {
      await sendUpcomingEventReminder(event);
      console.log(`Sent upcoming event reminder for ${event.name}.`);
    } catch (error) {
      console.error(`Failed to send upcoming event reminder for ${event.name}:`, error);
    }
  }

  for (const event of getEventsForTrigger(localParts, 0)) {
    const eventKey = `${eventKeyPrefix}-active-${event.weekday}-${event.start}-${event.name}`;

    if (lastSentEventKeys.has(eventKey)) {
      continue;
    }

    lastSentEventKeys.add(eventKey);

    try {
      await sendActiveEventReminder(event);
      console.log(`Sent active event reminder for ${event.name}.`);
    } catch (error) {
      console.error(`Failed to send active event reminder for ${event.name}:`, error);
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
  checkEventSchedule();
  setInterval(checkSchedule, 15 * 1000);
  setInterval(checkEventSchedule, 15 * 1000);
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
