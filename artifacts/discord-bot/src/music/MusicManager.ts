import {
  AudioPlayer, AudioPlayerStatus, VoiceConnection, StreamType,
  createAudioPlayer, createAudioResource, joinVoiceChannel,
  getVoiceConnection, AudioResource,
} from '@discordjs/voice';
import { spawn, execSync, exec } from 'child_process';
import { promisify } from 'util';
import type { ChildProcess } from 'child_process';
import play from 'play-dl';
import {
  VoiceBasedChannel, EmbedBuilder, Client, TextBasedChannel,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
} from 'discord.js';
import { COLORS, BOT_FOOTER } from '../utils/embeds.js';
import { getMusicPanel } from '../database.js';
import axios from 'axios';

const execAsync = promisify(exec);

// ── FIND yt-dlp BINARY ────────────────────────────────────────────────────────
let YTDLP_BIN = 'yt-dlp';
const YT_DLP_CANDIDATES = [
  '/home/runner/workspace/.pythonlibs/bin/yt-dlp',
  '/root/.local/bin/yt-dlp',
  '/usr/local/bin/yt-dlp',
  '/usr/bin/yt-dlp',
  process.env.YTDLP_PATH ?? '',
];

for (const candidate of YT_DLP_CANDIDATES) {
  try {
    if (!candidate) continue;
    execSync(`"${candidate}" --version`, { stdio: 'ignore', timeout: 3000 });
    YTDLP_BIN = candidate;
    break;
  } catch {}
}

try {
  const found = execSync('which yt-dlp 2>/dev/null || true', { encoding: 'utf8' }).trim();
  if (found) YTDLP_BIN = found;
} catch {}

console.log(`[Music] Using yt-dlp: ${YTDLP_BIN}`);

