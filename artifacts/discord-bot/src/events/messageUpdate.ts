import { EmbedBuilder, Events } from 'discord.js';
import { BotClient } from '../client.js';
import { COLORS } from '../utils/embeds.js';
import { sendLog } from '../utils/helpers.js';

export default function registerMessageUpdate(client: BotClient) {
  client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
    if (!newMessage.guild || newMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return;

    const embed = new EmbedBuilder()
      .setColor(COLORS.warning)
      .setTitle('✏️ Message Edited')
      .addFields(
        { name: 'Author', value: newMessage.author ? `${newMessage.author.tag} (<@${newMessage.author.id}>)` : 'Unknown', inline: true },
        { name: 'Channel', value: `<#${newMessage.channel.id}>`, inline: true },
        { name: 'Jump to Message', value: `[Click here](${newMessage.url})`, inline: true },
        { name: 'Before', value: oldMessage.content?.slice(0, 1020) || '*Unknown*' },
        { name: 'After', value: newMessage.content?.slice(0, 1020) || '*Unknown*' },
      )
      .setTimestamp();

    await sendLog(client, newMessage.guild.id, 'messagelog', embed);
  });
}
