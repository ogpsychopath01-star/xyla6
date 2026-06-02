import { EmbedBuilder, TextChannel } from 'discord.js';
import { BotClient } from '../client.js';
import { getLeaveSettings } from '../database.js';
import { COLORS } from '../utils/embeds.js';
import { sendLog } from '../utils/helpers.js';

export default function registerGuildMemberRemove(client: BotClient) {
  client.on('guildMemberRemove', async (member) => {
    const guild = member.guild;

    await sendLog(client, guild.id, 'joinleave', new EmbedBuilder()
      .setColor(COLORS.error).setTitle('📤 Member Left')
      .setThumbnail(member.user.displayAvatarURL())
      .addFields(
        { name: 'User', value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
        { name: 'Joined', value: member.joinedAt ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>` : 'Unknown', inline: true },
        { name: 'Members', value: `${guild.memberCount}`, inline: true },
      ).setTimestamp());

    const settings = getLeaveSettings(guild.id);
    if (settings?.enabled) {
      try {
        const channel = guild.channels.cache.get(settings.channel_id) as TextChannel;
        if (channel) {
          const msg = settings.message
            .replace(/{user}/g, member.user.tag)
            .replace(/{server}/g, guild.name)
            .replace(/{membercount}/g, String(guild.memberCount));
          await channel.send({ embeds: [new EmbedBuilder().setColor(COLORS.error).setTitle('👋 Member Left').setDescription(msg).setThumbnail(member.user.displayAvatarURL({ size: 256 })).setTimestamp()] });
        }
      } catch {}
    }
  });
}