// ── TYPES ─────────────────────────────────────────────────────────────────────
export interface Track {
  title: string;
  url: string;
  thumbnail: string;
  duration: number;
  durationStr: string;
  requestedBy: string;
  source: 'youtube' | 'spotify' | 'query';
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
export function fmtDuration(sec: number): string {
  if (!sec || sec <= 0) return '?:??';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function shuffleArr<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── GET DIRECT AUDIO URL via yt-dlp ──────────────────────────────────────────
// FIXED: Uses iOS client first (most reliable in 2025/2026 — bypasses YouTube
// bot-detection). Falls back to android_vr → tv_embedded → default → bestaudio*.
async function getDirectAudioUrl(youtubeUrl: string): Promise<string> {
  // iOS client is currently the most stable — YouTube serves it a clean mp4/m4a
  // stream without bot-detection challenges. android_vr returns webm/opus.
  // tv_embedded and web_creator are secondary fallbacks.
  const attempts = [
    // 1. iOS client — best quality, no bot-detection, clean m4a audio
    `"${YTDLP_BIN}" -g --no-playlist --no-warnings --no-check-certificate --force-ipv4 --extractor-args "youtube:player_client=ios" -f "bestaudio[ext=m4a]/bestaudio" "${youtubeUrl}"`,
    // 2. android_vr — returns seekable webm/opus, very reliable
    `"${YTDLP_BIN}" -g --no-playlist --no-warnings --no-check-certificate --force-ipv4 --extractor-args "youtube:player_client=android_vr" -f "bestaudio" "${youtubeUrl}"`,
    // 3. tv_embedded — embedded TV client, bypasses most restrictions
    `"${YTDLP_BIN}" -g --no-playlist --no-warnings --no-check-certificate --force-ipv4 --extractor-args "youtube:player_client=tv_embedded" -f "bestaudio" "${youtubeUrl}"`,
    // 4. web_creator — another reliable client
    `"${YTDLP_BIN}" -g --no-playlist --no-warnings --no-check-certificate --force-ipv4 --extractor-args "youtube:player_client=web_creator" -f "bestaudio" "${youtubeUrl}"`,
    // 5. Default client, bestaudio fallback
    `"${YTDLP_BIN}" -g --no-playlist --no-warnings --no-check-certificate --force-ipv4 -f "bestaudio" "${youtubeUrl}"`,
    // 6. Last resort: any stream
    `"${YTDLP_BIN}" -g --no-playlist --no-warnings --no-check-certificate --force-ipv4 -f "best" "${youtubeUrl}"`,
  ];
  for (const cmd of attempts) {
    try {
      const { stdout } = await execAsync(cmd, { timeout: 20000 });
      const url = stdout.trim().split('\n')[0];
      if (url && url.startsWith('http')) return url;
    } catch {}
  }
  throw new Error('yt-dlp: all URL extraction attempts failed — YouTube may be rate-limiting. Try again in a moment.');
}

// ── GUILD MUSIC PLAYER ────────────────────────────────────────────────────────
export class GuildMusicPlayer {
  guildId: string;
  textChannelId: string = '';
  queue: Track[] = [];
  currentTrack: Track | null = null;
  audioPlayer: AudioPlayer;
  connection: VoiceConnection | null = null;
  currentResource: AudioResource | null = null;
  private ffmpegProcess: ChildProcess | null = null;
  private ytdlpProcess: ChildProcess | null = null;
  volume: number = 80;
  bassBoost: number = 0;
  nightcore: boolean = false;
  slowed: boolean = false;
  loop: 'off' | 'track' | 'queue' = 'off';
  autoplay: boolean = false;
  is247: boolean = false;
  vc247Id: string = '';
  private inactivityTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private client: Client;
  nowPlayingMessage: any = null;
  previousTracks: Track[] = [];
  isPermanentPanel: boolean = false;

  constructor(guildId: string, client: Client) {
    this.guildId = guildId;
    this.client = client;
    this.audioPlayer = createAudioPlayer();
    this.setupEvents();
  }

  private setupEvents() {
    this.audioPlayer.on(AudioPlayerStatus.Idle, async () => {
      this.currentResource = null;
      this.killFfmpeg();
      await this.advance();
    });
    this.audioPlayer.on('error', async (err) => {
      console.error(`[Music] Player error in ${this.guildId}:`, err.message);
      this.currentResource = null;
      this.killFfmpeg();
      await this.advance();
    });
  }

  private killFfmpeg() {
    if (this.ffmpegProcess) {
      try { this.ffmpegProcess.kill('SIGKILL'); } catch {}
      this.ffmpegProcess = null;
    }
    if (this.ytdlpProcess) {
      try { this.ytdlpProcess.kill('SIGKILL'); } catch {}
      this.ytdlpProcess = null;
    }
  }

  private async advance() {
    if (this.loop === 'track' && this.currentTrack) {
      await this.streamTrack(this.currentTrack);
      return;
    }

    if (this.currentTrack && this.loop !== 'track') {
      this.previousTracks.unshift(this.currentTrack);
      if (this.previousTracks.length > 20) this.previousTracks.pop();
    }

    if (this.loop === 'queue' && this.currentTrack) {
      this.queue.push(this.currentTrack);
    }

    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      this.currentTrack = next;
      await this.streamTrack(next);
      await this.sendNowPlaying(next);
    } else if (this.autoplay && this.currentTrack) {
      await this.doAutoplay();
    } else {
      this.currentTrack = null;
      if (this.nowPlayingMessage) {
        try {
          if (this.isPermanentPanel) {
            await this.nowPlayingMessage.edit({
              embeds: [buildIdleEmbed()],
              components: buildMusicControls(this),
            });
          } else {
            await this.nowPlayingMessage.edit({ components: [] });
          }
        } catch {}
      }
      if (!this.is247) this.startInactivityTimer();
    }
  }

  async playPrevious(): Promise<boolean> {
    if (!this.previousTracks.length) return false;
    const prev = this.previousTracks.shift()!;
    if (this.currentTrack) this.queue.unshift(this.currentTrack);
    this.currentTrack = prev;
    this.killFfmpeg();
    this.audioPlayer.stop(true);
    await this.streamTrack(prev);
    await this.sendNowPlaying(prev);
    return true;
  }

  async updatePanel() {
    if (!this.nowPlayingMessage || !this.currentTrack) return;
    try {
      await this.nowPlayingMessage.edit({
        embeds: [buildNowPlayingEmbed(this.currentTrack, this)],
        components: buildMusicControls(this),
      });
    } catch {}
  }

  private async doAutoplay() {
    try {
      const related = await play.search(
        `${this.currentTrack!.title} official audio`,
        { source: { youtube: 'video' }, limit: 6 },
      );
      const candidates = related.filter(
        r => r.url !== this.currentTrack!.url && (r.durationInSec ?? 0) > 30 && (r.durationInSec ?? 0) < 600,
      );
      const picked = candidates[Math.floor(Math.random() * candidates.length)] ?? candidates[0];
      if (!picked) { this.currentTrack = null; if (!this.is247) this.startInactivityTimer(); return; }

      const track: Track = {
        title: picked.title ?? 'Unknown',
        url: picked.url,
        thumbnail: picked.thumbnails?.[0]?.url ?? '',
        duration: picked.durationInSec ?? 0,
        durationStr: fmtDuration(picked.durationInSec ?? 0),
        requestedBy: 'autoplay',
        source: 'query',
      };
      this.currentTrack = track;
      await this.streamTrack(track);
      await this.sendNowPlaying(track, true);
    } catch {
      this.currentTrack = null;
      if (!this.is247) this.startInactivityTimer();
    }
  }

  // ── CORE STREAM — yt-dlp → ffmpeg → @discordjs/voice ─────────────────────
  async streamTrack(track: Track) {
    this.killFfmpeg();
    this.clearInactivityTimer();

    try {
      await this._doStream(track);
    } catch (err: any) {
      console.error(`[Music] Cannot stream "${track.title}":`, err.message);
      await this.skipSendMsg(`⚠️ Couldn't stream **${track.title}** — skipping to next.`);
      this.currentTrack = this.queue.shift() ?? null;
      if (this.currentTrack) await this.streamTrack(this.currentTrack);
      else if (!this.is247) this.startInactivityTimer();
    }
  }

  // ── BUILD AUDIO FILTER CHAIN ─────────────────────────────────────────────
  private buildAudioFilter(): string {
    const vol = (this.volume / 100).toFixed(3);
    const parts: string[] = [];

    if (this.nightcore) {
      parts.push('asetrate=60000,aresample=48000');
    }

    if (this.slowed && !this.nightcore) {
      parts.push('asetrate=38400,aresample=48000');
      parts.push('aecho=0.8:0.88:60:0.4');
    }

    if (this.bassBoost > 0) {
      const gain = this.bassBoost * 5;
      parts.push(`bass=g=${gain}:f=110:w=0.4`);
    }

    parts.push(`volume=${vol}`);
    parts.push('acompressor=threshold=0.3:ratio=4:attack=5:release=50');
    parts.push('alimiter=level_in=1:level_out=1:limit=0.95:attack=5:release=50:asc=1');

    return parts.join(',');
  }

  setNightcore(enabled: boolean) {
    this.nightcore = enabled;
    if (enabled) this.slowed = false;
    if (this.currentTrack && (this.isPlaying || this.isPaused)) {
      this.restartCurrentTrack().catch(() => {});
    }
  }

  setSlowed(enabled: boolean) {
    this.slowed = enabled;
    if (enabled) this.nightcore = false;
    if (this.currentTrack && (this.isPlaying || this.isPaused)) {
      this.restartCurrentTrack().catch(() => {});
    }
  }

  private async _doStream(track: Track) {
    // ── Strategy 1: yt-dlp iOS client → ffmpeg HTTP stream ───────────────────
    // iOS client bypasses YouTube bot detection in 2025/2026.
    let directUrl: string | null = null;
    try {
      directUrl = await getDirectAudioUrl(track.url);
    } catch (e: any) {
      console.warn(`[Music] yt-dlp URL fetch failed for "${track.title}": ${e.message}`);
    }

    if (directUrl) {
      const ffmpegArgs = [
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5',
        '-reconnect_at_eof', '1',
        '-i', directUrl,
        '-vn',
        '-af', this.buildAudioFilter(),
        '-acodec', 'pcm_s16le',
        '-ar', '48000',
        '-ac', '2',
        '-f', 's16le',
        'pipe:1',
      ];

      const ffmpeg = spawn('ffmpeg', ffmpegArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
      this.ffmpegProcess = ffmpeg;

      ffmpeg.stderr?.on('data', (d: Buffer) => {
        const line = d.toString().trim();
        if (/error|invalid|failed|unable/i.test(line) && !/encoder|deprecated/i.test(line)) {
          console.warn(`[Music][ffmpeg] ${line.slice(0, 200)}`);
        }
      });
      ffmpeg.on('error', (e) => console.warn(`[Music] ffmpeg spawn error: ${e.message}`));

      const resource = createAudioResource(ffmpeg.stdout!, {
        inputType: StreamType.Raw,
        inlineVolume: false,
      });
      this.currentResource = resource;
      this.audioPlayer.play(resource);
      return;
    }

    // ── Strategy 2: play-dl direct stream (fallback) ─────────────────────────
    console.warn(`[Music] Falling back to play-dl for "${track.title}"`);
    const stream = await play.stream(track.url, { discordPlayerCompatibility: true });
    const resource = createAudioResource(stream.stream, {
      inputType: stream.type,
      inlineVolume: true,
    });
    resource.volume?.setVolume(Math.min(this.volume / 100, 2));
    this.currentResource = resource;
    this.audioPlayer.play(resource);
  }

  private async skipSendMsg(msg: string) {
    if (!this.textChannelId) return;
    try {
      const guild = this.client.guilds.cache.get(this.guildId);
      const ch = guild?.channels.cache.get(this.textChannelId) as TextBasedChannel | undefined;
      await ch?.send({ embeds: [new EmbedBuilder().setColor(COLORS.warning).setDescription(msg).setFooter(BOT_FOOTER)] }).catch(() => {});
    } catch {}
  }

  setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(800, vol));
    if (this.currentTrack && (this.isPlaying || this.isPaused)) {
      this.restartCurrentTrack().catch(() => {});
    }
  }

