import { EmbedBuilder } from 'discord.js';
import { BotCommand } from '../client.js';
import { COLORS } from '../utils/embeds.js';
import { getVoiceStats, getMessageStats, getAllVoiceStats, getAllMessageStats } from '../database.js';
import { formatTime } from '../utils/helpers.js';

function infoEmbed(t: string, d: string) {
  return new EmbedBuilder().setColor(COLORS.info).setTitle(`ℹ️ ${t}`).setDescription(d).setTimestamp();
}
function errorEmbed(t: string, d: string) {
  return new EmbedBuilder().setColor(COLORS.error).setTitle(`❌ ${t}`).setDescription(d).setTimestamp();
}
function successEmbed(t: string, d: string) {
  return new EmbedBuilder().setColor(COLORS.success).setTitle(`✅ ${t}`).setDescription(d).setTimestamp();
}

const MEDALS = ['🥇', '🥈', '🥉'];
function medal(i: number) { return MEDALS[i] ?? `**${i + 1}.**`; }

const utilityCommands: BotCommand[] = [

  // ── PING ──────────────────────────────────────────────────────────────────
  {
    name: 'ping',
    description: 'Check the bot latency',
    category: 'Utility',
    usage: 'ping',
    async execute(message) {
      const sent = await message.reply({ embeds: [infoEmbed('Pinging...', '🏓 Calculating...')] });
      const latency = sent.createdTimestamp - message.createdTimestamp;
      const apiLatency = Math.round(message.client.ws.ping);
      await sent.edit({ embeds: [new EmbedBuilder()
        .setColor(latency < 100 ? COLORS.success : latency < 200 ? COLORS.warning : COLORS.error)
        .setTitle('🏓 Pong!')
        .addFields(
          { name: '⌚ Message Latency', value: `\`${latency}ms\``, inline: true },
          { name: '💻 API Latency', value: `\`${apiLatency}ms\``, inline: true },
          { name: '🟢 Status', value: latency < 100 ? 'Excellent' : latency < 200 ? 'Good' : 'Poor', inline: true },
        )
        .setTimestamp()] });
    }
  },

  // ── AVATAR ────────────────────────────────────────────────────────────────
  {
    name: 'avatar',
    description: 'Show a user\'s avatar',
    category: 'Utility',
    aliases: ['av', 'pfp'],
    usage: 'avatar [@user]',
    async execute(message) {
      const target = message.mentions.users.first() ?? message.author;
      await message.reply({ embeds: [new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle(`🖼️ Avatar — ${target.username}`)
        .setImage(target.displayAvatarURL({ size: 4096 }))
        .addFields(
          { name: 'PNG', value: `[Link](${target.displayAvatarURL({ size: 4096, extension: 'png' })})`, inline: true },
          { name: 'JPG', value: `[Link](${target.displayAvatarURL({ size: 4096, extension: 'jpg' })})`, inline: true },
          { name: 'WEBP', value: `[Link](${target.displayAvatarURL({ size: 4096, extension: 'webp' })})`, inline: true },
        )
        .setTimestamp()] });
    }
  },

  // ── BANNER ────────────────────────────────────────────────────────────────
  {
    name: 'banner',
    description: 'Show a user\'s banner',
    category: 'Utility',
    usage: 'banner [@user]',
    async execute(message) {
      const target = message.mentions.users.first() ?? message.author;
      const user = await target.fetch();
      if (!user.banner)
        return message.reply({ embeds: [errorEmbed('No Banner', `**${target.username}** does not have a banner.`)] });
      await message.reply({ embeds: [new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle(`🖼️ Banner — ${target.username}`)
        .setImage(user.bannerURL({ size: 4096 })!)
        .setTimestamp()] });
    }
  },

  // ── USER INFO ─────────────────────────────────────────────────────────────
  {
    name: 'userinfo',
    description: 'Get information about a user',
    category: 'Utility',
    aliases: ['ui', 'whois'],
    usage: 'userinfo [@user]',
    async execute(message) {
      const member = message.mentions.members?.first() ?? message.member!;
      const user = member.user;
      const joinedAt = member.joinedAt ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>` : 'Unknown';
      const createdAt = `<t:${Math.floor(user.createdAt.getTime() / 1000)}:R>`;
      const roles = member.roles.cache.filter(r => r.id !== message.guild!.id).map(r => `<@&${r.id}>`).join(', ') || 'None';
      await message.reply({ embeds: [new EmbedBuilder()
        .setColor(member.displayHexColor || COLORS.primary)
        .setTitle(`👤 User Info — ${user.tag}`)
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .addFields(
          { name: '🆔 User ID', value: user.id, inline: true },
          { name: '📅 Account Created', value: createdAt, inline: true },
          { name: '📥 Joined Server', value: joinedAt, inline: true },
          { name: '🤖 Bot', value: user.bot ? 'Yes' : 'No', inline: true },
          { name: '🎭 Roles', value: roles.length > 1024 ? `${roles.slice(0, 1020)}...` : roles },
        )
        .setFooter({ text: `Requested by ${message.author.tag}` })
        .setTimestamp()] });
    }
  },

  // ── SERVER INFO ───────────────────────────────────────────────────────────
  {
    name: 'serverinfo',
    description: 'Get information about the server',
    category: 'Utility',
    aliases: ['si', 'guildinfo'],
    usage: 'serverinfo',
    async execute(message) {
      const guild = message.guild!;
      await guild.fetch();
      await message.reply({ embeds: [new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle(`🏠 Server Info — ${guild.name}`)
        .setThumbnail(guild.iconURL({ size: 256 }))
        .addFields(
          { name: '🆔 Server ID', value: guild.id, inline: true },
          { name: '👑 Owner', value: `<@${guild.ownerId}>`, inline: true },
          { name: '📅 Created', value: `<t:${Math.floor(guild.createdAt.getTime() / 1000)}:R>`, inline: true },
          { name: '👥 Members', value: `${guild.memberCount}`, inline: true },
          { name: '📢 Channels', value: `${guild.channels.cache.size}`, inline: true },
          { name: '🎭 Roles', value: `${guild.roles.cache.size}`, inline: true },
          { name: '😀 Emojis', value: `${guild.emojis.cache.size}`, inline: true },
          { name: '🚀 Boosts', value: `${guild.premiumSubscriptionCount ?? 0} (Level ${guild.premiumTier})`, inline: true },
          { name: '🔒 Verification', value: `${guild.verificationLevel}`, inline: true },
        )
        .setTimestamp()] });
    }
  },

  // ── STATS ─────────────────────────────────────────────────────────────────
  {
    name: 'stats',
    description: 'Check bot stats',
    category: 'Utility',
    aliases: ['botstats', 'status'],
    usage: 'stats',
    async execute(message) {
      const client = message.client;
      const mem = process.memoryUsage();
      await message.reply({ embeds: [new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle('📊 Bot Stats & Live Status')
        .setThumbnail(client.user!.displayAvatarURL())
        .addFields(
          { name: '🟢 Status', value: 'Online', inline: true },
          { name: '🏓 Latency', value: `\`${Math.round(client.ws.ping)}ms\``, inline: true },
          { name: '⏱️ Uptime', value: formatTime(Math.floor(process.uptime())), inline: true },
          { name: '🏠 Servers', value: `${client.guilds.cache.size}`, inline: true },
          { name: '👥 Users', value: `${client.users.cache.size}`, inline: true },
          { name: '💾 Memory', value: `${Math.round(mem.heapUsed / 1024 / 1024)}MB`, inline: true },
          { name: '🔧 Node.js', value: process.version, inline: true },
          { name: '📦 discord.js', value: 'v14', inline: true },
        )
        .setTimestamp()] });
    }
  },

  // ── VOICE TIME ────────────────────────────────────────────────────────────
  {
    name: 'voicetime',
    description: 'Check voice time statistics',
    category: 'Utility',
    aliases: ['vt', 'vctime'],
    usage: 'voicetime [@user]',
    async execute(message) {
      const target = message.mentions.members?.first() ?? message.member!;
      const stats = getVoiceStats(message.guild!.id, target.id);
      await message.reply({ embeds: [new EmbedBuilder()
        .setColor(COLORS.info)
        .setTitle(`🎙️ Voice Time — ${target.user.username}`)
        .setThumbnail(target.user.displayAvatarURL())
        .addFields(
          { name: '📅 Daily', value: formatTime(stats?.daily ?? 0), inline: true },
          { name: '📆 Weekly', value: formatTime(stats?.weekly ?? 0), inline: true },
          { name: '🗓️ All Time', value: formatTime(stats?.alltime ?? 0), inline: true },
        )
        .setTimestamp()] });
    }
  },

  // ── MESSAGE COUNT ─────────────────────────────────────────────────────────
  {
    name: 'msgcount',
    description: 'Check message count statistics',
    category: 'Utility',
    aliases: ['msgs', 'messages'],
    usage: 'msgcount [@user]',
    async execute(message) {
      const target = message.mentions.members?.first() ?? message.member!;
      const stats = getMessageStats(message.guild!.id, target.id);
      await message.reply({ embeds: [new EmbedBuilder()
        .setColor(COLORS.info)
        .setTitle(`💬 Messages — ${target.user.username}`)
        .setThumbnail(target.user.displayAvatarURL())
        .addFields(
          { name: '📅 Daily', value: `${stats?.daily ?? 0}`, inline: true },
          { name: '📆 Weekly', value: `${stats?.weekly ?? 0}`, inline: true },
          { name: '🗓️ All Time', value: `${stats?.alltime ?? 0}`, inline: true },
        )
        .setTimestamp()] });
    }
  },

  // ── VOICE LEADERBOARD ─────────────────────────────────────────────────────
  {
    name: 'voicelb',
    description: 'Voice time leaderboard — top members by time in VC',
    category: 'Utility',
    aliases: ['vlb', 'voicetop', 'vtop', 'vclb'],
    usage: 'voicelb [daily|weekly|alltime]',
    async execute(message, args) {
      const periods = ['daily', 'weekly', 'alltime'] as const;
      type Period = typeof periods[number];
      const period: Period = (periods.includes(args[0]?.toLowerCase() as Period) ? args[0].toLowerCase() : 'alltime') as Period;

      const all = getAllVoiceStats(message.guild!.id);
      const sorted = all
        .filter(s => s.stats[period] > 0)
        .sort((a, b) => b.stats[period] - a.stats[period])
        .slice(0, 10);

      if (!sorted.length)
        return message.reply({ embeds: [errorEmbed('No Data', 'No voice time data recorded yet in this server.\nMembers need to join voice channels first.')] });

      const list = sorted.map((s, i) =>
        `${medal(i)} <@${s.userId}> — \`${formatTime(s.stats[period])}\``
      ).join('\n');

      await message.reply({ embeds: [new EmbedBuilder()
        .setColor(0x00CED1)
        .setTitle(`🎙️ Voice Time Leaderboard — ${period.charAt(0).toUpperCase() + period.slice(1)}`)
        .setDescription(list)
        .setFooter({ text: `Server: ${message.guild!.name} • Use: voicelb daily | weekly | alltime` })
        .setTimestamp()] });
    }
  },

  // ── MESSAGE LEADERBOARD ───────────────────────────────────────────────────
  {
    name: 'msglb',
    description: 'Message count leaderboard — top members by messages sent',
    category: 'Utility',
    aliases: ['mlb', 'msgtop', 'chattop', 'chatlb'],
    usage: 'msglb [daily|weekly|alltime]',
    async execute(message, args) {
      const periods = ['daily', 'weekly', 'alltime'] as const;
      type Period = typeof periods[number];
      const period: Period = (periods.includes(args[0]?.toLowerCase() as Period) ? args[0].toLowerCase() : 'alltime') as Period;

      const all = getAllMessageStats(message.guild!.id);
      const sorted = all
        .filter(s => s.stats[period] > 0)
        .sort((a, b) => b.stats[period] - a.stats[period])
        .slice(0, 10);

      if (!sorted.length)
        return message.reply({ embeds: [errorEmbed('No Data', 'No message data recorded yet in this server.\nMembers need to send messages first.')] });

      const list = sorted.map((s, i) =>
        `${medal(i)} <@${s.userId}> — \`${s.stats[period].toLocaleString()} messages\``
      ).join('\n');

      await message.reply({ embeds: [new EmbedBuilder()
        .setColor(0xFF73FA)
        .setTitle(`💬 Message Leaderboard — ${period.charAt(0).toUpperCase() + period.slice(1)}`)
        .setDescription(list)
        .setFooter({ text: `Server: ${message.guild!.name} • Use: msglb daily | weekly | alltime` })
        .setTimestamp()] });
    }
  },

  // ── BOTOWNER INFO ─────────────────────────────────────────────────────────
  {
    name: 'botowner',
    description: 'Show information about the bot owner',
    category: 'Utility',
    usage: 'botowner',
    async execute(message) {
      const { BOT_OWNER_ID } = await import('../utils/permissions.js');
      let owner;
      try { owner = await message.client.users.fetch(BOT_OWNER_ID); } catch {}
      const embed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle('👑 Bot Owner')
        .setDescription(`The bot owner is <@${BOT_OWNER_ID}> (ID: \`${BOT_OWNER_ID}\`)`)
        .setTimestamp();
      if (owner) {
        embed.setThumbnail(owner.displayAvatarURL({ size: 256 }));
        embed.addFields({ name: 'Tag', value: owner.tag, inline: true });
      }
      await message.reply({ embeds: [embed] });
    }
  },

  // ── ROLE INFO ─────────────────────────────────────────────────────────────
  {
    name: 'roleinfo',
    description: 'Get info about a role',
    category: 'Utility',
    usage: 'roleinfo <@role>',
    async execute(message) {
      const role = message.mentions.roles.first();
      if (!role) return message.reply({ embeds: [errorEmbed('Missing Role', 'Please mention a role.')] });
      await message.reply({ embeds: [new EmbedBuilder()
        .setColor(role.color || COLORS.primary)
        .setTitle(`🎭 Role Info — ${role.name}`)
        .addFields(
          { name: '🆔 ID', value: role.id, inline: true },
          { name: '🎨 Color', value: role.hexColor, inline: true },
          { name: '👥 Members', value: `${role.members.size}`, inline: true },
          { name: '📌 Position', value: `${role.position}`, inline: true },
          { name: '🤖 Managed', value: role.managed ? 'Yes' : 'No', inline: true },
          { name: '🔔 Mentionable', value: role.mentionable ? 'Yes' : 'No', inline: true },
          { name: '📅 Created', value: `<t:${Math.floor(role.createdAt.getTime() / 1000)}:R>`, inline: true },
        )
        .setTimestamp()] });
    }
  },

  // ── COINFLIP ──────────────────────────────────────────────────────────────
  {
    name: 'coinflip',
    description: 'Flip a coin',
    category: 'Utility',
    aliases: ['flip', 'coin'],
    usage: 'coinflip',
    async execute(message) {
      const result = Math.random() < 0.5 ? '🪙 Heads!' : '🪙 Tails!';
      await message.reply({ embeds: [new EmbedBuilder()
        .setColor(0xFFD700).setTitle('🪙 Coin Flip').setDescription(`**${result}**`).setTimestamp()] });
    }
  },

  // ── ROLL DICE ─────────────────────────────────────────────────────────────
  {
    name: 'roll',
    description: 'Roll dice',
    category: 'Utility',
    usage: 'roll [sides] (default: 6)',
    async execute(message, args) {
      const sides = Math.min(Math.max(parseInt(args[0] ?? '6') || 6, 2), 1000);
      const result = Math.floor(Math.random() * sides) + 1;
      await message.reply({ embeds: [new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle('🎲 Dice Roll')
        .setDescription(`Rolled a **${result}** on a **${sides}-sided** die!`)
        .setTimestamp()] });
    }
  },

  // ── POLL ──────────────────────────────────────────────────────────────────
  {
    name: 'poll',
    description: 'Create a quick yes/no poll',
    category: 'Utility',
    usage: 'poll <question>',
    async execute(message, args) {
      if (!args.length) return message.reply({ embeds: [errorEmbed('Missing Question', 'Provide a question for the poll.')] });
      const question = args.join(' ');
      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle('📊 Poll')
        .setDescription(`**${question}**\n\nReact with ✅ for Yes or ❌ for No.`)
        .setFooter({ text: `Poll by ${message.author.tag}` })
        .setTimestamp();
      const poll = await message.channel.send({ embeds: [embed] });
      await poll.react('✅');
      await poll.react('❌');
      await message.delete().catch(() => {});
    }
  },

  // ── REMIND ────────────────────────────────────────────────────────────────
  {
    name: 'remind',
    description: 'Set a reminder',
    category: 'Utility',
    aliases: ['reminder', 'remindme'],
    usage: 'remind <time> <message> (e.g. 10m Check the oven)',
    async execute(message, args) {
      const { parseTime } = await import('../utils/helpers.js');
      const ms = parseTime(args[0] ?? '');
      if (!ms) return message.reply({ embeds: [errorEmbed('Invalid Time', 'Use format like `10m`, `1h`, `1d`.')] });
      const reminder = args.slice(1).join(' ') || 'Something';
      await message.reply({ embeds: [successEmbed('Reminder Set', `I will remind you about: **${reminder}**\nIn **${args[0]}**.`)] });
      setTimeout(async () => {
        try {
          await message.author.send({ embeds: [new EmbedBuilder()
            .setColor(COLORS.warning)
            .setTitle('⏰ Reminder!')
            .setDescription(`You asked me to remind you:\n**${reminder}**\n\nSet in: **${message.guild?.name ?? 'DM'}**`)
            .setTimestamp()] });
        } catch {
          await message.channel.send({ content: `<@${message.author.id}>`, embeds: [new EmbedBuilder()
            .setColor(COLORS.warning).setTitle('⏰ Reminder!').setDescription(`**${reminder}**`).setTimestamp()] })
            .catch(() => {});
        }
      }, ms);
    }
  },
];

export default utilityCommands;
