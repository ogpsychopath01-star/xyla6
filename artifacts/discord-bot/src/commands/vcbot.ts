import { EmbedBuilder, Guild } from 'discord.js';
import { BotCommand } from '../client.js';
import { COLORS } from '../utils/embeds.js';
import { get247Channel, set247Channel, remove247Channel } from '../database.js';

function successEmbed(t: string, d: string) {
  return new EmbedBuilder().setColor(COLORS.success).setTitle(`✅ ${t}`).setDescription(d).setTimestamp();
}
function errorEmbed(t: string, d: string) {
  return new EmbedBuilder().setColor(COLORS.error).setTitle(`❌ ${t}`).setDescription(d).setTimestamp();
}
function infoEmbed(t: string, d: string) {
  return new EmbedBuilder().setColor(COLORS.info).setTitle(`ℹ️ ${t}`).setDescription(d).setTimestamp();
}

// ── GATEWAY OP 4: Join/leave VC via WebSocket ─────────────────────────────────
// This is the ONLY reliable way to make a bot join a VC without @discordjs/voice.
// guild.members.me.voice.setChannel() uses REST which only moves already-connected bots.
// Gateway OP 4 works even when the bot is not currently in any VC.
export function gatewayJoinVC(guild: Guild, channelId: string | null) {
  (guild.shard as any).send({
    op: 4,
    d: {
      guild_id: guild.id,
      channel_id: channelId,
      self_mute: false,
      self_deaf: false,
    },
  });
}

const vcBotCommands: BotCommand[] = [

  {
    name: 'join',
    description: 'Make the bot join your voice channel',
    category: 'Voice Bot',
    usage: 'join',
    async execute(message) {
      const vc = message.member!.voice.channel;
      if (!vc)
        return message.reply({ embeds: [errorEmbed('Not in VC', 'You must be in a voice channel first.')] });

      try {
        gatewayJoinVC(message.guild!, vc.id);
        await message.reply({ embeds: [successEmbed('Joined VC', `Joined **${vc.name}** 🎙️`)] });
      } catch (err: any) {
        await message.reply({ embeds: [errorEmbed('Join Failed', `Could not join **${vc.name}**. Error: ${err?.message ?? 'Unknown error'}`)] });
      }
    }
  },

  {
    name: 'disconnect',
    description: 'Disconnect bot from voice channel',
    category: 'Voice Bot',
    aliases: ['leave', 'dc'],
    usage: 'disconnect',
    async execute(message) {
      const botVc = message.guild!.members.me?.voice.channel;
      if (!botVc)
        return message.reply({ embeds: [errorEmbed('Not Connected', 'I am not in a voice channel.')] });

      remove247Channel(message.guild!.id);
      gatewayJoinVC(message.guild!, null); // null channel_id = disconnect
      await message.reply({ embeds: [successEmbed('Disconnected', `Left **${botVc.name}**.`)] });
    }
  },

  {
    name: '247',
    description: 'Toggle 24/7 mode — bot stays in VC permanently',
    category: 'Voice Bot',
    usage: '247',
    async execute(message) {
      const existing = get247Channel(message.guild!.id);

      if (existing) {
        remove247Channel(message.guild!.id);
        gatewayJoinVC(message.guild!, null);
        return message.reply({ embeds: [infoEmbed('24/7 Disabled', 'Bot will no longer stay permanently in voice.')] });
      }

      const vc = message.member!.voice.channel;
      if (!vc)
        return message.reply({ embeds: [errorEmbed('Not in VC', 'You must be in a voice channel to enable 24/7 mode.')] });

      set247Channel(message.guild!.id, vc.id);
      gatewayJoinVC(message.guild!, vc.id);
      await message.reply({ embeds: [successEmbed('24/7 Enabled', `Now permanently staying in **${vc.name}**.\nIf disconnected, I will rejoin automatically. 🔒`)] });
    }
  },

  {
    name: 'vcstatus',
    description: 'Check the bot voice channel status',
    category: 'Voice Bot',
    usage: 'vcstatus',
    async execute(message) {
      const botVc = message.guild!.members.me?.voice.channel;
      const is247 = get247Channel(message.guild!.id);
      const embed = new EmbedBuilder()
        .setColor(COLORS.info)
        .setTitle('🎙️ Voice Status')
        .addFields(
          { name: 'Connected', value: botVc ? `✅ <#${botVc.id}>` : '❌ Not connected', inline: true },
          { name: '24/7 Mode', value: is247 ? `✅ <#${is247}>` : '❌ Off', inline: true },
        )
        .setTimestamp();
      await message.reply({ embeds: [embed] });
    }
  },
];

export default vcBotCommands;