  setBassBoost(level: number) {
    this.bassBoost = Math.max(0, Math.min(5, Math.round(level)));
    if (this.currentTrack && (this.isPlaying || this.isPaused)) {
      this.restartCurrentTrack().catch(() => {});
    }
  }

  async restartCurrentTrack() {
    if (!this.currentTrack) return;
    const track = this.currentTrack;
    this.killFfmpeg();
    this.audioPlayer.stop(true);
    await this.streamTrack(track);
  }

  connect(channel: VoiceBasedChannel) {
    const existing = getVoiceConnection(this.guildId);
    if (existing) existing.destroy();
    const conn = joinVoiceChannel({
      channelId: channel.id,
      guildId: this.guildId,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: true,
    });
    conn.subscribe(this.audioPlayer);

    conn.on('stateChange' as any, (oldState: any, newState: any) => {
      if (newState.status === 'destroyed' && this.is247 && this.vc247Id) {
        this.scheduleReconnect();
      }
    });

    this.connection = conn;
    this.clearInactivityTimer();
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (!this.is247 || !this.vc247Id) return;
      try {
        const guild = this.client.guilds.cache.get(this.guildId);
        const ch = guild?.channels.cache.get(this.vc247Id) as VoiceBasedChannel | undefined;
        if (ch) this.connect(ch);
      } catch {}
    }, 3000);
  }

  disconnect() {
    this.is247 = false;
    this.vc247Id = '';
    this.clearInactivityTimer();
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.killFfmpeg();
    this.audioPlayer.stop(true);
    const existing = getVoiceConnection(this.guildId);
    if (existing) existing.destroy();
    this.connection = null;
    this.currentTrack = null;
    this.queue = [];
    this.currentResource = null;
  }

  shuffleQueue() { this.queue = shuffleArr(this.queue); }
  skip() { this.killFfmpeg(); this.audioPlayer.stop(true); }
  pause() { return this.audioPlayer.pause(); }
  resume() { return this.audioPlayer.unpause(); }

  get isPaused() { return this.audioPlayer.state.status === AudioPlayerStatus.Paused; }
  get isPlaying() { return this.audioPlayer.state.status === AudioPlayerStatus.Playing; }

  private startInactivityTimer() {
    this.clearInactivityTimer();
    this.inactivityTimer = setTimeout(() => {
      this.disconnect();
      this.skipSendMsg('⏹️ Left the voice channel — **5 minutes of inactivity**. Use `!play` to start again.');
    }, 5 * 60 * 1000);
  }

  private clearInactivityTimer() {
    if (this.inactivityTimer) { clearTimeout(this.inactivityTimer); this.inactivityTimer = null; }
  }

  async sendNowPlaying(track: Track, isAutoplay = false) {
    if (!this.textChannelId) return;
    try {
      const guild = this.client.guilds.cache.get(this.guildId);
      const ch = guild?.channels.cache.get(this.textChannelId) as any;
      if (!ch) return;

      const payload = {
        embeds: [buildNowPlayingEmbed(track, this, isAutoplay)],
        components: buildMusicControls(this),
      };

      if (this.nowPlayingMessage) {
        try {
          await this.nowPlayingMessage.edit(payload);
          return;
        } catch {
          this.nowPlayingMessage = null;
        }
      }

      this.nowPlayingMessage = await ch.send(payload).catch(() => null);
    } catch {}
  }
}

