import {
  AudioPlayer, AudioPlayerStatus, VoiceConnection, StreamType,
  createAudioPlayer, createAudioResource, joinVoiceChannel,
  getVoiceConnection,
} from '@discordjs/voice';
import { spawn } from 'child_process';
import { createRequire } from 'module';
import axios from 'axios';
import { EmbedBuilder, Message } from 'discord.js';
import { BotCommand } from '../client.js';
import { COLORS, BOT_FOOTER } from '../utils/embeds.js';
import {
  getTTSLang, setTTSLang, getTTSGuildDefault, setTTSGuildDefault,
  getTTSSlow, setTTSSlow,
} from '../database.js';
import { isBotStaff, isBotOwner } from '../utils/permissions.js';

// ── CJS-SAFE IMPORT (google-tts-api is CommonJS) ─────────────────────────────
const _require = createRequire(import.meta.url);
const { getAllAudioUrls } = _require('google-tts-api') as {
  getAllAudioUrls: (text: string, opts: { lang: string; slow: boolean; host: string; splitPunct?: string }) => Array<{ shortText: string; url: string }>;
};

// ── SUPPORTED LANGUAGES ───────────────────────────────────────────────────────
export const TTS_LANGUAGES: Record<string, { name: string; native: string; flag: string }> = {
  en:  { name: 'English',    native: 'English',         flag: '🇬🇧' },
  hi:  { name: 'Hindi',      native: 'हिंदी',             flag: '🇮🇳' },
  es:  { name: 'Spanish',    native: 'Español',         flag: '🇪🇸' },
  fr:  { name: 'French',     native: 'Français',        flag: '🇫🇷' },
  de:  { name: 'German',     native: 'Deutsch',         flag: '🇩🇪' },
  ja:  { name: 'Japanese',   native: '日本語',            flag: '🇯🇵' },
  ko:  { name: 'Korean',     native: '한국어',            flag: '🇰🇷' },
  zh:  { name: 'Chinese',    native: '中文',             flag: '🇨🇳' },
  ar:  { name: 'Arabic',     native: 'العربية',          flag: '🇸🇦' },
  pt:  { name: 'Portuguese', native: 'Português',       flag: '🇧🇷' },
  ru:  { name: 'Russian',    native: 'Русский',         flag: '🇷🇺' },
  it:  { name: 'Italian',    native: 'Italiano',        flag: '🇮🇹' },
  pa:  { name: 'Punjabi',    native: 'ਪੰਜਾਬੀ',           flag: '🇮🇳' },
  bn:  { name: 'Bengali',    native: 'বাংলা',            flag: '🇧🇩' },
  ur:  { name: 'Urdu',       native: 'اردو',             flag: '🇵🇰' },
  ta:  { name: 'Tamil',      native: 'தமிழ்',            flag: '🇮🇳' },
  tr:  { name: 'Turkish',    native: 'Türkçe',          flag: '🇹🇷' },
  nl:  { name: 'Dutch',      native: 'Nederlands',      flag: '🇳🇱' },
  pl:  { name: 'Polish',     native: 'Polski',          flag: '🇵🇱' },
  sv:  { name: 'Swedish',    native: 'Svenska',         flag: '🇸🇪' },
  id:  { name: 'Indonesian', native: 'Bahasa Indonesia',flag: '🇮🇩' },
  vi:  { name: 'Vietnamese', native: 'Tiếng Việt',      flag: '🇻🇳' },
  th:  { name: 'Thai',       native: 'ภาษาไทย',          flag: '🇹🇭' },
  ms:  { name: 'Malay',      native: 'Bahasa Melayu',   flag: '🇲🇾' },
};

