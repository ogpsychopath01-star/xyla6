import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ComponentType, Message
} from 'discord.js';
import { BotCommand } from '../client.js';
import { COLORS } from '../utils/embeds.js';
import { setAfk, removeAfk, isAfk } from '../database.js';

function successEmbed(t: string, d: string) {
  return new EmbedBuilder().setColor(COLORS.success).setTitle(`✅ ${t}`).setDescription(d).setTimestamp();
}
function errorEmbed(t: string, d: string) {
  return new EmbedBuilder().setColor(COLORS.error).setTitle(`❌ ${t}`).setDescription(d).setTimestamp();
}

const afkCommands: BotCommand[] = [
  {
    name: 'afk',
    description: 'Set yourself as AFK',
    category: 'Utility',
    usage: 'afk [reason]',
    async execute(message, args) {
      const existing = isAfk(message.author.id);
      if (existing) {
        removeAfk(message.author.id);
        return message.reply({ embeds: [successEmbed('AFK Removed', 'Welcome back! Your AFK status has been removed.')] });
      }

      const reason = args.join(' ') || 'AFK';

      // Ask about DM notifications
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('afk_dm_on').setLabel('DM Notifications ON').setStyle(ButtonStyle.Success).setEmoji('🔔'),
        new ButtonBuilder().setCustomId('afk_dm_off').setLabel('DM Notifications OFF').setStyle(ButtonStyle.Secondary).setEmoji('🔕'),
      );

      const prompt = await message.reply({
        embeds: [new EmbedBuilder()
          .setColor(COLORS.info)
          .setTitle('💤 Going AFK')
          .setDescription(`**Reason:** ${reason}\n\nDo you want to receive DM notifications when someone pings you?`)
          .setTimestamp()
        ],
        components: [row],
      });

      try {
        const interaction = await prompt.awaitMessageComponent({
          filter: i => i.user.id === message.author.id && (i.customId === 'afk_dm_on' || i.customId === 'afk_dm_off'),
          componentType: ComponentType.Button,
          time: 30000,
        });

        const dmOn = interaction.customId === 'afk_dm_on';
        setAfk(message.author.id, reason, dmOn);

        await interaction.update({
          embeds: [new EmbedBuilder()
            .setColor(COLORS.warning)
            .setTitle('💤 You are now AFK')
            .setDescription(`**Reason:** ${reason}\n**DM Notifications:** ${dmOn ? '🔔 On' : '🔕 Off'}`)
            .setTimestamp()
          ],
          components: [],
        });
      } catch {
        // Timed out — set AFK with DM on by default
        setAfk(message.author.id, reason, true);
        await prompt.edit({
          embeds: [successEmbed('AFK Set', `You are now AFK.\n**Reason:** ${reason}`)],
          components: [],
        });
      }
    }
  }
];

export default afkCommands;