export function buildNowPlayingEmbed(track: Track, player: GuildMusicPlayer, isAutoplay = false): EmbedBuilder {
  const loopLabel = player.loop === 'off' ? '`Off`' : player.loop === 'track' ? '`🔂 Track`' : '`🔁 Queue`';
  const sourceLabel = track.source === 'spotify' ? '🟢 Spotify' : '🔴 YouTube';
  const reqBy = track.requestedBy === 'autoplay' ? '🤖 Autoplay' : `<@${track.requestedBy}>`;
  const queueInfo = player.queue.length > 0
    ? `${player.queue.length} track${player.queue.length === 1 ? '' : 's'} in queue`
    : 'Queue is empty';

  const embed = new EmbedBuilder()
    .setColor(0x1DB954)
    .setAuthor({ name: isAutoplay ? '🔮 Autoplay Mode' : '🎵 Now Playing' })
    .setTitle(track.title)
    .setURL(track.url)
    .setDescription(
      `> 🎤 **Source:** ${sourceLabel}\n` +
      `> 👤 **Requested by:** ${reqBy}\n` +
      `> 📋 **${queueInfo}**`
    )
    .addFields(
      { name: '⏱️ Duration', value: `\`${track.durationStr}\``, inline: true },
      { name: '🔊 Volume',   value: `\`${player.volume}%\``,     inline: true },
      { name: '🔁 Loop',     value: loopLabel,                    inline: true },
      { name: '📻 Autoplay', value: player.autoplay ? '`✅ On`' : '`❌ Off`', inline: true },
      { name: '⏮️ History',  value: `\`${player.previousTracks.length} saved\``, inline: true },
      { name: '🎵 Lyrics',   value: '`!lyrics`', inline: true },
    )
    .setFooter({ text: '🎵 Xyla Music  •  Use buttons below or type !help music' });

  if (track.thumbnail) embed.setImage(track.thumbnail);

  return embed;
}

