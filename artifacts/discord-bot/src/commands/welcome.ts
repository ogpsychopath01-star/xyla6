import { EmbedBuilder } from 'discord.js';
import { BotCommand } from '../client.js';
import { COLORS } from '../utils/embeds.js';
import { getWelcomeSettings, setWelcomeSettings, getLeaveSettings, setLeaveSettings } from '../database.js';
import { hasPermission, Perms } from '../utils/permissions.js';

function successEmbed(t: string, d: string) {
  return new EmbedBuilder().setColor(COLORS.success).setTitle(`✅ ${t}`).setDescription(d).setTimestamp();
}
function errorEmbed(t: string, d: string) {
  return new EmbedBuilder().setColor(COLORS.error).setTitle(`❌ ${t}`).setDescription(d).setTimestamp();
}

const welcomeCommands: BotCommand[] = [
  {
    name: 'setwelcome',
    description: 'Set the welcome message and channel',
    category: 'Welcome',
    usage: 'setwelcome [#channel] [message] — Variables: {user} {server} {membercount}',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ManageGuild))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Server** permission.')] });
      const channel = message.mentions.channels.first() ?? message.channel;
      const msg = args.slice(message.mentions.channels.first() ? 1 : 0).join(' ') || 'Welcome to **{server}**, {user}! You are member #{membercount} 🎉';
      setWelcomeSettings(message.guild!.id, { channel_id: channel.id, message: msg, enabled: true });
      const preview = msg.replace(/{user}/g, `@${message.author.username}`).replace(/{server}/g, message.guild!.name).replace(/{membercount}/g, String(message.guild!.memberCount));
      await message.reply({ embeds: [successEmbed('Welcome Setup', `Welcome messages → <#${channel.id}>\n\n**Preview:**\n${preview}`)] });
    }
  },
  {
    name: 'disablewelcome',
    description: 'Disable welcome messages',
    category: 'Welcome',
    usage: 'disablewelcome',
    async execute(message) {
      if (!hasPermission(message.member!, Perms.ManageGuild))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Server** permission.')] });
      const existing = getWelcomeSettings(message.guild!.id);
      if (existing) setWelcomeSettings(message.guild!.id, { ...existing, enabled: false });
      await message.reply({ embeds: [successEmbed('Welcome Disabled', 'Welcome messages have been disabled.')] });
    }
  },
  {
    name: 'setleave',
    description: 'Set the leave message and channel',
    category: 'Welcome',
    usage: 'setleave [#channel] [message]',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ManageGuild))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Server** permission.')] });
      const channel = message.mentions.channels.first() ?? message.channel;
      const msg = args.slice(message.mentions.channels.first() ? 1 : 0).join(' ') || '{user} has left **{server}**. Goodbye! 👋';
      setLeaveSettings(message.guild!.id, { channel_id: channel.id, message: msg, enabled: true });
      await message.reply({ embeds: [successEmbed('Leave Setup', `Leave messages → <#${channel.id}>\n\n**Message:** ${msg}`)] });
    }
  },
  {
    name: 'testwelcome',
    description: 'Preview the welcome message',
    category: 'Welcome',
    usage: 'testwelcome',
    async execute(message) {
      const settings = getWelcomeSettings(message.guild!.id);
      if (!settings) return message.reply({ embeds: [errorEmbed('Not Set', 'Set up welcome with `setwelcome` first.')] });
      const msg = settings.message.replace(/{user}/g, `<@${message.author.id}>`).replace(/{server}/g, message.guild!.name).replace(/{membercount}/g, String(message.guild!.memberCount));
      await message.reply({ embeds: [new EmbedBuilder().setColor(COLORS.success).setTitle('👋 Welcome! (Test)').setDescription(msg).setThumbnail(message.author.displayAvatarURL({ size: 256 })).setTimestamp()] });
    }
  },
];

export default welcomeCommands;
