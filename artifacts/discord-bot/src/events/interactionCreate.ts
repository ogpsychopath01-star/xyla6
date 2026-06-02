import {
  EmbedBuilder, Events,
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
  ChannelType, PermissionFlagsBits, TextChannel, ButtonBuilder,
} from 'discord.js';
import { BotClient } from '../client.js';
import { getActiveTempVc, updateTempVc, deleteActiveTempVc,
         getTicketSettings, getActiveTicket, getActiveTicketByUser, createTicket, deleteTicket,
         addLikedSong, removeLikedSong, isLikedSong } from '../database.js';
import { COLORS, BOT_FOOTER } from '../utils/embeds.js';
import { getTicketCloseRow, TICKET_LABELS, getTicketPanelComponents, getTicketPanelEmbed } from '../commands/tickets.js';
import {
  getPlayer, buildNowPlayingEmbed, buildMusicControls, buildIdleEmbed, resolveQuery,
} from '../music/MusicManager.js';

export default function registerInteractionCreate(client: BotClient) {
  client.on(Events.InteractionCreate, async (interaction) => {

    // ── TEMP VC BUTTONS ───────────────────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith('tvc_')) {
      const member = interaction.guild?.members.cache.get(interaction.user.id);
      const vc = member?.voice.channel;

      if (!vc) return interaction.reply({
        embeds: [new EmbedBuilder().setColor(COLORS.error).setTitle('❌ Not in VC').setDescription('You must be in your temp voice channel to use these controls.').setFooter(BOT_FOOTER).setTimestamp()],
        ephemeral: true
      });

      const tempvc = getActiveTempVc(vc.id);
      if (!tempvc) return interaction.reply({
        embeds: [new EmbedBuilder().setColor(COLORS.error).setTitle('❌ Not a Temp VC').setDescription('This is not a managed temp voice channel.').setFooter(BOT_FOOTER).setTimestamp()],
        ephemeral: true
      });

      if (tempvc.owner_id !== interaction.user.id) return interaction.reply({
        embeds: [new EmbedBuilder().setColor(COLORS.error).setTitle('❌ Not Owner').setDescription('Only the channel owner can control this channel.').setFooter(BOT_FOOTER).setTimestamp()],
        ephemeral: true
      });

      switch (interaction.customId) {
        case 'tvc_lock':
          await vc.permissionOverwrites.edit(interaction.guild!.roles.everyone, { Connect: false });
          updateTempVc(vc.id, { locked: true });
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.success).setTitle('🔒 VC Locked').setDescription('Your voice channel is now **locked**.').setFooter(BOT_FOOTER).setTimestamp()], ephemeral: true });
          break;
        case 'tvc_unlock':
          await vc.permissionOverwrites.edit(interaction.guild!.roles.everyone, { Connect: null });
          updateTempVc(vc.id, { locked: false });
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.success).setTitle('🔓 VC Unlocked').setDescription('Your voice channel is now **open**.').setFooter(BOT_FOOTER).setTimestamp()], ephemeral: true });
          break;
        case 'tvc_hide':
          await vc.permissionOverwrites.edit(interaction.guild!.roles.everyone, { ViewChannel: false });
          updateTempVc(vc.id, { hidden: true });
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.success).setTitle('👁️ VC Hidden').setDescription('Your channel is now **hidden**.').setFooter(BOT_FOOTER).setTimestamp()], ephemeral: true });
          break;
        case 'tvc_unhide':
          await vc.permissionOverwrites.edit(interaction.guild!.roles.everyone, { ViewChannel: null });
          updateTempVc(vc.id, { hidden: false });
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.success).setTitle('✨ VC Visible').setDescription('Your channel is now **visible**.').setFooter(BOT_FOOTER).setTimestamp()], ephemeral: true });
          break;
        case 'tvc_delete':
          deleteActiveTempVc(vc.id);
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.warning).setTitle('🗑️ Deleting VC…').setFooter(BOT_FOOTER).setTimestamp()], ephemeral: true });
          await vc.delete('Owner deleted temp VC').catch(() => {});
          break;
        case 'tvc_limit': {
          const modal = new ModalBuilder().setCustomId('tvc_limit_modal').setTitle('Set User Limit');
          modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('limit_value').setLabel('User Limit (0 = unlimited)').setStyle(TextInputStyle.Short).setMinLength(1).setMaxLength(2).setRequired(true)
          ));
          await interaction.showModal(modal);
          break;
        }
        case 'tvc_rename': {
          const modal = new ModalBuilder().setCustomId('tvc_rename_modal').setTitle('Rename Channel');
          modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('rename_value').setLabel('New Channel Name').setStyle(TextInputStyle.Short).setMinLength(1).setMaxLength(100).setRequired(true)
          ));
          await interaction.showModal(modal);
          break;
        }
        case 'tvc_kick': {
          const modal = new ModalBuilder().setCustomId('tvc_kick_modal').setTitle('Kick from VC');
          modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('kick_user_id').setLabel('User ID to kick').setStyle(TextInputStyle.Short).setMinLength(17).setMaxLength(20).setRequired(true)
          ));
          await interaction.showModal(modal);
          break;
        }
        case 'tvc_transfer': {
          const modal = new ModalBuilder().setCustomId('tvc_transfer_modal').setTitle('Transfer Ownership');
          modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('transfer_user_id').setLabel('New Owner User ID').setStyle(TextInputStyle.Short).setMinLength(17).setMaxLength(20).setRequired(true)
          ));
          await interaction.showModal(modal);
          break;
        }
        case 'tvc_invite':
          await interaction.reply({ content: `📨 **Channel Link:** <#${vc.id}>`, ephemeral: true });
          break;
      }
    }

    // ── TICKET PANEL BUTTONS ──────────────────────────────────────────────
    // Match any ticket_ button that is NOT close/claim
    if (interaction.isButton() && interaction.customId.startsWith('ticket_') &&
        interaction.customId !== 'ticket_close' && interaction.customId !== 'ticket_claim') {

      await interaction.deferReply({ ephemeral: true });

      const guild = interaction.guild!;
      const settings = getTicketSettings(guild.id);

      if (!settings?.enabled) {
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.error).setTitle('❌ Tickets Disabled').setDescription('The ticket system is not currently enabled.').setFooter(BOT_FOOTER).setTimestamp()] });
      }

      // Block duplicate open tickets
      const existing = getActiveTicketByUser(guild.id, interaction.user.id);
      if (existing) {
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.warning).setTitle('⚠️ Ticket Already Open').setDescription(`You already have an open ticket: <#${existing.channel_id}>\n\nPlease close your existing ticket first.`).setFooter(BOT_FOOTER).setTimestamp()] });
      }

      const ticketType = interaction.customId;
      // Resolve label from TICKET_LABELS (default + any custom added at runtime)
      const allBtns = settings.custom_buttons ?? [];
      const customLabel = allBtns.find(b => b.id === ticketType);
      const label = TICKET_LABELS[ticketType] ?? (customLabel ? `${customLabel.emoji} ${customLabel.label}` : '📋 Support');

      // Create private ticket channel
      const staffRoleOverwrites = guild.roles.cache
        .filter(r => r.permissions.has(PermissionFlagsBits.ManageChannels) && !r.managed)
        .map(r => ({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] as bigint[] }));

      const ticketChannel = await guild.channels.create({
        name: `ticket-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16) || 'user'}`,
        type: ChannelType.GuildText,
        parent: settings.category_id || undefined,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
          { id: guild.members.me!.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory] },
          ...staffRoleOverwrites,
        ],
      }) as TextChannel;

      const ticketNum = createTicket(ticketChannel.id, interaction.user.id, guild.id, ticketType);
      const paddedNum = String(ticketNum).padStart(4, '0');
      await ticketChannel.setName(`ticket-${paddedNum}`).catch(() => {});

      const ticketEmbed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle(`${label}`)
        .setDescription(`> Welcome <@${interaction.user.id}>! A staff member will assist you shortly.\n\nPlease describe your issue in detail so we can help you faster.`)
        .addFields(
          { name: '🎫 Ticket', value: `#${paddedNum}`, inline: true },
          { name: '📁 Category', value: label, inline: true },
          { name: '👤 Opened By', value: `<@${interaction.user.id}>`, inline: true },
          { name: '📅 Opened', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
        )
        .setFooter(BOT_FOOTER)
        .setTimestamp();

      // Ping the configured staff role if set
      const pingContent = settings.ping_role_id
        ? `<@${interaction.user.id}> <@&${settings.ping_role_id}>`
        : `<@${interaction.user.id}>`;
      await ticketChannel.send({ content: pingContent, embeds: [ticketEmbed], components: [getTicketCloseRow()] });

      // Log
      if (settings.log_channel_id) {
        const logCh = guild.channels.cache.get(settings.log_channel_id) as TextChannel | undefined;
        if (logCh?.isTextBased()) {
          await logCh.send({ embeds: [new EmbedBuilder().setColor(COLORS.success).setTitle('🎫 Ticket Opened')
            .addFields(
              { name: 'User', value: `<@${interaction.user.id}>`, inline: true },
              { name: 'Category', value: label, inline: true },
              { name: 'Channel', value: `<#${ticketChannel.id}>`, inline: true },
              { name: 'Ticket #', value: paddedNum, inline: true },
            ).setFooter(BOT_FOOTER).setTimestamp()
          ]}).catch(() => {});
        }
      }

      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.success).setTitle('✅ Ticket Created').setDescription(`Your ticket: <#${ticketChannel.id}>`).setFooter(BOT_FOOTER).setTimestamp()] });
    }

    // ── TICKET CLOSE ──────────────────────────────────────────────────────
    if (interaction.isButton() && interaction.customId === 'ticket_close') {
      await interaction.deferReply({ ephemeral: true });
      const channel = interaction.channel as TextChannel;
      const ticket = getActiveTicket(channel.id);

      if (!ticket) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.error).setTitle('❌ Not a Ticket').setFooter(BOT_FOOTER).setTimestamp()] });

      const member = interaction.guild!.members.cache.get(interaction.user.id)!;
      const canClose = ticket.user_id === interaction.user.id || member.permissions.has(PermissionFlagsBits.ManageChannels);
      if (!canClose) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.error).setTitle('❌ No Permission').setDescription('Only the ticket opener or staff can close this ticket.').setFooter(BOT_FOOTER).setTimestamp()] });

      const settings = getTicketSettings(interaction.guild!.id);
      const paddedNum = String(ticket.ticket_number).padStart(4, '0');
      const label = TICKET_LABELS[ticket.type] ?? '📋 Support';

      if (settings?.log_channel_id) {
        const logCh = interaction.guild!.channels.cache.get(settings.log_channel_id) as TextChannel | undefined;
        if (logCh?.isTextBased()) {
          await logCh.send({ embeds: [new EmbedBuilder().setColor(COLORS.error).setTitle('🔒 Ticket Closed')
            .addFields(
              { name: 'Ticket #', value: paddedNum, inline: true },
              { name: 'Category', value: label, inline: true },
              { name: 'Opened By', value: `<@${ticket.user_id}>`, inline: true },
              { name: 'Closed By', value: `<@${interaction.user.id}>`, inline: true },
              { name: 'Duration', value: `<t:${Math.floor(ticket.created_at / 1000)}:R>`, inline: true },
            ).setFooter(BOT_FOOTER).setTimestamp()
          ]}).catch(() => {});
        }
      }

      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.success).setTitle('🔒 Closing Ticket').setDescription('This ticket will be deleted in 5 seconds.').setFooter(BOT_FOOTER).setTimestamp()] });
      deleteTicket(channel.id);
      setTimeout(() => channel.delete('Ticket closed').catch(() => {}), 5000);
    }

    // ── TICKET CLAIM ──────────────────────────────────────────────────────
    if (interaction.isButton() && interaction.customId === 'ticket_claim') {
      const member = interaction.guild!.members.cache.get(interaction.user.id)!;
      if (!member.permissions.has(PermissionFlagsBits.ManageChannels))
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.error).setTitle('❌ No Permission').setDescription('Only staff can claim tickets.').setFooter(BOT_FOOTER).setTimestamp()], ephemeral: true });
      const ticket = getActiveTicket(interaction.channel!.id);
      if (!ticket) return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.error).setTitle('❌ Not a Ticket').setFooter(BOT_FOOTER).setTimestamp()], ephemeral: true });
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.success).setTitle('✋ Ticket Claimed').setDescription(`<@${interaction.user.id}> has claimed this ticket and will assist you.`).setFooter(BOT_FOOTER).setTimestamp()] });
    }

    // ── MUSIC PANEL BUTTONS ───────────────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith('music_')) {
      const parts = interaction.customId.split('_');
      const action = parts[1];
      const guildId = parts.slice(2).join('_');
      const player = getPlayer(guildId, interaction.client as any);

      // ── Search opens a modal — must NOT defer first ──────────────────────
      if (action === 'search') {
        const modal = new ModalBuilder()
          .setCustomId(`music_search_modal_${guildId}`)
          .setTitle('🔍 Search for Music');
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('search_query')
              .setLabel('Song, YouTube URL, or Spotify link')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('e.g. Blinding Lights The Weeknd')
              .setRequired(true)
              .setMaxLength(200)
          )
        );
        await interaction.showModal(modal);
        return;
      }

      // All other buttons defer ephemerally
      await interaction.deferReply({ ephemeral: true });

      const member = interaction.guild?.members.cache.get(interaction.user.id);
      const memberVC = member?.voice.channel;
      const botVC = interaction.guild?.members.me?.voice.channel;
      const canControl = memberVC && botVC && memberVC.id === botVC.id;
      const hasManage = member?.permissions.has(PermissionFlagsBits.ManageChannels);

      if (!canControl && !hasManage) {
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.error).setDescription('❌ Join the same voice channel as the bot to use controls.').setFooter(BOT_FOOTER)] });
      }

      const noTrack = () => interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.error).setDescription('❌ Nothing is playing.').setFooter(BOT_FOOTER)] });

      switch (action) {
        case 'prev': {
          const went = await player.playPrevious();
          if (!went) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.warning).setDescription('⏮️ No previous tracks in history yet.').setFooter(BOT_FOOTER)] });
          await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x1DB954).setDescription('⏮️ Playing previous track.').setFooter(BOT_FOOTER)] });
          break;
        }
        case 'pause': {
          if (!player.currentTrack) return noTrack();
          if (player.isPaused) { player.resume(); await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x1DB954).setDescription('▶️ Resumed.').setFooter(BOT_FOOTER)] }); }
          else { player.pause(); await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x1DB954).setDescription('⏸️ Paused.').setFooter(BOT_FOOTER)] }); }
          await player.updatePanel();
          break;
        }
        case 'skip': {
          if (!player.currentTrack) return noTrack();
          const skipTitle = player.currentTrack.title;
          player.skip();
          await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x1DB954).setDescription(`⏭️ Skipped **${skipTitle}**.`).setFooter(BOT_FOOTER)] });
          break;
        }
        case 'stop': {
          const wasPanel = player.isPermanentPanel;
          const panelMsg = player.nowPlayingMessage;
          player.disconnect();
          if (!wasPanel) player.nowPlayingMessage = null;
          if (wasPanel && panelMsg) {
            try { await panelMsg.edit({ embeds: [buildIdleEmbed()], components: buildMusicControls(player) }); } catch {}
            player.nowPlayingMessage = panelMsg;
            player.isPermanentPanel = true;
          }
          await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x1DB954).setDescription('🛑 Stopped and disconnected.').setFooter(BOT_FOOTER)] });
          break;
        }
        case 'loop': {
          player.loop = player.loop === 'off' ? 'track' : player.loop === 'track' ? 'queue' : 'off';
          const loopMsg = player.loop === 'off' ? '🔁 Loop **Off**' : player.loop === 'track' ? '🔂 Looping **current track**' : '🔁 Looping **entire queue**';
          await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x1DB954).setDescription(loopMsg).setFooter(BOT_FOOTER)] });
          await player.updatePanel();
          break;
        }
        case 'shuffle': {
          if (!player.queue.length) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.warning).setDescription('🔀 The queue is empty.').setFooter(BOT_FOOTER)] });
          player.shuffleQueue();
          await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x1DB954).setDescription(`🔀 Shuffled **${player.queue.length}** tracks.`).setFooter(BOT_FOOTER)] });
          break;
        }
        case 'like': {
          if (!player.currentTrack) return noTrack();
          const t = player.currentTrack;
          const uid = interaction.user.id;
          if (isLikedSong(uid, t.url)) {
            removeLikedSong(uid, t.url);
            await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x1DB954).setDescription(`💔 Removed **${t.title}** from liked songs.`).setFooter(BOT_FOOTER)] });
          } else {
            addLikedSong(uid, { title: t.title, url: t.url, thumbnail: t.thumbnail, duration: t.duration, durationStr: t.durationStr, source: t.source });
            await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x1DB954).setDescription(`❤️ Liked **${t.title}**!`).setFooter(BOT_FOOTER)] });
          }
          break;
        }
        case 'queue': {
          const lines = player.queue.slice(0, 10).map((q, i) => `\`${i + 1}.\` **${q.title}** — \`${q.durationStr}\``).join('\n') || '*Queue is empty*';
          const nowLine = player.currentTrack ? `**Now:** ${player.currentTrack.title}\n\n` : '';
          await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x1DB954).setTitle('📋 Queue').setDescription(`${nowLine}${lines}`).setFooter({ text: `${player.queue.length} tracks queued | ${BOT_FOOTER.text}` })] });
          break;
        }
        case 'autoplay': {
          player.autoplay = !player.autoplay;
          await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x1DB954).setDescription(`📻 Autoplay **${player.autoplay ? 'enabled ✅' : 'disabled ❌'}**.`).setFooter(BOT_FOOTER)] });
          await player.updatePanel();
          break;
        }
        case 'lyrics': {
          if (!player.currentTrack) return noTrack();
          const songQ = player.currentTrack.title;
          await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x1DB954).setDescription(`🔍 Fetching lyrics for **${songQ}**…`).setFooter(BOT_FOOTER)] });
          try {
            const { default: axios } = await import('axios');
            const res = await (axios as any).get(`https://lrclib.net/api/search?q=${encodeURIComponent(songQ)}`, { timeout: 8000, headers: { 'User-Agent': 'XylaBot/1.0' } });
            const hit = res.data?.[0];
            if (hit?.plainLyrics) {
              await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x1DB954).setTitle(`🎵 ${hit.trackName}`).setAuthor({ name: `🎤 ${hit.artistName}` }).setDescription(hit.plainLyrics.slice(0, 3900)).setFooter({ text: `lrclib.net | ${BOT_FOOTER.text}` })] });
            } else {
              await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.warning).setDescription(`❌ No lyrics found for **${songQ}**. Try \`!lyrics ${songQ}\`.`).setFooter(BOT_FOOTER)] });
            }
          } catch {
            await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.error).setDescription('❌ Lyrics fetch failed. Try `!lyrics <song name>`.').setFooter(BOT_FOOTER)] });
          }
          break;
        }
        case '247': {
          if (player.is247) {
            player.is247 = false;
            player.vc247Id = '';
            await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x1DB954).setDescription('🕐 24/7 mode **disabled** — bot will leave when idle.').setFooter(BOT_FOOTER)] });
          } else {
            if (!memberVC) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.error).setDescription('❌ Join a voice channel first to enable 24/7 mode.').setFooter(BOT_FOOTER)] });
            if (!player.connection) player.connect(memberVC);
            player.is247 = true;
            player.vc247Id = memberVC.id;
            await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x1DB954).setDescription('🕐 24/7 mode **enabled** — bot will stay in the VC permanently!').setFooter(BOT_FOOTER)] });
          }
          await player.updatePanel();
          break;
        }
        default:
          await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.error).setDescription('❌ Unknown button action.').setFooter(BOT_FOOTER)] });
      }
      return;
    }

    // ── MODAL SUBMITS ─────────────────────────────────────────────────────
    if (interaction.isModalSubmit()) {

      // ── Music Search Modal ───────────────────────────────────────────────
      if (interaction.customId.startsWith('music_search_modal_')) {
        const guildId = interaction.customId.replace('music_search_modal_', '');
        await interaction.deferReply({ ephemeral: true });

        const member = interaction.guild?.members.cache.get(interaction.user.id);
        const vc = member?.voice.channel;
        if (!vc) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.error).setDescription('❌ You must join a voice channel first!').setFooter(BOT_FOOTER)] });

        const query = interaction.fields.getTextInputValue('search_query').trim();
        if (!query) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.error).setDescription('❌ Empty search query.').setFooter(BOT_FOOTER)] });

        const player = getPlayer(guildId, interaction.client as any);
        player.textChannelId = player.textChannelId || interaction.channelId;

        const botVC = interaction.guild?.members.me?.voice.channel;
        if (!botVC || botVC.id !== vc.id) player.connect(vc);

        await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x1DB954).setDescription(`🔍 Searching for **${query}**…`).setFooter(BOT_FOOTER)] });

        try {
          const tracks = await resolveQuery(query, interaction.user.id);
          if (!tracks.length) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.error).setDescription('❌ No results found.').setFooter(BOT_FOOTER)] });

          if (tracks.length === 1) {
            const track = tracks[0];
            if (!player.currentTrack) {
              player.currentTrack = track;
              await player.streamTrack(track);
              await player.sendNowPlaying(track);
              await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x1DB954).setDescription(`▶️ Now playing **${track.title}**`).setFooter(BOT_FOOTER)] });
            } else {
              player.queue.push(track);
              await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x1DB954).setDescription(`➕ Added **${track.title}** to queue at **#${player.queue.length}**`).setFooter(BOT_FOOTER)] });
            }
          } else {
            for (const t of tracks) player.queue.push(t);
            if (!player.currentTrack) {
              const first = player.queue.shift()!;
              player.currentTrack = first;
              await player.streamTrack(first);
              await player.sendNowPlaying(first);
            }
            await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x1DB954).setDescription(`➕ Added **${tracks.length}** tracks to the queue.`).setFooter(BOT_FOOTER)] });
          }
        } catch (e: any) {
          await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.error).setDescription(`❌ ${e.message ?? 'Failed to load that song.'}`).setFooter(BOT_FOOTER)] });
        }
        return;
      }

      const member = interaction.guild?.members.cache.get(interaction.user.id);
      const vc = member?.voice.channel;

      if (interaction.customId === 'tvc_limit_modal' && vc) {
        const limit = parseInt(interaction.fields.getTextInputValue('limit_value'));
        if (!isNaN(limit)) {
          await vc.setUserLimit(limit);
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.success).setTitle('🔢 Limit Set').setDescription(`User limit set to **${limit === 0 ? 'Unlimited' : limit}**.`).setFooter(BOT_FOOTER).setTimestamp()], ephemeral: true });
        }
      }
      if (interaction.customId === 'tvc_rename_modal' && vc) {
        const name = interaction.fields.getTextInputValue('rename_value');
        await vc.setName(name);
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.success).setTitle('✏️ Renamed').setDescription(`Channel renamed to **${name}**.`).setFooter(BOT_FOOTER).setTimestamp()], ephemeral: true });
      }
      if (interaction.customId === 'tvc_kick_modal' && vc) {
        const userId = interaction.fields.getTextInputValue('kick_user_id');
        const target = vc.members.get(userId);
        if (target) {
          await target.voice.disconnect();
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.success).setTitle('👢 Kicked').setDescription(`<@${userId}> was kicked from your VC.`).setFooter(BOT_FOOTER).setTimestamp()], ephemeral: true });
        } else {
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.error).setTitle('❌ Not Found').setDescription('That user is not in your VC.').setFooter(BOT_FOOTER).setTimestamp()], ephemeral: true });
        }
      }
      if (interaction.customId === 'tvc_transfer_modal' && vc) {
        const userId = interaction.fields.getTextInputValue('transfer_user_id');
        updateTempVc(vc.id, { owner_id: userId });
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.success).setTitle('🔄 Transferred').setDescription(`Ownership transferred to <@${userId}>.`).setFooter(BOT_FOOTER).setTimestamp()], ephemeral: true });
      }
    }
  });
}