export function buildIdleEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x1DB954)
    .setAuthor({ name: '🎵 Xyla Music — Control Panel' })
    .setTitle('Nothing is Playing')
    .setDescription(
      '> 🔍 Hit **Search** below to find a song to play\n' +
      '> 💬 Or type `!play <song / URL / Spotify link>`\n' +
      '> 🎧 Make sure you join a voice channel first!'
    )
    .setFooter({ text: '🎵 Xyla Music  •  Powered by YouTube & Spotify' })
    .setTimestamp();
}

export function buildMusicControls(player: GuildMusicPlayer): ActionRowBuilder<ButtonBuilder>[] {
  const g = player.guildId;
  const isPaused = player.isPaused;
  const hasTrack = !!player.currentTrack;
  const hasPrev = player.previousTracks.length > 0;

  const loopStyle =
    player.loop === 'off'   ? ButtonStyle.Secondary :
    player.loop === 'track' ? ButtonStyle.Success    : ButtonStyle.Primary;
  const loopLabel =
    player.loop === 'off'   ? 'Loop Off' :
    player.loop === 'track' ? '🔂 Track'  : '🔁 Queue';

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`music_prev_${g}`).setEmoji('⏮️').setStyle(ButtonStyle.Secondary).setLabel('Prev').setDisabled(!hasPrev),
    new ButtonBuilder().setCustomId(`music_pause_${g}`).setEmoji(isPaused ? '▶️' : '⏸️').setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Primary).setLabel(isPaused ? 'Resume' : 'Pause').setDisabled(!hasTrack),
    new ButtonBuilder().setCustomId(`music_skip_${g}`).setEmoji('⏭️').setStyle(ButtonStyle.Primary).setLabel('Skip').setDisabled(!hasTrack),
    new ButtonBuilder().setCustomId(`music_stop_${g}`).setEmoji('🛑').setStyle(ButtonStyle.Danger).setLabel('Stop').setDisabled(!hasTrack),
    new ButtonBuilder().setCustomId(`music_loop_${g}`).setEmoji('🔁').setStyle(loopStyle).setLabel(loopLabel),
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`music_shuffle_${g}`).setEmoji('🔀').setStyle(ButtonStyle.Secondary).setLabel('Shuffle').setDisabled(!hasTrack),
    new ButtonBuilder().setCustomId(`music_like_${g}`).setEmoji('❤️').setStyle(ButtonStyle.Secondary).setLabel('Like').setDisabled(!hasTrack),
    new ButtonBuilder().setCustomId(`music_queue_${g}`).setEmoji('📋').setStyle(ButtonStyle.Secondary).setLabel('Queue'),
    new ButtonBuilder().setCustomId(`music_autoplay_${g}`).setEmoji('📻').setStyle(player.autoplay ? ButtonStyle.Success : ButtonStyle.Secondary).setLabel(player.autoplay ? 'Auto On' : 'Autoplay'),
    new ButtonBuilder().setCustomId(`music_lyrics_${g}`).setEmoji('🎵').setStyle(ButtonStyle.Secondary).setLabel('Lyrics').setDisabled(!hasTrack),
  );

  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`music_search_${g}`).setEmoji('🔍').setStyle(ButtonStyle.Primary).setLabel('Search Music'),
    new ButtonBuilder().setCustomId(`music_247_${g}`).setEmoji('🕐').setStyle(player.is247 ? ButtonStyle.Success : ButtonStyle.Secondary).setLabel(player.is247 ? '24/7 On' : '24/7 Mode'),
  );

  return [row1, row2, row3];
}

