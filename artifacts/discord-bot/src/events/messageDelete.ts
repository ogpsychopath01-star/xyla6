import { EmbedBuilder, Events, AuditLogEvent } from 'discord.js';
import { BotClient } from '../client.js';
import { COLORS } from '../utils/embeds.js';
import { sendLog } from '../utils/helpers.js';

export default function registerMessageDelete(client: BotClient) {
  client.on(Events.MessageDelete, async (message) => {
    if (!message.guild || message.author?.bot) return;

    const embed = new EmbedBuilder()
      .setColor(COLORS.error)
      .setTitle('🗑️ Message Deleted')
      .addFields(
        { name: 'Author', value: message.author ? `${message.author.tag} (<@${message.author.id}>)` : 'Unknown', inline: true },
        { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
        { name: 'Content', value: message.content?.slice(0, 1020) || '*No text content*' },
      )
      .setTimestamp();

    if (message.attachments.size > 0) {
      embed.addFields({ name: 'Attachments', value: message.attachments.map(a => a.url).join('\n').slice(0, 1020) });
    }

    await sendLog(client, message.guild.id, 'messagelog', embed);
  });
}
