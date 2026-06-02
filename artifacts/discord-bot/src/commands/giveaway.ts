import { EmbedBuilder, TextChannel } from 'discord.js';
import { BotCommand } from '../client.js';
import { COLORS, BOT_FOOTER, successEmbed, errorEmbed, infoEmbed } from '../utils/embeds.js';
import { parseTime } from '../utils/helpers.js';
import { createGiveaway, getGiveaway, getAllGiveaways, endGiveawayInDB } from '../database.js';
import { isBotOwner, BOT_OWNER_ID } from '../utils/permissions.js';

const giveawayTimers = new Map<string, NodeJS.Timeout>();

async function finishGiveaway(client: any, messageId: string): Promise<void> {
  const giveaway = getGiveaway(messageId);
  if (!giveaway || giveaway.ended) return;

  try {
    const channel = await client.channels.fetch(giveaway.channelId) as TextChannel;
    const msg = await channel.messages.fetch(messageId);

    const reaction = msg.reactions.cache.get('🎉');
    let entries: string[] = [];
    if (reaction) {
      const users = await reaction.users.fetch();
      entries = [...users.values()].filter((u: any) => !u.bot).map((u: any) => u.id);
    }

    if (entries.length === 0) {
      const embed = new EmbedBuilder()
        .setColor(COLORS.error)
        .setTitle('🎊  Giveaway Ended — No Winners')
        .setDescription(
          `✦ **Prize**\n> ${giveaway.prize}\n\n` +
          `✦ **Hosted by:** <@${giveaway.hostId}>\n\n` +
          `*Nobody entered the giveaway.*`
        )
        .setFooter(BOT_FOOTER)
        .setTimestamp();
      await msg.edit({ embeds: [embed] });
      await channel.send({ content: `😔 The giveaway for **${giveaway.prize}** ended with no entries.` });
      endGiveawayInDB(messageId, []);
    } else {
      const shuffled = [...entries].sort(() => Math.random() - 0.5);
      const winners = shuffled.slice(0, Math.min(giveaway.winnerCount, entries.length));

      const embed = new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle('🎊  Giveaway Ended — We Have a Winner!')
        .setDescription(
          `✦ **Prize**\n> ${giveaway.prize}\n\n` +
          `🏆 **Winner${winners.length > 1 ? 's' : ''}:** ${winners.map((w: string) => `<@${w}>`).join(', ')}\n` +
          `👑 **Hosted by:** <@${giveaway.hostId}>`
        )
        .setFooter(BOT_FOOTER)
        .setTimestamp();
      await msg.edit({ embeds: [embed] });
      await channel.send({
        content: `🎉 Congratulations ${winners.map((w: string) => `<@${w}>`).join(', ')}! You won **${giveaway.prize}**! 🏆`,
      });
      endGiveawayInDB(messageId, winners);
    }
  } catch (e) {
    console.error('[Giveaway] Error ending giveaway:', e);
    endGiveawayInDB(messageId, []);
  }
  giveawayTimers.delete(messageId);
}

export function setupGiveawayTimers(client: any) {
  const all = getAllGiveaways();
  let restored = 0;
  for (const [msgId, g] of Object.entries(all)) {
    if (g.ended) continue;
    const remaining = g.endTime - Date.now();
    if (remaining <= 0) {
      setTimeout(() => finishGiveaway(client, msgId), 3000);
    } else {
      const timer = setTimeout(() => finishGiveaway(client, msgId), remaining);
      giveawayTimers.set(msgId, timer);
    }
    restored++;
  }
  if (restored > 0) console.log(`🎊 Restored ${restored} giveaway timer(s)`);
}

function canManageGiveaway(message: any): boolean {
  return message.member?.permissions.has('ManageGuild') || isBotOwner(message.author.id);
}