// ── LANG ALIASES ──────────────────────────────────────────────────────────────
const LANG_ALIASES: Record<string, string> = {
  english:'en', hindi:'hi', spanish:'es', french:'fr', german:'de',
  japanese:'ja', korean:'ko', chinese:'zh', arabic:'ar', portuguese:'pt',
  russian:'ru', italian:'it', punjabi:'pa', bengali:'bn', urdu:'ur',
  tamil:'ta', turkish:'tr', dutch:'nl', polish:'pl', swedish:'sv',
  indonesian:'id', vietnamese:'vi', thai:'th', malay:'ms',
  jp:'ja', kr:'ko', cn:'zh', 'zh-cn':'zh', 'zh-tw':'zh',
  ind:'hi', indian:'hi', panjabi:'pa', pun:'pa',
};

export function resolveLang(input: string): string | null {
  const lower = input.toLowerCase().trim();
  if (TTS_LANGUAGES[lower]) return lower;
  return LANG_ALIASES[lower] ?? null;
}

// ── GOOGLE TTS HEADERS (required to avoid 403) ────────────────────────────────
const TTS_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Referer': 'https://translate.google.com/',
  'Accept-Language': 'en-US,en;q=0.9',
};

// ── DOWNLOAD TTS AUDIO → BUFFER ───────────────────────────────────────────────
// Downloads the MP3 from Google Translate TTS with proper browser headers.
async function fetchTTSBuffer(url: string): Promise<Buffer> {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    headers: TTS_HEADERS,
    timeout: 12000,
  });
  return Buffer.from(res.data as ArrayBuffer);
}

// ── STREAM MP3 BUFFER → DISCORD PCM ──────────────────────────────────────────
// Pipes the MP3 buffer into ffmpeg via stdin, gets raw PCM on stdout.
function bufferToAudioResource(mp3: Buffer) {
  const ff = spawn('ffmpeg', [
    '-hide_banner', '-loglevel', 'error',
    '-f', 'mp3', '-i', 'pipe:0',
    '-vn',
    '-acodec', 'pcm_s16le',
    '-ar', '48000',
    '-ac', '2',
    '-f', 's16le',
    'pipe:1',
  ], { stdio: ['pipe', 'pipe', 'pipe'] });

  ff.stdin!.write(mp3);
  ff.stdin!.end();

  return {
    resource: createAudioResource(ff.stdout!, { inputType: StreamType.Raw }),
    ffmpeg: ff,
  };
}

// ── TTS QUEUE ITEM ─────────────────────────────────────────────────────────────
interface TTSItem {
  text: string;
  lang: string;
  slow: boolean;
  userId: string;
  username: string;
}

// ── GUILD TTS SESSION ─────────────────────────────────────────────────────────
// Uses a single idle-callback pattern to avoid event listener conflicts.
class GuildTTSSession {
  guildId: string;
  queue: TTSItem[] = [];
  isPlaying = false;
  audioPlayer: AudioPlayer;
  vcId = '';
  textChannelId = '';
  private idleCallback: (() => void) | null = null;
  private inactivityTimer: NodeJS.Timeout | null = null;
  private activeFfmpeg: ReturnType<typeof spawn> | null = null;

  constructor(guildId: string) {
    this.guildId = guildId;
    this.audioPlayer = createAudioPlayer();

    // Single idle handler — calls registered callback, or starts inactivity timer
    this.audioPlayer.on(AudioPlayerStatus.Idle, () => {
      const cb = this.idleCallback;
      this.idleCallback = null;
      if (cb) cb();
    });

    this.audioPlayer.on('error', (err) => {
      console.error(`[TTS] AudioPlayer error in ${guildId}:`, err.message);
      const cb = this.idleCallback;
      this.idleCallback = null;
      if (cb) cb();
    });
  }

  // ── CONNECT TO VOICE CHANNEL ────────────────────────────────────────────────
  connect(vcId: string, adapterCreator: any) {
    const existing = getVoiceConnection(this.guildId);
    if (existing && this.vcId === vcId) return; // already in the right VC

    // Destroy existing connection (music player will need to rejoin if needed)
    if (existing) existing.destroy();

    const conn = joinVoiceChannel({
      channelId: vcId,
      guildId: this.guildId,
      adapterCreator,
      selfDeaf: false,
    });
    conn.subscribe(this.audioPlayer);
    this.vcId = vcId;
    this.clearInactivity();
  }

