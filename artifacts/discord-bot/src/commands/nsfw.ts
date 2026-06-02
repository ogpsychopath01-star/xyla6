import { EmbedBuilder } from 'discord.js';
import { BotCommand } from '../client.js';
import { COLORS, BOT_FOOTER } from '../utils/embeds.js';
import { hasNsfwAccess } from '../database.js';
import { BOT_OWNER_ID } from '../utils/permissions.js';
import { fetchNsfwGif } from '../utils/helpers.js';

// Verified waifu.pics NSFW categories
const nsfwCategories = [
  { name: 'hentai',   emoji: '🔞' },
  { name: 'ass',      emoji: '🍑' },
  { name: 'blowjob',  emoji: '💋' },
  { name: 'boobs',    emoji: '🍒' },
  { name: 'cum',      emoji: '💦' },
  { name: 'les',      emoji: '♀️' },
  { name: 'neko',     emoji: '😺' },
  { name: 'nsfw',     emoji: '🔞' },
  { name: 'pussy',    emoji: '🐱' },
  { name: 'ecchi',    emoji: '💝' },
  { name: 'paizuri',  emoji: '🔞' },
  { name: 'uniform',  emoji: '👗' },
  { name: 'milf',     emoji: '🔥' },
  { name: 'bondage',  emoji: '⛓️' },
  { name: 'waifu',    emoji: '👘' },
];

function makeNsfwCommand(category: string, emoji: string): BotCommand {
  return {
    name: category,
    description: `🔞 NSFW: ${category} (owner-gated)`,
    category: 'NSFW',
    usage: category,
    async execute(message) {
      // Access check
      if (!hasNsfwAccess(message.author.id, BOT_OWNER_ID))
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor(COLORS.error)
          .setTitle('❌ NSFW Access Denied')
          .setDescription('You do not have NSFW access.\nThe bot owner can grant it with `!givensfw @you`.')
          .setFooter(BOT_FOOTER)
          .setTimestamp()] });

      // Must be in an NSFW channel (not a DM, not a regular channel)
      const ch = message.channel as any;
      if (!ch.nsfw)
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor(COLORS.error)
          .setTitle('❌ NSFW Channel Required')
          .setDescription('This command can only be used in a channel marked **Age-Restricted (NSFW)**.\nRight-click the channel → Edit Channel → Enable Age-Restricted.')
          .setFooter(BOT_FOOTER)
          .setTimestamp()] });

      const url = await fetchNsfwGif(category);

      const embed = new EmbedBuilder()
        .setColor(COLORS.nsfw)
        .setTitle(`${emoji} ${category.toUpperCase()}`)
        .setFooter(BOT_FOOTER)
        .setTimestamp();

      if (url) embed.setImage(url);
      else embed.setDescription('*(Content unavailable right now — APIs may be temporarily down. Try again in a moment.)*');

      await message.reply({ embeds: [embed] });
    }
  };
}

const nsfwCommands: BotCommand[] = nsfwCategories.map(c => makeNsfwCommand(c.name, c.emoji));
export default nsfwCommands;
