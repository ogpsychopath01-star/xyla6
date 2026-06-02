import { EmbedBuilder } from 'discord.js';
import { BotCommand } from '../client.js';
import { randomPercent } from '../utils/helpers.js';
import { COLORS, BOT_FOOTER } from '../utils/embeds.js';

const percentageNames = [
  { name: 'tharki',     label: 'Tharki',     emoji: '😏', color: 0xFF6347 },
  { name: 'gay',        label: 'Gay',         emoji: '🏳️‍🌈', color: 0xFF73FA },
  { name: 'lesbian',    label: 'Lesbian',     emoji: '🏳️‍🌈', color: 0xFF69B4 },
  { name: 'intelligent', label: 'Intelligent', emoji: '🧠', color: 0x00BFFF },
  { name: 'horny',      label: 'Horny',       emoji: '🔞', color: 0xFF4500 },
  { name: 'cute',       label: 'Cute',        emoji: '🥰', color: 0xFFB6C1 },
  { name: 'gorgeous',   label: 'Gorgeous',    emoji: '✨', color: 0xFFD700 },
  { name: 'handsome',   label: 'Handsome',    emoji: '😎', color: 0x4169E1 },
  { name: 'beautiful',  label: 'Beautiful',   emoji: '🌹', color: 0xFF69B4 },
  { name: 'sexy',       label: 'Sexy',        emoji: '🔥', color: 0xFF1493 },
  { name: 'dalla',      label: 'Dalla',       emoji: '🍆', color: 0x800080 },
  { name: 'bauni',      label: 'Bauni',       emoji: '😶', color: 0x708090 },
  { name: 'bakchod',    label: 'Bakchod',     emoji: '🤪', color: 0xFF8C00 },
  { name: 'bhadwa',     label: 'Bhadwa',      emoji: '👀', color: 0xDC143C },
  { name: 'bhadwi',     label: 'Bhadwi',      emoji: '👀', color: 0xDC143C },
  { name: 'randwa',     label: 'Randwa',      emoji: '😤', color: 0x8B0000 },
  { name: 'ladkibaz',   label: 'Ladkibaz',    emoji: '💘', color: 0xFF69B4 },
  { name: 'chutiya',    label: 'Chutiya',     emoji: '🤡', color: 0xFF4500 },
  { name: 'madarchod',  label: 'Madarchod',   emoji: '😤', color: 0x8B0000 },
  { name: 'bhaichara',  label: 'Bhaichara',   emoji: '🤝', color: 0x00FF7F },
  { name: 'virgin',     label: 'Virgin',      emoji: '😇', color: 0xFFFFFF },
];

function makeProgressBar(percent: number): string {
  const filled = Math.floor(percent / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

function getLabel(percent: number): string {
  if (percent >= 90) return '🔥 Absolutely MAX!';
  if (percent >= 70) return '📈 Very High!';
  if (percent >= 50) return '👍 Decent';
  if (percent >= 30) return '📉 Below Average';
  return '💀 Almost None';
}

const percentCommands: BotCommand[] = percentageNames.map(({ name, label, emoji, color }) => ({
  name,
  description: `Check how ${label} someone is`,
  category: 'Percentage',
  usage: `${name} [@user]`,
  async execute(message) {
    const target = message.mentions.users.first() ?? message.author;
    // Pure random every call — no seed, fully different each time
    const percent = randomPercent();
    const bar = makeProgressBar(percent);
    await message.reply({ embeds: [new EmbedBuilder()
      .setColor(color as any)
      .setTitle(`${emoji} ${label} Meter`)
      .setDescription(`**${target.username}** is **${percent}% ${label}**\n\n\`[${bar}]\` **${percent}%**\n\n${getLabel(percent)}`)
      .setThumbnail(target.displayAvatarURL({ size: 256 }))
      .setFooter(BOT_FOOTER)
      .setTimestamp()] });
  }
}));

// ── LOVE METER ────────────────────────────────────────────────────────────────
percentCommands.push({
  name: 'love',
  description: 'Check love percentage between two users',
  category: 'Percentage',
  usage: 'love <@user1> [@user2]',
  async execute(message) {
    const user1 = message.mentions.users.first() ?? message.author;
    const user2 = message.mentions.users.at(1) ?? message.author;
    // Fully random every call
    const percent = randomPercent();
    const bar = makeProgressBar(percent);
    await message.reply({ embeds: [new EmbedBuilder()
      .setColor(0xFF69B4)
      .setTitle('❤️ Love Meter')
      .setDescription(`**${user1.username}** ❤️ **${user2.username}**\n\n\`[${bar}]\` **${percent}%**\n\n${percent >= 80 ? '💞 Soulmates!' : percent >= 60 ? '💕 Strong love!' : percent >= 40 ? '💓 Some chemistry...' : percent >= 20 ? '💔 Not much...' : '😬 Disaster!'}`)
      .setFooter(BOT_FOOTER)
      .setTimestamp()] });
  }
});

export default percentCommands;
