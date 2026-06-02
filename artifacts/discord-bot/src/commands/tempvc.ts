import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ChannelType, PermissionFlagsBits, TextChannel
} from 'discord.js';
import { BotCommand } from '../client.js';
import { COLORS, BOT_FOOTER } from '../utils/embeds.js';
import { getTempVcSettings, setTempVcSettings, updateTempVcSettings } from '../database.js';
import { hasPermission, Perms } from '../utils/permissions.js';

function successEmbed(t: string, d: string) {
  return new EmbedBuilder().setColor(COLORS.success).setTitle(`✅ ${t}`).setDescription(d).setFooter(BOT_FOOTER).setTimestamp();
}
function errorEmbed(t: string, d: string) {
  return new EmbedBuilder().setColor(COLORS.error).setTitle(`❌ ${t}`).setDescription(d).setFooter(BOT_FOOTER).setTimestamp();
}

export function getTempVcControlPanel() {
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('tvc_lock').setLabel('Lock').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
    new ButtonBuilder().setCustomId('tvc_unlock').setLabel('Unlock').setStyle(ButtonStyle.Success).setEmoji('🔓'),
    new ButtonBuilder().setCustomId('tvc_hide').setLabel('Hide').setStyle(ButtonStyle.Secondary).setEmoji('👁️'),
    new ButtonBuilder().setCustomId('tvc_unhide').setLabel('Show').setStyle(ButtonStyle.Secondary).setEmoji('✨'),
    new ButtonBuilder().setCustomId('tvc_limit').setLabel('Set Limit').setStyle(ButtonStyle.Primary).setEmoji('🔢'),
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('tvc_rename').setLabel('Rename').setStyle(ButtonStyle.Primary).setEmoji('✏️'),
    new ButtonBuilder().setCustomId('tvc_kick').setLabel('Kick Member').setStyle(ButtonStyle.Danger).setEmoji('👢'),
    new ButtonBuilder().setCustomId('tvc_transfer').setLabel('Transfer').setStyle(ButtonStyle.Primary).setEmoji('🔄'),
    new ButtonBuilder().setCustomId('tvc_invite').setLabel('Invite').setStyle(ButtonStyle.Success).setEmoji('📨'),
    new ButtonBuilder().setCustomId('tvc_delete').setLabel('Delete').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
  );
  return [row1, row2];
}

export function buildTempVcPanelEmbed() {
  return new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle('🎙️ Temp Voice Channel Controls')
    .setDescription(
      '> Join **➕ Create VC** to get your own temporary voice channel!\n\n' +
      'Once you\'re in your temp VC, use the buttons below to manage it.\n' +
      'Only the **channel owner** can control their own channel.'
    )
    .addFields(
      { name: '🔒 Lock / 🔓 Unlock', value: 'Control who can join your VC', inline: true },
      { name: '👁️ Hide / ✨ Show', value: 'Toggle channel visibility', inline: true },
      { name: '🔢 Set Limit', value: 'Set max member count', inline: true },
      { name: '✏️ Rename', value: 'Change your VC name', inline: true },
      { name: '👢 Kick', value: 'Remove a member by ID', inline: true },
      { name: '🔄 Transfer', value: 'Give ownership to someone', inline: true },
      { name: '📨 Invite', value: 'Share your channel link', inline: true },
      { name: '🗑️ Delete', value: 'Delete your temp VC', inline: true },
    )
    .setFooter(BOT_FOOTER)
    .setTimestamp();
}

const tempvcCommands: BotCommand[] = [
  {
    name: 'setuptempvc',
    description: 'Setup temporary voice channel system',
    category: 'Temp VC',
    usage: 'setuptempvc <#interface-channel> [categoryID]',
    aliases: ['tempvcsetup'],
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ManageChannels))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Channels** permission.')] });

      const interfaceChannel = message.mentions.channels.first() as TextChannel;
      if (!interfaceChannel) return message.reply({ embeds: [errorEmbed('Missing Channel', 'Mention the interface channel for the control panel.')] });

      const categoryId = args[1];

      // Check if already set up — delete old panel message if exists
      const existing = getTempVcSettings(message.guild!.id);
      if (existing?.panel_message_id) {
        try {
          const oldChannel = message.guild!.channels.cache.get(existing.interface_channel_id) as TextChannel | undefined;
          const oldMsg = await oldChannel?.messages.fetch(existing.panel_message_id).catch(() => null);
          if (oldMsg) await oldMsg.delete().catch(() => {});
        } catch {}
      }

      const createChannel = await message.guild!.channels.create({
        name: '➕ Create VC',
        type: ChannelType.GuildVoice,
        parent: categoryId || undefined,
        permissionOverwrites: [
          { id: message.guild!.id, allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel] }
        ]
      });

      // Send ONE fixed panel message
      const panelMsg = await interfaceChannel.send({
        embeds: [buildTempVcPanelEmbed()],
        components: getTempVcControlPanel(),
      });

      setTempVcSettings(message.guild!.id, {
        trigger_channel_id: createChannel.id,
        interface_channel_id: interfaceChannel.id,
        category_id: categoryId,
        enabled: true,
        panel_message_id: panelMsg.id,
      });

      await message.reply({ embeds: [successEmbed('Temp VC Setup', `System ready!\n• **Join channel:** <#${createChannel.id}>\n• **Control panel:** <#${interfaceChannel.id}>\n\nOne fixed panel has been posted. No new messages will be created when VCs are made.`)] });
    }
  },
  {
    name: 'disabletempvc',
    description: 'Disable the temp VC system',
    category: 'Temp VC',
    usage: 'disabletempvc',
    async execute(message) {
      if (!hasPermission(message.member!, Perms.ManageChannels))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Channels** permission.')] });
      const existing = getTempVcSettings(message.guild!.id);
      if (existing) setTempVcSettings(message.guild!.id, { ...existing, enabled: false });
      await message.reply({ embeds: [successEmbed('Temp VC Disabled', 'Temp voice channel system disabled.')] });
    }
  },
  {
    name: 'refreshtempvc',
    description: 'Refresh the temp VC control panel message',
    category: 'Temp VC',
    usage: 'refreshtempvc',
    aliases: ['tvcpanel'],
    async execute(message) {
      if (!hasPermission(message.member!, Perms.ManageChannels))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Channels** permission.')] });

      const settings = getTempVcSettings(message.guild!.id);
      if (!settings?.enabled) return message.reply({ embeds: [errorEmbed('Not Setup', 'Temp VC system is not set up. Use `!setuptempvc` first.')] });

      const interfaceChannel = message.guild!.channels.cache.get(settings.interface_channel_id) as TextChannel | undefined;
      if (!interfaceChannel) return message.reply({ embeds: [errorEmbed('Channel Not Found', 'The interface channel could not be found.')] });

      // Delete old panel if exists
      if (settings.panel_message_id) {
        const oldMsg = await interfaceChannel.messages.fetch(settings.panel_message_id).catch(() => null);
        if (oldMsg) await oldMsg.delete().catch(() => {});
      }

      const panelMsg = await interfaceChannel.send({
        embeds: [buildTempVcPanelEmbed()],
        components: getTempVcControlPanel(),
      });

      updateTempVcSettings(message.guild!.id, { panel_message_id: panelMsg.id });
      await message.reply({ embeds: [successEmbed('Panel Refreshed', `New control panel posted in <#${interfaceChannel.id}>.`)] });
    }
  },
];

export default tempvcCommands;
