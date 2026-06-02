import { ActivityType } from 'discord.js';
import { BotClient } from '../client.js';
import { getAll247 } from '../database.js';

export default function registerReady(client: BotClient) {
  client.once('ready', async () => {
    console.log(`✅ Logged in as ${client.user!.tag}`);
    console.log(`📊 Serving ${client.guilds.cache.size} servers`);

    client.user!.setPresence({
      activities: [{ name: `${client.guilds.cache.size} servers | !help`, type: ActivityType.Watching }],
      status: 'online',
    });

    // Restore 24/7 connections
    const channels = getAll247();
    for (const entry of channels) {
      try {
        const guild = client.guilds.cache.get(entry.guild_id);
        if (!guild) continue;
        const channel = guild.channels.cache.get(entry.channel_id);
        if (!channel) continue;
        await guild.members.me?.voice.setChannel(channel as any);
        console.log(`🎙️ Restored 24/7 in ${guild.name}`);
      } catch {}
    }

    // Rotate presence every 5 minutes
    setInterval(() => {
      const activities = [
        { name: `${client.guilds.cache.size} servers | !help`, type: ActivityType.Watching },
        { name: 'over your server 🛡️', type: ActivityType.Watching },
        { name: '!help for commands', type: ActivityType.Playing },
      ];
      const pick = activities[Math.floor(Math.random() * activities.length)];
      client.user!.setActivity(pick);
    }, 300000);
  });
}