// ── GLOBAL PLAYER MAP ─────────────────────────────────────────────────────────
const players = new Map<string, GuildMusicPlayer>();

export function getPlayer(guildId: string, client: Client): GuildMusicPlayer {
  if (!players.has(guildId)) {
    const player = new GuildMusicPlayer(guildId, client);
    players.set(guildId, player);

    setTimeout(async () => {
      try {
        const panel = getMusicPanel(guildId);
        if (!panel) return;
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return;
        const ch = guild.channels.cache.get(panel.channel_id) as any;
        if (!ch) return;
        const msg = await ch.messages.fetch(panel.message_id).catch(() => null);
        if (!msg) return;
        player.nowPlayingMessage = msg;
        player.isPermanentPanel = true;
        await msg.edit({
          embeds: [buildIdleEmbed()],
          components: buildMusicControls(player),
        }).catch(() => {});
      } catch {}
    }, 3000);
  }
  return players.get(guildId)!;
}

export function deletePlayer(guildId: string) {
  const p = players.get(guildId);
  if (p) { p.disconnect(); players.delete(guildId); }
}

// ── TRACK RESOLUTION ─────────────────────────────────────────────────────────
const YT_URL_RE = /https?:\/\/(www\.)?(youtube\.com\/watch|youtu\.be\/|youtube\.com\/shorts\/)/;
const SP_TRACK_RE = /https?:\/\/open\.spotify\.com\/track\/([A-Za-z0-9]+)/;
const SP_PLAYLIST_RE = /https?:\/\/open\.spotify\.com\/playlist\/([A-Za-z0-9]+)/;
const SP_ALBUM_RE = /https?:\/\/open\.spotify\.com\/album\/([A-Za-z0-9]+)/;