  // ── ADD TO QUEUE & KICK OFF PLAYBACK ────────────────────────────────────────
  enqueue(item: TTSItem) {
    this.queue.push(item);
    this.clearInactivity();
    if (!this.isPlaying) this.runQueue();
  }

  // ── DRAIN THE QUEUE ─────────────────────────────────────────────────────────
  private async runQueue() {
    if (this.isPlaying) return;
    this.isPlaying = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      await this.speakItem(item);
    }

    this.isPlaying = false;
    this.startInactivity();
  }

  // ── SPEAK ONE ITEM (may be split into multiple chunks) ──────────────────────
  private async speakItem(item: TTSItem) {
    let chunks: Array<{ shortText: string; url: string }> = [];
    try {
      chunks = getAllAudioUrls(item.text, {
        lang: item.lang,
        slow: item.slow,
        host: 'https://translate.google.com',
        splitPunct: ',.?!;',
      });
    } catch (e: any) {
      console.error(`[TTS] getAllAudioUrls error:`, e.message);
      return;
    }

    for (const chunk of chunks) {
      if (!chunk.url) continue;
      try {
        const mp3 = await fetchTTSBuffer(chunk.url);
        await this.playBuffer(mp3);
      } catch (e: any) {
        console.warn(`[TTS] chunk failed ("${chunk.shortText?.slice(0, 30)}"):`, e.message);
      }
    }
  }

  // ── PLAY ONE MP3 BUFFER AND WAIT FOR IT TO FINISH ───────────────────────────
  private playBuffer(mp3: Buffer): Promise<void> {
    return new Promise<void>((resolve) => {
      const { resource, ffmpeg } = bufferToAudioResource(mp3);
      this.activeFfmpeg = ffmpeg;
      ffmpeg.on('error', () => { this.activeFfmpeg = null; resolve(); });

      // The single idle handler will call this when the resource finishes
      this.idleCallback = () => { this.activeFfmpeg = null; resolve(); };
      this.audioPlayer.play(resource);
    });
  }

  // ── STOP EVERYTHING ─────────────────────────────────────────────────────────
  stop() {
    this.queue = [];
    this.isPlaying = false;
    this.idleCallback = null;
    this.clearInactivity();
    if (this.activeFfmpeg) { try { this.activeFfmpeg.kill('SIGKILL'); } catch {} this.activeFfmpeg = null; }
    this.audioPlayer.stop(true);
    const conn = getVoiceConnection(this.guildId);
    if (conn) conn.destroy();
    this.vcId = '';
  }

  // ── SKIP CURRENT CHUNK ───────────────────────────────────────────────────────
  skip() {
    if (this.activeFfmpeg) { try { this.activeFfmpeg.kill('SIGKILL'); } catch {} this.activeFfmpeg = null; }
    this.audioPlayer.stop(true);
  }

  private startInactivity() {
    this.clearInactivity();
    this.inactivityTimer = setTimeout(() => {
      if (!this.isPlaying) this.stop();
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

// ── EMBED HELPERS ─────────────────────────────────────────────────────────────
function errorEmbed(title: string, desc: string) {
  return new EmbedBuilder().setColor(COLORS.error).setTitle(`❌ ${title}`).setDescription(desc).setFooter(BOT_FOOTER).setTimestamp();
}
function successEmbed(title: string, desc: string) {
  return new EmbedBuilder().setColor(COLORS.success).setTitle(`✅ ${title}`).setDescription(desc).setFooter(BOT_FOOTER).setTimestamp();
}

// ─────────────────────────────────────────────────────────────────────────────
//  TTS COMMANDS
// ─────────────────────────────────────────────────────────────────────────────
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
            '**Quick Commands:**\n' +
            '`!ttslang <language>` — Set your personal TTS language\n' +
            '`!ttslangs` — See all 24 supported languages\n' +
            '`!ttsslow` — Toggle slow/normal speech speed\n' +
            '`!ttsstop` — Stop TTS and leave VC'
          )
          .setFooter(BOT_FOOTER).setTimestamp()
        ] });
      }

      if (text.length > 500) {
        return message.reply({ embeds: [errorEmbed('Text Too Long', `Max **500 characters** per TTS message. You sent ${text.length} chars.\nBreak it into shorter messages.`)] });
      }

      const voiceChannel = message.member.voice?.channel;
      if (!voiceChannel) {
        return message.reply({ embeds: [errorEmbed('Not in Voice Channel', 'You need to **join a voice channel** first!\n\nJoin any VC and try again.')] });
      }

      const lang = getTTSLang(message.author.id) ?? getTTSGuildDefault(message.guild.id) ?? 'en';
      const slow = getTTSSlow(message.author.id);
      const langInfo = TTS_LANGUAGES[lang] ?? TTS_LANGUAGES['en'];

      const session = getSession(message.guild.id);
      session.textChannelId = message.channel.id;
      session.connect(voiceChannel.id, message.guild.voiceAdapterCreator);
      session.enqueue({ text, lang, slow, userId: message.author.id, username: message.member.displayName });

      const queuePos = session.queue.length;
      await message.reply({ embeds: [new EmbedBuilder()
        .setColor(COLORS.success)
        .setAuthor({ name: '🔊 TTS — Speaking in VC' })
        .setDescription(`> ${text.length > 100 ? text.slice(0, 100) + '…' : text}`)
        .addFields(
          { name: '🌐 Language', value: `${langInfo.flag} ${langInfo.name}`, inline: true },
          { name: '🐢 Speed',    value: slow ? '`Slow`' : '`Normal`',         inline: true },
          { name: '📋 Queue',    value: queuePos > 0 ? `Position #${queuePos + 1}` : '▶️ Playing now', inline: true },
        )
        .setFooter({ text: `!ttslang to change language  •  !ttsslow to toggle speed  •  ${BOT_FOOTER.text}` })
        .setTimestamp()
      ] });
    }
  },

  // ── !ttslang ──────────────────────────────────────────────────────────────
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
        const code = getTTSLang(message.author.id) ?? getTTSGuildDefault(message.guild.id) ?? 'en';
        const l = TTS_LANGUAGES[code];
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor(COLORS.info)
          .setTitle('🌐 Your TTS Language')
          .setDescription(`**Current:** ${l?.flag} ${l?.name} (${l?.native}) — \`${code}\`\n\nChange it: \`!ttslang hindi\` or \`!ttslang hi\`\nSee all: \`!ttslangs\``)
          .setFooter(BOT_FOOTER).setTimestamp()
        ] });
      }

      const code = resolveLang(input);
      if (!code) {
        return message.reply({ embeds: [errorEmbed('Unknown Language', `**"${input}"** is not recognized.\n\nUse \`!ttslangs\` to see all supported languages.\nExamples: \`!ttslang hindi\`, \`!ttslang en\`, \`!ttslang japanese\``)] });
      }

      setTTSLang(message.author.id, code);
      const l = TTS_LANGUAGES[code];
      await message.reply({ embeds: [successEmbed('Language Set',
        `Your TTS language is now **${l.flag} ${l.name}** (${l.native}).\nAll your \`!tts\` messages will be spoken in ${l.name}.\n\nTry it: \`!tts Hello, this is my new voice!\``
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
      const entries = Object.entries(TTS_LANGUAGES);
      const col1: string[] = [];
      const col2: string[] = [];
      entries.forEach(([code, info], i) => {
        const line = `${info.flag} **${info.name}** — \`${code}\``;
        if (i % 2 === 0) col1.push(line); else col2.push(line);
      });

      await message.reply({ embeds: [new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle('🌐 Supported TTS Languages')
        .setDescription('Set yours with `!ttslang <name or code>`\nExample: `!ttslang hindi` or `!ttslang hi`')
        .addFields(
          { name: '\u200b', value: col1.join('\n'), inline: true },
          { name: '\u200b', value: col2.join('\n'), inline: true },
        )
        .setFooter({ text: `${entries.length} languages  •  ${BOT_FOOTER.text}` })
        .setTimestamp()
      ] });
    }
  },

  // ── !ttsslow ──────────────────────────────────────────────────────────────
  {
    name: 'ttsslow',
    description: 'Toggle slow speech mode for your TTS messages',
    category: 'TTS',
    usage: 'ttsslow',
    aliases: ['slowtts', 'ttsslowmode', 'slowspeak'],
    async execute(message: Message) {
      const current = getTTSSlow(message.author.id);
      const newValue = !current;
      setTTSSlow(message.author.id, newValue);

      await message.reply({ embeds: [new EmbedBuilder()
        .setColor(newValue ? COLORS.warning : COLORS.success)
        .setTitle(newValue ? '🐢 Slow Mode ON' : '⚡ Normal Speed ON')
        .setDescription(
          newValue
            ? 'Your TTS messages will now be spoken **slowly** — great for learning, accessibility, or hard-to-pronounce words.\n\nToggle back: `!ttsslow`'
            : 'Your TTS messages will now be spoken at **normal speed**.\n\nToggle slow mode back: `!ttsslow`'
        )
        .setFooter(BOT_FOOTER)
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
        return message.reply({ embeds: [errorEmbed('Not Active', 'TTS is not currently active.\nUse `!tts <text>` to start!')] });
      }
      session.stop();
      await message.reply({ embeds: [successEmbed('TTS Stopped', 'Stopped TTS and left the voice channel.')] });
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
        return message.reply({ embeds: [errorEmbed('Nothing Playing', 'No TTS is currently playing.')] });
      }
      session.skip();
      await message.reply({ embeds: [successEmbed('Skipped', 'Skipped the current TTS message.')] });
    }
  },

  // ── !ttsclear ─────────────────────────────────────────────────────────────
  {
    name: 'ttsclear',
    description: 'Clear the TTS queue (bot stays in VC)',
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
      await message.reply({ embeds: [successEmbed('Queue Cleared', `Removed **${count}** pending TTS message${count === 1 ? '' : 's'}.`)] });
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
          .setFooter(BOT_FOOTER).setTimestamp()
        ] });
      }

      const entries = session.queue.slice(0, 10).map((item, i) => {
        const l = TTS_LANGUAGES[item.lang];
        const preview = item.text.length > 60 ? item.text.slice(0, 60) + '…' : item.text;
        return `**${i + 1}.** ${l?.flag ?? '🌐'} **${item.username}:** "${preview}"`;
      });

      await message.reply({ embeds: [new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle(`📋 TTS Queue — ${session.queue.length} item${session.queue.length === 1 ? '' : 's'}`)
        .setDescription(entries.join('\n') + (session.queue.length > 10 ? `\n*…and ${session.queue.length - 10} more*` : ''))
        .addFields(
          { name: '▶️ Status', value: session.isPlaying ? 'Speaking now' : 'Idle', inline: true },
          { name: '🔊 VC',    value: session.vcId ? `<#${session.vcId}>` : 'Not in VC', inline: true },
        )
        .setFooter({ text: `!ttsstop to clear all  •  ${BOT_FOOTER.text}` })
        .setTimestamp()
      ] });
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
        return message.reply({ embeds: [errorEmbed('No Permission', 'Only the server owner or bot staff can change the server TTS default.')] });
      }
      const input = args.join(' ').trim();
      if (!input) {
        const code = getTTSGuildDefault(message.guild.id) ?? 'en';
        const l = TTS_LANGUAGES[code];
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor(COLORS.info)
          .setTitle('🌐 Server TTS Default')
          .setDescription(`**Current:** ${l?.flag} ${l?.name} — \`${code}\`\n\nChange: \`!ttsdefault <language>\`\nUsers with \`!ttslang\` set will override this.`)
          .setFooter(BOT_FOOTER).setTimestamp()
        ] });
      }

      const code = resolveLang(input);
      if (!code) {
        return message.reply({ embeds: [errorEmbed('Unknown Language', `**"${input}"** is not recognized. Use \`!ttslangs\` to see all options.`)] });
      }
      setTTSGuildDefault(message.guild.id, code);
      const l = TTS_LANGUAGES[code];
      await message.reply({ embeds: [successEmbed('Server Default Set',
        `Server TTS default is now **${l.flag} ${l.name}** (${l.native}).\nUsers without a personal language set will use this.`
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
      const userLangCode  = getTTSLang(message.author.id);
      const guildLangCode = getTTSGuildDefault(message.guild.id) ?? 'en';
      const activeLang    = TTS_LANGUAGES[userLangCode ?? guildLangCode];
      const slow          = getTTSSlow(message.author.id);
      const session       = sessions.get(message.guild.id);
      const isActive      = !!(session?.isPlaying || session?.queue.length);

      await message.reply({ embeds: [new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle('🔊 Your TTS Settings')
        .setThumbnail(message.author.displayAvatarURL({ size: 256 }))
        .addFields(
          { name: '🌐 Your Language', value: userLangCode
            ? `${TTS_LANGUAGES[userLangCode]?.flag} ${TTS_LANGUAGES[userLangCode]?.name} — \`${userLangCode}\``
            : `*Not set — using server default (${TTS_LANGUAGES[guildLangCode]?.name})*`, inline: false },
          { name: '🐢 Slow Mode',  value: slow ? '`🟢 ON` — Speaking slowly' : '`⚫ OFF` — Normal speed', inline: true },
          { name: '🌐 Active Lang', value: `${activeLang?.flag} ${activeLang?.name}`, inline: true },
          { name: '📡 Session',    value: isActive ? `🟢 Active — ${session!.queue.length} in queue` : '⚫ Inactive', inline: true },
          { name: '📋 Commands', value:
            '`!tts <text>` — Speak in VC\n' +
            '`!ttslang <lang>` — Change language\n' +
            '`!ttsslow` — Toggle slow mode\n' +
            '`!ttslangs` — All languages\n' +
            '`!ttsstop` — Stop & leave VC', inline: false },
        )
        .setFooter(BOT_FOOTER).setTimestamp()
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
        .setDescription('The bot joins your voice channel and **reads your text aloud**.\nPerfect for accessibility — no need to unmute!\n\n**How to start:** Join a VC → `!tts <message>`')
        .addFields(
          { name: '🗣️ Speaking', value:
            '`!tts <text>` — Bot joins VC and speaks your text\n' +
            '`!ttsskip` — Skip the current message\n' +
            '`!ttsstop` / `!ttsleave` — Stop TTS and leave VC\n' +
            '`!ttsclear` — Clear the queue (bot stays in VC)', inline: false },
          { name: '🌐 Languages', value:
            '`!ttslang <language>` — Set YOUR personal TTS language (saved!)\n' +
            '`!ttslangs` — See all 24 supported languages\n' +
            '`!ttsdefault <lang>` — *(Staff)* Set server default language', inline: false },
          { name: '🐢 Slow Mode', value:
            '`!ttsslow` — Toggle slow speech on/off\n' +
            'Slow mode is great for learning, accessibility, or hard words\n' +
            'Your speed preference is saved permanently', inline: false },
          { name: '📊 Status', value:
            '`!ttsqueue` — See queued messages\n' +
            '`!ttsinfo` — Your settings + session status', inline: false },
          { name: '🌍 Language Examples', value:
            '`!ttslang hindi` → 🇮🇳 Hindi\n' +
            '`!ttslang english` → 🇬🇧 English\n' +
            '`!ttslang hi` / `!ttslang en` → short codes work too', inline: false },
          { name: '⚡ Tips', value:
            '• Max **500 characters** per message\n' +
            '• Multiple users can queue TTS at once\n' +
            '• Bot auto-leaves after **30 seconds** of silence\n' +
            '• Your language + speed are saved across sessions', inline: false },
        )
        .setFooter({ text: `24 languages  •  ${BOT_FOOTER.text}` })
        .setTimestamp()
      ] });
    }
  },

];

export default ttsCommands;
