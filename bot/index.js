cd bot
npm init -y
npm install discord.js axios dotenv

// bot/index.js (CommonJS)
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const BACKEND_URL = process.env.BACKEND_URL;
const SECRET_TOKEN = process.env.SECRET_TOKEN || '';
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || null;

if (!DISCORD_TOKEN || !BACKEND_URL) {
  console.error('Missing DISCORD_TOKEN or BACKEND_URL in .env');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers
  ]
});

client.once('ready', () => {
  console.log(`Bot ready: ${client.user.tag}`);
  // Initial push: for each guild, push current voice channel lists
  client.guilds.cache.forEach(guild => pushGuildVCs(guild).catch(console.error));
});

async function pushGuildVCs(guild) {
  const data = {};
  guild.channels.cache.forEach(channel => {
    // 2 = GuildVoice in discord.js v14 (using "type" may need constants depending on versions)
    // Use .isVoiceBased() in newer versions; we check if channel.members exists:
    if (channel.members && channel.members.size > 0) {
      const members = channel.members.map(m => ({
        id: m.id,
        username: m.user.username,
        tag: m.user.tag
      }));
      if (members.length) data[channel.name] = members;
    }
  });

  // send to backend if any channels present (also send empty to let backend know)
  await sendUpdate({ guildId: guild.id, guildName: guild.name, channels: data });
}

async function sendUpdate(payload) {
  try {
    await axios.post(BACKEND_URL, payload, {
      headers: { 'x-tracker-secret': SECRET_TOKEN }
    });
    // console.log('Sent update to backend');
  } catch (err) {
    console.error('Error sending update to backend:', err.message);
  }
}

client.on('voiceStateUpdate', async (oldState, newState) => {
  try {
    // Determine which guild affected
    const guild = newState.guild || oldState.guild;
    if (!guild) return;
    // Build payload for the affected guild (only channels that have members)
    const data = {};
    guild.channels.cache.forEach(channel => {
      if (channel.members && channel.members.size > 0) {
        const members = channel.members.map(m => ({
          id: m.id,
          username: m.user.username,
          tag: m.user.tag
        }));
        if (members.length) data[channel.name] = members;
      }
    });

    await sendUpdate({ guildId: guild.id, guildName: guild.name, channels: data });

    // optional text log
    if (LOG_CHANNEL_ID) {
      const textChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
      if (textChannel) {
        const user = newState.member?.user?.username ?? oldState.member?.user?.username;
        const joined = newState.channel?.name;
        const left = oldState.channel?.name;
        if (joined && !left) {
          textChannel.send(`🎧 **${user}** joined **${joined}**`);
        } else if (!joined && left) {
          textChannel.send(`🚪 **${user}** left **${left}**`);
        } else if (joined && left && joined !== left) {
          textChannel.send(`🔀 **${user}** moved from **${left}** → **${joined}**`);
        }
      }
    }
  } catch (err) {
    console.error('voiceStateUpdate handler error:', err);
  }
});

client.login(DISCORD_TOKEN);