export async function resolveQuery(rawQuery: string, requestedBy: string): Promise<Track[]> {
  const query = rawQuery.trim();

  if (YT_URL_RE.test(query)) {
    try {
      const info = await play.video_info(query);
      const v = info.video_details;
      return [{
        title: v.title ?? 'Unknown',
        url: v.url,
        thumbnail: v.thumbnails?.[0]?.url ?? '',
        duration: v.durationInSec ?? 0,
        durationStr: fmtDuration(v.durationInSec ?? 0),
        requestedBy,
        source: 'youtube',
      }];
    } catch (err: any) {
      throw new Error(`Cannot load that YouTube video: ${err.message}`);
    }
  }

  if (SP_TRACK_RE.test(query)) {
    const match = SP_TRACK_RE.exec(query)!;
    const spTrack = await fetchSpotifyTrack(match[1]);
    const bestYt = await bestYouTubeMatch(
      spTrack?.name ?? await getSpotifyOembed(query),
      spTrack?.artist ?? '',
      spTrack?.duration ?? 0,
    );
    if (!bestYt) throw new Error('Could not find this Spotify track on YouTube.');
    return [{
      title: spTrack?.name ?? bestYt.title ?? 'Unknown',
      url: bestYt.url,
      thumbnail: spTrack?.thumbnail ?? bestYt.thumbnails?.[0]?.url ?? '',
      duration: spTrack?.duration ?? bestYt.durationInSec ?? 0,
      durationStr: fmtDuration(spTrack?.duration ?? bestYt.durationInSec ?? 0),
      requestedBy,
      source: 'spotify',
    }];
  }

  if (SP_PLAYLIST_RE.test(query)) {
    const match = SP_PLAYLIST_RE.exec(query)!;
    const tracks = await fetchSpotifyPlaylistTracks(match[1], requestedBy);
    if (!tracks.length) throw new Error('Could not load any tracks from this Spotify playlist.');
    return tracks;
  }

  if (SP_ALBUM_RE.test(query)) {
    const match = SP_ALBUM_RE.exec(query)!;
    const tracks = await fetchSpotifyAlbumTracks(match[1], requestedBy);
    if (!tracks.length) throw new Error('Could not load any tracks from this Spotify album.');
    return tracks;
  }

  const results = await play.search(query, { source: { youtube: 'video' }, limit: 1 });
  if (!results.length) throw new Error(`No results found for: **${query}**`);
  const v = results[0];
  return [{
    title: v.title ?? 'Unknown',
    url: v.url,
    thumbnail: v.thumbnails?.[0]?.url ?? '',
    duration: v.durationInSec ?? 0,
    durationStr: fmtDuration(v.durationInSec ?? 0),
    requestedBy,
    source: 'query',
  }];
}

// ── SPOTIFY API ───────────────────────────────────────────────────────────────
let _spotifyToken: string | null = null;
let _spotifyTokenExpiry = 0;

async function getSpotifyToken(): Promise<string | null> {
  const cid = process.env.SPOTIFY_CLIENT_ID;
  const csec = process.env.SPOTIFY_CLIENT_SECRET;
  if (!cid || !csec) return null;
  if (_spotifyToken && Date.now() < _spotifyTokenExpiry) return _spotifyToken;
  try {
    const creds = Buffer.from(`${cid}:${csec}`).toString('base64');
    const res = await axios.post<{ access_token: string; expires_in: number }>(
      'https://accounts.spotify.com/api/token',
      'grant_type=client_credentials',
      { headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 8000 },
    );
    _spotifyToken = res.data.access_token;
    _spotifyTokenExpiry = Date.now() + (res.data.expires_in - 60) * 1000;
    return _spotifyToken;
  } catch (e: any) {
    console.error('[Music] Spotify token error:', e.message);
    return null;
  }
}

interface SpTrack { name: string; artist: string; duration: number; thumbnail: string }

async function fetchSpotifyTrack(id: string): Promise<SpTrack | null> {
  const token = await getSpotifyToken();
  if (!token) return null;
  try {
    const res = await axios.get<any>(`https://api.spotify.com/v1/tracks/${id}`,
      { headers: { Authorization: `Bearer ${token}` }, timeout: 8000 });
    return {
      name: res.data.name,
      artist: res.data.artists?.map((a: any) => a.name).join(', ') ?? '',
      duration: Math.floor(res.data.duration_ms / 1000),
      thumbnail: res.data.album?.images?.[0]?.url ?? '',
    };
  } catch { return null; }
}

