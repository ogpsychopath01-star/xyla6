import {
  EmbedBuilder, PermissionFlagsBits, ChannelType, TextChannel, OverwriteType
} from 'discord.js';
import { BotCommand } from '../client.js';
import { COLORS, BOT_FOOTER } from '../utils/embeds.js';
import { hasPermission, Perms } from '../utils/permissions.js';
import { sendLog } from '../utils/helpers.js';
import {
  getMediaOnlyChannels, addMediaOnlyChannel, removeMediaOnlyChannel,
} from '../database.js';

function successEmbed(t: string, d: string) {
  return new EmbedBuilder().setColor(COLORS.success).setTitle(`✅ ${t}`).setDescription(d).setFooter(BOT_FOOTER).setTimestamp();
}
function errorEmbed(t: string, d: string) {
  return new EmbedBuilder().setColor(COLORS.error).setTitle(`❌ ${t}`).setDescription(d).setFooter(BOT_FOOTER).setTimestamp();
}

const serverCommands: BotCommand[] = [

  // ── NUKE CHANNEL ──────────────────────────────────────────────────────────
  {
    name: 'nuke',
    description: 'Delete and recreate the channel with identical permissions (purges ALL messages)',
    category: 'Moderation',
    usage: 'nuke [#channel]',
    aliases: ['nukechannel', 'clonechannel'],
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ManageChannels))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Channels** permission.')] });

      const target = (message.mentions.channels.first() ?? message.channel) as TextChannel;

      if (!target || target.type !== ChannelType.GuildText)
        return message.reply({ embeds: [errorEmbed('Invalid Channel', 'Nuke only works on text channels.')] });

      const botMember = message.guild!.members.me!;
      if (!target.permissionsFor(botMember)?.has(PermissionFlagsBits.ManageChannels))
        return message.reply({ embeds: [errorEmbed('Missing Permissions', 'I do not have **Manage Channels** permission in that channel.')] });

      // Collect channel details
      const name = target.name;
      const topic = target.topic ?? undefined;
      const nsfw = target.nsfw;
      const position = target.position;
      const category = target.parentId ?? undefined;
      const rateLimitPerUser = target.rateLimitPerUser;

      // Clone permission overwrites
      const permOverwrites = target.permissionOverwrites.cache.map(ow => ({
        id: ow.id,
        type: ow.type as OverwriteType,
        allow: ow.allow.bitfield,
        deny: ow.deny.bitfield,
      }));

      // If nuking a different channel, confirm via reply then nuke
      if (target.id !== message.channel.id) {
        await message.reply({ embeds: [new EmbedBuilder()
          .setColor(COLORS.warning)
          .setTitle('💣 Nuking Channel...')
          .setDescription(`Deleting and recreating <#${target.id}>. This cannot be undone.`)
          .setFooter(BOT_FOOTER)
          .setTimestamp()
        ] });
      }

      try {
        await target.delete(`Nuked by ${message.author.tag}`);
      } catch {
        return message.channel.send({ embeds: [errorEmbed('Failed', 'Could not delete the channel.')] }).catch(() => {});
      }

      const newChannel = await message.guild!.channels.create({
        name,
        type: ChannelType.GuildText,
        topic,
        nsfw,
        rateLimitPerUser,
        parent: category,
        permissionOverwrites: permOverwrites as any,
        reason: `Nuked by ${message.author.tag}`,
      });

      // Try to set position
      await newChannel.setPosition(position).catch(() => {});

      const nukeEmbed = new EmbedBuilder()
        .setColor(COLORS.error)
        .setTitle('💣 Channel Nuked')
        .setDescription('This channel has been nuked and recreated.\nAll previous messages have been permanently deleted.')
        .addFields(
          { name: '👤 Nuked By', value: `<@${message.author.id}>`, inline: true },
          { name: '📅 Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
        )
        .setFooter(BOT_FOOTER)
        .setTimestamp();

      await newChannel.send({ embeds: [nukeEmbed] });

      await sendLog(message.client, message.guild!.id, 'serverlog', new EmbedBuilder()
        .setColor(COLORS.error)
        .setTitle('💣 Channel Nuked')
        .addFields(
          { name: 'Channel', value: `#${name}`, inline: true },
          { name: 'New Channel', value: `<#${newChannel.id}>`, inline: true },
          { name: 'By', value: `<@${message.author.id}>`, inline: true },
        )
        .setFooter(BOT_FOOTER)
        .setTimestamp()
      );
    }
  },

  // ── MEDIA ONLY CHANNELS ───────────────────────────────────────────────────
  {
    name: 'mediaonly',
    description: 'Manage media-only channels (images/videos only)',
    category: 'Setup',
    usage: 'mediaonly <add|remove|list> [#channel]',
    aliases: ['mediach', 'mediachannels', 'imagechannel'],
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ManageChannels))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Channels** permission.')] });

      const sub = args[0]?.toLowerCase();
      const channel = (message.mentions.channels.first() ?? message.channel) as TextChannel;

      if (sub === 'add') {
        addMediaOnlyChannel(message.guild!.id, channel.id);
        await message.reply({ embeds: [successEmbed('Media-Only Added', `<#${channel.id}> is now a **media-only** channel.\nOnly messages with images, videos, or attachments will be allowed.`)] });

      } else if (sub === 'remove' || sub === 'delete') {
        removeMediaOnlyChannel(message.guild!.id, channel.id);
        await message.reply({ embeds: [successEmbed('Media-Only Removed', `<#${channel.id}> is no longer a media-only channel.`)] });

      } else if (sub === 'list' || sub === 'show') {
        const channels = getMediaOnlyChannels(message.guild!.id);
        if (!channels.length) return message.reply({ embeds: [new EmbedBuilder()
          .setColor(COLORS.info)
          .setTitle('📷 Media-Only Channels')
          .setDescription('No media-only channels configured.\nUse `!mediaonly add #channel` to add one.')
          .setFooter(BOT_FOOTER)
          .setTimestamp()
        ] });
        await message.reply({ embeds: [new EmbedBuilder()
          .setColor(COLORS.info)
          .setTitle('📷 Media-Only Channels')
          .setDescription(channels.map(id => `• <#${id}>`).join('\n'))
          .addFields({ name: 'Total', value: `${channels.length} channel(s)`, inline: true })
          .setFooter(BOT_FOOTER)
          .setTimestamp()
        ] });
      } else {
        await message.reply({ embeds: [new EmbedBuilder()
          .setColor(COLORS.info)
          .setTitle('📷 Media-Only Channels')
          .setDescription('Restrict channels to only allow images, videos, and file attachments.')
          .addFields(
            { name: 'Add Channel', value: '`!mediaonly add [#channel]`', inline: false },
            { name: 'Remove Channel', value: '`!mediaonly remove [#channel]`', inline: false },
            { name: 'List All', value: '`!mediaonly list`', inline: false },
          )
          .setFooter(BOT_FOOTER)
          .setTimestamp()
        ] });
      }
    }
  },
];

export default serverCommands;
