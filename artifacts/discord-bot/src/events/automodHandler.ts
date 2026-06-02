import { Message, EmbedBuilder, PermissionFlagsBits, TextChannel } from 'discord.js';
import {
  getAutomodSetting, addWarning, getAutomodWhitelist, getLogChannel,
} from '../database.js';
import { COLORS, BOT_FOOTER } from '../utils/embeds.js';

// Use a function to return fresh regex each time to avoid lastIndex bugs
function urlRegex() {
  return /https?:\/\/[^\s]+|discord\.gg\/[^\s]+|discord\.com\/invite\/[^\s]+/gi;
}

// Spam: per-user message count in rolling 5s window
const spamMap = new Map<string, { count: number; timeout: NodeJS.Timeout }>();
// Raid: guild-level join timestamps in rolling 10s window
const joinMap = new Map<string, number[]>();

// ── AUTOMOD LOG ───────────────────────────────────────────────────────────────
async function logAutomod(message: Message, feature: string, reason: string, extra?: string) {
  const automodLogId = getLogChannel(message.guild!.id, 'automodlog');
  if (!automodLogId) return;
  try {
    const ch = message.guild!.channels.cache.get(automodLogId) as TextChannel | undefined;
    if (!ch?.isTextBased()) return;
    const embed = new EmbedBuilder()
      .setColor(COLORS.warning)
      .setTitle(`🤖 Automod — ${feature}`)
      .addFields(
        { name: '👤 User', value: `<@${message.author.id}> (\`${message.author.tag}\`)`, inline: true },
        { name: '📍 Channel', value: `<#${message.channel.id}>`, inline: true },
        { name: '📝 Reason', value: reason, inline: false },
        { name: '💬 Content', value: (message.content.slice(0, 300) || '*[no text]*'), inline: false },
      )
      .setFooter(BOT_FOOTER)
      .setTimestamp();
    if (extra) embed.addFields({ name: 'Extra', value: extra, inline: false });
    await ch.send({ embeds: [embed] });
  } catch {}
}

// ── APPLY PUNISHMENT ──────────────────────────────────────────────────────────
async function applyPunishment(message: Message, feature: string, punishment: string, reason: string): Promise<boolean> {
  const member = message.member!;

  // Delete message
  await message.delete().catch(() => {});

  // In-channel warning (auto-deletes 5s)
  const warnMsg = await (message.channel as TextChannel).send({
    embeds: [new EmbedBuilder()
      .setColor(COLORS.warning)
      .setTitle('🤖 Automod Action')
      .setDescription(`<@${member.id}> — ${reason}`)
      .setFooter({ text: 'Automod • Deletes in 5s' })
      .setTimestamp()
    ]
  }).catch(() => null);
  if (warnMsg) setTimeout(() => warnMsg.delete().catch(() => {}), 5000);

  // Log to automod channel
  await logAutomod(message, feature, reason);

  // Apply the actual punishment
  switch (punishment) {
    case 'warn':
      addWarning(message.guild!.id, member.id, reason, message.client.user!.id);
      break;
    case 'timeout':
      await member.timeout(10 * 60 * 1000, reason).catch(() => {}); // 10 min
      break;
    case 'kick':
      try {
        await member.send({ embeds: [new EmbedBuilder().setColor(COLORS.error).setTitle('👢 Kicked by Automod').setDescription(`**Server:** ${message.guild!.name}\n**Reason:** ${reason}`).setFooter(BOT_FOOTER).setTimestamp()] }).catch(() => {});
        await member.kick(reason);
      } catch {}
      break;
    case 'ban':
      try {
        await member.send({ embeds: [new EmbedBuilder().setColor(COLORS.error).setTitle('🔨 Banned by Automod').setDescription(`**Server:** ${message.guild!.name}\n**Reason:** ${reason}`).setFooter(BOT_FOOTER).setTimestamp()] }).catch(() => {});
        await member.ban({ reason, deleteMessageSeconds: 86400 });
      } catch {}
      break;
    default:
      addWarning(message.guild!.id, member.id, reason, message.client.user!.id);
  }

  return true;
}

// ── MAIN AUTOMOD HANDLER ──────────────────────────────────────────────────────
export async function handleAutomod(message: Message): Promise<boolean> {
  if (!message.guild || message.author.bot) return false;

  const member = message.member!;

  // Staff bypass: admins and manage-messages holders are immune
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return false;
  if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return false;

  const guildId = message.guild.id;
  const channelId = message.channel.id;

  // Whitelist — channels exempt from all automod
  const whitelist = getAutomodWhitelist(guildId);
  const isWhitelisted = whitelist.includes(channelId);

  // ── ANTI-LINK ──────────────────────────────────────────────────────────────
  if (!isWhitelisted) {
    const antiLink = getAutomodSetting(guildId, 'antilink');
    if (antiLink?.enabled && urlRegex().test(message.content)) {
      await applyPunishment(message, 'Anti-Link', antiLink.punishment, '🔗 Links are not allowed in this server.');
      return true;
    }
  }

  // ── ANTI-SPAM ──────────────────────────────────────────────────────────────
  if (!isWhitelisted) {
    const antiSpam = getAutomodSetting(guildId, 'antispam');
    if (antiSpam?.enabled) {
      const key = `${guildId}:${member.id}`;
      const entry = spamMap.get(key);
      if (entry) {
        entry.count++;
        clearTimeout(entry.timeout);
        entry.timeout = setTimeout(() => spamMap.delete(key), 5000);
        if (entry.count >= 5) {
          spamMap.delete(key);
          await applyPunishment(message, 'Anti-Spam', antiSpam.punishment, '🚫 You are sending messages too fast.');
          return true;
        }
      } else {
        const timeout = setTimeout(() => spamMap.delete(key), 5000);
        spamMap.set(key, { count: 1, timeout });
      }
    }
  }

  // ── REGISTRATION DATE PROTECTION ──────────────────────────────────────────
  const regProtect = getAutomodSetting(guildId, 'regprotect');
  if (regProtect?.enabled) {
    const minDays = parseInt(regProtect.extra ?? '7');
    const ageMs = Date.now() - message.author.createdAt.getTime();
    const ageDays = Math.floor(ageMs / 86400000);
    if (ageDays < minDays) {
      await applyPunishment(message, 'Reg-Date Protection', regProtect.punishment,
        `📅 Your account must be at least **${minDays} days old** to chat here. Your account is **${ageDays} days old**.`);
      return true;
    }
  }

  return false;
}

// ── ANTI-RAID HANDLER (called from guildMemberAdd) ────────────────────────────
export function handleAntiRaid(guildId: string): boolean {
  const antiRaid = getAutomodSetting(guildId, 'antiraid');
  if (!antiRaid?.enabled) return false;
  const now = Date.now();
  const joins = joinMap.get(guildId) ?? [];
  joins.push(now);
  const recent = joins.filter(t => now - t < 10000); // 10s window
  joinMap.set(guildId, recent);
  return recent.length >= 8; // 8 joins in 10s = raid
}
