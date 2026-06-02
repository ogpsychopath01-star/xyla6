import { EmbedBuilder, PermissionFlagsBits, TextChannel, ChannelType } from 'discord.js';
import { BotCommand } from '../client.js';
import { COLORS, BOT_FOOTER } from '../utils/embeds.js';
import { hasPermission, Perms, canModerate } from '../utils/permissions.js';
import {
  getJailSetting, setJailSetting, updateJailSetting,
  getJailedUser, setJailedUser, removeJailedUser, getAllJailedUsers,
} from '../database.js';
import { sendLog } from '../utils/helpers.js';

function successEmbed(t: string, d: string) {
  return new EmbedBuilder().setColor(COLORS.success).setTitle(`✅ ${t}`).setDescription(d).setFooter(BOT_FOOTER).setTimestamp();
}
function errorEmbed(t: string, d: string) {
  return new EmbedBuilder().setColor(COLORS.error).setTitle(`❌ ${t}`).setDescription(d).setFooter(BOT_FOOTER).setTimestamp();
}

// Lock all channels for a jailed member — deny everything except in the jail channel
async function lockChannelsForJail(
  guild: import('discord.js').Guild,
  userId: string,
  jailChannelId: string,
): Promise<void> {
  const lockable = guild.channels.cache.filter(c =>
    c.type === ChannelType.GuildText ||
    c.type === ChannelType.GuildVoice ||
    c.type === ChannelType.GuildAnnouncement ||
    c.type === ChannelType.GuildForum ||
    c.type === ChannelType.GuildStageVoice,
  );

  for (const [, channel] of lockable) {
    try {
      if (channel.id === jailChannelId) {
        // Jail channel: explicitly ALLOW the jailed member to view and talk
        await channel.permissionOverwrites.edit(userId, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
        });
      } else {
        // Every other channel: deny view, send, and connect
        await channel.permissionOverwrites.edit(userId, {
          ViewChannel: false,
          SendMessages: false,
          Connect: false,
        });
      }
    } catch {
      // Skip channels where bot lacks ManageRoles / ManageChannels
    }
  }
}

// Remove all jail-related channel overwrites when unjailing
async function unlockChannelsAfterJail(
  guild: import('discord.js').Guild,
  userId: string,
): Promise<void> {
  const lockable = guild.channels.cache.filter(c =>
    c.type === ChannelType.GuildText ||
    c.type === ChannelType.GuildVoice ||
    c.type === ChannelType.GuildAnnouncement ||
    c.type === ChannelType.GuildForum ||
    c.type === ChannelType.GuildStageVoice,
  );

  for (const [, channel] of lockable) {
    try {
      const overwrite = channel.permissionOverwrites.cache.get(userId);
      if (overwrite) {
        await overwrite.delete('Unjail — removing channel restrictions');
      }
    } catch {
      // Skip if no permission
    }
  }
}

