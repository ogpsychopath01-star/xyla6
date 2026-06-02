import {
  EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder, ComponentType, Collection
} from 'discord.js';
import { BotCommand } from '../client.js';
import { COLORS, BOT_FOOTER } from '../utils/embeds.js';
import { PREFIX } from '../utils/permissions.js';

const CATEGORY_META: Record<string, { emoji: string; description: string; color: number }> = {
  'Moderation': { emoji: '⚔️',  description: 'Ban, kick, warn, timeout, purge, lock/unlock',       color: 0xFF7043 },
  'Mute':       { emoji: '🔇',  description: 'Chat mute, VC mute, deafen, move, kick, ban',        color: 0xFF4500 },
  'Fun':        { emoji: '🎮',  description: 'GIF reactions, games, truth/dare & more',             color: 0xFF6EC7 },
  'Percentage': { emoji: '📊',  description: 'Random percentage fun commands',                      color: 0x9B59B6 },
  'Utility':    { emoji: '🔧',  description: 'Avatar, userinfo, ping, stats, say & more',           color: 0x00D4FF },
  'Voice Bot':  { emoji: '🎙️', description: 'Join, leave, and 24/7 voice mode',                    color: 0x1ABC9C },
  'Music':      { emoji: '🎵',  description: 'Full music system — play, queue, playlists & more',   color: 0x1DB954 },
  'Logs':       { emoji: '📝',  description: 'Configure per-type logging channels',                 color: 0x5C6BC0 },
  'Automod':    { emoji: '🛡️', description: 'Antilink, antiraid, antispam, regprotect',            color: 0xF39C12 },
  'Welcome':    { emoji: '🌟',  description: 'Welcome & leave messages with variables',             color: 0x2ECC71 },
  'Temp VC':    { emoji: '🎤',  description: 'Auto-create temp VCs with control panel',             color: 0x6C63FF },
  'AFK':        { emoji: '💤',  description: 'AFK status with DM notifications',                    color: 0x99AAB5 },
  'NSFW':       { emoji: '🔞',  description: 'Owner-gated NSFW commands (NSFW channels only)',      color: 0xFF006E },
  'Giveaway':   { emoji: '🎊',  description: 'Create, end, reroll & manage giveaways',              color: 0xFFD700 },
  'Tickets':    { emoji: '🎫',  description: 'Support ticket system with categories & logs',        color: 0x5865F2 },
  'Setup':      { emoji: '⚙️',  description: 'Server setup — autoresponder, autoreact & more',      color: 0x607D8B },
  'Jail':       { emoji: '⛓️',  description: 'Jail users — strip roles & confine to one channel',   color: 0x795548 },
  'Server':     { emoji: '🏛️', description: 'Server info, icon, banner & profile management',      color: 0x3498DB },
  'Roles':      { emoji: '🎭',  description: 'Assign, remove, and manage member roles',             color: 0xE91E63 },
  'Bio':        { emoji: '📖',  description: 'Set and view personal bios for server members',       color: 0x00BCD4 },
  'Bot Owner':  { emoji: '👑',  description: 'Owner/staff exclusive management commands',           color: 0xF1C40F },
  'Whitelist':  { emoji: '🔐',  description: 'Control who can use moderation actions',              color: 0x2ECC71 },
};

