import { Message, EmbedBuilder, PermissionFlagsBits, TextChannel } from 'discord.js';
import { BotClient } from '../client.js';
import { PREFIX, BOT_OWNER_ID, isBotOwner, isBotStaff } from '../utils/permissions.js';
import {
  isAfk, removeAfk, hasNoPfxAccess, updateMessageStats,
  getAutoresponder, getAutoreact, isMediaOnlyChannel,
} from '../database.js';
import { COLORS, BOT_FOOTER } from '../utils/embeds.js';
import { handleAutomod } from './automodHandler.js';
import { isMaintenanceMode, isGuildSuspended } from '../utils/state.js';

export default function registerMessageCreate(client: BotClient) {
  client.on('messageCreate', async (message: Message) => {
    if (message.author.bot || !message.guild) return;

    // Track message stats
    updateMessageStats(message.guild.id, message.author.id);

    // ── MEDIA-ONLY CHANNEL ENFORCEMENT ────────────────────────────────────
    if (isMediaOnlyChannel(message.guild.id, message.channel.id)) {
      const member = message.guild.members.cache.get(message.author.id);
      const isStaff = member?.permissions.has(PermissionFlagsBits.ManageMessages) || isBotStaff(message.author.id);

      if (!isStaff) {
        const hasMedia = message.attachments.size > 0 ||
          /https?:\/\/[^\s]+(\.png|\.jpg|\.jpeg|\.gif|\.webp|\.mp4|\.mov|\.webm)/i.test(message.content) ||
          (message.embeds.length > 0 && message.embeds.some(e => e.image || e.video || e.thumbnail));

        if (!hasMedia) {
          await message.delete().catch(() => {});
          const warn = await (message.channel as TextChannel).send({
            embeds: [new EmbedBuilder()
              .setColor(COLORS.warning)
              .setTitle('📷 Media-Only Channel')
              .setDescription(`<@${message.author.id}> This channel only allows **images, videos, and file attachments**.\nText-only messages are not permitted here.`)
              .setFooter({ text: 'Deletes in 5s' })
              .setTimestamp()
            ]
          }).catch(() => null);
          if (warn) setTimeout(() => warn.delete().catch(() => {}), 5000);
          return;
        }
      }
    }

    // ── AFK CHECK ─────────────────────────────────────────────────────────
    const authorAfk = isAfk(message.author.id);
    if (authorAfk) {
      removeAfk(message.author.id);
      message.reply({
        embeds: [new EmbedBuilder()
          .setColor(COLORS.success)
          .setTitle('✅ AFK Removed')
          .setDescription('Welcome back! Your AFK status has been removed.')
          .setFooter(BOT_FOOTER)
          .setTimestamp()
        ]
      }).catch(() => {});
    }

    // ── PING HANDLERS — AFK / AUTORESPONDER / AUTOREACT ────────────────────
    for (const [, user] of message.mentions.users) {
      if (user.id === message.author.id) continue;

      // AFK notification
      const afkData = isAfk(user.id);
      if (afkData) {
        const timeAgo = Math.floor((Date.now() - afkData.timestamp) / 60000);
        message.reply({
          embeds: [new EmbedBuilder()
            .setColor(COLORS.warning)
            .setTitle('💤 User is AFK')
            .setDescription(`<@${user.id}> is currently AFK\n**Reason:** ${afkData.reason}\n**Since:** ${timeAgo} min ago`)
            .setFooter(BOT_FOOTER)
            .setTimestamp()
          ]
        }).catch(() => {});

        if (afkData.dm_notifications) {
          try {
            const dmEmbed = new EmbedBuilder()
              .setColor(COLORS.info)
              .setTitle('📨 Someone pinged you!')
              .setDescription(`**${message.author.tag}** mentioned you in **${message.guild.name}** while you were AFK.\n\n**Message:** ${message.content.slice(0, 200)}`)
              .setFooter(BOT_FOOTER)
              .setTimestamp();
            const { ButtonBuilder, ActionRowBuilder, ButtonStyle } = await import('discord.js');
            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder().setLabel('Jump to Message').setStyle(ButtonStyle.Link).setURL(message.url)
            );
            await user.send({ embeds: [dmEmbed], components: [row] });
          } catch {}
        }
      }

      // Auto-responder — send a reply on behalf of the pinged user
      const autoResp = getAutoresponder(user.id);
      if (autoResp) {
        message.reply({
          embeds: [new EmbedBuilder()
            .setColor(COLORS.info)
            .setTitle(`💬 Auto Reply from ${(await message.guild.members.fetch(user.id).catch(() => null))?.displayName ?? user.username}`)
            .setDescription(autoResp)
            .setFooter({ text: `Auto-responder • ${BOT_FOOTER.text}` })
            .setTimestamp()
          ]
        }).catch(() => {});
      }

      // Auto-react — react to the message with the pinged user's emoji
      const autoReactEmoji = getAutoreact(user.id);
      if (autoReactEmoji) {
        message.react(autoReactEmoji).catch(() => {});
      }
    }

    // ── AUTOMOD ───────────────────────────────────────────────────────────
    const blocked = await handleAutomod(message);
    if (blocked) return;

    // ── COMMAND PARSING ───────────────────────────────────────────────────
    const hasPrefix = message.content.startsWith(PREFIX);
    const noPfx = hasNoPfxAccess(message.author.id, BOT_OWNER_ID);
    const botMentioned = message.content.startsWith(`<@${client.user!.id}>`) || message.content.startsWith(`<@!${client.user!.id}>`);

    let args: string[];
    let commandName: string | undefined;

    if (hasPrefix) {
      args = message.content.slice(PREFIX.length).trim().split(/\s+/);
      commandName = args.shift()?.toLowerCase();
    } else if (botMentioned) {
      args = message.content.replace(/<@!?[\d]+>/, '').trim().split(/\s+/);
      commandName = args.shift()?.toLowerCase();
    } else if (noPfx) {
      args = message.content.trim().split(/\s+/);
      commandName = args.shift()?.toLowerCase();
    } else {
      return;
    }

    if (!commandName) return;

    // Look up command
    let command = client.commands.get(commandName);
    if (!command) {
      const aliasTarget = client.aliases.get(commandName);
      if (aliasTarget) command = client.commands.get(aliasTarget);
    }
    if (!command) return;

    // ── GLOBAL MAINTENANCE MODE ───────────────────────────────────────────
    if (isMaintenanceMode() && !isBotStaff(message.author.id)) {
      message.reply({
        embeds: [new EmbedBuilder()
          .setColor(COLORS.warning)
          .setTitle('🔴 Global Maintenance')
          .setDescription('The bot is currently in **global maintenance mode**.\nAll commands are temporarily disabled for regular users.\n\nPlease wait for the bot to come back online.')
          .setFooter(BOT_FOOTER)
          .setTimestamp()
        ]
      }).catch(() => {});
      return;
    }

    // ── PER-SERVER SUSPENSION ─────────────────────────────────────────────
    if (isGuildSuspended(message.guild.id) && !isBotStaff(message.author.id)) {
      message.reply({
        embeds: [new EmbedBuilder()
          .setColor(COLORS.warning)
          .setTitle('🔴 Server Maintenance')
          .setDescription('The bot is currently **under maintenance in this server**.\nAll commands are temporarily disabled here.\n\nThe bot owner can use `!restart <serverID>` to bring it back online.')
          .setFooter(BOT_FOOTER)
          .setTimestamp()
        ]
      }).catch(() => {});
      return;
    }

    try {
      await command.execute(message, args);
    } catch (err) {
      console.error(`Error executing command ${commandName}:`, err);
      message.reply({
        embeds: [new EmbedBuilder()
          .setColor(COLORS.error)
          .setTitle('❌ Command Error')
          .setDescription('An error occurred while running this command. Please try again.')
          .setFooter(BOT_FOOTER)
          .setTimestamp()
        ]
      }).catch(() => {});
    }
  });
}
