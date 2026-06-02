import { EmbedBuilder } from 'discord.js';
import { BotCommand } from '../client.js';
import { COLORS, BOT_FOOTER } from '../utils/embeds.js';
import {
  isUserWhitelisted, addUserWhitelist, removeUserWhitelist,
  getUserWhitelistPerms, getGuildWhitelistMap,
  getWhitelistPunishment, setWhitelistPunishment,
  addWhitelistLog, getWhitelistLog,
} from '../database.js';
import { isBotOwner, hasPermission, Perms } from '../utils/permissions.js';
import { WHITELIST_PERMS } from '../utils/whitelist.js';
import { sendLog } from '../utils/helpers.js';

function successEmbed(t: string, d: string) {
  return new EmbedBuilder().setColor(COLORS.success).setTitle(`✅ ${t}`).setDescription(d).setFooter(BOT_FOOTER).setTimestamp();
}
function errorEmbed(t: string, d: string) {
  return new EmbedBuilder().setColor(COLORS.error).setTitle(`❌ ${t}`).setDescription(d).setFooter(BOT_FOOTER).setTimestamp();
}
function infoEmbed(t: string, d: string) {
  return new EmbedBuilder().setColor(COLORS.info).setTitle(`💠 ${t}`).setDescription(d).setFooter(BOT_FOOTER).setTimestamp();
}
function auditEmbed(title: string, fields: { name: string; value: string; inline?: boolean }[]) {
  return new EmbedBuilder()
    .setColor(0x2ECC71)
    .setTitle(`🔐 ${title}`)
    .addFields(fields)
    .setFooter(BOT_FOOTER)
    .setTimestamp();
}

function canManageWhitelist(message: any): boolean {
  return isBotOwner(message.author.id) || hasPermission(message.member!, Perms.Administrator);
}

const ALL_PERMS_LABEL = WHITELIST_PERMS.join(', ');

function actionLabel(action: string): string {
  if (action === 'grant') return '✅ Granted';
  if (action === 'revoke') return '❌ Revoked';
  return '⚙️ Punishment Changed';
}

