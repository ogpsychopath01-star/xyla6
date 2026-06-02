import { EmbedBuilder } from 'discord.js';
import { BotCommand } from '../client.js';
import { COLORS, BOT_FOOTER } from '../utils/embeds.js';
import {
  setAutomodSetting, getAutomodSetting,
  getAutomodWhitelist, addAutomodWhitelist, removeAutomodWhitelist,
  getLogChannel, setLogChannel, deleteLogChannel,
} from '../database.js';
import { hasPermission, Perms } from '../utils/permissions.js';

function successEmbed(t: string, d: string) {
  return new EmbedBuilder().setColor(COLORS.success).setTitle(`✅ ${t}`).setDescription(d).setFooter(BOT_FOOTER).setTimestamp();
}
function errorEmbed(t: string, d: string) {
  return new EmbedBuilder().setColor(COLORS.error).setTitle(`❌ ${t}`).setDescription(d).setFooter(BOT_FOOTER).setTimestamp();
}

const AUTOMOD_FEATURES: Record<string, string> = {
  antilink: '🔗 Anti-Link',
  antiraid: '🛡️ Anti-Raid',
  antispam: '🚫 Anti-Spam',
  regprotect: '📅 Registration Date Protection',
  antibot: '🤖 Anti-Bot Add',
  antirolead: '🎭 Anti-Role Add',
};

const PUNISHMENTS = ['warn', 'timeout', 'kick', 'ban'];

