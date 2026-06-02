import {
  AudioPlayer, AudioPlayerStatus, VoiceConnection, StreamType,
  createAudioPlayer, createAudioResource, joinVoiceChannel,
  getVoiceConnection,
} from '@discordjs/voice';
import { spawn } from 'child_process';
import { EmbedBuilder, Message } from 'discord.js';
import googleTTS from 'google-tts-api';
import { BotCommand } from '../client.js';
import { COLORS, BOT_FOOTER } from '../utils/embeds.js';
import { getTTSLang, setTTSLang, getTTSGuildDefault, setTTSGuildDefault } from '../database.js';
import { isBotStaff, isBotOwner } from '../utils/permissions.js';

// ── SUPPORTED LANGUAGES ───────────────────────────────────────────────────────
export const TTS_LANGUAGES: Record<string, { name: string; native: string; flag: string }> = {
  en:    { name: 'English',    native: 'English',    flag: '🇬🇧' },
  hi:    { name: 'Hindi',      native: 'हिंदी',        flag: '🇮🇳' },
  es:    { name: 'Spanish',    native: 'Español',    flag: '🇪🇸' },
  fr:    { name: 'French',     native: 'Français',   flag: '🇫🇷' },
  de:    { name: 'German',     native: 'Deutsch',    flag: '🇩🇪' },
  ja:    { name: 'Japanese',   native: '日本語',       flag: '🇯🇵' },
  ko:    { name: 'Korean',     native: '한국어',       flag: '🇰🇷' },
  zh:    { name: 'Chinese',    native: '中文',         flag: '🇨🇳' },
  ar:    { name: 'Arabic',     native: 'العربية',     flag: '🇸🇦' },
  pt:    { name: 'Portuguese', native: 'Português',  flag: '🇧🇷' },
  ru:    { name: 'Russian',    native: 'Русский',    flag: '🇷🇺' },
  it:    { name: 'Italian',    native: 'Italiano',   flag: '🇮🇹' },
  pa:    { name: 'Punjabi',    native: 'ਪੰਜਾਬੀ',       flag: '🇮🇳' },
  bn:    { name: 'Bengali',    native: 'বাংলা',       flag: '🇧🇩' },
  ur:    { name: 'Urdu',       native: 'اردو',       flag: '🇵🇰' },
  ta:    { name: 'Tamil',      native: 'தமிழ்',       flag: '🇮🇳' },
  tr:    { name: 'Turkish',    native: 'Türkçe',     flag: '🇹🇷' },
  nl:    { name: 'Dutch',      native: 'Nederlands', flag: '🇳🇱' },
  pl:    { name: 'Polish',     native: 'Polski',     flag: '🇵🇱' },
  sv:    { name: 'Swedish',    native: 'Svenska',    flag: '🇸🇪' },
  id:    { name: 'Indonesian', native: 'Bahasa Indonesia', flag: '🇮🇩' },
  vi:    { name: 'Vietnamese', native: 'Tiếng Việt', flag: '🇻🇳' },
  th:    { name: 'Thai',       native: 'ภาษาไทย',    flag: '🇹🇭' },
  ms:    { name: 'Malay',      native: 'Bahasa Melayu', flag: '🇲🇾' },
};

// ── LANG ALIASES (common short names → lang code) ─────────────────────────────
const LANG_ALIASES: Record<string, string> = {
  english: 'en', hindi: 'hi', spanish: 'es', french: 'fr', german: 'de',
  japanese: 'ja', korean: 'ko', chinese: 'zh', arabic: 'ar', portuguese: 'pt',
  russian: 'ru', italian: 'it', punjabi: 'pa', bengali: 'bn', urdu: 'ur',
  tamil: 'ta', turkish: 'tr', dutch: 'nl', polish: 'pl', swedish: 'sv',
  indonesian: 'id', vietnamese: 'vi', thai: 'th', malay: 'ms',
  // Common misspellings / shorthand
  jp: 'ja', kr: 'ko', cn: 'zh', 'zh-cn': 'zh', 'zh-tw': 'zh',
  ind: 'hi', 'indian': 'hi', 'हिंदी': 'hi', 'hindi': 'hi',
  panjabi: 'pa', 'pun': 'pa',
};

function resolveLang(input: string): string | null {
  const lower = input.toLowerCase().trim();
  if (TTS_LANGUAGES[lower]) return lower;
  return LANG_ALIASES[lower] ?? null;
}