async function fetchSpotifyPlaylistTracks(playlistId: string, requestedBy: string): Promise<Track[]> {
  const token = await getSpotifyToken();
  if (!token) {
    throw new Error(
      '❌ Spotify API credentials are not set up.\n\n' +
      'To enable Spotify playlists, set `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` as bot environment variables.',
    );
  }

  const spTracks: SpTrack[] = [];
  let url: string | null = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50&fields=items(track(name,artists(name),duration_ms,album(images))),next`;

  while (url && spTracks.length < 100) {
    const res = await axios.get<any>(url, { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 });
    for (const item of res.data.items ?? []) {
      if (!item?.track?.name) continue;
      spTracks.push({
        name: item.track.name,
        artist: item.track.artists?.map((a: any) => a.name).join(', ') ?? '',
        duration: Math.floor((item.track.duration_ms ?? 0) / 1000),
        thumbnail: item.track.album?.images?.[0]?.url ?? '',
      });
    }
    url = res.data.next ?? null;
  }

  return resolveSpTracksToYT(spTracks, requestedBy);
}

async function fetchSpotifyAlbumTracks(albumId: string, requestedBy: string): Promise<Track[]> {
  const token = await getSpotifyToken();
  if (!token) throw new Error('Spotify API credentials not set up.');

  const spTracks: SpTrack[] = [];
  let url: string | null = `https://api.spotify.com/v1/albums/${albumId}/tracks?limit=50`;
  const albumRes = await axios.get<any>(`https://api.spotify.com/v1/albums/${albumId}`,
    { headers: { Authorization: `Bearer ${token}` }, timeout: 8000 });
  const albumThumb = albumRes.data?.images?.[0]?.url ?? '';

  while (url && spTracks.length < 50) {
    const res = await axios.get<any>(url, { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 });
    for (const item of res.data.items ?? []) {
      if (!item?.name) continue;
      spTracks.push({
        name: item.name,
        artist: item.artists?.map((a: any) => a.name).join(', ') ?? '',
        duration: Math.floor((item.duration_ms ?? 0) / 1000),
        thumbnail: albumThumb,
      });
    }
    url = res.data.next ?? null;
  }

  return resolveSpTracksToYT(spTracks, requestedBy);
}

async function resolveSpTracksToYT(spTracks: SpTrack[], requestedBy: string): Promise<Track[]> {
  const tracks: Track[] = [];
  const batchSize = 5;

  for (let i = 0; i < spTracks.length; i += batchSize) {
    const batch = spTracks.slice(i, i + batchSize);
    await Promise.allSettled(batch.map(async (sp) => {
      const yt = await bestYouTubeMatch(sp.name, sp.artist, sp.duration);
      if (!yt) return;
      tracks.push({
        title: sp.name,
        url: yt.url,
        thumbnail: sp.thumbnail || yt.thumbnails?.[0]?.url || '',
        duration: sp.duration || yt.durationInSec || 0,
        durationStr: fmtDuration(sp.duration || yt.durationInSec || 0),
        requestedBy,
        source: 'spotify',
      });
    }));
  }

  return tracks;
}

async function bestYouTubeMatch(name: string, artist: string, durationSec: number): Promise<any | null> {
  const queries = [
    artist ? `${name} ${artist} official audio` : `${name} official audio`,
    artist ? `${name} ${artist}` : name,
    name,
  ];

  for (const q of queries) {
    try {
      const results = await play.search(q, { source: { youtube: 'video' }, limit: 5 });
      if (!results.length) continue;

      if (durationSec > 0) {
        const close = results.find(r => Math.abs((r.durationInSec ?? 0) - durationSec) < 10);
        if (close) return close;
      }

      const filtered = results.filter(r => (r.durationInSec ?? 0) > 60);
      return filtered[0] ?? results[0];
    } catch {}
  }
  return null;
}

async function getSpotifyOembed(url: string): Promise<string> {
  try {
    const res = await axios.get(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`, { timeout: 5000 });
    return res.data?.title ?? '';
  } catch { return ''; }
}
