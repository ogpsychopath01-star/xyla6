import { Message, EmbedBuilder } from 'discord.js';
import { isBotOwner, isBotStaff } from './permissions.js';
import { isUserWhitelisted, addWarning, getWhitelistPunishment } from '../database.js';
import { COLORS, BOT_FOOTER } from './embeds.js';

export const WHITELIST_PERMS = [
  'ban', 'kick', 'timeout', 'warn', 'mute',
  'purge', 'slowmode', 'role', 'channel', 'nick',
] as const;

export type WhitelistPerm = typeof WHITELIST_PERMS[number] | 'all';

/**
 * Checks if a user is whitelisted to use a command with the given permission.
 * If NOT whitelisted, punishes the user and returns true (blocked).
 * If whitelisted / exempt, returns false (allowed).
 */
export async function enforceWhitelist(message: Message, permission: WhitelistPerm): Promise<boolean> {
  if (!message.guild || !message.member) return false;

  const guildId = message.guild.id;
  const userId  = message.author.id;

  // Always allow: bot owner, bot staff, server owner
  if (isBotOwner(userId))                  return false;
  if (isBotStaff(userId))                  return false;
  if (message.guild.ownerId === userId)     return false;

  // Check bot whitelist
  if (isUserWhitelisted(guildId, userId, permission)) return false;

  // ── NOT WHITELISTED — apply punishment ───────────────────────────────────
  const punishment = getWhitelistPunishment(guildId) || 'warn';
  const member = message.member;

  const punishDesc: Record<string, string> = {
    warn:    '⚠️ **Warning** issued by the anti-abuse system.',
    timeout: '⏰ **5-minute timeout** applied by the anti-abuse system.',
    kick:    '👢 **Kicked** by the anti-abuse system.',
    ban:     '🔨 **Banned** by the anti-abuse system.',
  };

  // Notify in channel
  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.error)
        .setTitle('⛔ Whitelist Required')
        .setDescription(
          `<@${userId}>, you are **not whitelisted** to use the \`${permission}\` action.\n\n` +
          `${punishDesc[punishment] ?? ''}\n\n` +
          `Contact a server admin to request whitelist access with \`!whitelist @you ${permission}\`.`
        )
        .setFooter(BOT_FOOTER)
        .setTimestamp()
    ]
  }).catch(() => {});

  // Apply punishment
  switch (punishment) {
    case 'warn':
      addWarning(guildId, userId, `Used \`${permission}\` command without whitelist`, 'Bot Anti-Abuse');
      break;
    case 'timeout':
      await member.timeout(5 * 60 * 1000, `Tried to use ${permission} without whitelist`).catch(() => {});
      break;
    case 'kick':
      await member.kick(`Anti-abuse: tried to use ${permission} without whitelist`).catch(() => {});
      break;
    case 'ban':
      await member.ban({ reason: `Anti-abuse: tried to use ${permission} without whitelist` }).catch(() => {});
      break;
  }

  return true; // blocked
}