// ── TTS QUEUE ITEM ─────────────────────────────────────────────────────────────
interface TTSItem {
  text: string;
  lang: string;
  userId: string;
  username: string;
  slow: boolean;
}

// ── GUILD TTS SESSION ─────────────────────────────────────────────────────────
class GuildTTSSession {
  guildId: string;
  queue: TTSItem[] = [];
  isPlaying = false;
  audioPlayer: AudioPlayer;
  connection: VoiceConnection | null = null;
  vcId: string = '';
  textChannelId: string = '';
  private inactivityTimer: NodeJS.Timeout | null = null;
  private currentFfmpeg: ReturnType<typeof spawn> | null = null;

  constructor(guildId: string) {
    this.guildId = guildId;
    this.audioPlayer = createAudioPlayer();

    this.audioPlayer.on(AudioPlayerStatus.Idle, () => {
      this.currentFfmpeg = null;
      this.playNext();
    });

    this.audioPlayer.on('error', () => {
      this.currentFfmpeg = null;
      this.playNext();
    });
  }

  connect(vcId: string, guildAdapterCreator: any) {
    const existing = getVoiceConnection(this.guildId);
    if (existing && this.vcId === vcId) {
      this.vcId = vcId;
      return;
    }
    if (existing) existing.destroy();
    const conn = joinVoiceChannel({
      channelId: vcId,
      guildId: this.guildId,
      adapterCreator: guildAdapterCreator,
      selfDeaf: false,
    });
    conn.subscribe(this.audioPlayer);
    this.connection = conn;
    this.vcId = vcId;
    this.clearInactivity();
  }

  enqueue(item: TTSItem) {
    this.queue.push(item);
    this.clearInactivity();
    if (!this.isPlaying) this.playNext();
  }

  private async playNext() {
    if (this.queue.length === 0) {
      this.isPlaying = false;
      this.startInactivity();
      return;
    }

    this.isPlaying = true;
    const item = this.queue.shift()!;

    try {
      // Split text into ≤200-char chunks (Google TTS limit)
      const chunks = (googleTTS as any).getAllAudioUrls(item.text, {
        lang: item.lang,
        slow: item.slow,
        host: 'https://translate.google.com',
        splitPunct: ',.?!;',
      }) as Array<{ shortText: string; url: string }>;

      for (const chunk of chunks) {
        if (!chunk.url) continue;
        await this.streamUrl(chunk.url);
      }
    } catch (e: any) {
      console.warn(`[TTS] Failed to play "${item.text.slice(0, 40)}...":`, e.message);
    }

    this.playNext();
  }

  private streamUrl(url: string): Promise<void> {
    return new Promise((resolve) => {
      const ffmpeg = spawn('ffmpeg', [
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5',
        '-i', url,
        '-vn',
        '-acodec', 'pcm_s16le',
        '-ar', '48000',
        '-ac', '2',
        '-f', 's16le',
        'pipe:1',
      ], { stdio: ['ignore', 'pipe', 'pipe'] });

      this.currentFfmpeg = ffmpeg;
      ffmpeg.stderr?.resume();
      ffmpeg.on('error', () => resolve());

      const resource = createAudioResource(ffmpeg.stdout!, { inputType: StreamType.Raw });

      const onIdle = () => {
        this.audioPlayer.removeListener(AudioPlayerStatus.Idle, onIdle as any);
        this.audioPlayer.removeListener('error', onErr as any);
        resolve();
      };
      const onErr = () => {
        this.audioPlayer.removeListener(AudioPlayerStatus.Idle, onIdle as any);
        this.audioPlayer.removeListener('error', onErr as any);
        resolve();
      };

      // Temporarily override the outer idle listener just for this chunk
      this.audioPlayer.once(AudioPlayerStatus.Idle, onIdle as any);
      this.audioPlayer.once('error', onErr as any);

      this.audioPlayer.play(resource);
    });
  }

  stop() {
    this.queue = [];
    this.isPlaying = false;
    this.clearInactivity();
    if (this.currentFfmpeg) { try { this.currentFfmpeg.kill('SIGKILL'); } catch {} this.currentFfmpeg = null; }
    this.audioPlayer.stop(true);
    const conn = getVoiceConnection(this.guildId);
    if (conn) conn.destroy();
    this.connection = null;
    this.vcId = '';
  }

  private startInactivity() {
    this.clearInactivity();
    this.inactivityTimer = setTimeout(() => {
      this.stop();
    }, 30_000);
  }

