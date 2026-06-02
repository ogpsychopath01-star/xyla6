import {
  EmbedBuilder, PermissionFlagsBits, TextChannel, GuildChannel
} from 'discord.js';
import { BotCommand } from '../client.js';
import { COLORS, BOT_FOOTER } from '../utils/embeds.js';
import {
  getAutoresponder, setAutoresponder, removeAutoresponder,
  getAutoreact, setAutoreact, removeAutoreact,
  addTempRole, getTempRolesForUser,
} from '../database.js';
import { hasPermission, Perms, isBotStaff } from '../utils/permissions.js';
import axios from 'axios';

function successEmbed(t: string, d: string) {
  return new EmbedBuilder().setColor(COLORS.success).setTitle(`✅ ${t}`).setDescription(d).setFooter(BOT_FOOTER).setTimestamp();
}
function errorEmbed(t: string, d: string) {
  return new EmbedBuilder().setColor(COLORS.error).setTitle(`❌ ${t}`).setDescription(d).setFooter(BOT_FOOTER).setTimestamp();
}

const setupCommands: BotCommand[] = [

  // ── TEMP ROLE ─────────────────────────────────────────────────────────────
  {
    name: 'temprole',
    description: 'Give a role to a member for a set number of days',
    category: 'Setup',
    usage: 'temprole <@user> <@role> <days>',
    aliases: ['temporaryrole', 'giverolefor'],
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ManageRoles))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Roles** permission.')] });

      const target = message.mentions.members?.first();
      const role = message.mentions.roles.first();
      const days = parseFloat(args[2]);

      if (!target) return message.reply({ embeds: [errorEmbed('Missing User', 'Mention the member to give the role to.')] });
      if (!role) return message.reply({ embeds: [errorEmbed('Missing Role', 'Mention the role to give.')] });
      if (isNaN(days) || days <= 0) return message.reply({ embeds: [errorEmbed('Invalid Days', 'Provide a valid positive number of days. Example: `!temprole @user @role 7`')] });

      if (role.position >= message.guild!.members.me!.roles.highest.position)
        return message.reply({ embeds: [errorEmbed('Role Too High', 'I cannot manage that role — it is above my highest role.')] });

      const expiresAt = Date.now() + days * 86400000;

      await target.roles.add(role, `Temp role by ${message.author.tag} for ${days} days`);
      addTempRole({
        guild_id: message.guild!.id,
        user_id: target.id,
        role_id: role.id,
        expires_at: expiresAt,
        given_by: message.author.id,
      });

      await message.reply({ embeds: [new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle('⏳ Temp Role Given')
        .setDescription(`<@&${role.id}> has been given to <@${target.id}> for **${days} day${days !== 1 ? 's' : ''}**.`)
        .addFields(
          { name: '👤 Member', value: `<@${target.id}>`, inline: true },
          { name: '🎭 Role', value: `<@&${role.id}>`, inline: true },
          { name: '⏰ Expires', value: `<t:${Math.floor(expiresAt / 1000)}:R>`, inline: true },
        )
        .setFooter(BOT_FOOTER)
        .setTimestamp()
      ] });
    }
  },

  {
    name: 'temproles',
    description: 'View active temp roles for a member',
    category: 'Setup',
    usage: 'temproles <@user>',
    aliases: ['listtemproles'],
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ManageRoles))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Roles** permission.')] });
      const target = message.mentions.members?.first() ?? message.member!;
      const roles = getTempRolesForUser(message.guild!.id, target.id);
      if (!roles.length) return message.reply({ embeds: [errorEmbed('No Temp Roles', `**${target.displayName}** has no active temp roles.`)] });
      const list = roles.map(r => `<@&${r.role_id}> — expires <t:${Math.floor(r.expires_at / 1000)}:R>`).join('\n');
      await message.reply({ embeds: [new EmbedBuilder()
        .setColor(COLORS.info)
        .setTitle(`⏳ Temp Roles — ${target.displayName}`)
        .setDescription(list)
        .setFooter(BOT_FOOTER)
        .setTimestamp()
      ] });
    }
  },

  // ── STEAL EMOJI ───────────────────────────────────────────────────────────
  {
    name: 'stealemoji',
    description: 'Steal a custom emoji and add it to this server',
    category: 'Setup',
    usage: 'stealemoji <emoji> [name]',
    aliases: ['emojisteal', 'addemoji'],
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ManageGuildExpressions))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Expressions** permission.')] });
      if (!args[0]) return message.reply({ embeds: [errorEmbed('Missing Emoji', 'Provide a custom emoji.')] });

      const emojiStr = args[0];
      const customMatch = emojiStr.match(/<a?:([a-zA-Z0-9_]+):(\d+)>/);
      if (!customMatch)
        return message.reply({ embeds: [errorEmbed('Invalid Emoji', 'Only custom emojis can be stolen. Paste the emoji directly in the command.')] });

      const emojiName = args[1] || customMatch[1];
      const emojiId = customMatch[2];
      const animated = emojiStr.startsWith('<a:');
      const ext = animated ? 'gif' : 'png';
      const url = `https://cdn.discordapp.com/emojis/${emojiId}.${ext}?size=128&quality=lossless`;

      try {
        const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 });
        const emoji = await message.guild!.emojis.create({
          attachment: Buffer.from(res.data),
          name: emojiName.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 32) || 'stolen_emoji',
        });
        await message.reply({ embeds: [successEmbed('Emoji Stolen!', `**${emoji.toString()}** \`:${emoji.name}:\` has been added to the server!`)] });
      } catch (e: any) {
        await message.reply({ embeds: [errorEmbed('Failed', `Could not steal emoji. The server may have reached its emoji limit.\n\`${e?.message ?? 'Unknown error'}\``)] });
      }
    }
  },

  // ── STEAL STICKER ─────────────────────────────────────────────────────────
  {
    name: 'stealsticker',
    description: 'Steal a sticker from a replied message and add it to this server',
    category: 'Setup',
    usage: 'stealsticker [name] (reply to a message with a sticker)',
    aliases: ['stickersteal', 'addsticker'],
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ManageGuildExpressions))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Expressions** permission.')] });

      const ref = message.reference;
      let sticker: any = null;

      if (ref?.messageId) {
        const refMsg = await message.channel.messages.fetch(ref.messageId).catch(() => null);
        sticker = refMsg?.stickers?.first();
      }
      if (!sticker) sticker = message.stickers?.first();
      if (!sticker) return message.reply({ embeds: [errorEmbed('No Sticker', 'Reply to a message that contains a sticker, then use `!stealsticker`.')] });

      const name = args.join(' ').trim() || sticker.name || 'stolen_sticker';
      const url = sticker.url;

      try {
        const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 });
        const created = await message.guild!.stickers.create({
          file: { attachment: Buffer.from(res.data), name: `sticker.${sticker.format === 1 ? 'png' : sticker.format === 3 ? 'json' : 'png'}` },
          name: name.slice(0, 30),
          tags: sticker.tags || name.slice(0, 200),
        });
        await message.reply({ embeds: [successEmbed('Sticker Stolen!', `Sticker **${created.name}** has been added to the server!`)] });
      } catch (e: any) {
        await message.reply({ embeds: [errorEmbed('Failed', `Could not steal sticker.\n\`${e?.message ?? 'Unknown error'}\``)] });
      }
    }
  },

  // ── AUTO RESPONDER ────────────────────────────────────────────────────────
  // Staff can also set autoresponder for another user: !autoresponder set @user <message>
  {
    name: 'autoresponder',
    description: 'Set an auto-reply when someone pings you (or another user if staff)',
    category: 'Setup',
    usage: 'autoresponder <set [<@user>] <message> | remove [<@user>] | view [<@user>]>',
    aliases: ['autoreply', 'autoresponse', 'ar'],
    async execute(message, args) {
      const sub = args[0]?.toLowerCase();
      const isStaff = isBotStaff(message.author.id) || hasPermission(message.member!, Perms.ManageGuild);

      if (sub === 'set') {
        // Check if a user is mentioned (staff-only targeting another user)
        const mentionedUser = message.mentions.users.first();
        const targetId = (mentionedUser && isStaff) ? mentionedUser.id : message.author.id;
        const msgStart = (mentionedUser && isStaff) ? 2 : 1;
        const msg = args.slice(msgStart).join(' ');

        if (!msg) return message.reply({ embeds: [errorEmbed('Missing Message',
          'Provide the auto-response message.\n' +
          'Example: `!autoresponder set I am busy, reply soon!`\n' +
          (isStaff ? 'Staff: `!autoresponder set @user <message>`' : '')
        )] });
        if (msg.length > 300) return message.reply({ embeds: [errorEmbed('Too Long', 'Auto-response must be 300 characters or less.')] });

        setAutoresponder(targetId, msg);
        const targetName = mentionedUser && isStaff ? `<@${targetId}>` : 'you';
        await message.reply({ embeds: [successEmbed('Auto Responder Set', `When someone pings ${targetName}, Xyla will reply:\n> ${msg}`)] });

      } else if (sub === 'remove' || sub === 'off' || sub === 'clear') {
        const mentionedUser = message.mentions.users.first();
        const targetId = (mentionedUser && isStaff) ? mentionedUser.id : message.author.id;
        removeAutoresponder(targetId);
        await message.reply({ embeds: [successEmbed('Auto Responder Removed', mentionedUser && isStaff ? `Auto-responder for <@${targetId}> has been cleared.` : 'Your auto-response has been cleared.')] });

      } else if (sub === 'view' || sub === 'check') {
        const mentionedUser = message.mentions.users.first();
        const targetId = (mentionedUser && isStaff) ? mentionedUser.id : message.author.id;
        const current = getAutoresponder(targetId);
        if (!current) return message.reply({ embeds: [errorEmbed('Not Set', mentionedUser && isStaff ? `<@${targetId}> does not have an auto-responder set.` : 'You do not have an auto-responder set.')] });
        await message.reply({ embeds: [new EmbedBuilder()
          .setColor(COLORS.info)
          .setTitle(`💬 Auto Responder${mentionedUser && isStaff ? ` for ${mentionedUser.tag}` : ''}`)
          .setDescription(`> ${current}`)
          .setFooter(BOT_FOOTER)
          .setTimestamp()
        ] });

      } else {
        await message.reply({ embeds: [new EmbedBuilder()
          .setColor(COLORS.info)
          .setTitle('💬 Auto Responder')
          .setDescription('When someone pings you, Xyla automatically sends your configured message.')
          .addFields(
            { name: 'Set (self)', value: '`!autoresponder set <message>`', inline: false },
            { name: 'Set (for another user)', value: isStaff ? '`!autoresponder set @user <message>`' : '*Staff only*', inline: false },
            { name: 'Remove', value: '`!autoresponder remove [@user]`', inline: false },
            { name: 'View', value: '`!autoresponder view [@user]`', inline: false },
          )
          .setFooter(BOT_FOOTER).setTimestamp()
        ] });
      }
    }
  },

  // ── AUTO REACT ────────────────────────────────────────────────────────────
  // Staff can also set autoreact for another user: !autoreact set @user <emoji>
  {
    name: 'autoreact',
    description: 'Set an emoji that auto-reacts when someone pings you (or another user if staff)',
    category: 'Setup',
    usage: 'autoreact <set [<@user>] <emoji> | remove [<@user>] | view [<@user>]>',
    async execute(message, args) {
      const sub = args[0]?.toLowerCase();
      const isStaff = isBotStaff(message.author.id) || hasPermission(message.member!, Perms.ManageGuild);

      if (sub === 'set') {
        const mentionedUser = message.mentions.users.first();
        const targetId = (mentionedUser && isStaff) ? mentionedUser.id : message.author.id;
        const emojiArg = (mentionedUser && isStaff) ? args[2] : args[1];

        if (!emojiArg) return message.reply({ embeds: [errorEmbed('Missing Emoji',
          'Provide an emoji.\nExample: `!autoreact set 👋`\n' +
          (isStaff ? 'Staff: `!autoreact set @user 👋`' : '')
        )] });

        setAutoreact(targetId, emojiArg);
        const targetName = mentionedUser && isStaff ? `<@${targetId}>` : 'you';
        await message.reply({ embeds: [successEmbed('Auto React Set', `When someone pings ${targetName}, Xyla will react with **${emojiArg}**`)] });

      } else if (sub === 'remove' || sub === 'off' || sub === 'clear') {
        const mentionedUser = message.mentions.users.first();
        const targetId = (mentionedUser && isStaff) ? mentionedUser.id : message.author.id;
        removeAutoreact(targetId);
        await message.reply({ embeds: [successEmbed('Auto React Removed', mentionedUser && isStaff ? `Auto-react for <@${targetId}> cleared.` : 'Your auto-react emoji has been cleared.')] });

      } else if (sub === 'view' || sub === 'check') {
        const mentionedUser = message.mentions.users.first();
        const targetId = (mentionedUser && isStaff) ? mentionedUser.id : message.author.id;
        const current = getAutoreact(targetId);
        if (!current) return message.reply({ embeds: [errorEmbed('Not Set', 'No auto-react is configured.')] });
        await message.reply({ embeds: [new EmbedBuilder()
          .setColor(COLORS.info)
          .setTitle(`⚡ Auto React${mentionedUser && isStaff ? ` for ${mentionedUser.tag}` : ''}`)
          .setDescription(`Auto-react emoji: **${current}**`)
          .setFooter(BOT_FOOTER).setTimestamp()
        ] });

      } else {
        await message.reply({ embeds: [new EmbedBuilder()
          .setColor(COLORS.info)
          .setTitle('⚡ Auto React')
          .setDescription('When someone pings you, Xyla reacts to their message with your chosen emoji.')
          .addFields(
            { name: 'Set (self)', value: '`!autoreact set <emoji>`', inline: false },
            { name: 'Set (for another user)', value: isStaff ? '`!autoreact set @user <emoji>`' : '*Staff only*', inline: false },
            { name: 'Remove', value: '`!autoreact remove [@user]`', inline: false },
            { name: 'View', value: '`!autoreact view [@user]`', inline: false },
          )
          .setFooter(BOT_FOOTER).setTimestamp()
        ] });
      }
    }
  },

  // ── REMOVE SLOWMODE ───────────────────────────────────────────────────────
  {
    name: 'unslowmode',
    description: 'Remove slowmode from a channel',
    category: 'Setup',
    usage: 'unslowmode [#channel]',
    aliases: ['removeslowmode', 'clearslowmode', 'noslowmode'],
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ManageChannels))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Channels** permission.')] });

      const channel = (message.mentions.channels.first() ?? message.channel) as TextChannel;
      if (!('setRateLimitPerUser' in channel))
        return message.reply({ embeds: [errorEmbed('Invalid Channel', 'This channel does not support slowmode.')] });

      await (channel as TextChannel).setRateLimitPerUser(0, `Slowmode removed by ${message.author.tag}`);
      await message.reply({ embeds: [successEmbed('Slowmode Removed', `Slowmode has been removed from <#${channel.id}>.`)] });
    }
  },

  // ── TICKET ADD / REMOVE MEMBER ────────────────────────────────────────────
  {
    name: 'ticketadd',
    description: 'Add a member to the current ticket',
    category: 'Tickets',
    usage: 'ticketadd <@user>',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ManageChannels))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Channels** permission.')] });
      const target = message.mentions.members?.first();
      if (!target) return message.reply({ embeds: [errorEmbed('Missing User', 'Mention the member to add.')] });
      const channel = message.channel as TextChannel;
      await channel.permissionOverwrites.edit(target.id, {
        ViewChannel: true, SendMessages: true, ReadMessageHistory: true,
      });
      await message.reply({ embeds: [successEmbed('Member Added', `<@${target.id}> has been added to this ticket.`)] });
    }
  },

  {
    name: 'ticketremove',
    description: 'Remove a member from the current ticket',
    category: 'Tickets',
    usage: 'ticketremove <@user>',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ManageChannels))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Channels** permission.')] });
      const target = message.mentions.members?.first();
      if (!target) return message.reply({ embeds: [errorEmbed('Missing User', 'Mention the member to remove.')] });
      const channel = message.channel as TextChannel;
      await channel.permissionOverwrites.edit(target.id, { ViewChannel: false });
      await message.reply({ embeds: [successEmbed('Member Removed', `<@${target.id}> has been removed from this ticket.`)] });
    }
  },
];

export default setupCommands;