function buildCategoryEmbed(category: string, commands: BotCommand[]) {
  const meta = CATEGORY_META[category] ?? { emoji: '📌', description: '', color: 0x6C63FF };
  const unique = [...new Map(commands.map(c => [c.name, c])).values()];
  const cmds = unique.map(c => {
    const alias = c.aliases?.length ? ` *(${c.aliases.slice(0, 2).join(' / ')})* ` : ' ';
    return `\`${PREFIX}${c.name}\`${alias}— ${c.description}`;
  }).join('\n');

  return new EmbedBuilder()
    .setColor(meta.color as any)
    .setTitle(`${meta.emoji}  ${category} Commands`)
    .setDescription(
      `> ${meta.description}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      (cmds || '*No commands found.*')
    )
    .setFooter({ text: `✦ Prefix: ${PREFIX}  •  @mention  •  no-prefix (if granted)` })
    .setTimestamp();
}

function buildMainHelpEmbed(categories: string[], totalCmds: number) {
  const fields = categories.map(cat => {
    const meta = CATEGORY_META[cat] ?? { emoji: '📌', description: '' };
    return { name: `${meta.emoji}  ${cat}`, value: meta.description || cat, inline: true };
  });

  return new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle('🌟  Xyla — Command Centre')
    .setDescription(
      `> ✦ **Prefix:** \`${PREFIX}\`  •  **Mention:** @Xyla  •  **No-prefix** (if granted by staff)\n` +
      `> ✦ **${categories.length} categories** • **${totalCmds}+ commands**\n\n` +
      `📂  **Select a category from the dropdown below to view its commands.**`
    )
    .addFields(fields)
    .setFooter({ text: '✦ Xyla • Made by ogpsychopath1  •  Menu expires in 2 minutes' })
    .setTimestamp();
}

const helpCommands: BotCommand[] = [
  {
    name: 'help',
    description: 'Show all commands with interactive category menu',
    category: 'Utility',
    aliases: ['h', 'commands', 'cmds'],
    usage: 'help [category]',
    async execute(message, args) {
      const commands: Collection<string, BotCommand> = (message.client as any).commands;

      const categoryMap = new Map<string, BotCommand[]>();
      for (const [, cmd] of commands) {
        if (!categoryMap.has(cmd.category)) categoryMap.set(cmd.category, []);
        categoryMap.get(cmd.category)!.push(cmd);
      }

      const preferredOrder = [
        'Moderation', 'Mute', 'Fun', 'Percentage', 'Utility', 'Voice Bot',
        'Music', 'Logs', 'Automod', 'Welcome', 'Temp VC', 'AFK', 'NSFW',
        'Giveaway', 'Tickets', 'Setup', 'Jail', 'Server', 'Roles', 'Bio', 'Bot Owner', 'Whitelist',
      ];
      const categories = [...categoryMap.keys()].sort((a, b) => {
        const ai = preferredOrder.indexOf(a);
        const bi = preferredOrder.indexOf(b);
        if (ai === -1 && bi === -1) return a.localeCompare(b);
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });

      if (args[0]) {
        const requestedCat = categories.find(c => c.toLowerCase() === args[0].toLowerCase())
          ?? categories.find(c => c.toLowerCase().includes(args[0].toLowerCase()));
        if (requestedCat) {
          return message.reply({ embeds: [buildCategoryEmbed(requestedCat, categoryMap.get(requestedCat)!)] });
        }
      }

      const totalCmds = [...categoryMap.values()].reduce((sum, v) => sum + new Set(v.map(c => c.name)).size, 0);

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('help_category_select')
        .setPlaceholder('📂  Choose a category...')
        .addOptions(
          categories.slice(0, 25).map(cat => {
            const meta = CATEGORY_META[cat] ?? { emoji: '📌', description: `${cat} commands` };
            const count = new Set(categoryMap.get(cat)?.map(c => c.name)).size;
            return new StringSelectMenuOptionBuilder()
              .setLabel(cat)
              .setValue(cat)
              .setDescription(`${meta.description.slice(0, 50)} (${count} cmds)`)
              .setEmoji(meta.emoji.trim());
          })
        );

      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
      const mainEmbed = buildMainHelpEmbed(categories, totalCmds);
      const reply = await message.reply({ embeds: [mainEmbed], components: [row] });

      const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 120000,
        filter: i => i.user.id === message.author.id,
      });

      collector.on('collect', async (i) => {
        const selected = i.values[0];
        const cmds = categoryMap.get(selected) ?? [];
        await i.update({ embeds: [buildCategoryEmbed(selected, cmds)], components: [row] });
      });

      collector.on('end', async () => {
        try { await reply.edit({ components: [] }); } catch {}
      });
    }
  }
];

export default helpCommands;
