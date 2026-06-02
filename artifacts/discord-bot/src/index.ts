import http from 'http';
import { ActivityType } from 'discord.js';
import { createClient } from './client.js';
import { startStatResetScheduler, getBotConfig, getExpiredTempRoles, removeTempRole } from './database.js';

// Commands
import moderation from './commands/moderation.js';
import muteCommands from './commands/mute.js';
import funCommands from './commands/fun.js';
import percentageCommands from './commands/percentage.js';
import utilityCommands from './commands/utility.js';
import vcBotCommands from './commands/vcbot.js';
import nsfwCommands from './commands/nsfw.js';
import logCommands from './commands/logs.js';
import automodCommands from './commands/automod.js';
import welcomeCommands from './commands/welcome.js';
import botownerCommands from './commands/botowner.js';
import afkCommands from './commands/afk.js';
import helpCommands from './commands/help.js';
import tempvcCommands from './commands/tempvc.js';
import roleCommands from './commands/giverole.js';
import bioCommands from './commands/bio.js';
import giveawayCommands, { setupGiveawayTimers } from './commands/giveaway.js';
import ticketCommands from './commands/tickets.js';
import setupCommands from './commands/setup.js';
import jailCommands from './commands/jail.js';
import serverCommands from './commands/server.js';
import musicCommands from './commands/music.js';
import lyricsCommands from './commands/lyrics.js';
import whitelistCommands from './commands/whitelist.js';

// Events
import registerReady from './events/ready.js';
import registerMessageCreate from './events/messageCreate.js';
import registerInteractionCreate from './events/interactionCreate.js';
import registerGuildMemberAdd from './events/guildMemberAdd.js';
import registerGuildMemberRemove from './events/guildMemberRemove.js';
import registerVoiceStateUpdate from './events/voiceStateUpdate.js';
import registerMessageDelete from './events/messageDelete.js';
import registerMessageUpdate from './events/messageUpdate.js';
import registerRoleEvents from './events/roleCreate.js';

const client = createClient();

// ── LOAD ALL COMMANDS ────────────────────────────────────────────────────────
const allCommands = [
  ...moderation,
  ...muteCommands,
  ...funCommands,
  ...percentageCommands,
  ...utilityCommands,
  ...vcBotCommands,
  ...nsfwCommands,
  ...logCommands,
  ...automodCommands,
  ...welcomeCommands,
  ...botownerCommands,
  ...afkCommands,
  ...helpCommands,
  ...tempvcCommands,
  ...roleCommands,
  ...bioCommands,
  ...giveawayCommands,
  ...ticketCommands,
  ...setupCommands,
  ...jailCommands,
  ...serverCommands,
  ...musicCommands,
  ...lyricsCommands,
  ...whitelistCommands,
];

for (const command of allCommands) {
  client.commands.set(command.name, command);
  if (command.aliases) {
    for (const alias of command.aliases) {
      client.aliases.set(alias, command.name);
    }
  }
}

console.log(`✅ Loaded ${client.commands.size} commands`);

// ── START SCHEDULERS ──────────────────────────────────────────────────────────
startStatResetScheduler();
console.log('⏰ Stat reset scheduler started (daily at midnight, weekly on Mondays)');

// Temp role expiry — check every 60 seconds
setInterval(async () => {
  const expired = getExpiredTempRoles();
  for (const entry of expired) {
    try {
      const guild = client.guilds.cache.get(entry.guild_id);
      if (!guild) { removeTempRole(entry.guild_id, entry.user_id, entry.role_id); continue; }
      const member = await guild.members.fetch(entry.user_id).catch(() => null);
      if (member) await member.roles.remove(entry.role_id, 'Temp role expired').catch(() => {});
      removeTempRole(entry.guild_id, entry.user_id, entry.role_id);
    } catch {}
  }
}, 60_000);
console.log('⏳ Temp role expiry scheduler started (checks every 60s)');

// ── REGISTER EVENTS ──────────────────────────────────────────────────────────
registerReady(client);
registerMessageCreate(client);
registerInteractionCreate(client);
registerGuildMemberAdd(client);
registerGuildMemberRemove(client);
registerVoiceStateUpdate(client);
registerMessageDelete(client);
registerMessageUpdate(client);
registerRoleEvents(client);

// ── RESTORE GIVEAWAY TIMERS + BOT STATUS ON READY ────────────────────────────
client.once('clientReady' as any, () => {
  setupGiveawayTimers(client);
  const statusType = getBotConfig('status_type');
  const statusText = getBotConfig('status_text');
  if (statusType && statusText) {
    const typeMap: Record<string, ActivityType> = {
      playing: ActivityType.Playing, watching: ActivityType.Watching,
      listening: ActivityType.Listening, competing: ActivityType.Competing,
      streaming: ActivityType.Streaming,
    };
    if (typeMap[statusType]) client.user?.setActivity(statusText, { type: typeMap[statusType] });
  }
});

// ── MINIMAL HTTP SERVER (for workflow health check) ───────────────────────────
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3999;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'online',
    bot: client.user?.tag ?? 'Connecting...',
    guilds: client.guilds.cache.size,
    ping: client.ws.ping,
    uptime: Math.floor(process.uptime()),
  }));
}).listen(PORT, () => {
  console.log(`🌐 Health server running on port ${PORT}`);
});

// ── LOGIN ────────────────────────────────────────────────────────────────────
const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('❌ DISCORD_TOKEN is not set!');
  process.exit(1);
}

client.login(token).catch(err => {
  console.error('❌ Failed to login:', err.message);
  process.exit(1);
});

// ── UNHANDLED ERRORS ──────────────────────────────────────────────────────────
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});
