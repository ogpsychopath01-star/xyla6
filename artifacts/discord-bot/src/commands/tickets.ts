import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ChannelType, PermissionFlagsBits, TextChannel
} from 'discord.js';
import { BotCommand } from '../client.js';
import { COLORS, BOT_FOOTER } from '../utils/embeds.js';
import { getTicketSettings, setTicketSettings, updateTicketSettings } from '../database.js';
import { hasPermission, Perms } from '../utils/permissions.js';

function successEmbed(t: string, d: string) {
  return new EmbedBuilder().setColor(COLORS.success).setTitle(`✅ ${t}`).setDescription(d).setFooter(BOT_FOOTER).setTimestamp();
}
function errorEmbed(t: string, d: string) {
  return new EmbedBuilder().setColor(COLORS.error).setTitle(`❌ ${t}`).setDescription(d).setFooter(BOT_FOOTER).setTimestamp();
}

// ── DEFAULT BUTTONS ────────────────────────────────────────────────────────────
const DEFAULT_BUTTONS = [
  { id: 'ticket_support',     label: 'General Support',  emoji: '🛠️', style: 'Primary'   },
  { id: 'ticket_report',      label: 'Report a User',    emoji: '🚨', style: 'Danger'    },
  { id: 'ticket_appeal',      label: 'Ban Appeal',       emoji: '⚖️', style: 'Secondary' },
  { id: 'ticket_suggestion',  label: 'Suggestion',       emoji: '💡', style: 'Success'   },
  { id: 'ticket_partnership', label: 'Partnership',      emoji: '🤝', style: 'Primary'   },
  { id: 'ticket_giveaway',    label: 'Giveaway Claim',   emoji: '🎉', style: 'Success'   },
  { id: 'ticket_roleappeal',  label: 'Role Appeal',      emoji: '👔', style: 'Secondary' },
];

export const TICKET_LABELS: Record<string, string> = {
  ticket_support:     '🛠️ General Support',
  ticket_report:      '🚨 Report a User',
  ticket_appeal:      '⚖️ Ban Appeal',
  ticket_suggestion:  '💡 Suggestion',
  ticket_partnership: '🤝 Partnership',
  ticket_giveaway:    '🎉 Giveaway Claim',
  ticket_roleappeal:  '👔 Role Appeal',
};

const STYLE_MAP: Record<string, ButtonStyle> = {
  Primary: ButtonStyle.Primary,
  Secondary: ButtonStyle.Secondary,
  Success: ButtonStyle.Success,
  Danger: ButtonStyle.Danger,
};

export function getTicketPanelComponents(customButtons?: { id: string; label: string; emoji: string; style: string }[]) {
  const buttons = customButtons && customButtons.length > 0
    ? customButtons
    : DEFAULT_BUTTONS;

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < buttons.length && i < 25; i += 5) {
    const chunk = buttons.slice(i, i + 5);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      chunk.map(b =>
        new ButtonBuilder()
          .setCustomId(b.id)
          .setLabel(b.label)
          .setStyle(STYLE_MAP[b.style] ?? ButtonStyle.Primary)
          .setEmoji(b.emoji)
      )
    );
    rows.push(row);
    if (rows.length >= 5) break;
  }
  return rows;
}

export function getTicketPanelEmbed(customButtons?: { id: string; label: string; emoji: string; style: string }[]) {
  const buttons = customButtons && customButtons.length > 0 ? customButtons : DEFAULT_BUTTONS;
  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle('🎫  Support Tickets')
    .setDescription(
      '> Need help? Open a ticket and our team will assist you shortly.\n\n' +
      '**Choose the category that best fits your request:**'
    )
    .addFields(buttons.slice(0, 25).map(b => ({ name: `${b.emoji} ${b.label}`, value: '\u200b', inline: true })))
    .setFooter(BOT_FOOTER)
    .setTimestamp();
  return embed;
}

export function getTicketCloseRow() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('ticket_close').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
    new ButtonBuilder().setCustomId('ticket_claim').setLabel('Claim').setStyle(ButtonStyle.Success).setEmoji('✋'),
  );
}

async function refreshPanel(guildId: string, client: any) {
  const settings = getTicketSettings(guildId);
  if (!settings?.panel_channel_id || !settings?.panel_message_id) return;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;
  const ch = guild.channels.cache.get(settings.panel_channel_id) as TextChannel | undefined;
  if (!ch) return;
  const msg = await ch.messages.fetch(settings.panel_message_id).catch(() => null);
  if (!msg) return;
  await msg.edit({
    embeds: [getTicketPanelEmbed(settings.custom_buttons)],
    components: getTicketPanelComponents(settings.custom_buttons),
  }).catch(() => {});
}