const whitelistCommands: BotCommand[] = [

  // ── WHITELIST (specific perm or all) ──────────────────────────────────────
  {
    name: 'whitelist',
    description: '[Admin] Whitelist a user for a specific moderation permission',
    category: 'Whitelist',
    aliases: ['wl'],
    usage: 'whitelist <@user> <permission|all>',
    async execute(message, args) {
      if (!canManageWhitelist(message))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Administrator** permission (or be the bot owner) to manage the whitelist.')] });

      const target = message.mentions.members?.first();
      if (!target) return message.reply({ embeds: [errorEmbed('Missing User', 'Mention a member to whitelist.')] });

      const perm = args[1]?.toLowerCase();
      if (!perm) return message.reply({ embeds: [errorEmbed('Missing Permission', `Provide a permission to whitelist.\n**Available:** ${ALL_PERMS_LABEL}, **all**`)] });
      if (perm !== 'all' && !(WHITELIST_PERMS as readonly string[]).includes(perm))
        return message.reply({ embeds: [errorEmbed('Invalid Permission', `**Available permissions:**\n\`${ALL_PERMS_LABEL}\`, \`all\``)] });

      if (perm === 'all') {
        for (const p of WHITELIST_PERMS) addUserWhitelist(message.guild!.id, target.id, p);
        addWhitelistLog(message.guild!.id, {
          action: 'grant',
          by_id: message.author.id,
          by_tag: message.author.tag,
          target_id: target.id,
          target_tag: target.user.tag,
          perms: [...WHITELIST_PERMS],
          timestamp: Date.now(),
        });
        await message.reply({ embeds: [successEmbed('Whitelisted (All)', `<@${target.id}> has been whitelisted for **all** moderation actions.`)] });
        await sendLog(message.client, message.guild!.id, 'members_log', auditEmbed('Whitelist — All Granted', [
          { name: 'Member', value: `<@${target.id}> (${target.user.tag})`, inline: true },
          { name: 'By', value: `<@${message.author.id}> (${message.author.tag})`, inline: true },
          { name: 'Permissions', value: `\`${ALL_PERMS_LABEL}\``, inline: false },
        ]));
      } else {
        addUserWhitelist(message.guild!.id, target.id, perm);
        addWhitelistLog(message.guild!.id, {
          action: 'grant',
          by_id: message.author.id,
          by_tag: message.author.tag,
          target_id: target.id,
          target_tag: target.user.tag,
          perms: [perm],
          timestamp: Date.now(),
        });
        await message.reply({ embeds: [successEmbed('Whitelisted', `<@${target.id}> has been whitelisted for the \`${perm}\` action.`)] });
        await sendLog(message.client, message.guild!.id, 'members_log', auditEmbed('Whitelist — Permission Granted', [
          { name: 'Member', value: `<@${target.id}> (${target.user.tag})`, inline: true },
          { name: 'By', value: `<@${message.author.id}> (${message.author.tag})`, inline: true },
          { name: 'Permission', value: `\`${perm}\``, inline: true },
        ]));
      }
    }
  },

  // ── WHITELIST ALL ─────────────────────────────────────────────────────────
  {
    name: 'whitelistall',
    description: '[Admin] Whitelist a user for ALL moderation permissions at once',
    category: 'Whitelist',
    aliases: ['wlall'],
    usage: 'whitelistall <@user>',
    async execute(message, args) {
      if (!canManageWhitelist(message))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Administrator** permission to manage the whitelist.')] });

      const target = message.mentions.members?.first();
      if (!target) return message.reply({ embeds: [errorEmbed('Missing User', 'Mention a member to whitelist for all actions.')] });

      for (const p of WHITELIST_PERMS) addUserWhitelist(message.guild!.id, target.id, p);
      addWhitelistLog(message.guild!.id, {
        action: 'grant',
        by_id: message.author.id,
        by_tag: message.author.tag,
        target_id: target.id,
        target_tag: target.user.tag,
        perms: [...WHITELIST_PERMS],
        timestamp: Date.now(),
      });

      await message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.success)
            .setTitle('✅ Whitelisted — All Permissions')
            .setDescription(`<@${target.id}> can now use **all** moderation actions without restriction.`)
            .addFields({ name: 'Permissions Granted', value: `\`${ALL_PERMS_LABEL}\`` })
            .setFooter(BOT_FOOTER)
            .setTimestamp()
        ]
      });
      await sendLog(message.client, message.guild!.id, 'members_log', auditEmbed('Whitelist — Full Access Granted', [
        { name: 'Member', value: `<@${target.id}> (${target.user.tag})`, inline: true },
        { name: 'By', value: `<@${message.author.id}> (${message.author.tag})`, inline: true },
        { name: 'Access', value: '**ALL** moderation permissions', inline: false },
      ]));
    }
  },

  // ── UNWHITELIST ───────────────────────────────────────────────────────────
  {
    name: 'unwhitelist',
    description: '[Admin] Remove a user from the whitelist (all or a specific permission)',
    category: 'Whitelist',
    aliases: ['unwl', 'removewl'],
    usage: 'unwhitelist <@user> [permission]',
    async execute(message, args) {
      if (!canManageWhitelist(message))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Administrator** permission to manage the whitelist.')] });

      const target = message.mentions.members?.first();
      if (!target) return message.reply({ embeds: [errorEmbed('Missing User', 'Mention a member to remove from whitelist.')] });

      const perm = args[1]?.toLowerCase();

      if (!perm || perm === 'all') {
        const hadPerms = getUserWhitelistPerms(message.guild!.id, target.id);
        removeUserWhitelist(message.guild!.id, target.id);
        addWhitelistLog(message.guild!.id, {
          action: 'revoke',
          by_id: message.author.id,
          by_tag: message.author.tag,
          target_id: target.id,
          target_tag: target.user.tag,
          perms: hadPerms,
          timestamp: Date.now(),
        });
        await message.reply({ embeds: [successEmbed('Unwhitelisted', `<@${target.id}> has been removed from the whitelist for **all** permissions.`)] });
        await sendLog(message.client, message.guild!.id, 'members_log', auditEmbed('Whitelist — All Permissions Revoked', [
          { name: 'Member', value: `<@${target.id}> (${target.user.tag})`, inline: true },
          { name: 'By', value: `<@${message.author.id}> (${message.author.tag})`, inline: true },
          { name: 'Removed Perms', value: hadPerms.length ? `\`${hadPerms.join(', ')}\`` : '*None*', inline: false },
        ]));
      } else {
        if (!(WHITELIST_PERMS as readonly string[]).includes(perm))
          return message.reply({ embeds: [errorEmbed('Invalid Permission', `**Available permissions:**\n\`${ALL_PERMS_LABEL}\``)] });
        removeUserWhitelist(message.guild!.id, target.id, perm);
        addWhitelistLog(message.guild!.id, {
          action: 'revoke',
          by_id: message.author.id,
          by_tag: message.author.tag,
          target_id: target.id,
          target_tag: target.user.tag,
          perms: [perm],
          timestamp: Date.now(),
        });
        await message.reply({ embeds: [successEmbed('Unwhitelisted', `<@${target.id}> has been removed from the whitelist for \`${perm}\`.`)] });
        await sendLog(message.client, message.guild!.id, 'members_log', auditEmbed('Whitelist — Permission Revoked', [
          { name: 'Member', value: `<@${target.id}> (${target.user.tag})`, inline: true },
          { name: 'By', value: `<@${message.author.id}> (${message.author.tag})`, inline: true },
          { name: 'Permission Removed', value: `\`${perm}\``, inline: true },
        ]));
      }
    }
  },

  // ── WHITELIST CHECK ───────────────────────────────────────────────────────
  {
    name: 'whitelistcheck',
    description: 'Check whitelist status of a user',
    category: 'Whitelist',
    aliases: ['wlcheck', 'wlstatus', 'whiteliststatus'],
    usage: 'whitelistcheck <@user>',
    async execute(message, args) {
      const target = message.mentions.members?.first() ?? message.member!;
      const perms = getUserWhitelistPerms(message.guild!.id, target.id);

      if (!perms.length) {
        return message.reply({ embeds: [infoEmbed('Whitelist Status', `<@${target.id}> is **not whitelisted** for any moderation actions.`)] });
      }

      const hasAll = WHITELIST_PERMS.every(p => perms.includes(p));
      await message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.primary)
            .setTitle('🔐 Whitelist Status')
            .setDescription(`<@${target.id}> is whitelisted for the following actions:`)
            .addFields(
              { name: hasAll ? '✅ All Permissions' : '✅ Whitelisted Perms', value: `\`${perms.join(', ')}\``, inline: false },
              { name: '❌ Not Whitelisted', value: hasAll ? '*None*' : `\`${WHITELIST_PERMS.filter(p => !perms.includes(p)).join(', ') || 'None'}\``, inline: false },
            )
            .setFooter(BOT_FOOTER)
            .setTimestamp()
        ]
      });
    }
  },

  // ── WHITELIST LIST ────────────────────────────────────────────────────────
  {
    name: 'whitelistlist',
    description: '[Admin] Show all whitelisted users in this server',
    category: 'Whitelist',
    aliases: ['wllist', 'whitelists'],
    usage: 'whitelistlist',
    async execute(message) {
      if (!canManageWhitelist(message))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Administrator** permission to view the whitelist.')] });

      const wl = getGuildWhitelistMap(message.guild!.id);
      const entries = Object.entries(wl).filter(([, perms]) => perms.length > 0);

      if (!entries.length)
        return message.reply({ embeds: [infoEmbed('Whitelist Empty', 'No users are whitelisted in this server.\nUse `!whitelist @user <perm>` to add users.')] });

      const lines = entries.map(([userId, perms]) => {
        const hasAll = WHITELIST_PERMS.every(p => perms.includes(p));
        return `<@${userId}> — ${hasAll ? '**ALL**' : `\`${perms.join(', ')}\``}`;
      }).join('\n');

      await message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.primary)
            .setTitle('🔐 Server Whitelist')
            .setDescription(lines)
            .addFields({ name: 'Total Whitelisted', value: `${entries.length} member${entries.length !== 1 ? 's' : ''}`, inline: true })
            .setFooter(BOT_FOOTER)
            .setTimestamp()
        ]
      });
    }
  },

  // ── SET WHITELIST PUNISHMENT ──────────────────────────────────────────────
  {
    name: 'setwhitelistpunishment',
    description: '[Admin] Set what happens to non-whitelisted users who use mod commands',
    category: 'Whitelist',
    aliases: ['wlpunishment', 'wlpunish', 'setwhitelistpunish'],
    usage: 'setwhitelistpunishment <warn|timeout|kick|ban>',
    async execute(message, args) {
      if (!canManageWhitelist(message))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Administrator** permission to set punishment.')] });

      const punishment = args[0]?.toLowerCase();
      const valid = ['warn', 'timeout', 'kick', 'ban'];
      if (!punishment || !valid.includes(punishment))
        return message.reply({ embeds: [errorEmbed('Invalid Punishment', 'Choose one of: `warn`, `timeout`, `kick`, `ban`\n\n`warn` — adds a bot warning\n`timeout` — 5 minute timeout\n`kick` — kicks from server\n`ban` — bans from server')] });

      const oldPunishment = getWhitelistPunishment(message.guild!.id) || 'warn';
      setWhitelistPunishment(message.guild!.id, punishment);
      addWhitelistLog(message.guild!.id, {
        action: 'punishment_change',
        by_id: message.author.id,
        by_tag: message.author.tag,
        punishment,
        old_punishment: oldPunishment,
        timestamp: Date.now(),
      });

      const descriptions: Record<string, string> = {
        warn:    'Non-whitelisted users will receive a **warning** when they try to use mod commands.',
        timeout: 'Non-whitelisted users will be **timed out for 5 minutes** when they try to use mod commands.',
        kick:    'Non-whitelisted users will be **kicked** from the server when they try to use mod commands.',
        ban:     'Non-whitelisted users will be **banned** from the server when they try to use mod commands.',
      };

      await message.reply({ embeds: [successEmbed('Punishment Set', `Whitelist punishment set to **${punishment}**.\n\n${descriptions[punishment]}`)] });
      await sendLog(message.client, message.guild!.id, 'members_log', auditEmbed('Whitelist — Punishment Changed', [
        { name: 'Changed By', value: `<@${message.author.id}> (${message.author.tag})`, inline: true },
        { name: 'Old Punishment', value: `\`${oldPunishment}\``, inline: true },
        { name: 'New Punishment', value: `\`${punishment}\``, inline: true },
      ]));
    }
  },

  // ── WHITELIST PERMS INFO ──────────────────────────────────────────────────
  {
    name: 'whitelistperms',
    description: 'Show all available whitelist permission categories',
    category: 'Whitelist',
    aliases: ['wlperms', 'whitelistinfo'],
    usage: 'whitelistperms',
    async execute(message) {
      const currentPunish = getWhitelistPunishment(message.guild!.id) || 'warn';
      const permDescriptions: Record<string, string> = {
        ban:      'ban, unban, hackban, massban, massunban',
        kick:     'kick, masskick, vckick, vckickall',
        timeout:  'timeout, untimeout, masstm, masstmremove',
        warn:     'warn, masswarn, removewarn',
        mute:     'chatmute, chatunmute, vcmute, vcunmute, vcmuteall, vcban, vcunban',
        purge:    'purge, clear, prune',
        slowmode: 'slowmode',
        role:     'giverole, removerole, giveroleall',
        channel:  'chatlock, chatunlock, lock, unlock, vchide, vcunhide',
        nick:     'nickname/setnick commands',
      };

      const fields = WHITELIST_PERMS.map(p => ({
        name: `\`${p}\``,
        value: permDescriptions[p] ?? p,
        inline: false,
      }));

      await message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.primary)
            .setTitle('🔐 Whitelist Permission Categories')
            .setDescription(
              `The whitelist system enforces **extra access control** on top of Discord permissions.\n` +
              `Users need to be whitelisted by an admin to use moderation commands.\n\n` +
              `**Current Punishment:** \`${currentPunish}\`\n` +
              `**Change with:** \`!setwhitelistpunishment <warn|timeout|kick|ban>\``
            )
            .addFields(fields)
            .setFooter(BOT_FOOTER)
            .setTimestamp()
        ]
      });
    }
  },

  // ── WHITELIST LOG ─────────────────────────────────────────────────────────
  {
    name: 'whitelistlog',
    description: '[Admin] Show recent whitelist changes in this server',
    category: 'Whitelist',
    aliases: ['wllog', 'whitelisthistory', 'wlhistory'],
    usage: 'whitelistlog [page]',
    async execute(message, args) {
      if (!canManageWhitelist(message))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Administrator** permission to view the whitelist log.')] });

      const log = getWhitelistLog(message.guild!.id);
      if (!log.length)
        return message.reply({ embeds: [infoEmbed('Whitelist Log Empty', 'No whitelist changes have been recorded yet.\nChanges will appear here after you use `!whitelist`, `!unwhitelist`, or `!setwhitelistpunishment`.')] });

      const PAGE_SIZE = 10;
      const page = Math.max(1, parseInt(args[0] ?? '1') || 1);
      const totalPages = Math.ceil(log.length / PAGE_SIZE);
      const clampedPage = Math.min(page, totalPages);
      const slice = log.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

      const lines = slice.map((entry, i) => {
        const ts = Math.floor(entry.timestamp / 1000);
        const globalIdx = (clampedPage - 1) * PAGE_SIZE + i + 1;
        if (entry.action === 'punishment_change') {
          return `\`${globalIdx}.\` ⚙️ <@${entry.by_id}> changed punishment \`${entry.old_punishment}\` → \`${entry.punishment}\` <t:${ts}:R>`;
        }
        const icon = entry.action === 'grant' ? '✅' : '❌';
        const verb = entry.action === 'grant' ? 'whitelisted' : 'unwhitelisted';
        const permsStr = (entry.perms?.length ?? 0) >= (WHITELIST_PERMS.length)
          ? '**all perms**'
          : `\`${entry.perms?.join(', ') ?? '?'}\``;
        return `\`${globalIdx}.\` ${icon} <@${entry.by_id}> ${verb} <@${entry.target_id}> for ${permsStr} <t:${ts}:R>`;
      }).join('\n');

      await message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.primary)
            .setTitle('🔐 Whitelist Audit Log')
            .setDescription(lines)
            .setFooter({ text: `Page ${clampedPage}/${totalPages} • ${log.length} total entries • ${BOT_FOOTER.text}` })
            .setTimestamp()
        ]
      });
    }
  },
];

export default whitelistCommands;
