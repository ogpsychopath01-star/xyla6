import { EmbedBuilder, ChannelType, PermissionFlagsBits } from 'discord.js';
import { BotClient } from '../client.js';
import {
  updateVoiceStats, isVcBanned, get247Channel,
  getTempVcSettings, getActiveTempVc, setActiveTempVc, deleteActiveTempVc,
  setVoiceJoinTime, getVoiceJoinTime
} from '../database.js';
import { COLORS } from '../utils/embeds.js';
import { sendLog } from '../utils/helpers.js';
import { gatewayJoinVC } from '../commands/vcbot.js';

export default function registerVoiceStateUpdate(client: BotClient) {
  client.on('voiceStateUpdate', async (oldState, newState) => {
    const guild = newState.guild || oldState.guild;
    const member = newState.member || oldState.member;
    if (!member) return;

    // ── BOT 24/7 RE-JOIN ─────────────────────────────────────────────────
    if (client.user && member.id === client.user.id && !newState.channel && oldState.channel) {
      const channelId = get247Channel(guild.id);
      if (channelId) {
        setTimeout(() => {
          try { gatewayJoinVC(guild, channelId); } catch {}
        }, 2000);
      }
    }

    if (member.user.bot) return;

    // ── VC BAN ENFORCEMENT ────────────────────────────────────────────────
    if (newState.channel && isVcBanned(guild.id, member.id)) {
      await member.voice.disconnect('VC Ban active').catch(() => {});
      return;
    }

    // ── VOICE TIME TRACKING ───────────────────────────────────────────────
    if (newState.channel && !oldState.channel) {
      setVoiceJoinTime(guild.id, member.id, Date.now());
    } else if (!newState.channel && oldState.channel) {
      const joinTime = getVoiceJoinTime(guild.id, member.id);
      if (joinTime) {
        const seconds = Math.floor((Date.now() - joinTime) / 1000);
        if (seconds > 0) updateVoiceStats(guild.id, member.id, seconds);
      }
    } else if (newState.channel && oldState.channel && newState.channel.id !== oldState.channel.id) {
      const joinTime = getVoiceJoinTime(guild.id, member.id);
      if (joinTime) {
        const seconds = Math.floor((Date.now() - joinTime) / 1000);
        if (seconds > 0) updateVoiceStats(guild.id, member.id, seconds);
      }
      setVoiceJoinTime(guild.id, member.id, Date.now());
    }

    // ── TEMP VC SYSTEM ────────────────────────────────────────────────────
    const settings = getTempVcSettings(guild.id);
    if (settings?.enabled && newState.channel?.id === settings.trigger_channel_id) {
      try {
        const tempChannel = await guild.channels.create({
          name: `${member.displayName}'s VC`,
          type: ChannelType.GuildVoice,
          parent: settings.category_id || newState.channel.parentId || undefined,
          permissionOverwrites: [
            { id: member.id, allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel] },
            { id: guild.id, allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel] }
          ]
        });

        setActiveTempVc(tempChannel.id, {
          channel_id: tempChannel.id,
          owner_id: member.id,
          guild_id: guild.id,
          locked: false,
          hidden: false,
        });

        await member.voice.setChannel(tempChannel);

        // ── NO new message is sent here ──
        // The fixed panel in the interface channel already has all the control
        // buttons. Members click buttons there to control their own VC.

      } catch (err) {
        console.error('Temp VC creation failed:', err);
      }
    }

    // ── DELETE EMPTY TEMP VC ──────────────────────────────────────────────
    if (oldState.channel && !newState.channel) {
      const tempvc = getActiveTempVc(oldState.channel.id);
      if (tempvc && oldState.channel.members.size === 0) {
        deleteActiveTempVc(oldState.channel.id);
        await oldState.channel.delete('Temp VC empty').catch(() => {});
      }
    }

    // Also clean up when moving out of a temp VC (but not leaving guild)
    if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
      const tempvc = getActiveTempVc(oldState.channel.id);
      if (tempvc && oldState.channel.members.size === 0) {
        deleteActiveTempVc(oldState.channel.id);
        await oldState.channel.delete('Temp VC empty').catch(() => {});
      }
    }

    // ── VC LOG ────────────────────────────────────────────────────────────
    let logDescription = '';
    if (!oldState.channel && newState.channel)
      logDescription = `**${member.user.tag}** joined <#${newState.channel.id}>`;
    else if (oldState.channel && !newState.channel)
      logDescription = `**${member.user.tag}** left <#${oldState.channel.id}>`;
    else if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id)
      logDescription = `**${member.user.tag}** moved: <#${oldState.channel.id}> → <#${newState.channel.id}>`;
    else if (!oldState.mute && newState.mute)
      logDescription = `**${member.user.tag}** was server muted`;
    else if (oldState.mute && !newState.mute)
      logDescription = `**${member.user.tag}** was server unmuted`;
    else if (!oldState.deaf && newState.deaf)
      logDescription = `**${member.user.tag}** was server deafened`;
    else if (oldState.deaf && !newState.deaf)
      logDescription = `**${member.user.tag}** was server undeafened`;

    if (logDescription) {
      await sendLog(client, guild.id, 'vclog', new EmbedBuilder()
        .setColor(COLORS.info)
        .setTitle('🎙️ Voice State Update')
        .setDescription(logDescription)
        .setTimestamp());
    }
  });
}
