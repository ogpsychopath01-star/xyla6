import { EmbedBuilder } from 'discord.js';
import { BotCommand } from '../client.js';
import { COLORS, BOT_FOOTER } from '../utils/embeds.js';
import { setBio, getBio, getVoiceStats, getMessageStats } from '../database.js';
import { formatTime } from '../utils/helpers.js';

function errorEmbed(t: string, d: string) {
  return new EmbedBuilder().setColor(COLORS.error).setTitle(`❌ ${t}`).setDescription(d).setFooter(BOT_FOOTER).setTimestamp();
}
function successEmbed(t: string, d: string) {
  return new EmbedBuilder().setColor(COLORS.success).setTitle(`✅ ${t}`).setDescription(d).setFooter(BOT_FOOTER).setTimestamp();
}

const bioCommands: BotCommand[] = [

  // ── SET BIO ───────────────────────────────────────────────────────────────
  {
    name: 'setbio',
    description: 'Set your custom profile bio card',
    category: 'Utility',
    usage: 'setbio <your bio text>',
    async execute(message, args) {
      const bio = args.join(' ').trim();
      if (!bio) return message.reply({ embeds: [errorEmbed('No Bio', 'Please provide a bio text.\nUsage: `!setbio Your bio here...`')] });
      if (bio.length > 300) return message.reply({ embeds: [errorEmbed('Too Long', `Bio must be under 300 characters. Yours is **${bio.length}**.`)] });
      setBio(message.guild!.id, message.author.id, bio);
      await message.reply({ embeds: [successEmbed('Bio Saved!', `Your bio card has been updated.\nUse \`!bio\` to see how it looks.`)] });
    }
  },

  // ── CLEAR BIO ─────────────────────────────────────────────────────────────
  {
    name: 'clearbio',
    description: 'Clear your bio card',
    category: 'Utility',
    usage: 'clearbio',
    async execute(message) {
      setBio(message.guild!.id, message.author.id, '');
      await message.reply({ embeds: [successEmbed('Bio Cleared', 'Your bio has been removed.')] });
    }
  },

  // ── VIEW BIO CARD ─────────────────────────────────────────────────────────
  {
    name: 'bio',
    description: 'View a member\'s profile bio card',
    category: 'Utility',
    aliases: ['profile', 'card', 'biocard'],
    usage: 'bio [@user]',
    async execute(message) {
      const member = message.mentions.members?.first() ?? message.member!;
      const user   = member.user;
      const guild  = message.guild!;

      const bioText   = getBio(guild.id, user.id);
      const voiceStats = getVoiceStats(guild.id, user.id);
      const msgStats   = getMessageStats(guild.id, user.id);

      const joinedAt  = member.joinedAt
        ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:D>`
        : 'Unknown';
      const createdAt = `<t:${Math.floor(user.createdAt.getTime() / 1000)}:D>`;

      const topRole = member.roles.cache
        .filter(r => r.id !== guild.id)
        .sort((a, b) => b.position - a.position)
        .first();

      // Pick accent color from top role or fallback to gradient purple
      const accent: number = topRole?.color || 0x7B2FBE;

      // Build the "damn cool" bio card
      const embed = new EmbedBuilder()
        .setColor(accent)
        .setAuthor({
          name: `${user.username}'s Profile`,
          iconURL: user.displayAvatarURL({ size: 64 }),
        })
        // Large user avatar
        .setThumbnail(user.displayAvatarURL({ size: 512 }))
        // Bot avatar in footer
        .setFooter({
          text: `🤖 Made by ogpsychopath1 • Xyla Bot`,
          iconURL: message.client.user!.displayAvatarURL({ size: 64 }),
        })
        .setTimestamp();

      // ── BANNER / DISPLAY ─────────────────────────────────────────────────
      const separator = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

      // Bio section
      embed.setDescription(
        `\`\`\`\n${user.tag}\n\`\`\`` +
        `\n📝 **Bio**\n${bioText || '*This user has not set a bio yet.*\nUse `!setbio` to set yours!*'}\n\n` +
        separator
      );

      // Stats fields
      embed.addFields(
        {
          name: '📅 Dates',
          value: `**Joined Server:** ${joinedAt}\n**Account Created:** ${createdAt}`,
          inline: true,
        },
        {
          name: '🎙️ Voice Activity',
          value: [
            `📅 Daily: \`${formatTime(voiceStats?.daily ?? 0)}\``,
            `📆 Weekly: \`${formatTime(voiceStats?.weekly ?? 0)}\``,
            `🗓️ All Time: \`${formatTime(voiceStats?.alltime ?? 0)}\``,
          ].join('\n'),
          inline: true,
        },
        {
          name: '💬 Messages',
          value: [
            `📅 Daily: \`${msgStats?.daily ?? 0}\``,
            `📆 Weekly: \`${msgStats?.weekly ?? 0}\``,
            `🗓️ All Time: \`${msgStats?.alltime ?? 0}\``,
          ].join('\n'),
          inline: true,
        },
        {
          name: '🏷️ Info',
          value: [
            `**ID:** \`${user.id}\``,
            `**Bot:** ${user.bot ? '✅ Yes' : '❌ No'}`,
            `**Top Role:** ${topRole ? `<@&${topRole.id}>` : 'None'}`,
            `**Display Name:** ${member.displayName}`,
          ].join('\n'),
          inline: false,
        }
      );

      await message.reply({ embeds: [embed] });
    }
  },
];

export default bioCommands;
