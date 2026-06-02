import { EmbedBuilder } from 'discord.js';
import { BotCommand } from '../client.js';
import { COLORS } from '../utils/embeds.js';
import { hasPermission, Perms } from '../utils/permissions.js';
import { enforceWhitelist } from '../utils/whitelist.js';

function successEmbed(t: string, d: string) {
  return new EmbedBuilder().setColor(COLORS.success).setTitle(`✅ ${t}`).setDescription(d).setTimestamp();
}
function errorEmbed(t: string, d: string) {
  return new EmbedBuilder().setColor(COLORS.error).setTitle(`❌ ${t}`).setDescription(d).setTimestamp();
}

const roleCommands: BotCommand[] = [

  // ── GIVE ROLE TO USER ─────────────────────────────────────────────────────
  {
    name: 'giverole',
    description: 'Give a role to a specific member',
    category: 'Moderation',
    usage: 'giverole <@user> <@role>',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ManageRoles))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Roles** permission.')] });
      if (await enforceWhitelist(message, 'role')) return;
      const target = message.mentions.members?.first();
      const role = message.mentions.roles.first();
      if (!target) return message.reply({ embeds: [errorEmbed('Missing User', 'Mention a member.')] });
      if (!role) return message.reply({ embeds: [errorEmbed('Missing Role', 'Mention a role.')] });
      if (role.position >= message.member!.roles.highest.position)
        return message.reply({ embeds: [errorEmbed('Hierarchy Error', 'You cannot assign a role equal or higher than yours.')] });
      try {
        await target.roles.add(role);
        await message.reply({ embeds: [successEmbed('Role Given', `${role} has been given to ${target}.`)] });
      } catch { await message.reply({ embeds: [errorEmbed('Failed', 'Could not assign that role.')] }); }
    }
  },

  // ── REMOVE ROLE FROM USER ─────────────────────────────────────────────────
  {
    name: 'removerole',
    description: 'Remove a role from a specific member',
    category: 'Moderation',
    usage: 'removerole <@user> <@role>',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ManageRoles))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Roles** permission.')] });
      if (await enforceWhitelist(message, 'role')) return;
      const target = message.mentions.members?.first();
      const role = message.mentions.roles.first();
      if (!target) return message.reply({ embeds: [errorEmbed('Missing User', 'Mention a member.')] });
      if (!role) return message.reply({ embeds: [errorEmbed('Missing Role', 'Mention a role.')] });
      try {
        await target.roles.remove(role);
        await message.reply({ embeds: [successEmbed('Role Removed', `${role} has been removed from ${target}.`)] });
      } catch { await message.reply({ embeds: [errorEmbed('Failed', 'Could not remove that role.')] }); }
    }
  },

  // ── GIVE ROLE TO ALL ──────────────────────────────────────────────────────
  {
    name: 'giveroleall',
    description: 'Give a role to everyone in the server',
    category: 'Moderation',
    usage: 'giveroleall <@role>',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ManageRoles))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Roles** permission.')] });
      if (await enforceWhitelist(message, 'role')) return;
      const role = message.mentions.roles.first();
      if (!role) return message.reply({ embeds: [errorEmbed('Missing Role', 'Mention a role.')] });
      if (role.position >= message.member!.roles.highest.position)
        return message.reply({ embeds: [errorEmbed('Hierarchy Error', 'You cannot assign a role equal or higher than yours.')] });
      const msg = await message.reply({ embeds: [new EmbedBuilder().setColor(COLORS.warning).setTitle('⏳ Working...').setDescription(`Adding ${role} to all members. This may take a while...`).setTimestamp()] });
      let done = 0;
      await message.guild!.members.fetch();
      for (const [, member] of message.guild!.members.cache) {
        if (member.roles.cache.has(role.id)) continue;
        try { await member.roles.add(role); done++; } catch {}
      }
      await msg.edit({ embeds: [successEmbed('Role Given to All', `Added ${role} to **${done}** members.`)] });
    }
  },

  // ── REMOVE ROLE FROM ALL ──────────────────────────────────────────────────
  {
    name: 'removeroleall',
    description: 'Remove a role from everyone in the server',
    category: 'Moderation',
    usage: 'removeroleall <@role>',
    async execute(message, args) {
      if (!hasPermission(message.member!, Perms.ManageRoles))
        return message.reply({ embeds: [errorEmbed('No Permission', 'You need **Manage Roles** permission.')] });
      if (await enforceWhitelist(message, 'role')) return;
      const role = message.mentions.roles.first();
      if (!role) return message.reply({ embeds: [errorEmbed('Missing Role', 'Mention a role.')] });
      const msg = await message.reply({ embeds: [new EmbedBuilder().setColor(COLORS.warning).setTitle('⏳ Working...').setDescription(`Removing ${role} from all members...`).setTimestamp()] });
      let done = 0;
      await message.guild!.members.fetch();
      for (const [, member] of message.guild!.members.cache) {
        if (!member.roles.cache.has(role.id)) continue;
        try { await member.roles.remove(role); done++; } catch {}
      }
      await msg.edit({ embeds: [successEmbed('Role Removed from All', `Removed ${role} from **${done}** members.`)] });
    }
  },
];

export default roleCommands;