const automodCommands: BotCommand[] = [

  // ── AUTOMOD ENABLE/DISABLE ────────────────────────────────────────────────
  {
    name: 'automod',
    description: 'Enable or disable automod features',
    category: 'Automod',
    usage: 'automod <feature> <enable|disable> [punishment]',
    aliases: ['amod'],
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ManageGuild))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Server** permission.')] });

      const feature = args[0]?.toLowerCase();
      const action = args[1]?.toLowerCase();

      if (!feature) {
        const status = Object.entries(AUTOMOD_FEATURES).map(([k, v]) => {
          const s = getAutomodSetting(message.guild!.id, k);
          return `${v}: ${s?.enabled ? `✅ Enabled (${s.punishment})` : '❌ Disabled'}`;
        }).join('\n');

        const whitelist = getAutomodWhitelist(message.guild!.id);
        const whitelistStr = whitelist.length > 0 ? whitelist.map(id => `<#${id}>`).join(', ') : 'None';
        const automodLog = getLogChannel(message.guild!.id, 'automodlog');

        return message.reply({ embeds: [new EmbedBuilder()
          .setColor(COLORS.info)
          .setTitle('🤖 Automod Status')
          .setDescription(status)
          .addFields(
            { name: '📋 Whitelisted Channels', value: whitelistStr, inline: false },
            { name: '📋 Automod Log', value: automodLog ? `<#${automodLog}>` : 'Not set', inline: false },
            { name: '💡 Usage', value: '`!automod <feature> <enable|disable> [punishment]`\n**Features:** ' + Object.keys(AUTOMOD_FEATURES).join(', ') + '\n**Punishments:** warn, timeout, kick, ban', inline: false },
          )
          .setFooter(BOT_FOOTER)
          .setTimestamp()
        ] });
      }

      if (!AUTOMOD_FEATURES[feature])
        return message.reply({ embeds: [errorEmbed('Invalid Feature', `Valid features:\n${Object.keys(AUTOMOD_FEATURES).map(k => `• \`${k}\``).join('\n')}`)] });

      if (!action || !['enable', 'disable'].includes(action))
        return message.reply({ embeds: [errorEmbed('Invalid Action', 'Use `enable` or `disable`.')] });

      const punishment = args[2]?.toLowerCase() ?? 'warn';
      if (action === 'enable' && !PUNISHMENTS.includes(punishment))
        return message.reply({ embeds: [errorEmbed('Invalid Punishment', `Valid: ${PUNISHMENTS.join(', ')}`)] });

      const extra = feature === 'regprotect' ? (args[3] ?? '7') : '';
      setAutomodSetting(message.guild!.id, feature, action === 'enable', punishment, extra);

      await message.reply({ embeds: [successEmbed('Automod Updated',
        `${AUTOMOD_FEATURES[feature]} has been **${action}d**.` +
        (action === 'enable' ? `\n**Punishment:** ${punishment}${feature === 'regprotect' ? `\n**Min account age:** ${extra || 7} days` : ''}` : '')
      )] });
    }
  },

  // ── AUTOMOD ALL ENABLE ────────────────────────────────────────────────────
  {
    name: 'automodon',
    description: 'Enable all automod features at once',
    category: 'Automod',
    usage: 'automodon [punishment]',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ManageGuild))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Server** permission.')] });
      const punishment = args[0]?.toLowerCase() ?? 'warn';
      if (!PUNISHMENTS.includes(punishment))
        return message.reply({ embeds: [errorEmbed('Invalid Punishment', `Valid: ${PUNISHMENTS.join(', ')}`)] });
      for (const feature of Object.keys(AUTOMOD_FEATURES)) {
        setAutomodSetting(message.guild!.id, feature, true, punishment);
      }
      await message.reply({ embeds: [successEmbed('All Automod Enabled', `All features enabled with **${punishment}** punishment.`)] });
    }
  },

  // ── AUTOMOD ALL DISABLE ───────────────────────────────────────────────────
  {
    name: 'automodoff',
    description: 'Disable all automod features at once',
    category: 'Automod',
    usage: 'automodoff',
    async execute(message) {
      if (!hasPermission(message.member!, Perms.ManageGuild))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Server** permission.')] });
      for (const feature of Object.keys(AUTOMOD_FEATURES)) {
        setAutomodSetting(message.guild!.id, feature, false);
      }
      await message.reply({ embeds: [successEmbed('All Automod Disabled', 'All automod features have been disabled.')] });
    }
  },

  // ── AUTOMOD WHITELIST (BYPASS) ────────────────────────────────────────────
  {
    name: 'automodbypass',
    description: 'Whitelist channels from automod — useful for link-sharing, banners, promotions, etc.',
    category: 'Automod',
    usage: 'automodbypass <add|remove|list> [#channel]',
    aliases: ['automodwhitelist', 'amodbypass', 'amodwhitelist', 'automodexempt'],
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ManageGuild))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Server** permission.')] });

      const sub = args[0]?.toLowerCase();
      const channel = message.mentions.channels.first() ?? message.channel;

      if (sub === 'add') {
        addAutomodWhitelist(message.guild!.id, channel.id);
        await message.reply({ embeds: [successEmbed('Channel Whitelisted',
          `<#${channel.id}> is now **exempt from all automod rules**.\n\nLinks, invites, and other content are allowed freely in this channel.`
        )] });

      } else if (sub === 'remove' || sub === 'delete') {
        removeAutomodWhitelist(message.guild!.id, channel.id);
        await message.reply({ embeds: [successEmbed('Channel Removed', `<#${channel.id}> has been removed from the automod whitelist.\nAutomod rules now apply in this channel.`)] });

      } else if (sub === 'list' || sub === 'show') {
        const whitelist = getAutomodWhitelist(message.guild!.id);
        await message.reply({ embeds: [new EmbedBuilder()
          .setColor(COLORS.info)
          .setTitle('📋 Automod Whitelist')
          .setDescription(whitelist.length > 0
            ? `${whitelist.length} channel(s) are exempt from automod:\n${whitelist.map(id => `• <#${id}>`).join('\n')}`
            : 'No channels are whitelisted. Use `!automodbypass add #channel` to add one.'
          )
          .setFooter(BOT_FOOTER)
          .setTimestamp()
        ] });

      } else {
        await message.reply({ embeds: [new EmbedBuilder()
          .setColor(COLORS.info)
          .setTitle('📋 Automod Bypass (Whitelist)')
          .setDescription('Whitelist specific channels so automod does not apply there.\n\nPerfect for:\n• Server promotion channels\n• Banner/art sharing channels\n• Social media link channels')
          .addFields(
            { name: 'Add Channel', value: '`!automodbypass add [#channel]`', inline: false },
            { name: 'Remove Channel', value: '`!automodbypass remove [#channel]`', inline: false },
            { name: 'List All', value: '`!automodbypass list`', inline: false },
          )
          .setFooter(BOT_FOOTER)
          .setTimestamp()
        ] });
      }
    }
  },

  // ── AUTOMOD LOG CHANNEL ───────────────────────────────────────────────────
  {
    name: 'automodlog',
    description: 'Set a dedicated log channel for automod punishments',
    category: 'Automod',
    usage: 'automodlog <#channel|off>',
    aliases: ['automodlogchannel', 'amodlog'],
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ManageGuild))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Server** permission.')] });

      if (args[0]?.toLowerCase() === 'off' || args[0]?.toLowerCase() === 'disable') {
        deleteLogChannel(message.guild!.id, 'automodlog');
        return message.reply({ embeds: [successEmbed('Automod Log Disabled', 'The automod log channel has been removed.')] });
      }

      const channel = message.mentions.channels.first();
      if (!channel) return message.reply({ embeds: [errorEmbed('Missing Channel', 'Mention a channel or use `off` to disable.\nExample: `!automodlog #automod-logs`')] });

      setLogChannel(message.guild!.id, 'automodlog', channel.id);
      await message.reply({ embeds: [successEmbed('Automod Log Set',
        `All automod actions (punishments) will now be logged in <#${channel.id}>.\n\nThis includes: anti-link, anti-spam, reg-protect, and all other automod triggers.`
      )] });
    }
  },
];

export default automodCommands;
export { AUTOMOD_FEATURES, PUNISHMENTS };
