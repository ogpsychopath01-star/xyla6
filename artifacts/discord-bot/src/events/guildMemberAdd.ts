import { EmbedBuilder, TextChannel } from 'discord.js';
import { BotClient } from '../client.js';
import { isVcBanned, getAutomodSetting, getWelcomeSettings } from '../database.js';
import { COLORS } from '../utils/embeds.js';
import { sendLog } from '../utils/helpers.js';
import { handleAntiRaid } from './automodHandler.js';

export default function registerGuildMemberAdd(client: BotClient) {
  client.on('guildMemberAdd', async (member) => {
    const guild = member.guild;

    // ── ANTI-BOT ─────────────────────────────────────────────────────────
    const antiBot = getAutomodSetting(guild.id, 'antibot');
    if (antiBot?.enabled && member.user.bot) {
      await member.kick('Anti-bot protection').catch(() => {});
      await sendLog(client, guild.id, 'antinuke', new EmbedBuilder()
        .setColor(COLORS.error).setTitle('🤖 Bot Blocked')
        .setDescription(`Bot **${member.user.tag}** was kicked by anti-bot protection.`).setTimestamp());
      return;
    }

    // ── ANTI-RAID ─────────────────────────────────────────────────────────
    const antiRaid = getAutomodSetting(guild.id, 'antiraid');
    if (antiRaid?.enabled && handleAntiRaid(guild.id, member.id)) {
      await member.kick('Possible raid detected').catch(() => {});
      await sendLog(client, guild.id, 'antinuke', new EmbedBuilder()
        .setColor(COLORS.error).setTitle('🛡️ Anti-Raid Triggered')
        .setDescription(`**${member.user.tag}** removed — possible raid detected.`).setTimestamp());
      return;
    }

    // ── REG DATE PROTECTION ───────────────────────────────────────────────
    const regProtect = getAutomodSetting(guild.id, 'regprotect');
    if (regProtect?.enabled) {
      const minDays = parseInt(regProtect.extra ?? '7');
      const accountAge = (Date.now() - member.user.createdAt.getTime()) / 86400000;
      if (accountAge < minDays) {
        if (regProtect.punishment === 'kick') await member.kick(`Account too new`).catch(() => {});
        else if (regProtect.punishment === 'ban') await member.ban({ reason: 'Account too new' }).catch(() => {});
        await sendLog(client, guild.id, 'antinuke', new EmbedBuilder()
          .setColor(COLORS.warning).setTitle('📅 Reg Date Protection')
          .setDescription(`**${member.user.tag}** — ${Math.floor(accountAge)}d old (min ${minDays}d). Action: ${regProtect.punishment}`).setTimestamp());
        return;
      }
    }

    // ── JOIN LOG ──────────────────────────────────────────────────────────
    await sendLog(client, guild.id, 'joinleave', new EmbedBuilder()
      .setColor(COLORS.success).setTitle('📥 Member Joined')
      .setThumbnail(member.user.displayAvatarURL())
      .addFields(
        { name: 'User', value: `${member.user.tag} (<@${member.id}>)`, inline: true },
        { name: 'Account Created', value: `<t:${Math.floor(member.user.createdAt.getTime() / 1000)}:R>`, inline: true },
        { name: 'Members', value: `${guild.memberCount}`, inline: true },
      ).setTimestamp());

    // ── WELCOME MESSAGE ────────────────────────────────────────────────────
    const settings = getWelcomeSettings(guild.id);
    if (settings?.enabled) {
      try {
        const channel = guild.channels.cache.get(settings.channel_id) as TextChannel;
        if (channel) {
          const msg = settings.message
            .replace(/{user}/g, `<@${member.id}>`)
            .replace(/{server}/g, guild.name)
            .replace(/{membercount}/g, String(guild.memberCount));
          await channel.send({ embeds: [new EmbedBuilder().setColor(COLORS.success).setTitle('👋 Welcome!').setDescription(msg).setThumbnail(member.user.displayAvatarURL({ size: 256 })).setTimestamp()] });
        }
      } catch {}
    }
  });
}