const ticketCommands: BotCommand[] = [
  {
    name: 'ticketsetup',
    description: 'Setup the ticket panel in a channel',
    category: 'Tickets',
    usage: 'ticketsetup <#channel> [categoryID]',
    aliases: ['setupticket', 'ticketpanel'],
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ManageChannels))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Channels** permission.')] });

      const channel = message.mentions.channels.first() as TextChannel;
      if (!channel) return message.reply({ embeds: [errorEmbed('Missing Channel', 'Mention the channel where the ticket panel should be posted.')] });

      const categoryId = args[1];
      const existing = getTicketSettings(message.guild!.id);

      // Delete old panel if exists
      if (existing?.panel_message_id) {
        try {
          const oldCh = message.guild!.channels.cache.get(existing.panel_channel_id) as TextChannel | undefined;
          const oldMsg = await oldCh?.messages.fetch(existing.panel_message_id).catch(() => null);
          if (oldMsg) await oldMsg.delete().catch(() => {});
        } catch {}
      }

      const customBtns = existing?.custom_buttons;
      const panelMsg = await channel.send({
        embeds: [getTicketPanelEmbed(customBtns)],
        components: getTicketPanelComponents(customBtns),
      });

      setTicketSettings(message.guild!.id, {
        panel_channel_id: channel.id,
        category_id: categoryId ?? existing?.category_id,
        log_channel_id: existing?.log_channel_id,
        panel_message_id: panelMsg.id,
        enabled: true,
        custom_buttons: customBtns,
      });

      await message.reply({ embeds: [successEmbed('Ticket System Setup', `Ticket panel posted in <#${channel.id}>!\nMembers can open tickets using the buttons.${categoryId ? `\n• Category: \`${categoryId}\`` : ''}`)] });
    }
  },

  {
    name: 'ticketaddbutton',
    description: 'Add a custom button to the ticket panel',
    category: 'Tickets',
    usage: 'ticketaddbutton <id> <emoji> <Primary|Secondary|Success|Danger> <label...>',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ManageChannels))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Channels** permission.')] });

      const settings = getTicketSettings(message.guild!.id);
      if (!settings) return message.reply({ embeds: [errorEmbed('Not Setup', 'Run `!ticketsetup` first.')] });

      const [rawId, emoji, style, ...labelParts] = args;
      const id = `ticket_custom_${rawId?.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;
      const label = labelParts.join(' ');

      if (!rawId || !emoji || !style || !label)
        return message.reply({ embeds: [errorEmbed('Usage', '`!ticketaddbutton <id> <emoji> <Primary|Secondary|Success|Danger> <label>`\nExample: `!ticketaddbutton purchase 🛒 Success Purchase Issue`')] });

      if (!STYLE_MAP[style])
        return message.reply({ embeds: [errorEmbed('Invalid Style', 'Style must be: `Primary`, `Secondary`, `Success`, or `Danger`.')] });

      const currentBtns = settings.custom_buttons ?? [...DEFAULT_BUTTONS];
      if (currentBtns.length >= 25)
        return message.reply({ embeds: [errorEmbed('Max Buttons', 'Discord allows a maximum of 25 buttons per panel.')] });

      if (currentBtns.find(b => b.id === id))
        return message.reply({ embeds: [errorEmbed('ID Exists', `A button with id \`${rawId}\` already exists. Use a different ID.`)] });

      currentBtns.push({ id, label, emoji, style });
      TICKET_LABELS[id] = `${emoji} ${label}`;

      updateTicketSettings(message.guild!.id, { custom_buttons: currentBtns });
      await refreshPanel(message.guild!.id, message.client);
      await message.reply({ embeds: [successEmbed('Button Added', `Button **${emoji} ${label}** added to the ticket panel. The panel has been updated.`)] });
    }
  },

  {
    name: 'ticketremovebutton',
    description: 'Remove a button from the ticket panel',
    category: 'Tickets',
    usage: 'ticketremovebutton <id>',
    aliases: ['ticketdelbutton'],
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ManageChannels))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Channels** permission.')] });

      const settings = getTicketSettings(message.guild!.id);
      if (!settings) return message.reply({ embeds: [errorEmbed('Not Setup', 'Run `!ticketsetup` first.')] });

      const rawId = args[0];
      if (!rawId) return message.reply({ embeds: [errorEmbed('Missing ID', 'Provide the button ID to remove. Use `!ticketlistbuttons` to see all buttons.')] });

      const lookupId = rawId.startsWith('ticket_') ? rawId : `ticket_custom_${rawId}`;
      const currentBtns = settings.custom_buttons ?? [...DEFAULT_BUTTONS];
      const idx = currentBtns.findIndex(b => b.id === lookupId || b.id === `ticket_${rawId}` || b.id === rawId);

      if (idx === -1)
        return message.reply({ embeds: [errorEmbed('Not Found', `No button with id \`${rawId}\` found. Use \`!ticketlistbuttons\` to see all.`)] });

      const removed = currentBtns.splice(idx, 1)[0];
      updateTicketSettings(message.guild!.id, { custom_buttons: currentBtns });
      await refreshPanel(message.guild!.id, message.client);
      await message.reply({ embeds: [successEmbed('Button Removed', `Button **${removed.emoji} ${removed.label}** removed. The panel has been updated.`)] });
    }
  },

  {
    name: 'ticketlistbuttons',
    description: 'List all buttons on the ticket panel',
    category: 'Tickets',
    usage: 'ticketlistbuttons',
    aliases: ['ticketbuttons'],
    async execute(message) {
      if (!hasPermission(message.member!, Perms.ManageChannels))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Channels** permission.')] });
      const settings = getTicketSettings(message.guild!.id);
      const buttons = settings?.custom_buttons ?? DEFAULT_BUTTONS;
      const list = buttons.map((b, i) => `${i + 1}. ${b.emoji} **${b.label}** — ID: \`${b.id}\` — Style: ${b.style}`).join('\n');
      await message.reply({ embeds: [new EmbedBuilder()
        .setColor(COLORS.info)
        .setTitle('🎫 Ticket Panel Buttons')
        .setDescription(list || 'No buttons configured.')
        .setFooter(BOT_FOOTER)
        .setTimestamp()
      ] });
    }
  },

  {
    name: 'ticketcategory',
    description: 'Set the category where ticket channels are created',
    category: 'Tickets',
    usage: 'ticketcategory <categoryID>',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ManageChannels))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Channels** permission.')] });
      if (!args[0]) return message.reply({ embeds: [errorEmbed('Missing ID', 'Provide the category channel ID.')] });
      const settings = getTicketSettings(message.guild!.id);
      if (!settings) return message.reply({ embeds: [errorEmbed('Not Setup', 'Run `!ticketsetup` first.')] });
      updateTicketSettings(message.guild!.id, { category_id: args[0] });
      await message.reply({ embeds: [successEmbed('Category Set', `Tickets will now be created under category \`${args[0]}\`.`)] });
    }
  },

  {
    name: 'ticketlog',
    description: 'Set the channel for ticket logs/transcripts',
    category: 'Tickets',
    usage: 'ticketlog <#channel>',
    async execute(message) {
      if (!hasPermission(message.member!, Perms.ManageChannels))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Channels** permission.')] });
      const channel = message.mentions.channels.first();
      if (!channel) return message.reply({ embeds: [errorEmbed('Missing Channel', 'Mention the log channel.')] });
      const settings = getTicketSettings(message.guild!.id);
      if (!settings) return message.reply({ embeds: [errorEmbed('Not Setup', 'Run `!ticketsetup` first.')] });
      updateTicketSettings(message.guild!.id, { log_channel_id: channel.id });
      await message.reply({ embeds: [successEmbed('Ticket Log Set', `Ticket activity will be logged in <#${channel.id}>.`)] });
    }
  },

  {
    name: 'ticketdisable',
    description: 'Disable the ticket system',
    category: 'Tickets',
    usage: 'ticketdisable',
    async execute(message) {
      if (!hasPermission(message.member!, Perms.ManageChannels))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Channels** permission.')] });
      const settings = getTicketSettings(message.guild!.id);
      if (!settings) return message.reply({ embeds: [errorEmbed('Not Setup', 'Ticket system is not configured.')] });
      updateTicketSettings(message.guild!.id, { enabled: false });
      await message.reply({ embeds: [successEmbed('Tickets Disabled', 'The ticket system has been disabled.')] });
    }
  },

  // ── TICKET PING ROLE ──────────────────────────────────────────────────────
  {
    name: 'ticketpingrole',
    description: 'Set a role to be pinged when a new ticket is created',
    category: 'Tickets',
    usage: 'ticketpingrole <@role|off>',
    aliases: ['ticketrole', 'ticketstaff'],
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ManageChannels))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Channels** permission.')] });

      const settings = getTicketSettings(message.guild!.id);
      if (!settings) return message.reply({ embeds: [errorEmbed('Not Setup', 'Run `!ticketsetup` first.')] });

      if (args[0]?.toLowerCase() === 'off' || args[0]?.toLowerCase() === 'none' || args[0]?.toLowerCase() === 'disable') {
        updateTicketSettings(message.guild!.id, { ping_role_id: undefined });
        return message.reply({ embeds: [successEmbed('Ping Role Removed', 'No role will be pinged when tickets are created.')] });
      }

      const role = message.mentions.roles.first();
      if (!role) return message.reply({ embeds: [errorEmbed('Missing Role', 'Mention a role to ping when tickets are created.\nExample: `!ticketpingrole @Staff`\nTo disable: `!ticketpingrole off`')] });

      updateTicketSettings(message.guild!.id, { ping_role_id: role.id });
      await message.reply({ embeds: [successEmbed('Ticket Ping Role Set',
        `<@&${role.id}> will now be **pinged** every time a new ticket is created.\n\nTip: Make sure this role is not set to @everyone or a very large role to avoid unnecessary pings.`
      )] });
    }
  },
];

export default ticketCommands;
