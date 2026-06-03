import { EmbedBuilder, TextChannel } from 'discord.js';
import { BotCommand } from '../client.js';
import { COLORS, BOT_FOOTER } from '../utils/embeds.js';
import { getPlayer } from '../music/MusicManager.js';
import axios from 'axios';

function splitText(text: string, max: number): string[] {
  const chunks: string[] = [];
  const lines = text.split('\n');
  let current = '';
  for (const line of lines) {
    if ((current + '\n' + line).length > max) {
      if (current) chunks.push(current.trim());
      current = line;
    } else {
      current += (current ? '\n' : '') + line;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

async function fetchLyrics(query: string): Promise<{ title: string; artist: string; lyrics: string } | null> {
  // ── Try lrclib.net (best free lyrics API, no auth needed) ─────────────────
  try {
    const res = await axios.get<any[]>(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`, {
      timeout: 8000,
      headers: { 'User-Agent': 'XylaBot/1.0' },
    });
    const hit = res.data?.[0];
    if (hit?.plainLyrics) {
      return { title: hit.trackName, artist: hit.artistName, lyrics: hit.plainLyrics };
    }
  } catch {}

  // ── Fallback: try splitting query as "artist title" ───────────────────────
  try {
    const parts = query.split(' ');
    if (parts.length >= 2) {
      const artist = parts.slice(0, Math.ceil(parts.length / 2)).join(' ');
      const title = parts.slice(Math.ceil(parts.length / 2)).join(' ');
      const res = await axios.get<{ lyrics?: string }>(
        `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`,
        { timeout: 8000 },
      );
      if (res.data?.lyrics) {
        return { title: title, artist: artist, lyrics: res.data.lyrics };
      }
    }
  } catch {}

  return null;
}

const lyricsCommands: BotCommand[] = [
  {
    name: 'lyrics',
    aliases: ['ly', 'lyric'],
    description: 'Get lyrics for the current song or any song you name',
    category: 'Music',
    usage: 'lyrics [song name]',
    async execute(message, args) {
      const player = getPlayer(message.guild!.id, message.client);

      let query: string;
      let songTitle = '';
      if (args.length) {
        query = args.join(' ');
      } else if (player.currentTrack) {
        query = player.currentTrack.title;
        songTitle = player.currentTrack.title;
      } else {
        return message.reply({ embeds: [
          new EmbedBuilder()
            .setColor(COLORS.error)
            .setDescription('❌ Nothing is playing. Provide a song name: `!lyrics Shape of You`')
            .setFooter(BOT_FOOTER),
        ] });
      }

      const loading = await message.reply({ embeds: [
        new EmbedBuilder()
          .setColor(0x1DB954)
          .setDescription(`🔍 Fetching lyrics for **${query}**…`)
          .setFooter(BOT_FOOTER),
      ] });

      const result = await fetchLyrics(query);

      if (!result) {
        return loading.edit({ embeds: [
          new EmbedBuilder()
            .setColor(COLORS.error)
            .setTitle('❌ Lyrics Not Found')
            .setDescription(`Couldn't find lyrics for **${query}**.\n\nTips:\n• Try the exact song title: \`!lyrics Blinding Lights The Weeknd\`\n• Use simpler terms without parentheses`)
            .setFooter(BOT_FOOTER),
        ] });
      }

      const chunks = splitText(result.lyrics, 3900);
      const totalPages = Math.min(chunks.length, 4);

      const makeEmbed = (chunk: string, page: number) =>
        new EmbedBuilder()
          .setColor(0x1DB954)
          .setTitle(`🎵 ${result.title}`)
          .setAuthor({ name: `🎤 ${result.artist}` })
          .setDescription(chunk)
          .setFooter({ text: `Page ${page}/${totalPages} • Powered by lrclib.net | ${BOT_FOOTER.text}` });

      await loading.edit({ embeds: [makeEmbed(chunks[0], 1)] });

      for (let i = 1; i < totalPages; i++) {
        await (message.channel as TextChannel).send({ embeds: [makeEmbed(chunks[i], i + 1)] });
      }
    },
  },
];

export default lyricsCommands;
