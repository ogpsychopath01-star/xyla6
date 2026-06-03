import {
  GuildMember, PermissionFlagsBits, EmbedBuilder, TextChannel, Collection, Message
} from 'discord.js';
import { BotCommand } from '../client.js';
import { addWarning, getWarnings, removeWarnings, getGuildWarnings } from '../database.js';
import { successEmbed, errorEmbed, modEmbed, COLORS } from '../utils/embeds.js';
import { isBotOwner, canModerate, hasPermission, Perms } from '../utils/permissions.js';
import { sendLog } from '../utils/helpers.js';
import { enforceWhitelist } from '../utils/whitelist.js';

// DM a user about a moderation action (silently fails if DMs closed)
async function dmUser(member: GuildMember, title: string, description: string) {
  try {
    await member.send({ embeds: [modEmbed(title, description)] });
  } catch {}
}

const moderation: BotCommand[] = [

  // ── BAN ──────────────────────────────────────────────────────────────────
  {
    name: 'ban',
    description: 'Ban a member from the server',
    category: 'Moderation',
    aliases: ['banuser'],
    usage: 'ban <@user> [reason]',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.BanMembers))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Ban Members** permission.')] });
      if (await enforceWhitelist(message, 'ban')) return;
      const target = message.mentions.members?.first();
      if (!target) return message.reply({ embeds: [errorEmbed('Missing User', 'Please mention a member to ban.')] });
      if (!canModerate(message.member!, target))
        return message.reply({ embeds: [errorEmbed('Hierarchy Error', 'You cannot ban this member.')] });
      const reason = args.slice(1).join(' ') || 'No reason provided';
      try {
        await dmUser(target, '🔨 You were Banned', `You have been **banned** from **${message.guild!.name}**.\n**Reason:** ${reason}\n**Moderator:** ${message.author.tag}`);
        await target.ban({ reason });
        await message.reply({ embeds: [modEmbed('🔨 Member Banned', `**${target.user.tag}** has been banned.\n**Reason:** ${reason}`)] });
        await sendLog(message.client, message.guild!.id, 'memberslog', modEmbed('🔨 Member Banned', `**User:** ${target.user.tag} (\`${target.id}\`)\n**Mod:** ${message.author.tag}\n**Reason:** ${reason}`));
      } catch { await message.reply({ embeds: [errorEmbed('Ban Failed', 'Could not ban this member.')] }); }
    }
  },

  // ── UNBAN ─────────────────────────────────────────────────────────────────
  {
    name: 'unban',
    description: 'Unban a user from the server',
    category: 'Moderation',
    usage: 'unban <userID> [reason]',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.BanMembers))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Ban Members** permission.')] });
      if (await enforceWhitelist(message, 'ban')) return;
      const userId = args[0];
      if (!userId) return message.reply({ embeds: [errorEmbed('Missing ID', 'Please provide a user ID to unban.')] });
      const reason = args.slice(1).join(' ') || 'No reason provided';
      try {
        await message.guild!.bans.remove(userId, reason);
        await message.reply({ embeds: [modEmbed('✅ Member Unbanned', `User \`${userId}\` has been unbanned.\n**Reason:** ${reason}`)] });
        await sendLog(message.client, message.guild!.id, 'memberslog', modEmbed('✅ Member Unbanned', `**UserID:** \`${userId}\`\n**Mod:** ${message.author.tag}\n**Reason:** ${reason}`));
      } catch { await message.reply({ embeds: [errorEmbed('Unban Failed', 'Could not unban this user. Make sure the ID is correct.')] }); }
    }
  },

  // ── HACKBAN ───────────────────────────────────────────────────────────────
  {
    name: 'hackban',
    description: 'Ban a user by ID (even if not in server)',
    category: 'Moderation',
    aliases: ['forceban', 'idban'],
    usage: 'hackban <userID> [reason]',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.BanMembers))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Ban Members** permission.')] });
      if (await enforceWhitelist(message, 'ban')) return;
      const userId = args[0];
      if (!userId || !/^\d{17,19}$/.test(userId))
        return message.reply({ embeds: [errorEmbed('Invalid ID', 'Provide a valid Discord user ID.')] });
      const reason = args.slice(1).join(' ') || 'Hackban';
      try {
        await message.guild!.bans.create(userId, { reason });
        await message.reply({ embeds: [modEmbed('🔨 Hackban', `User \`${userId}\` has been banned.\n**Reason:** ${reason}`)] });
        await sendLog(message.client, message.guild!.id, 'memberslog', modEmbed('🔨 Hackban', `**UserID:** \`${userId}\`\n**Mod:** ${message.author.tag}\n**Reason:** ${reason}`));
      } catch { await message.reply({ embeds: [errorEmbed('Hackban Failed', 'Could not ban this user. Make sure the ID is valid.')] }); }
    }
  },

  // ── MASS BAN ──────────────────────────────────────────────────────────────
  {
    name: 'massban',
    description: 'Ban multiple members at once',
    category: 'Moderation',
    usage: 'massban <@user1> <@user2> ... [reason]',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.BanMembers))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Ban Members** permission.')] });
      if (await enforceWhitelist(message, 'ban')) return;
      const targets = message.mentions.members!;
      if (targets.size === 0) return message.reply({ embeds: [errorEmbed('Missing Users', 'Please mention members to ban.')] });
      const reason = args.filter(a => !a.startsWith('<@')).join(' ') || 'Mass ban';
      let banned = 0;
      for (const [, member] of targets) {
        if (!canModerate(message.member!, member)) continue;
        try {
          await dmUser(member, '🔨 You were Banned', `You have been **banned** from **${message.guild!.name}**.\n**Reason:** ${reason}`);
          await member.ban({ reason }); banned++;
        } catch {}
      }
      await message.reply({ embeds: [modEmbed('🔨 Mass Ban', `Banned **${banned}/${targets.size}** members.\n**Reason:** ${reason}`)] });
      await sendLog(message.client, message.guild!.id, 'memberslog', modEmbed('🔨 Mass Ban', `**Mod:** ${message.author.tag}\n**Banned:** ${banned} members\n**Reason:** ${reason}`));
    }
  },

  // ── MASS UNBAN ────────────────────────────────────────────────────────────
  {
    name: 'massunban',
    description: 'Unban multiple users by IDs',
    category: 'Moderation',
    usage: 'massunban <id1> <id2> ...',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.BanMembers))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Ban Members** permission.')] });
      if (await enforceWhitelist(message, 'ban')) return;
      if (!args.length) return message.reply({ embeds: [errorEmbed('Missing IDs', 'Provide user IDs to unban.')] });
      let unbanned = 0;
      for (const id of args) {
        try { await message.guild!.bans.remove(id); unbanned++; } catch {}
      }
      await message.reply({ embeds: [modEmbed('✅ Mass Unban', `Unbanned **${unbanned}/${args.length}** users.`)] });
    }
  },

  // ── KICK ──────────────────────────────────────────────────────────────────
  {
    name: 'kick',
    description: 'Kick a member from the server',
    category: 'Moderation',
    usage: 'kick <@user> [reason]',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.KickMembers))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Kick Members** permission.')] });
      if (await enforceWhitelist(message, 'kick')) return;
      const target = message.mentions.members?.first();
      if (!target) return message.reply({ embeds: [errorEmbed('Missing User', 'Please mention a member to kick.')] });
      if (!canModerate(message.member!, target))
        return message.reply({ embeds: [errorEmbed('Hierarchy Error', 'You cannot kick this member.')] });
      const reason = args.slice(1).join(' ') || 'No reason provided';
      try {
        await dmUser(target, '👢 You were Kicked', `You have been **kicked** from **${message.guild!.name}**.\n**Reason:** ${reason}\n**Moderator:** ${message.author.tag}`);
        await target.kick(reason);
        await message.reply({ embeds: [modEmbed('👢 Member Kicked', `**${target.user.tag}** has been kicked.\n**Reason:** ${reason}`)] });
        await sendLog(message.client, message.guild!.id, 'memberslog', modEmbed('👢 Member Kicked', `**User:** ${target.user.tag}\n**Mod:** ${message.author.tag}\n**Reason:** ${reason}`));
      } catch { await message.reply({ embeds: [errorEmbed('Kick Failed', 'Could not kick this member.')] }); }
    }
  },

  // ── MASS KICK ─────────────────────────────────────────────────────────────
  {
    name: 'masskick',
    description: 'Kick multiple members at once',
    category: 'Moderation',
    usage: 'masskick <@user1> <@user2> ...',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.KickMembers))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Kick Members** permission.')] });
      if (await enforceWhitelist(message, 'kick')) return;
      const targets = message.mentions.members!;
      if (targets.size === 0) return message.reply({ embeds: [errorEmbed('Missing Users', 'Please mention members to kick.')] });
      const reason = args.filter(a => !a.startsWith('<@')).join(' ') || 'Mass kick';
      let kicked = 0;
      for (const [, member] of targets) {
        if (!canModerate(message.member!, member)) continue;
        try {
          await dmUser(member, '👢 You were Kicked', `You have been **kicked** from **${message.guild!.name}**.\n**Reason:** ${reason}`);
          await member.kick(reason); kicked++;
        } catch {}
      }
      await message.reply({ embeds: [modEmbed('👢 Mass Kick', `Kicked **${kicked}/${targets.size}** members.\n**Reason:** ${reason}`)] });
    }
  },

  // ── TIMEOUT ───────────────────────────────────────────────────────────────
  {
    name: 'timeout',
    description: 'Timeout a member',
    category: 'Moderation',
    aliases: ['tm'],
    usage: 'timeout <@user> <duration> [reason] (e.g. 10m, 1h, 1d)',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ModerateMembers))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Moderate Members** permission.')] });
      if (await enforceWhitelist(message, 'timeout')) return;
      const target = message.mentions.members?.first();
      if (!target) return message.reply({ embeds: [errorEmbed('Missing User', 'Please mention a member.')] });
      if (!canModerate(message.member!, target))
        return message.reply({ embeds: [errorEmbed('Hierarchy Error', 'You cannot timeout this member.')] });
      const durationStr = args[1];
      if (!durationStr) return message.reply({ embeds: [errorEmbed('Missing Duration', 'Provide a duration like `10m`, `1h`, `1d`.')] });
      const { parseTime } = await import('../utils/helpers.js');
      const ms = parseTime(durationStr);
      if (!ms) return message.reply({ embeds: [errorEmbed('Invalid Duration', 'Use format like `10m`, `1h`, `7d`.')] });
      const reason = args.slice(2).join(' ') || 'No reason provided';
      try {
        await dmUser(target, '⏰ You were Timed Out', `You have been **timed out** in **${message.guild!.name}** for **${durationStr}**.\n**Reason:** ${reason}\n**Moderator:** ${message.author.tag}`);
        await target.timeout(ms, reason);
        await message.reply({ embeds: [modEmbed('⏰ Member Timed Out', `**${target.user.tag}** has been timed out for **${durationStr}**.\n**Reason:** ${reason}`)] });
        await sendLog(message.client, message.guild!.id, 'memberslog', modEmbed('⏰ Timeout', `**User:** ${target.user.tag}\n**Duration:** ${durationStr}\n**Mod:** ${message.author.tag}\n**Reason:** ${reason}`));
      } catch { await message.reply({ embeds: [errorEmbed('Timeout Failed', 'Could not timeout this member.')] }); }
    }
  },

  // ── TIMEOUT REMOVE ────────────────────────────────────────────────────────
  {
    name: 'untimeout',
    description: 'Remove timeout from a member',
    category: 'Moderation',
    aliases: ['unmute', 'tmremove', 'removetm'],
    usage: 'untimeout <@user>',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ModerateMembers))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Moderate Members** permission.')] });
      if (await enforceWhitelist(message, 'timeout')) return;
      const target = message.mentions.members?.first();
      if (!target) return message.reply({ embeds: [errorEmbed('Missing User', 'Please mention a member.')] });
      try {
        await target.timeout(null);
        await message.reply({ embeds: [modEmbed('✅ Timeout Removed', `**${target.user.tag}** timeout has been removed.`)] });
        await dmUser(target, '✅ Timeout Removed', `Your timeout in **${message.guild!.name}** has been removed.`);
      } catch { await message.reply({ embeds: [errorEmbed('Failed', 'Could not remove timeout.')] }); }
    }
  },

  // ── MASS TIMEOUT ──────────────────────────────────────────────────────────
  {
    name: 'masstm',
    description: 'Timeout multiple members',
    category: 'Moderation',
    usage: 'masstm <duration> <@user1> <@user2> ...',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ModerateMembers))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Moderate Members** permission.')] });
      if (await enforceWhitelist(message, 'timeout')) return;
      const { parseTime } = await import('../utils/helpers.js');
      const ms = parseTime(args[0]);
      if (!ms) return message.reply({ embeds: [errorEmbed('Invalid Duration', 'First arg must be duration like `10m`.')] });
      const targets = message.mentions.members!;
      if (targets.size === 0) return message.reply({ embeds: [errorEmbed('Missing Users', 'Mention members to timeout.')] });
      let done = 0;
      for (const [, member] of targets) {
        if (!canModerate(message.member!, member)) continue;
        try {
          await dmUser(member, '⏰ You were Timed Out', `You have been **timed out** in **${message.guild!.name}** for **${args[0]}**.`);
          await member.timeout(ms); done++;
        } catch {}
      }
      await message.reply({ embeds: [modEmbed('⏰ Mass Timeout', `Timed out **${done}/${targets.size}** members for **${args[0]}**.`)] });
    }
  },

  // ── MASS TIMEOUT REMOVE ───────────────────────────────────────────────────
  {
    name: 'masstmremove',
    description: 'Remove timeout from multiple members',
    category: 'Moderation',
    usage: 'masstmremove <@user1> <@user2> ...',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ModerateMembers))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Moderate Members** permission.')] });
      if (await enforceWhitelist(message, 'timeout')) return;
      const targets = message.mentions.members!;
      if (targets.size === 0) return message.reply({ embeds: [errorEmbed('Missing Users', 'Mention members to remove timeout.')] });
      let done = 0;
      for (const [, member] of targets) {
        try { await member.timeout(null); done++; } catch {}
      }
      await message.reply({ embeds: [modEmbed('✅ Mass Timeout Removed', `Removed timeout from **${done}/${targets.size}** members.`)] });
    }
  },

  // ── WARN ──────────────────────────────────────────────────────────────────
  {
    name: 'warn',
    description: 'Warn a member',
    category: 'Moderation',
    usage: 'warn <@user> [reason]',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ModerateMembers))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Moderate Members** permission.')] });
      if (await enforceWhitelist(message, 'timeout')) return;
      const target = message.mentions.members?.first();
      if (!target) return message.reply({ embeds: [errorEmbed('Missing User', 'Please mention a member to warn.')] });
      if (!canModerate(message.member!, target))
        return message.reply({ embeds: [errorEmbed('Hierarchy Error', 'You cannot warn this member.')] });
      const reason = args.slice(1).join(' ') || 'No reason provided';
      addWarning(message.guild!.id, target.id, reason, message.author.id);
      const warns = getWarnings(message.guild!.id, target.id);
      await message.reply({ embeds: [modEmbed('⚠️ Member Warned', `**${target.user.tag}** has been warned.\n**Reason:** ${reason}\n**Total Warnings:** ${warns.length}`)] });
      await dmUser(target, '⚠️ You were Warned', `You were warned in **${message.guild!.name}**.\n**Reason:** ${reason}\n**Total Warnings:** ${warns.length}\n**Moderator:** ${message.author.tag}`);
      await sendLog(message.client, message.guild!.id, 'memberslog', modEmbed('⚠️ Warning Issued', `**User:** ${target.user.tag}\n**Mod:** ${message.author.tag}\n**Reason:** ${reason}\n**Total:** ${warns.length}`));
    }
  },

  // ── MASS WARN ─────────────────────────────────────────────────────────────
  {
    name: 'masswarn',
    description: 'Warn multiple members at once',
    category: 'Moderation',
    usage: 'masswarn <@user1> <@user2> ... [reason]',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ModerateMembers))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Moderate Members** permission.')] });
      if (await enforceWhitelist(message, 'warn')) return;
      const targets = message.mentions.members!;
      if (targets.size === 0) return message.reply({ embeds: [errorEmbed('Missing Users', 'Mention members to warn.')] });
      const reason = args.filter(a => !a.startsWith('<@')).join(' ') || 'Mass warn';
      for (const [, member] of targets) {
        if (!canModerate(message.member!, member)) continue;
        addWarning(message.guild!.id, member.id, reason, message.author.id);
        await dmUser(member, '⚠️ You were Warned', `You were warned in **${message.guild!.name}**.\n**Reason:** ${reason}`);
      }
      await message.reply({ embeds: [modEmbed('⚠️ Mass Warn', `Warned **${targets.size}** members.\n**Reason:** ${reason}`)] });
    }
  },

  // ── WARNINGS ──────────────────────────────────────────────────────────────
  {
    name: 'warnings',
    description: 'Check warnings of a user',
    category: 'Moderation',
    aliases: ['warns', 'checkwarns'],
    usage: 'warnings <@user>',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ModerateMembers))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Moderate Members** permission.')] });
      if (await enforceWhitelist(message, 'warn')) return;
      const target = message.mentions.members?.first() ?? message.member!;
      const warns = getWarnings(message.guild!.id, target.id);
      if (!warns.length) return message.reply({ embeds: [new EmbedBuilder().setColor(0x00B0F4).setTitle(`ℹ️ No Warnings`).setDescription(`**${target.user.tag}** has no warnings.`).setTimestamp()] });
      const list = warns.map((w, i) => `**${i + 1}.** ${w.reason} — <@${w.moderator_id}> <t:${Math.floor(w.timestamp / 1000)}:R>`).join('\n');
      await message.reply({ embeds: [modEmbed(`⚠️ Warnings — ${target.user.tag}`, list).setFooter({ text: `Total: ${warns.length}` })] });
    }
  },

  // ── REMOVE WARNS ──────────────────────────────────────────────────────────
  {
    name: 'removewarn',
    description: 'Remove warnings from a user',
    category: 'Moderation',
    aliases: ['clearwarns', 'delwarn'],
    usage: 'removewarn <@user> [count]',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ModerateMembers))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Moderate Members** permission.')] });
      if (await enforceWhitelist(message, 'warn')) return;
      const target = message.mentions.members?.first();
      if (!target) return message.reply({ embeds: [errorEmbed('Missing User', 'Please mention a member.')] });
      const count = args[1] ? parseInt(args[1]) : undefined;
      removeWarnings(message.guild!.id, target.id, count);
      await message.reply({ embeds: [successEmbed('Warnings Removed', count ? `Removed **${count}** warning(s) from **${target.user.tag}**.` : `Cleared **all** warnings from **${target.user.tag}**.`)] });
    }
  },

  // ── SLOWMODE ──────────────────────────────────────────────────────────────
  {
    name: 'slowmode',
    description: 'Set slowmode in current channel',
    category: 'Moderation',
    usage: 'slowmode <seconds> (0 to disable)',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ManageChannels))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Channels** permission.')] });
      const seconds = parseInt(args[0]);
      if (isNaN(seconds) || seconds < 0 || seconds > 21600)
        return message.reply({ embeds: [errorEmbed('Invalid Value', 'Provide a number between 0 and 21600 seconds.')] });
      try {
        await (message.channel as any).setRateLimitPerUser(seconds);
        await message.reply({ embeds: [successEmbed('Slowmode', seconds === 0 ? 'Slowmode has been **disabled**.' : `Slowmode set to **${seconds} second(s)**.`)] });
      } catch { await message.reply({ embeds: [errorEmbed('Failed', 'Could not set slowmode.')] }); }
    }
  },

  // ── PURGE ─────────────────────────────────────────────────────────────────
  {
    name: 'purge',
    description: 'Delete multiple messages at once (up to 1000)',
    category: 'Moderation',
    aliases: ['clear', 'prune'],
    usage: 'purge <amount> [@user]',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ManageMessages))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Messages** permission.')] });
      if (await enforceWhitelist(message, 'purge')) return;
      const amount = parseInt(args[0]);
      if (isNaN(amount) || amount < 1 || amount > 1000)
        return message.reply({ embeds: [errorEmbed('Invalid Amount', 'Provide a number between 1 and 1000.')] });
      const targetUser = message.mentions.users.first();
      // Delete the invoking command message first
      await message.delete().catch(() => {});
      try {
        let deleted = 0;
        let lastId: string | undefined = undefined;
        while (deleted < amount) {
          const batchSize = Math.min(100, amount - deleted);
          const fetchOptions: any = { limit: batchSize };
          if (lastId) fetchOptions.before = lastId;
          const fetched = await (message.channel as TextChannel).messages.fetch(fetchOptions) as unknown as Collection<string, Message<true>>;
          if (!fetched.size) break;
          lastId = fetched.last()?.id;
          let batch = [...fetched.values()];
          if (targetUser) batch = batch.filter(m => m.author.id === targetUser.id);
          if (!batch.length) { if (fetched.size < batchSize) break; continue; }
          const batchToDelete = batch.slice(0, amount - deleted);
          const result = await (message.channel as TextChannel).bulkDelete(batchToDelete, true);
          deleted += result.size;
          if (fetched.size < batchSize || result.size === 0) break;
          // Small delay to avoid hitting rate limits between batches
          if (deleted < amount) await new Promise(r => setTimeout(r, 1200));
        }
        const reply = await (message.channel as TextChannel).send({ embeds: [successEmbed('Messages Purged', `Deleted **${deleted}** message${deleted !== 1 ? 's' : ''}.`)] });
        setTimeout(() => reply.delete().catch(() => {}), 4000);
      } catch { await (message.channel as TextChannel).send({ embeds: [errorEmbed('Purge Failed', 'Could not delete messages. Messages older than 14 days cannot be bulk deleted.')] }); }
    }
  },

  // ── LOCK ──────────────────────────────────────────────────────────────────
  {
    name: 'lock',
    description: 'Lock a channel',
    category: 'Moderation',
    usage: 'lock [reason]',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ManageChannels))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Channels** permission.')] });
      if (await enforceWhitelist(message, 'channel')) return;
      await (message.channel as any).permissionOverwrites.edit(message.guild!.roles.everyone, { SendMessages: false });
      await message.reply({ embeds: [modEmbed('🔒 Channel Locked', `This channel has been locked.\n**Reason:** ${args.join(' ') || 'No reason'}`)] });
    }
  },

  // ── UNLOCK ────────────────────────────────────────────────────────────────
  {
    name: 'unlock',
    description: 'Unlock a channel',
    category: 'Moderation',
    usage: 'unlock',
    async execute(message) {
      if (!hasPermission(message.member!, Perms.ManageChannels))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Channels** permission.')] });
      if (await enforceWhitelist(message, 'channel')) return;
      await (message.channel as any).permissionOverwrites.edit(message.guild!.roles.everyone, { SendMessages: null });
      await message.reply({ embeds: [successEmbed('🔓 Channel Unlocked', 'This channel has been unlocked.')] });
    }
  },

  // ── WARNINGS LEADERBOARD ─────────────────────────────────────────────────
  {
    name: 'warnleaderboard',
    description: 'Show the top most-warned members in this server',
    category: 'Moderation',
    usage: 'warnleaderboard [top]',
    aliases: ['warnlb', 'topwarns', 'warnboard', 'mostwarned'],
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ModerateMembers))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Moderate Members** permission.')] });
      if (await enforceWhitelist(message, 'warn')) return;

      const limit = Math.min(parseInt(args[0]) || 10, 25);
      const allWarns = getGuildWarnings(message.guild!.id);

      if (!allWarns.length) return message.reply({ embeds: [new EmbedBuilder()
        .setColor(COLORS.info)
        .setTitle('📋 Warnings Leaderboard')
        .setDescription('No warnings have been issued in this server yet.')
        .setFooter({ text: `✦ Xyla Bot • Owner: ogpsychopath1` })
        .setTimestamp()
      ] });

      // Tally warns per user
      const counts: Record<string, number> = {};
      for (const w of allWarns) {
        counts[w.user_id] = (counts[w.user_id] ?? 0) + 1;
      }

      // Sort descending by count
      const sorted = Object.entries(counts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, limit);

      // Resolve display names (fetch members from cache, fallback to ID)
      const medals = ['🥇', '🥈', '🥉'];
      const lines = await Promise.all(sorted.map(async ([userId, count], i) => {
        const member = message.guild!.members.cache.get(userId)
          ?? await message.guild!.members.fetch(userId).catch(() => null);
        const name = member ? member.displayName : `Unknown (${userId})`;
        const medal = medals[i] ?? `**#${i + 1}**`;
        const bar = '▓'.repeat(Math.min(count, 10)) + '░'.repeat(Math.max(0, 10 - count));
        return `${medal} **${name}** — \`${count}\` warn${count !== 1 ? 's' : ''}\n\`${bar}\``;
      }));

      const totalWarns = allWarns.length;
      const uniqueUsers = Object.keys(counts).length;

      await message.reply({ embeds: [new EmbedBuilder()
        .setColor(COLORS.warning)
        .setTitle(`⚠️ Warnings Leaderboard — ${message.guild!.name}`)
        .setDescription(lines.join('\n\n'))
        .addFields(
          { name: '📊 Total Warnings', value: `${totalWarns}`, inline: true },
          { name: '👥 Unique Members', value: `${uniqueUsers}`, inline: true },
          { name: '🏆 Most Warned', value: sorted[0] ? `<@${sorted[0][0]}> (${sorted[0][1]})` : 'None', inline: true },
        )
        .setFooter({ text: `Showing top ${sorted.length} • ✦ Xyla Bot • Owner: ogpsychopath1` })
        .setTimestamp()
      ] });
    }
  },
];

export default moderation;