const jailCommands: BotCommand[] = [

  // ── JAIL SETUP ────────────────────────────────────────────────────────────
  {
    name: 'jailsetup',
    description: 'Setup the jail system — set the jail channel and role',
    category: 'Moderation',
    usage: 'jailsetup <#channel> <@role>',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ManageGuild))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Server** permission.')] });

      const channel = message.mentions.channels.first() as TextChannel | undefined;
      const role = message.mentions.roles.first();

      if (!channel || !role)
        return message.reply({ embeds: [errorEmbed('Usage', '`!jailsetup <#jail-channel> <@jail-role>`\n\nExample: `!jailsetup #jail @Jailed`\n\n**Setup checklist:**\n• Create a `#jail` channel\n• Create a `Jailed` role\n• Run `!jailsetup #jail @Jailed`\n• The bot will **automatically** lock/unlock channels when jailing/unjailing')] });

      setJailSetting(message.guild!.id, { channel_id: channel.id, role_id: role.id, enabled: true });

      await message.reply({ embeds: [new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle('⛓️ Jail System Setup')
        .setDescription('The jail system has been configured and **enabled**.')
        .addFields(
          { name: '🔒 Jail Channel', value: `<#${channel.id}>`, inline: true },
          { name: '🏷️ Jail Role', value: `<@&${role.id}>`, inline: true },
          { name: '📋 How it works', value: 'When a member is jailed:\n• All their roles are removed\n• The Jail role is given\n• **All channels are automatically locked** — they can only see/talk in the jail channel\n\nUse `!unjail @user` to restore their roles and full channel access.', inline: false },
        )
        .setFooter(BOT_FOOTER)
        .setTimestamp()
      ] });
    }
  },

  // ── JAIL ENABLE / DISABLE ─────────────────────────────────────────────────
  {
    name: 'jailenable',
    description: 'Enable the jail system',
    category: 'Moderation',
    usage: 'jailenable',
    async execute(message) {
      if (!hasPermission(message.member!, Perms.ManageGuild))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Server** permission.')] });
      const setting = getJailSetting(message.guild!.id);
      if (!setting) return message.reply({ embeds: [errorEmbed('Not Setup', 'Run `!jailsetup #channel @role` first.')] });
      updateJailSetting(message.guild!.id, { enabled: true });
      await message.reply({ embeds: [successEmbed('Jail Enabled', '⛓️ The jail system is now **enabled**.')] });
    }
  },

  {
    name: 'jaildisable',
    description: 'Disable the jail system',
    category: 'Moderation',
    usage: 'jaildisable',
    async execute(message) {
      if (!hasPermission(message.member!, Perms.ManageGuild))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Server** permission.')] });
      const setting = getJailSetting(message.guild!.id);
      if (!setting) return message.reply({ embeds: [errorEmbed('Not Setup', 'Run `!jailsetup #channel @role` first.')] });
      updateJailSetting(message.guild!.id, { enabled: false });
      await message.reply({ embeds: [successEmbed('Jail Disabled', '🔓 The jail system is now **disabled**.')] });
    }
  },

  // ── JAIL ──────────────────────────────────────────────────────────────────
  {
    name: 'jail',
    description: 'Jail a member — removes roles, gives jail role, and auto-locks all channels except jail',
    category: 'Moderation',
    usage: 'jail <@user> [reason]',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ManageRoles))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Roles** permission.')] });

      const setting = getJailSetting(message.guild!.id);
      if (!setting) return message.reply({ embeds: [errorEmbed('Not Setup', 'Run `!jailsetup #channel @role` first.')] });
      if (!setting.enabled) return message.reply({ embeds: [errorEmbed('Jail Disabled', 'The jail system is disabled. Use `!jailenable` to enable it.')] });

      const target = message.mentions.members?.first();
      if (!target) return message.reply({ embeds: [errorEmbed('Missing User', 'Mention the member to jail.')] });
      if (!canModerate(message.member!, target))
        return message.reply({ embeds: [errorEmbed('Hierarchy Error', 'You cannot jail this member — they are above you in the role hierarchy.')] });
      if (target.id === message.author.id)
        return message.reply({ embeds: [errorEmbed('Self-Jail', 'You cannot jail yourself.')] });

      if (getJailedUser(message.guild!.id, target.id))
        return message.reply({ embeds: [errorEmbed('Already Jailed', `<@${target.id}> is already jailed. Use \`!unjail\` to release them first.`)] });

      const jailRole = message.guild!.roles.cache.get(setting.role_id);
      if (!jailRole) return message.reply({ embeds: [errorEmbed('Role Not Found', 'The configured jail role no longer exists. Run `!jailsetup` again.')] });

      const reason = args.slice(1).join(' ') || 'No reason provided';

      // Save all current roles (excluding @everyone and managed roles)
      const savedRoles = target.roles.cache
        .filter(r => r.id !== message.guild!.id && !r.managed)
        .map(r => r.id);

      // Remove all roles, then give jail role
      try {
        await target.roles.set([jailRole], `Jailed by ${message.author.tag}: ${reason}`);
      } catch {
        return message.reply({ embeds: [errorEmbed('Failed', 'Could not modify roles. Make sure the Jail role is below the bot\'s highest role.')] });
      }

      setJailedUser(message.guild!.id, target.id, {
        guild_id: message.guild!.id,
        user_id: target.id,
        roles: savedRoles,
        jailed_by: message.author.id,
        reason,
        jailed_at: Date.now(),
      });

      // Reply immediately so mod sees confirmation
      await message.reply({ embeds: [new EmbedBuilder()
        .setColor(COLORS.error)
        .setTitle('⛓️ Member Jailed')
        .addFields(
          { name: '👤 Member', value: `<@${target.id}> (\`${target.user.tag}\`)`, inline: true },
          { name: '👮 Moderator', value: `<@${message.author.id}>`, inline: true },
          { name: '📝 Reason', value: reason, inline: false },
          { name: '💾 Roles Saved', value: `${savedRoles.length} role(s) saved and will be restored on unjail`, inline: false },
          { name: '🔒 Channel Lock', value: 'Applying channel restrictions — jailed member can only see the jail channel.', inline: false },
        )
        .setFooter(BOT_FOOTER)
        .setTimestamp()
      ] });

      // Lock all channels for the jailed member
      await lockChannelsForJail(message.guild!, target.id, setting.channel_id);

      // DM the user
      try {
        await target.send({ embeds: [new EmbedBuilder()
          .setColor(COLORS.error)
          .setTitle('⛓️ You Have Been Jailed')
          .setDescription(`You have been **jailed** in **${message.guild!.name}**.\n\n**Reason:** ${reason}\n**Moderator:** ${message.author.tag}\n\nYou can only see the jail channel. Contact staff there if you have questions.`)
          .setFooter(BOT_FOOTER)
          .setTimestamp()
        ] });
      } catch {}

      await sendLog(message.client, message.guild!.id, 'memberslog', new EmbedBuilder()
        .setColor(COLORS.error)
        .setTitle('⛓️ Member Jailed')
        .addFields(
          { name: 'User', value: `<@${target.id}> (\`${target.id}\`)`, inline: true },
          { name: 'Moderator', value: `<@${message.author.id}>`, inline: true },
          { name: 'Reason', value: reason, inline: false },
          { name: 'Roles Saved', value: savedRoles.length > 0 ? savedRoles.map(r => `<@&${r}>`).join(', ').slice(0, 800) : 'None', inline: false },
        )
        .setFooter(BOT_FOOTER)
        .setTimestamp()
      );
    }
  },

  // ── UNJAIL ────────────────────────────────────────────────────────────────
  {
    name: 'unjail',
    description: 'Release a jailed member — restores roles and unlocks all channels',
    category: 'Moderation',
    usage: 'unjail <@user> [reason]',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ManageRoles))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Roles** permission.')] });

      const setting = getJailSetting(message.guild!.id);
      if (!setting) return message.reply({ embeds: [errorEmbed('Not Setup', 'Run `!jailsetup #channel @role` first.')] });

      const target = message.mentions.members?.first();
      if (!target) return message.reply({ embeds: [errorEmbed('Missing User', 'Mention the member to unjail.')] });

      const jailData = getJailedUser(message.guild!.id, target.id);
      if (!jailData) return message.reply({ embeds: [errorEmbed('Not Jailed', `<@${target.id}> is not currently jailed.`)] });

      const reason = args.slice(1).join(' ') || 'Released from jail';

      // Restore saved roles
      const rolesToRestore = jailData.roles.filter(rId => message.guild!.roles.cache.has(rId));
      try {
        await target.roles.set(rolesToRestore, `Unjailed by ${message.author.tag}: ${reason}`);
      } catch {
        await message.reply({ embeds: [errorEmbed('Partial Failure', 'Could not fully restore roles — some may have been deleted. Removing jail role only.')] });
        try { await target.roles.remove(setting.role_id).catch(() => {}); } catch {}
      }

      removeJailedUser(message.guild!.id, target.id);

      // Reply immediately
      await message.reply({ embeds: [new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle('🔓 Member Released')
        .addFields(
          { name: '👤 Member', value: `<@${target.id}> (\`${target.user.tag}\`)`, inline: true },
          { name: '👮 Moderator', value: `<@${message.author.id}>`, inline: true },
          { name: '📝 Reason', value: reason, inline: false },
          { name: '♻️ Roles Restored', value: `${rolesToRestore.length} role(s) restored`, inline: false },
          { name: '🔓 Channel Unlock', value: 'Removing all channel restrictions — full access restored.', inline: false },
        )
        .setFooter(BOT_FOOTER)
        .setTimestamp()
      ] });

      // Remove all jail-related channel overwrites
      await unlockChannelsAfterJail(message.guild!, target.id);

      // DM
      try {
        await target.send({ embeds: [new EmbedBuilder()
          .setColor(COLORS.success)
          .setTitle('🔓 You Have Been Released')
          .setDescription(`You have been **unjailed** in **${message.guild!.name}**.\n\n**Reason:** ${reason}\n**Moderator:** ${message.author.tag}\n\nYour roles and full channel access have been restored.`)
          .setFooter(BOT_FOOTER)
          .setTimestamp()
        ] });
      } catch {}

      await sendLog(message.client, message.guild!.id, 'memberslog', new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle('🔓 Member Unjailed')
        .addFields(
          { name: 'User', value: `<@${target.id}> (\`${target.id}\`)`, inline: true },
          { name: 'Moderator', value: `<@${message.author.id}>`, inline: true },
          { name: 'Reason', value: reason, inline: false },
        )
        .setFooter(BOT_FOOTER)
        .setTimestamp()
      );
    }
  },

  // ── JAILED LIST ───────────────────────────────────────────────────────────
  {
    name: 'jailed',
    description: 'List all currently jailed members',
    category: 'Moderation',
    usage: 'jailed',
    aliases: ['jaillist', 'jails'],
    async execute(message) {
      if (!hasPermission(message.member!, Perms.ManageRoles))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Roles** permission.')] });

      const list = getAllJailedUsers(message.guild!.id);
      if (!list.length) return message.reply({ embeds: [new EmbedBuilder()
        .setColor(COLORS.info)
        .setTitle('⛓️ Jailed Members')
        .setDescription('No members are currently jailed.')
        .setFooter(BOT_FOOTER)
        .setTimestamp()
      ] });

      const formatted = list.map((j, i) =>
        `${i + 1}. <@${j.user_id}> — Jailed by <@${j.jailed_by}> • <t:${Math.floor(j.jailed_at / 1000)}:R>\n   **Reason:** ${j.reason}`
      ).join('\n\n');

      await message.reply({ embeds: [new EmbedBuilder()
        .setColor(COLORS.warning)
        .setTitle(`⛓️ Jailed Members — ${list.length}`)
        .setDescription(formatted.slice(0, 4000))
        .setFooter(BOT_FOOTER)
        .setTimestamp()
      ] });
    }
  },

  // ── JAIL STATUS ───────────────────────────────────────────────────────────
  {
    name: 'jailstatus',
    description: 'Check the jail system configuration',
    category: 'Moderation',
    usage: 'jailstatus',
    aliases: ['jailconfig', 'jailinfo'],
    async execute(message) {
      if (!hasPermission(message.member!, Perms.ManageRoles))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Roles** permission.')] });
      const setting = getJailSetting(message.guild!.id);
      if (!setting) return message.reply({ embeds: [new EmbedBuilder()
        .setColor(COLORS.warning)
        .setTitle('⛓️ Jail Not Configured')
        .setDescription('Run `!jailsetup <#channel> <@role>` to set up the jail system.')
        .setFooter(BOT_FOOTER)
        .setTimestamp()
      ] });

      const jailedCount = getAllJailedUsers(message.guild!.id).length;
      await message.reply({ embeds: [new EmbedBuilder()
        .setColor(setting.enabled ? COLORS.success : COLORS.error)
        .setTitle('⛓️ Jail System')
        .addFields(
          { name: 'Status', value: setting.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
          { name: 'Currently Jailed', value: `${jailedCount} member(s)`, inline: true },
          { name: '🔒 Jail Channel', value: `<#${setting.channel_id}>`, inline: true },
          { name: '🏷️ Jail Role', value: `<@&${setting.role_id}>`, inline: true },
          { name: '🔐 Channel Lock', value: 'Auto-locks all channels on jail, removes restrictions on unjail', inline: false },
        )
        .setFooter(BOT_FOOTER)
        .setTimestamp()
      ] });
    }
  },
];

export default jailCommands;