const giveawayCommands: BotCommand[] = [
  {
    name: 'gcreate',
    description: 'Start a new giveaway in a channel',
    category: 'Giveaway',
    aliases: ['gstart', 'giveaway'],
    usage: 'gcreate <duration> <winners> <#channel> <prize>',
    async execute(message, args) {
      if (!canManageGiveaway(message))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Server** permission to start a giveaway.')] });

      if (args.length < 4)
        return message.reply({ embeds: [errorEmbed('Usage', '**Format:** `!gcreate <duration> <winners> <#channel> <prize>`\n**Example:** `!gcreate 1h 1 #general iPhone 15 Pro`')] });

      const duration = parseTime(args[0]);
      if (!duration) return message.reply({ embeds: [errorEmbed('Invalid Duration', 'Use format: `30s`, `10m`, `2h`, `1d`.')] });

      const winnerCount = parseInt(args[1]);
      if (isNaN(winnerCount) || winnerCount < 1 || winnerCount > 20)
        return message.reply({ embeds: [errorEmbed('Invalid Winners', 'Winner count must be between **1** and **20**.')] });

      const channel = message.mentions.channels.first();
      if (!channel || !(channel as any).isTextBased?.())
        return message.reply({ embeds: [errorEmbed('Missing Channel', 'Mention a valid text channel for the giveaway.')] });

      const prize = args.slice(3).join(' ');
      if (!prize) return message.reply({ embeds: [errorEmbed('Missing Prize', 'What is the giveaway prize?')] });

      const endTime = Date.now() + duration;

      const embed = new EmbedBuilder()
        .setColor(COLORS.giveaway)
        .setTitle('🎊  G I V E A W A Y')
        .setDescription(
          `✦ **Prize**\n> ${prize}\n\n` +
          `✦ **Winners:** \`${winnerCount}\`\n` +
          `✦ **Ends:** <t:${Math.floor(endTime / 1000)}:R> — <t:${Math.floor(endTime / 1000)}:f>\n` +
          `✦ **Hosted by:** <@${message.author.id}>\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `🎉  **React with 🎉 to enter!**`
        )
        .setFooter({ text: `${winnerCount} winner${winnerCount > 1 ? 's' : ''} • Ends` })
        .setTimestamp(endTime);

      const msg = await (channel as TextChannel).send({ embeds: [embed] });
      await msg.react('🎉');

      createGiveaway(msg.id, channel.id, message.guild!.id, prize, message.author.id, endTime, winnerCount);
      const timer = setTimeout(() => finishGiveaway(message.client, msg.id), duration);
      giveawayTimers.set(msg.id, timer);

      await message.reply({ embeds: [successEmbed('Giveaway Started! 🎊', `Giveaway for **${prize}** is now live in ${channel}!\n🔗 [Jump to Giveaway](${msg.url})`)] });
    }
  },

  {
    name: 'gend',
    description: 'End a giveaway early and pick winner(s)',
    category: 'Giveaway',
    aliases: ['endgiveaway', 'giveawayend'],
    usage: 'gend <messageId>',
    async execute(message, args) {
      if (!canManageGiveaway(message))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Server** permission.')] });

      const msgId = args[0];
      if (!msgId)
        return message.reply({ embeds: [errorEmbed('Missing ID', 'Provide the giveaway message ID.\nRight-click the giveaway message → **Copy Message ID**.')] });

      const giveaway = getGiveaway(msgId);
      if (!giveaway) return message.reply({ embeds: [errorEmbed('Not Found', 'No giveaway found with that message ID.')] });
      if (giveaway.ended) return message.reply({ embeds: [errorEmbed('Already Ended', 'That giveaway has already ended.')] });
      if (giveaway.guildId !== message.guild!.id)
        return message.reply({ embeds: [errorEmbed('Wrong Server', 'That giveaway does not belong to this server.')] });

      const existing = giveawayTimers.get(msgId);
      if (existing) { clearTimeout(existing); giveawayTimers.delete(msgId); }

      await finishGiveaway(message.client, msgId);
      await message.reply({ embeds: [successEmbed('Giveaway Ended', 'The giveaway has been ended early and a winner was selected.')] });
    }
  },

  {
    name: 'greroll',
    description: 'Reroll the winner of an ended giveaway',
    category: 'Giveaway',
    aliases: ['reroll', 'giveawayreroll'],
    usage: 'greroll <messageId>',
    async execute(message, args) {
      if (!canManageGiveaway(message))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Server** permission.')] });

      const msgId = args[0];
      if (!msgId)
        return message.reply({ embeds: [errorEmbed('Missing ID', 'Provide the giveaway message ID.')] });

      const giveaway = getGiveaway(msgId);
      if (!giveaway) return message.reply({ embeds: [errorEmbed('Not Found', 'No giveaway found with that message ID.')] });
      if (!giveaway.ended) return message.reply({ embeds: [errorEmbed('Not Ended Yet', 'That giveaway has not ended yet. Use `!gend` to end it first.')] });

      try {
        const channel = await message.client.channels.fetch(giveaway.channelId) as TextChannel;
        const msg = await channel.messages.fetch(msgId);
        const reaction = msg.reactions.cache.get('🎉');
        if (!reaction)
          return message.reply({ embeds: [errorEmbed('No Entries', 'No 🎉 reactions found on that giveaway message.')] });

        const users = await reaction.users.fetch();
        const entries = [...users.values()].filter((u: any) => !u.bot);
        if (!entries.length)
          return message.reply({ embeds: [errorEmbed('No Entries', 'There are no valid entries to reroll.')] });

        const winner = entries[Math.floor(Math.random() * entries.length)] as any;
        await channel.send({ content: `🎉 The **rerolled winner** for **${giveaway.prize}** is <@${winner.id}>! Congratulations! 🏆` });
        await message.reply({ embeds: [successEmbed('Rerolled! 🎉', `**New winner:** <@${winner.id}> (${winner.tag})\n**Prize:** ${giveaway.prize}`)] });
      } catch {
        await message.reply({ embeds: [errorEmbed('Failed', 'Could not fetch the giveaway message. It may have been deleted.')] });
      }
    }
  },

  {
    name: 'gcancel',
    description: 'Cancel an active giveaway without picking a winner',
    category: 'Giveaway',
    aliases: ['cancelgiveaway', 'giveawaycancel'],
    usage: 'gcancel <messageId>',
    async execute(message, args) {
      if (!canManageGiveaway(message))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Server** permission.')] });

      const msgId = args[0];
      if (!msgId)
        return message.reply({ embeds: [errorEmbed('Missing ID', 'Provide the giveaway message ID.')] });

      const giveaway = getGiveaway(msgId);
      if (!giveaway) return message.reply({ embeds: [errorEmbed('Not Found', 'No giveaway found with that ID.')] });
      if (giveaway.ended) return message.reply({ embeds: [errorEmbed('Already Ended', 'That giveaway has already ended.')] });
      if (giveaway.guildId !== message.guild!.id)
        return message.reply({ embeds: [errorEmbed('Wrong Server', 'That giveaway does not belong to this server.')] });

      const existing = giveawayTimers.get(msgId);
      if (existing) { clearTimeout(existing); giveawayTimers.delete(msgId); }

      endGiveawayInDB(msgId, []);

      try {
        const channel = await message.client.channels.fetch(giveaway.channelId) as TextChannel;
        const msg = await channel.messages.fetch(msgId);
        const cancelEmbed = new EmbedBuilder()
          .setColor(COLORS.error)
          .setTitle('🚫  Giveaway Cancelled')
          .setDescription(
            `✦ **Prize:** ${giveaway.prize}\n` +
            `✦ **Cancelled by:** <@${message.author.id}>`
          )
          .setFooter(BOT_FOOTER)
          .setTimestamp();
        await msg.edit({ embeds: [cancelEmbed] });
      } catch {}

      await message.reply({ embeds: [successEmbed('Giveaway Cancelled', `The giveaway for **${giveaway.prize}** has been cancelled. No winner was selected.`)] });
    }
  },

  {
    name: 'glist',
    description: 'List all active giveaways in this server',
    category: 'Giveaway',
    aliases: ['giveaways', 'activegiveaways'],
    usage: 'glist',
    async execute(message) {
      const all = getAllGiveaways();
      const active = Object.entries(all).filter(([, g]) => !g.ended && g.guildId === message.guild!.id);

      if (!active.length)
        return message.reply({ embeds: [infoEmbed('No Active Giveaways', 'There are no active giveaways in this server right now.\nStart one with `!gcreate <duration> <winners> <#channel> <prize>`!')] });

      const desc = active.map(([msgId, g]) =>
        `🎊 **${g.prize}**\n` +
        `> 🏆 ${g.winnerCount} winner${g.winnerCount > 1 ? 's' : ''} • Ends <t:${Math.floor(g.endTime / 1000)}:R>\n` +
        `> 🔗 [Jump to Giveaway](https://discord.com/channels/${g.guildId}/${g.channelId}/${msgId})`
      ).join('\n\n');

      await message.reply({ embeds: [new EmbedBuilder()
        .setColor(COLORS.giveaway)
        .setTitle(`🎊  Active Giveaways — ${active.length}`)
        .setDescription(desc)
        .setFooter(BOT_FOOTER)
        .setTimestamp()] });
    }
  },

  {
    name: 'say',
    description: 'Send a custom message to a specific channel',
    category: 'Utility',
    aliases: ['sendmsg', 'sendmessage'],
    usage: 'say <#channel> <message>',
    async execute(message, args) {
      if (!message.member?.permissions.has('ManageMessages') && !isBotOwner(message.author.id))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Messages** permission to use this command.')] });

      const channel = message.mentions.channels.first();
      if (!channel)
        return message.reply({ embeds: [errorEmbed('Missing Channel', 'Mention a channel to send the message to.')] });

      const text = args.slice(1).join(' ');
      if (!text)
        return message.reply({ embeds: [errorEmbed('Missing Message', 'Provide a message to send.')] });

      if (!(channel as any).isTextBased?.())
        return message.reply({ embeds: [errorEmbed('Invalid Channel', 'That is not a text channel.')] });

      try {
        await (channel as any).send(text);
        await message.reply({ embeds: [successEmbed('Message Sent', `Your message was sent to ${channel}. ✦`)] });
      } catch {
        await message.reply({ embeds: [errorEmbed('Failed', 'Could not send the message. Check my permissions in that channel.')] });
      }
    }
  },
];

export default giveawayCommands;
