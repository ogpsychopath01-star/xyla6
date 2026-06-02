import { PermissionFlagsBits, ChannelType, OverwriteType } from 'discord.js';
import { BotCommand } from '../client.js';
import { successEmbed, errorEmbed, modEmbed } from '../utils/embeds.js';
import { hasPermission, canModerate, Perms } from '../utils/permissions.js';
import { sendLog } from '../utils/helpers.js';
import { enforceWhitelist } from '../utils/whitelist.js';

const muteCommands: BotCommand[] = [

  // ── CHAT MUTE ─────────────────────────────────────────────────────────────
  {
    name: 'chatmute',
    description: 'Mute a user so they cannot chat in any channel',
    category: 'Mute',
    usage: 'chatmute <@user> [reason]',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ManageRoles))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Roles** permission.')] });
      if (await enforceWhitelist(message, 'mute')) return;
      const target = message.mentions.members?.first();
      if (!target) return message.reply({ embeds: [errorEmbed('Missing User', 'Please mention a member to mute.')] });
      if (!canModerate(message.member!, target))
        return message.reply({ embeds: [errorEmbed('Hierarchy Error', 'You cannot mute this member.')] });
      const reason = args.slice(1).join(' ') || 'No reason provided';
      // Find or create a "Muted" role
      let mutedRole = message.guild!.roles.cache.find(r => r.name === 'Muted');
      if (!mutedRole) {
        mutedRole = await message.guild!.roles.create({ name: 'Muted', color: 0x808080, reason: 'Bot mute role' });
        for (const [, channel] of message.guild!.channels.cache) {
          try {
            await channel.permissionOverwrites.create(mutedRole!, {
              SendMessages: false,
              Speak: false,
              AddReactions: false,
            });
          } catch {}
        }
      }
      try {
        await target.roles.add(mutedRole);
        await message.reply({ embeds: [modEmbed('🔇 Member Muted', `**${target.user.tag}** has been muted.\n**Reason:** ${reason}`)] });
        try { await target.send({ embeds: [modEmbed('🔇 You were Muted', `You have been muted in **${message.guild!.name}**.\n**Reason:** ${reason}`)] }); } catch {}
        await sendLog(message.client, message.guild!.id, 'members_log', modEmbed('🔇 Chat Mute', `**User:** ${target.user.tag}\n**Mod:** ${message.author.tag}\n**Reason:** ${reason}`));
      } catch { await message.reply({ embeds: [errorEmbed('Mute Failed', 'Could not mute this member.')] }); }
    }
  },

  // ── CHAT UNMUTE ───────────────────────────────────────────────────────────
  {
    name: 'chatunmute',
    description: 'Unmute a user',
    category: 'Mute',
    usage: 'chatunmute <@user>',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ManageRoles))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Roles** permission.')] });
      if (await enforceWhitelist(message, 'mute')) return;
      const target = message.mentions.members?.first();
      if (!target) return message.reply({ embeds: [errorEmbed('Missing User', 'Please mention a member to unmute.')] });
      const mutedRole = message.guild!.roles.cache.find(r => r.name === 'Muted');
      if (!mutedRole || !target.roles.cache.has(mutedRole.id))
        return message.reply({ embeds: [errorEmbed('Not Muted', 'This member is not muted.')] });
      try {
        await target.roles.remove(mutedRole);
        await message.reply({ embeds: [successEmbed('Member Unmuted', `**${target.user.tag}** has been unmuted.`)] });
        try { await target.send({ embeds: [successEmbed('You were Unmuted', `You have been unmuted in **${message.guild!.name}**.`)] }); } catch {}
      } catch { await message.reply({ embeds: [errorEmbed('Unmute Failed', 'Could not unmute this member.')] }); }
    }
  },

  // ── CHAT LOCK ─────────────────────────────────────────────────────────────
  {
    name: 'chatlock',
    description: 'Lock the current channel so no one can chat',
    category: 'Mute',
    usage: 'chatlock [reason]',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ManageChannels))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Channels** permission.')] });
      if (await enforceWhitelist(message, 'channel')) return;
      const reason = args.join(' ') || 'Channel locked';
      try {
        await (message.channel as any).permissionOverwrites.edit(message.guild!.roles.everyone, { SendMessages: false });
        await message.reply({ embeds: [modEmbed('🔒 Channel Locked', `This channel has been locked.\n**Reason:** ${reason}`)] });
      } catch { await message.reply({ embeds: [errorEmbed('Lock Failed', 'Could not lock this channel.')] }); }
    }
  },

  // ── CHAT UNLOCK ───────────────────────────────────────────────────────────
  {
    name: 'chatunlock',
    description: 'Unlock the current channel',
    category: 'Mute',
    usage: 'chatunlock [reason]',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ManageChannels))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Channels** permission.')] });
      if (await enforceWhitelist(message, 'channel')) return;
      try {
        await (message.channel as any).permissionOverwrites.edit(message.guild!.roles.everyone, { SendMessages: null });
        await message.reply({ embeds: [successEmbed('Channel Unlocked', 'This channel has been unlocked.')] });
      } catch { await message.reply({ embeds: [errorEmbed('Unlock Failed', 'Could not unlock this channel.')] }); }
    }
  },

  // ── VC MUTE ───────────────────────────────────────────────────────────────
  {
    name: 'vcmute',
    description: 'Server mute a member in voice channel',
    category: 'Mute',
    usage: 'vcmute <@user>',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.MuteMembers))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Mute Members** permission.')] });
      if (await enforceWhitelist(message, 'mute')) return;
      const target = message.mentions.members?.first();
      if (!target) return message.reply({ embeds: [errorEmbed('Missing User', 'Mention a member.')] });
      if (!target.voice.channel) return message.reply({ embeds: [errorEmbed('Not in VC', 'This member is not in a voice channel.')] });
      try {
        await target.voice.setMute(true, 'VC Mute command');
        await message.reply({ embeds: [modEmbed('🎙️ VC Muted', `**${target.user.tag}** has been server muted.`)] });
      } catch { await message.reply({ embeds: [errorEmbed('Failed', 'Could not mute this member.')] }); }
    }
  },

  // ── VC UNMUTE ─────────────────────────────────────────────────────────────
  {
    name: 'vcunmute',
    description: 'Remove server mute from a member',
    category: 'Mute',
    usage: 'vcunmute <@user>',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.MuteMembers))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Mute Members** permission.')] });
      if (await enforceWhitelist(message, 'mute')) return;
      const target = message.mentions.members?.first();
      if (!target?.voice.channel) return message.reply({ embeds: [errorEmbed('Not in VC', 'This member is not in a voice channel.')] });
      try {
        await target.voice.setMute(false);
        await message.reply({ embeds: [successEmbed('VC Unmuted', `**${target.user.tag}** has been unmuted.`)] });
      } catch { await message.reply({ embeds: [errorEmbed('Failed', 'Could not unmute this member.')] }); }
    }
  },

  // ── VC MUTE ALL ───────────────────────────────────────────────────────────
  {
    name: 'vcmuteall',
    description: 'Server mute all members in your voice channel',
    category: 'Mute',
    usage: 'vcmuteall',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.MuteMembers))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Mute Members** permission.')] });
      if (await enforceWhitelist(message, 'mute')) return;
      const vc = message.member!.voice.channel;
      if (!vc) return message.reply({ embeds: [errorEmbed('Not in VC', 'You must be in a voice channel.')] });
      let done = 0;
      for (const [, member] of vc.members) {
        try { await member.voice.setMute(true); done++; } catch {}
      }
      await message.reply({ embeds: [modEmbed('🎙️ VC Mute All', `Muted **${done}** members in **${vc.name}**.`)] });
    }
  },

  // ── VC UNMUTE ALL ─────────────────────────────────────────────────────────
  {
    name: 'vcunmuteall',
    description: 'Unmute all members in your voice channel',
    category: 'Mute',
    usage: 'vcunmuteall',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.MuteMembers))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Mute Members** permission.')] });
      if (await enforceWhitelist(message, 'mute')) return;
      const vc = message.member!.voice.channel;
      if (!vc) return message.reply({ embeds: [errorEmbed('Not in VC', 'You must be in a voice channel.')] });
      let done = 0;
      for (const [, member] of vc.members) {
        try { await member.voice.setMute(false); done++; } catch {}
      }
      await message.reply({ embeds: [successEmbed('VC Unmute All', `Unmuted **${done}** members in **${vc.name}**.`)] });
    }
  },

  // ── VC DEAFEN ─────────────────────────────────────────────────────────────
  {
    name: 'vcdeafen',
    description: 'Server deafen a member',
    category: 'Mute',
    usage: 'vcdeafen <@user>',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.DeafenMembers))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Deafen Members** permission.')] });
      if (await enforceWhitelist(message, 'mute')) return;
      const target = message.mentions.members?.first();
      if (!target?.voice.channel) return message.reply({ embeds: [errorEmbed('Not in VC', 'This member is not in a voice channel.')] });
      try {
        await target.voice.setDeaf(true);
        await message.reply({ embeds: [modEmbed('🔕 VC Deafened', `**${target.user.tag}** has been server deafened.`)] });
      } catch { await message.reply({ embeds: [errorEmbed('Failed', 'Could not deafen this member.')] }); }
    }
  },

  // ── VC UNDEAFEN ───────────────────────────────────────────────────────────
  {
    name: 'vcundeafen',
    description: 'Undeafen a member in voice channel',
    category: 'Mute',
    usage: 'vcundeafen <@user>',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.DeafenMembers))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Deafen Members** permission.')] });
      if (await enforceWhitelist(message, 'mute')) return;
      const target = message.mentions.members?.first();
      if (!target?.voice.channel) return message.reply({ embeds: [errorEmbed('Not in VC', 'This member is not in a voice channel.')] });
      try {
        await target.voice.setDeaf(false);
        await message.reply({ embeds: [successEmbed('VC Undeafened', `**${target.user.tag}** has been undeafened.`)] });
      } catch { await message.reply({ embeds: [errorEmbed('Failed', 'Could not undeafen this member.')] }); }
    }
  },

  // ── VC DEAFEN ALL ─────────────────────────────────────────────────────────
  {
    name: 'vcdeafenall',
    description: 'Deafen all members in your voice channel',
    category: 'Mute',
    usage: 'vcdeafenall',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.DeafenMembers))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Deafen Members** permission.')] });
      if (await enforceWhitelist(message, 'mute')) return;
      const vc = message.member!.voice.channel;
      if (!vc) return message.reply({ embeds: [errorEmbed('Not in VC', 'You must be in a voice channel.')] });
      let done = 0;
      for (const [, member] of vc.members) {
        try { await member.voice.setDeaf(true); done++; } catch {}
      }
      await message.reply({ embeds: [modEmbed('🔕 VC Deafen All', `Deafened **${done}** members in **${vc.name}**.`)] });
    }
  },

  // ── VC UNDEAFEN ALL ───────────────────────────────────────────────────────
  {
    name: 'vcundeafenall',
    description: 'Undeafen all members in your voice channel',
    category: 'Mute',
    usage: 'vcundeafenall',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.DeafenMembers))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Deafen Members** permission.')] });
      if (await enforceWhitelist(message, 'mute')) return;
      const vc = message.member!.voice.channel;
      if (!vc) return message.reply({ embeds: [errorEmbed('Not in VC', 'You must be in a voice channel.')] });
      let done = 0;
      for (const [, member] of vc.members) {
        try { await member.voice.setDeaf(false); done++; } catch {}
      }
      await message.reply({ embeds: [successEmbed('VC Undeafen All', `Undeafened **${done}** members in **${vc.name}**.`)] });
    }
  },

  // ── VC MOVE ───────────────────────────────────────────────────────────────
  {
    name: 'vcmove',
    description: 'Move a member to another voice channel',
    category: 'Mute',
    usage: 'vcmove <@user> <channelID>',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.MoveMembers))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Move Members** permission.')] });
      const target = message.mentions.members?.first();
      if (!target?.voice.channel) return message.reply({ embeds: [errorEmbed('Not in VC', 'This member is not in a voice channel.')] });
      const channelId = args[1];
      if (!channelId) return message.reply({ embeds: [errorEmbed('Missing Channel', 'Provide a voice channel ID.')] });
      try {
        await target.voice.setChannel(channelId);
        await message.reply({ embeds: [successEmbed('Member Moved', `**${target.user.tag}** has been moved to <#${channelId}>.`)] });
      } catch { await message.reply({ embeds: [errorEmbed('Move Failed', 'Could not move this member. Make sure the channel ID is correct.')] }); }
    }
  },

  // ── VC MOVE ALL ───────────────────────────────────────────────────────────
  {
    name: 'vcmoveall',
    description: 'Move all members in your VC to another channel',
    category: 'Mute',
    usage: 'vcmoveall <channelID>',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.MoveMembers))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Move Members** permission.')] });
      const vc = message.member!.voice.channel;
      if (!vc) return message.reply({ embeds: [errorEmbed('Not in VC', 'You must be in a voice channel.')] });
      const channelId = args[0];
      if (!channelId) return message.reply({ embeds: [errorEmbed('Missing Channel', 'Provide a voice channel ID.')] });
      let done = 0;
      for (const [, member] of vc.members) {
        try { await member.voice.setChannel(channelId); done++; } catch {}
      }
      await message.reply({ embeds: [successEmbed('VC Move All', `Moved **${done}** members to <#${channelId}>.`)] });
    }
  },

  // ── VC KICK ───────────────────────────────────────────────────────────────
  {
    name: 'vckick',
    description: 'Kick a member from their voice channel',
    category: 'Mute',
    usage: 'vckick <@user>',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.MoveMembers))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Move Members** permission.')] });
      if (await enforceWhitelist(message, 'kick')) return;
      const target = message.mentions.members?.first();
      if (!target?.voice.channel) return message.reply({ embeds: [errorEmbed('Not in VC', 'This member is not in a voice channel.')] });
      try {
        await target.voice.disconnect('VC kick command');
        await message.reply({ embeds: [modEmbed('👢 VC Kicked', `**${target.user.tag}** has been disconnected from voice.`)] });
      } catch { await message.reply({ embeds: [errorEmbed('Failed', 'Could not kick this member from VC.')] }); }
    }
  },

  // ── VC KICK ALL ───────────────────────────────────────────────────────────
  {
    name: 'vckickall',
    description: 'Kick all members from your voice channel',
    category: 'Mute',
    usage: 'vckickall',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.MoveMembers))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Move Members** permission.')] });
      if (await enforceWhitelist(message, 'kick')) return;
      const vc = message.member!.voice.channel;
      if (!vc) return message.reply({ embeds: [errorEmbed('Not in VC', 'You must be in a voice channel.')] });
      let done = 0;
      for (const [, member] of vc.members) {
        if (member.id === message.client.user!.id) continue;
        try { await member.voice.disconnect(); done++; } catch {}
      }
      await message.reply({ embeds: [modEmbed('👢 VC Kick All', `Kicked **${done}** members from **${vc.name}**.`)] });
    }
  },

  // ── VC BAN ────────────────────────────────────────────────────────────────
  {
    name: 'vcban',
    description: 'Ban a user from joining any voice channel',
    category: 'Mute',
    usage: 'vcban <@user> [reason]',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.MuteMembers))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Mute Members** permission.')] });
      if (await enforceWhitelist(message, 'ban')) return;
      const target = message.mentions.members?.first();
      if (!target) return message.reply({ embeds: [errorEmbed('Missing User', 'Mention a member.')] });
      if (!canModerate(message.member!, target))
        return message.reply({ embeds: [errorEmbed('Hierarchy Error', 'You cannot VC ban this member.')] });
      const reason = args.slice(1).join(' ') || 'No reason';
      const { addVcBan } = await import('../database.js');
      addVcBan(message.guild!.id, target.id, reason, message.author.id);
      // Disconnect from VC if currently in one
      if (target.voice.channel) {
        try { await target.voice.disconnect(); } catch {}
      }
      // Remove connect permission from all voice channels
      for (const [, channel] of message.guild!.channels.cache.filter(c => c.type === 2 || c.type === 13)) {
        try { await (channel as any).permissionOverwrites.create(target, { Connect: false }); } catch {}
      }
      await message.reply({ embeds: [modEmbed('🔇 VC Banned', `**${target.user.tag}** has been banned from all voice channels.\n**Reason:** ${reason}`)] });
    }
  },

  // ── VC UNBAN ──────────────────────────────────────────────────────────────
  {
    name: 'vcunban',
    description: 'Unban a user from voice channels',
    category: 'Mute',
    usage: 'vcunban <@user>',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.MuteMembers))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Mute Members** permission.')] });
      if (await enforceWhitelist(message, 'ban')) return;
      const target = message.mentions.members?.first();
      if (!target) return message.reply({ embeds: [errorEmbed('Missing User', 'Mention a member.')] });
      const { removeVcBan } = await import('../database.js');
      removeVcBan(message.guild!.id, target.id);
      for (const [, channel] of message.guild!.channels.cache.filter(c => c.type === 2 || c.type === 13)) {
        try { await (channel as any).permissionOverwrites.delete(target); } catch {}
      }
      await message.reply({ embeds: [successEmbed('VC Unbanned', `**${target.user.tag}** can now join voice channels again.`)] });
    }
  },

  // ── VC HIDE / UNHIDE ─────────────────────────────────────────────────────
  {
    name: 'vchide',
    description: 'Hide a voice channel from everyone',
    category: 'Mute',
    usage: 'vchide <channelID>',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ManageChannels))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Channels** permission.')] });
      if (await enforceWhitelist(message, 'channel')) return;
      const channelId = args[0] || message.member!.voice.channel?.id;
      if (!channelId) return message.reply({ embeds: [errorEmbed('Missing Channel', 'Provide a channel ID or be in a VC.')] });
      const channel = message.guild!.channels.cache.get(channelId);
      if (!channel) return message.reply({ embeds: [errorEmbed('Invalid Channel', 'Channel not found.')] });
      try {
        await (channel as any).permissionOverwrites.edit(message.guild!.roles.everyone, { ViewChannel: false });
        await message.reply({ embeds: [successEmbed('VC Hidden', `**${channel.name}** is now hidden from everyone.`)] });
      } catch { await message.reply({ embeds: [errorEmbed('Failed', 'Could not hide this channel.')] }); }
    }
  },

  {
    name: 'vcunhide',
    description: 'Unhide a voice channel',
    category: 'Mute',
    usage: 'vcunhide <channelID>',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ManageChannels))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Channels** permission.')] });
      if (await enforceWhitelist(message, 'channel')) return;
      const channelId = args[0] || message.member!.voice.channel?.id;
      if (!channelId) return message.reply({ embeds: [errorEmbed('Missing Channel', 'Provide a channel ID or be in a VC.')] });
      const channel = message.guild!.channels.cache.get(channelId);
      if (!channel) return message.reply({ embeds: [errorEmbed('Invalid Channel', 'Channel not found.')] });
      try {
        await (channel as any).permissionOverwrites.edit(message.guild!.roles.everyone, { ViewChannel: null });
        await message.reply({ embeds: [successEmbed('VC Visible', `**${channel.name}** is now visible to everyone.`)] });
      } catch { await message.reply({ embeds: [errorEmbed('Failed', 'Could not unhide this channel.')] }); }
    }
  },
];

export default muteCommands;
