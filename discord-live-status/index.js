// index.js
const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

require('dotenv').config();
const BOT_TOKEN = process.env.DISCORD_TOKEN;
const USER_ID = process.env.DISCORD_USER_ID;


const PORT = 3000;
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMembers
  ]
});

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Keep a “snapshot” that we can send immediately to new page loads
let latestData = {
  username: '',
  discriminator: '',
  avatarURL: '',
  badges: [],
  status: 'offline',       // online / idle / dnd / offline
  customEmojiUrl: '',      // if it’s a server emoji
  customEmojiText: '',     // if it’s a unicode emoji
  customStatusText: ''     // the text you wrote under “Custom Status”
};

// 1) Build an object { emojiUrl, emojiText, text } from activities[]
function getCustomStatus(activities) {
  for (const act of activities) {
    if (act.type === 4) { // 4 == CUSTOM_STATUS
      if (act.emoji && act.emoji.id) {
        return {
          // Use imageURL() instead of .url to avoid the deprecation warning
          emojiUrl: act.emoji.imageURL(),
          emojiText: '',
          text: act.state || ''
        };
      }
      if (act.emoji && act.emoji.name) {
        return {
          emojiUrl: '',
          emojiText: act.emoji.name,
          text: act.state || ''
        };
      }
      return {
        emojiUrl: '',
        emojiText: '',
        text: act.state || ''
      };
    }
  }
  return { emojiUrl: '', emojiText: '', text: '' };
}


// 2) Build the “latestData” object and emit it via Socket.IO
function updateData(user, presence) {
  const badgesArr = user.flags.toArray();
  const statusStr = presence ? presence.status : 'offline';
  const { emojiUrl, emojiText, text } = presence
    ? getCustomStatus(presence.activities)
    : { emojiUrl: '', emojiText: '', text: '' };

  latestData = {
    username: user.username,
    discriminator: user.discriminator,
    avatarURL: user.displayAvatarURL({ dynamic: true, size: 128 }),
    badges: badgesArr,
    status: statusStr,
    customEmojiUrl: emojiUrl,
    customEmojiText: emojiText,
    customStatusText: text
  };

  io.emit('update', latestData);
}

client.once('ready', async () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);

  try {
    // 3) Fetch the user object so we know username/avatar/badges immediately
    const user = await client.users.fetch(USER_ID);

    // 4) Try to find their presence by looking through guilds
    //    (so we don’t wait until you manually toggle status).
    let presence = null;
    for (const guild of client.guilds.cache.values()) {
      // Fetch the member (this populates their presence if the bot can see it)
      const member = await guild.members.fetch(USER_ID).catch(() => null);
      if (member && member.presence) {
        presence = member.presence;
        break;
      }
    }

    // 5) Now updateData with whatever we got (or null → “offline”)
    updateData(user, presence);
  } catch (err) {
    console.error('🔥 Error in ready handler:', err);
  }
});

// 6) Whenever Discord tells us presence changed, update again
client.on('presenceUpdate', (oldPresence, newPresence) => {
  if (!newPresence || newPresence.userId !== USER_ID) return;

  console.log('🎉 presenceUpdate:', newPresence.status, newPresence.activities);

  // member may not be cached — fetch it explicitly
  const member = newPresence.member;
  if (member) {
    updateData(member.user, newPresence);
  } else {
    // member not cached, re-fetch from guild
    const guild = newPresence.guild;
    if (guild) {
      guild.members.fetch(USER_ID).then(m => {
        updateData(m.user, newPresence);
      }).catch(err => console.error('Failed to fetch member on presenceUpdate:', err));
    }
  }
});

// 7) If username/avatar/badges change, keep existing presence status
client.on('userUpdate', (oldUser, newUser) => {
  if (newUser.id !== USER_ID) return;
  // Re-emit with updated user data but preserve the last known presence
  // by re-fetching from a guild so we don't falsely set status → offline
  for (const guild of client.guilds.cache.values()) {
    guild.members.fetch(USER_ID).then(member => {
      updateData(newUser, member.presence);
    }).catch(() => null);
    break;
  }
});

client.login(BOT_TOKEN);

// 8) Serve `public/` as static files
app.use(express.static('public'));

io.on('connection', (socket) => {
  // Send the latest “snapshot” immediately when a browser connects
  socket.emit('update', latestData);
});

server.listen(PORT, () => {
  console.log(`🌐 Web server running on http://localhost:${PORT}`);
});