  private clearInactivity() {
    if (this.inactivityTimer) { clearTimeout(this.inactivityTimer); this.inactivityTimer = null; }
  }
}

// ── SESSION MAP ───────────────────────────────────────────────────────────────
const sessions = new Map<string, GuildTTSSession>();

function getSession(guildId: string): GuildTTSSession {
  if (!sessions.has(guildId)) sessions.set(guildId, new GuildTTSSession(guildId));
  return sessions.get(guildId)!;
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function errorEmbed(title: string, desc: string) {
  return new EmbedBuilder().setColor(COLORS.error).setTitle(`❌ ${title}`).setDescription(desc).setFooter(BOT_FOOTER).setTimestamp();
}
function successEmbed(title: string, desc: string) {
  return new EmbedBuilder().setColor(COLORS.success).setTitle(`✅ ${title}`).setDescription(desc).setFooter(BOT_FOOTER).setTimestamp();
}

// ── TTS COMMANDS ──────────────────────────────────────────────────────────────
const ttsCommands: BotCommand[] = [

  // ── !tts <text> ──────────────────────────────────────────────────────────
  {
    name: 'tts',
    description: 'Make the bot speak your text in the voice channel',
    category: 'TTS',
    usage: 'tts <text>',
    aliases: ['speak', 'say'],
    async execute(message: Message, args: string[]) {
      if (!message.guild || !message.member) return;

      const text = args.join(' ').trim();
      if (!text) {
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor(COLORS.info)
          .setTitle('🔊 TTS — Text to Speech')
          .setDescription(
            'Make the bot **speak your message** in the voice channel!\n\n' +
            '> **Usage:** `!tts <your text here>`\n' +
            '> **Example:** `!tts Hello everyone, how are you?`\n\n' +
            '**Commands:**\n' +
            '> `!ttslang <language>` — Set your personal TTS language\n' +
            '> `!ttslangs` — See all supported languages\n' +
            '> `!ttsstop` — Stop TTS and leave VC\n' +
            '> `!ttsqueue` — View the TTS queue\n' +
            '> `!ttshelp` — Full help'
          )
          .setFooter(BOT_FOOTER)
          .setTimestamp()
        ] });
      }

      // Text length limit
      if (text.length > 500) {
        return message.reply({ embeds: [errorEmbed('Text Too Long', `Max 500 characters per TTS message. You sent ${text.length} chars.\n\nTip: Break it into shorter messages.`)] });
      }

      // Must be in a VC
      const voiceChannel = message.member.voice?.channel;
      if (!voiceChannel) {
        return message.reply({ embeds: [errorEmbed('Not in Voice Channel', 'You need to **join a voice channel** first before using TTS.\n\nJoin any VC and try again!')] });
      }

      // Get user's preferred language
      const lang = getTTSLang(message.author.id) ?? getTTSGuildDefault(message.guild.id) ?? 'en';
      const langInfo = TTS_LANGUAGES[lang] ?? TTS_LANGUAGES['en'];

      const session = getSession(message.guild.id);
      session.textChannelId = message.channel.id;
      session.connect(voiceChannel.id, message.guild.voiceAdapterCreator);

      session.enqueue({
        text,
        lang,
        userId: message.author.id,
        username: message.member.displayName,
        slow: false,
      });

      const queuePos = session.queue.length;
      await message.reply({ embeds: [new EmbedBuilder()
        .setColor(COLORS.success)
        .setAuthor({ name: '🔊 TTS — Speaking in VC' })
        .setDescription(`> **${text.length > 80 ? text.slice(0, 80) + '…' : text}**`)
        .addFields(
          { name: '🌐 Language', value: `${langInfo.flag} ${langInfo.name} (${langInfo.native})`, inline: true },
          { name: '👤 Speaker', value: `${message.member.displayName}`, inline: true },
          { name: '📋 Queue', value: queuePos > 0 ? `Position #${queuePos + 1}` : '▶️ Playing now', inline: true },
        )
        .setFooter({ text: `Use !ttslang to change language  •  ${BOT_FOOTER.text}` })
        .setTimestamp()
      ] });
    }
  },

  // ── !ttslang <language> ───────────────────────────────────────────────────
  {
    name: 'ttslang',
    description: 'Set your personal TTS language',
    category: 'TTS',
    usage: 'ttslang <language or code>',
    aliases: ['ttsset', 'setttslang', 'mylang'],
    async execute(message: Message, args: string[]) {
      if (!message.guild) return;

      const input = args.join(' ').trim();
      if (!input) {
        const currentCode = getTTSLang(message.author.id) ?? getTTSGuildDefault(message.guild.id) ?? 'en';
        const currentLang = TTS_LANGUAGES[currentCode];
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor(COLORS.info)
          .setTitle('🌐 Your TTS Language')
          .setDescription(
            `**Current:** ${currentLang?.flag} ${currentLang?.name} (${currentLang?.native}) — \`${currentCode}\`\n\n` +
            'To change: `!ttslang <language>`\n' +
            'Examples: `!ttslang hindi`, `!ttslang en`, `!ttslang japanese`\n\n' +
            'See all languages: `!ttslangs`'
          )
          .setFooter(BOT_FOOTER)
          .setTimestamp()
        ] });
      }

      const code = resolveLang(input);
      if (!code) {
        return message.reply({ embeds: [errorEmbed('Unknown Language',
          `**"${input}"** is not a recognized language.\n\nUse \`!ttslangs\` to see all supported languages and codes.\n\nExamples: \`!ttslang hindi\`, \`!ttslang en\`, \`!ttslang ja\``
        )] });
      }

      setTTSLang(message.author.id, code);
      const lang = TTS_LANGUAGES[code];

      await message.reply({ embeds: [successEmbed('Language Set',
        `Your TTS language is now **${lang.flag} ${lang.name}** (${lang.native}).\n\n` +
        `All your future \`!tts\` messages will be spoken in ${lang.name}.\n` +
        `Try it: \`!tts Hello, this is your new voice!\``
      )] });
    }
  },

  // ── !ttslangs ─────────────────────────────────────────────────────────────
  {
    name: 'ttslangs',
    description: 'List all supported TTS languages',
    category: 'TTS',
    usage: 'ttslangs',
    aliases: ['ttslanguages', 'ttslist', 'langlist'],
    async execute(message: Message) {
      const col1: string[] = [];
      const col2: string[] = [];
      const entries = Object.entries(TTS_LANGUAGES);

      entries.forEach(([code, info], i) => {
        const line = `${info.flag} **${info.name}** — \`${code}\``;
        if (i % 2 === 0) col1.push(line);
        else col2.push(line);
      });

      await message.reply({ embeds: [new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle('🌐 Supported TTS Languages')
        .setDescription('Set your language with `!ttslang <name or code>`\nExample: `!ttslang hindi` or `!ttslang hi`')
        .addFields(
          { name: '\u200b', value: col1.join('\n'), inline: true },
          { name: '\u200b', value: col2.join('\n'), inline: true },
        )
        .setFooter({ text: `${entries.length} languages supported  •  ${BOT_FOOTER.text}` })
        .setTimestamp()
      ] });
    }
  },

  // ── !ttsstop ──────────────────────────────────────────────────────────────
  {
    name: 'ttsstop',
    description: 'Stop TTS and make the bot leave the voice channel',
    category: 'TTS',
    usage: 'ttsstop',
    aliases: ['ttsleave', 'ttsoff', 'stoptts'],
    async execute(message: Message) {
      if (!message.guild) return;

      const session = sessions.get(message.guild.id);
      if (!session || (!session.isPlaying && session.queue.length === 0 && !session.vcId)) {
        return message.reply({ embeds: [errorEmbed('Not Active', 'TTS is not currently active in this server.\n\nUse `!tts <text>` to start!')] });
      }

      session.stop();
      await message.reply({ embeds: [successEmbed('TTS Stopped', 'Stopped TTS and left the voice channel. Use `!tts <text>` to start again.')] });
    }
  },

  // ── !ttsqueue ─────────────────────────────────────────────────────────────
  {
    name: 'ttsqueue',
    description: 'View the current TTS queue',
    category: 'TTS',
    usage: 'ttsqueue',
    aliases: ['ttsq', 'ttspending'],
    async execute(message: Message) {
      if (!message.guild) return;

      const session = sessions.get(message.guild.id);
      if (!session || session.queue.length === 0) {
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor(COLORS.info)
          .setTitle('📋 TTS Queue')
          .setDescription('Queue is empty! Use `!tts <text>` to add something.')
          .setFooter(BOT_FOOTER)
          .setTimestamp()
        ] });
      }

      const entries = session.queue.slice(0, 10).map((item, i) => {
        const lang = TTS_LANGUAGES[item.lang];
        const preview = item.text.length > 60 ? item.text.slice(0, 60) + '…' : item.text;
        return `**${i + 1}.** ${lang?.flag ?? '🌐'} **${item.username}:** "${preview}"`;
      });

      await message.reply({ embeds: [new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle(`📋 TTS Queue — ${session.queue.length} item${session.queue.length === 1 ? '' : 's'}`)
        .setDescription(entries.join('\n') + (session.queue.length > 10 ? `\n*...and ${session.queue.length - 10} more*` : ''))
        .addFields(
          { name: '▶️ Status', value: session.isPlaying ? 'Speaking now' : 'Idle', inline: true },
          { name: '🔊 VC', value: session.vcId ? `<#${session.vcId}>` : 'Not in VC', inline: true },
        )
        .setFooter({ text: `Use !ttsstop to clear queue  •  ${BOT_FOOTER.text}` })
        .setTimestamp()
      ] });
    }
  },

  // ── !ttsskip ──────────────────────────────────────────────────────────────
  {
    name: 'ttsskip',
    description: 'Skip the current TTS message',
    category: 'TTS',
    usage: 'ttsskip',
    aliases: ['skiptt', 'nexttts'],
    async execute(message: Message) {
      if (!message.guild) return;

      const session = sessions.get(message.guild.id);
      if (!session || !session.isPlaying) {
        return message.reply({ embeds: [errorEmbed('Nothing Playing', 'No TTS is currently playing to skip.')] });
      }

      session.audioPlayer.stop(true);
      await message.reply({ embeds: [successEmbed('Skipped', 'Skipped the current TTS message.')] });
    }
  },

  // ── !ttsclear ─────────────────────────────────────────────────────────────
  {
    name: 'ttsclear',
    description: 'Clear the TTS queue (keeps bot in VC)',
    category: 'TTS',
    usage: 'ttsclear',
    aliases: ['cleartts', 'ttsflush'],
    async execute(message: Message) {
      if (!message.guild) return;

      const session = sessions.get(message.guild.id);
      if (!session || session.queue.length === 0) {
        return message.reply({ embeds: [errorEmbed('Empty Queue', 'The TTS queue is already empty.')] });
      }

      const count = session.queue.length;
      session.queue = [];
      await message.reply({ embeds: [successEmbed('Queue Cleared', `Removed ${count} pending TTS message${count === 1 ? '' : 's'} from the queue.`)] });
    }
  },

  // ── !ttsdefault (Staff) ───────────────────────────────────────────────────
  {
    name: 'ttsdefault',
    description: '[Staff] Set the server default TTS language',
    category: 'TTS',
    usage: 'ttsdefault <language>',
    aliases: ['setservertts', 'ttsserverlang', 'guildtts'],
    async execute(message: Message, args: string[]) {
      if (!message.guild) return;
      if (!isBotStaff(message.author.id) && !isBotOwner(message.author.id) && message.guild.ownerId !== message.author.id) {
        return message.reply({ embeds: [errorEmbed('No Permission', 'Only the server owner or bot staff can change the server default TTS language.')] });
      }

      const input = args.join(' ').trim();
      if (!input) {
        const current = getTTSGuildDefault(message.guild.id) ?? 'en';
        const lang = TTS_LANGUAGES[current];
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor(COLORS.info)
          .setTitle('🌐 Server TTS Default')
          .setDescription(
            `**Current:** ${lang?.flag} ${lang?.name} — \`${current}\`\n\n` +
            'To change: `!ttsdefault <language>`\n' +
            'This applies to users who haven\'t set their own language with `!ttslang`.'
          )
          .setFooter(BOT_FOOTER)
          .setTimestamp()
        ] });
      }

      const code = resolveLang(input);
      if (!code) {
        return message.reply({ embeds: [errorEmbed('Unknown Language', `**"${input}"** is not recognized.\nUse \`!ttslangs\` to see all supported languages.`)] });
      }

      setTTSGuildDefault(message.guild.id, code);
      const lang = TTS_LANGUAGES[code];
      await message.reply({ embeds: [successEmbed('Server Default Set',
        `Server TTS default is now **${lang.flag} ${lang.name}** (${lang.native}).\n\n` +
        'Users without a personal language set will use this.\n' +
        'Users can override with `!ttslang <language>`.'
      )] });
    }
  },

  // ── !ttsinfo ──────────────────────────────────────────────────────────────
  {
    name: 'ttsinfo',
    description: 'Show your TTS settings and current session status',
    category: 'TTS',
    usage: 'ttsinfo',
    aliases: ['ttsstatus', 'mytts'],
    async execute(message: Message) {
      if (!message.guild) return;

      const userLangCode = getTTSLang(message.author.id);
      const guildLangCode = getTTSGuildDefault(message.guild.id) ?? 'en';
      const activeLangCode = userLangCode ?? guildLangCode;
      const userLang = userLangCode ? TTS_LANGUAGES[userLangCode] : null;
      const guildLang = TTS_LANGUAGES[guildLangCode];
      const activeLang = TTS_LANGUAGES[activeLangCode];

      const session = sessions.get(message.guild.id);
      const isActive = !!(session?.isPlaying || session?.queue.length);

      await message.reply({ embeds: [new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle('🔊 TTS Info')
        .setThumbnail(message.author.displayAvatarURL({ size: 256 }))
        .addFields(
          { name: '🌐 Your Language', value: userLang
            ? `${userLang.flag} ${userLang.name} (${userLang.native}) — \`${userLangCode}\``
            : `*Not set — using server default*`, inline: false },
          { name: '🏠 Server Default', value: `${guildLang?.flag} ${guildLang?.name} — \`${guildLangCode}\``, inline: true },
          { name: '▶️ Active Lang', value: `${activeLang?.flag} ${activeLang?.name} — \`${activeLangCode}\``, inline: true },
          { name: '📡 TTS Session', value: isActive
            ? `🟢 Active — ${session!.queue.length} in queue`
            : '⚫ Inactive', inline: true },
        )
        .addFields({
          name: '📋 Quick Commands',
          value:
            '`!tts <text>` — Speak in VC\n' +
            '`!ttslang <lang>` — Change your language\n' +
            '`!ttslangs` — List all languages\n' +
            '`!ttsstop` — Stop & leave VC',
          inline: false,
        })
        .setFooter(BOT_FOOTER)
        .setTimestamp()
      ] });
    }
  },

  // ── !ttshelp ──────────────────────────────────────────────────────────────
  {
    name: 'ttshelp',
    description: 'Show all TTS commands and how to use them',
    category: 'TTS',
    usage: 'ttshelp',
    aliases: ['helptts'],
    async execute(message: Message) {
      await message.reply({ embeds: [new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle('🔊 TTS — Text to Speech Help')
        .setDescription(
          'The TTS system lets the bot **speak your messages in a voice channel**.\n' +
          'Perfect for accessibility, or just having fun!\n\n' +
          '**How to use:** Join a voice channel → type `!tts <your message>`'
        )
        .addFields(
          {
            name: '🗣️ Speaking',
            value:
              '`!tts <text>` — Bot joins your VC and speaks the text\n' +
              '`!ttsskip` — Skip the current message\n' +
              '`!ttsstop` / `!ttsleave` — Stop TTS and leave VC\n' +
              '`!ttsclear` — Clear the queue (bot stays in VC)',
            inline: false,
          },
          {
            name: '🌐 Languages',
            value:
              '`!ttslang <language>` — Set YOUR personal TTS language\n' +
              '`!ttslangs` — See all 24 supported languages\n' +
              '`!ttsdefault <lang>` — *(Staff)* Set server default language',
            inline: false,
          },
          {
            name: '📊 Status',
            value:
              '`!ttsqueue` — View queued TTS messages\n' +
              '`!ttsinfo` — Your settings + active session status',
            inline: false,
          },
          {
            name: '🌍 Language Examples',
            value:
              '`!ttslang hindi` → 🇮🇳 Hindi\n' +
              '`!ttslang english` → 🇬🇧 English\n' +
              '`!ttslang japanese` → 🇯🇵 Japanese\n' +
              '`!ttslang hi` / `!ttslang en` → short codes also work',
            inline: false,
          },
          {
            name: '⚡ Tips',
            value:
              '• Max 500 characters per TTS message\n' +
              '• Multiple users can queue TTS messages at once\n' +
              '• Bot auto-leaves after 30 seconds of silence\n' +
              '• Your language preference is saved permanently',
            inline: false,
          }
        )
        .setFooter({ text: `24 languages supported  •  ${BOT_FOOTER.text}` })
        .setTimestamp()
      ] });
    }
  },

];

export default ttsCommands;
