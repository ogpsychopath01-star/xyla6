import { EmbedBuilder } from 'discord.js';
import { BotCommand } from '../client.js';
import { COLORS } from '../utils/embeds.js';
import { setLogChannel, getLogChannel, deleteLogChannel } from '../database.js';
import { hasPermission, Perms } from '../utils/permissions.js';

function successEmbed(t: string, d: string) {
  return new EmbedBuilder().setColor(COLORS.success).setTitle(`✅ ${t}`).setDescription(d).setTimestamp();
}
function errorEmbed(t: string, d: string) {
  return new EmbedBuilder().setColor(COLORS.error).setTitle(`❌ ${t}`).setDescription(d).setTimestamp();
}

const LOG_TYPES: Record<string, string> = {
  joinleave: '📥 Join/Leave',
  antinuke: '🛡️ Antinuke',
  automod: '🤖 Automod',
  vclog: '🎙️ Voice Channel',
  rolelog: '🎭 Role',
  memberslog: '👥 Members',
  messagelog: '💬 Message',
};

const logCommands: BotCommand[] = [
  {
    name: 'setlog',
    description: 'Set a log channel for a specific log type',
    category: 'Logs',
    usage: 'setlog <type> [#channel]',
    aliases: ['logset', 'setuplog'],
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ManageGuild))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Server** permission.')] });
      const type = args[0]?.toLowerCase();
      if (!type || !LOG_TYPES[type]) {
        const list = Object.entries(LOG_TYPES).map(([k, v]) => `\`${k}\` — ${v}`).join('\n');
        return message.reply({ embeds: [new EmbedBuilder().setColor(COLORS.info).setTitle('📋 Log Types').setDescription(`Available log types:\n\n${list}`).setTimestamp()] });
      }
      const channel = message.mentions.channels.first() ?? message.channel;
      setLogChannel(message.guild!.id, type, channel.id);
      await message.reply({ embeds: [successEmbed('Log Channel Set', `${LOG_TYPES[type]} logs → <#${channel.id}>.`)] });
    }
  },
  {
    name: 'viewlogs',
    description: 'View current log channel configurations',
    category: 'Logs',
    usage: 'viewlogs',
    aliases: ['logchannels', 'logs'],
    async execute(message) {
      if (!hasPermission(message.member!, Perms.ManageGuild))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Server** permission.')] });
      const fields = Object.entries(LOG_TYPES).map(([key, label]) => ({
        name: label, value: (() => { const c = getLogChannel(message.guild!.id, key); return c ? `<#${c}>` : 'Not set'; })(), inline: true
      }));
      await message.reply({ embeds: [new EmbedBuilder().setColor(COLORS.primary).setTitle('📋 Log Configuration').addFields(fields).setTimestamp()] });
    }
  },
  {
    name: 'disablelog',
    description: 'Disable a specific log type',
    category: 'Logs',
    usage: 'disablelog <type>',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ManageGuild))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Server** permission.')] });
      const type = args[0]?.toLowerCase();
      if (!type || !LOG_TYPES[type])
        return message.reply({ embeds: [errorEmbed('Invalid Type', `Valid types: ${Object.keys(LOG_TYPES).join(', ')}`)] });
      deleteLogChannel(message.guild!.id, type);
      await message.reply({ embeds: [successEmbed('Log Disabled', `${LOG_TYPES[type]} logs have been disabled.`)] });
    }
  },
];

export default logCommands;
