import { EmbedBuilder, ColorResolvable } from 'discord.js';

export const COLORS = {
  primary:    0x6C63FF as ColorResolvable, // Electric violet
  success:    0x2ECC71 as ColorResolvable, // Emerald green
  error:      0xE74C3C as ColorResolvable, // Vivid red
  warning:    0xF39C12 as ColorResolvable, // Amber
  info:       0x00D4FF as ColorResolvable, // Electric cyan
  nsfw:       0xFF006E as ColorResolvable, // Hot pink-red
  fun:        0xFF6EC7 as ColorResolvable, // Neon pink
  moderation: 0xFF7043 as ColorResolvable, // Deep orange
  logs:       0x5C6BC0 as ColorResolvable, // Indigo
  giveaway:   0xFFD700 as ColorResolvable, // Gold
  purple:     0x9B59B6 as ColorResolvable, // Amethyst
  dark:       0x2C2F33 as ColorResolvable, // Dark slate
  teal:       0x1ABC9C as ColorResolvable, // Teal
  gold:       0xF1C40F as ColorResolvable, // Golden yellow
};

export const BOT_OWNER_ID_DISPLAY = '1391063304419545128';
export const BOT_FOOTER = { text: `✦ Xyla Bot • Owner: ogpsychopath1 (ID: ${BOT_OWNER_ID_DISPLAY})` };

export function successEmbed(title: string, description: string) {
  return new EmbedBuilder()
    .setColor(COLORS.success)
    .setTitle(`✅  ${title}`)
    .setDescription(description)
    .setFooter(BOT_FOOTER)
    .setTimestamp();
}

export function errorEmbed(title: string, description: string) {
  return new EmbedBuilder()
    .setColor(COLORS.error)
    .setTitle(`❌  ${title}`)
    .setDescription(description)
    .setFooter(BOT_FOOTER)
    .setTimestamp();
}

export function infoEmbed(title: string, description: string) {
  return new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle(`💠  ${title}`)
    .setDescription(description)
    .setFooter(BOT_FOOTER)
    .setTimestamp();
}

export function modEmbed(title: string, description: string) {
  return new EmbedBuilder()
    .setColor(COLORS.moderation)
    .setTitle(title)
    .setDescription(description)
    .setFooter(BOT_FOOTER)
    .setTimestamp();
}

export function logEmbed(title: string, description: string, color: ColorResolvable = COLORS.logs) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setFooter(BOT_FOOTER)
    .setTimestamp();
}

export function giveawayEmbed(title: string, description: string) {
  return new EmbedBuilder()
    .setColor(COLORS.giveaway)
    .setTitle(`🎊  ${title}`)
    .setDescription(description)
    .setFooter(BOT_FOOTER)
    .setTimestamp();
}

export function warningEmbed(title: string, description: string) {
  return new EmbedBuilder()
    .setColor(COLORS.warning)
    .setTitle(`⚠️  ${title}`)
    .setDescription(description)
    .setFooter(BOT_FOOTER)
    .setTimestamp();
}
