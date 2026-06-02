import { EmbedBuilder, Events, AuditLogEvent } from 'discord.js';
import { BotClient } from '../client.js';
import { COLORS } from '../utils/embeds.js';
import { sendLog } from '../utils/helpers.js';
import { getAutomodSetting } from '../database.js';

export default function registerRoleEvents(client: BotClient) {
  client.on(Events.GuildRoleCreate, async (role) => {
    const embed = new EmbedBuilder()
      .setColor(COLORS.info)
      .setTitle('🎭 Role Created')
      .addFields(
        { name: 'Name', value: role.name, inline: true },
        { name: 'Color', value: role.hexColor, inline: true },
        { name: 'ID', value: role.id, inline: true },
      )
      .setTimestamp();
    await sendLog(client, role.guild.id, 'rolelog', embed);
  });

  client.on(Events.GuildRoleDelete, async (role) => {
    const embed = new EmbedBuilder()
      .setColor(COLORS.error)
      .setTitle('🗑️ Role Deleted')
      .addFields(
        { name: 'Name', value: role.name, inline: true },
        { name: 'ID', value: role.id, inline: true },
      )
      .setTimestamp();
    await sendLog(client, role.guild.id, 'rolelog', embed);
  });

  client.on(Events.GuildRoleUpdate, async (oldRole, newRole) => {
    if (oldRole.name === newRole.name && oldRole.color === newRole.color) return;
    const embed = new EmbedBuilder()
      .setColor(COLORS.warning)
      .setTitle('✏️ Role Updated')
      .addFields(
        { name: 'Role', value: newRole.name, inline: true },
        { name: 'ID', value: newRole.id, inline: true },
        oldRole.name !== newRole.name ? { name: 'Name Changed', value: `${oldRole.name} → ${newRole.name}`, inline: false } : { name: '\u200b', value: '\u200b', inline: false },
      )
      .setTimestamp();
    await sendLog(client, newRole.guild.id, 'rolelog', embed);
  });

  // Anti-role add: alert when role is added to a member unexpectedly
  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    const addedRoles = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
    if (!addedRoles.size) return;

    const antiRoleAdd = getAutomodSetting(newMember.guild.id, 'antirolead');
    if (antiRoleAdd?.enabled) {
      const embed = new EmbedBuilder()
        .setColor(COLORS.warning)
        .setTitle('🎭 Anti-Role Add Alert')
        .setDescription(`**${newMember.user.tag}** received ${addedRoles.size} new role(s):\n${addedRoles.map(r => r.name).join(', ')}`)
        .setTimestamp();
      await sendLog(client, newMember.guild.id, 'antinuke', embed);
    }

    // Also log to members log
    if (addedRoles.size) {
      await sendLog(client, newMember.guild.id, 'memberslog', new EmbedBuilder()
        .setColor(COLORS.info)
        .setTitle('👤 Member Updated')
        .setDescription(`**${newMember.user.tag}** got roles: ${addedRoles.map(r => `<@&${r.id}>`).join(', ')}`)
        .setTimestamp());
    }
  });
}
