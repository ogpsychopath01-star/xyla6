import { EmbedBuilder, GuildMember, TextChannel } from 'discord.js';
import { BotCommand } from '../client.js';
import { COLORS, BOT_FOOTER } from '../utils/embeds.js';
import {
  getPlayer, deletePlayer, resolveQuery, buildNowPlayingEmbed, buildMusicControls,
  buildIdleEmbed, fmtDuration, Track,
} from '../music/MusicManager.js';
import { setMusicPanel, deleteMusicPanel } from '../database.js';
import {
  getLikedSongs, addLikedSong, removeLikedSong, isLikedSong,
  getUserPlaylists, getPlaylist, createPlaylist, deletePlaylist,
  addToPlaylist, removeFromPlaylist, getPlaylistSong,
} from '../database.js';

// ── HELPERS ───────────────────────────────────────────────────────────────────
function err(msg: string) {
  return new EmbedBuilder().setColor(COLORS.error).setDescription(`❌ ${msg}`).setFooter(BOT_FOOTER);
}
function ok(msg: string) {
  return new EmbedBuilder().setColor(0x1DB954).setDescription(`✅ ${msg}`).setFooter(BOT_FOOTER);
}
function info(msg: string) {
  return new EmbedBuilder().setColor(COLORS.info).setDescription(`ℹ️ ${msg}`).setFooter(BOT_FOOTER);
}

function requireVC(member: GuildMember | null) {
  return member?.voice.channel ?? null;
}

// ── MUSIC COMMANDS ────────────────────────────────────────────────────────────
const musicCommands: BotCommand[] = [

  // ── PLAY ──────────────────────────────────────────────────────────────────
  {
    name: 'play',
    aliases: ['p'],
    description: 'Play a song — search query, YouTube URL, or Spotify track link',
    category: 'Music',
    usage: 'play <song name | YouTube URL | Spotify link>',
    async execute(message, args) {
      const vc = requireVC(message.member);
      if (!vc) return message.reply({ embeds: [err('You must be in a voice channel.')] });
      if (!args.length) return message.reply({ embeds: [err('Provide a song name, YouTube URL, or Spotify link.\nExample: `!play Believer`')] });

      const query = args.join(' ');
      const loading = await message.reply({ embeds: [new EmbedBuilder().setColor(0x1DB954).setDescription(`🔍 Searching for **${query}**…`).setFooter(BOT_FOOTER)] });

      try {
        const tracks = await resolveQuery(query, message.author.id);
        const player = getPlayer(message.guild!.id, message.client);
        player.textChannelId = message.channel.id;

        // Connect to VC if not already in one (or in a different one)
        const botVC = message.guild!.members.me?.voice.channel;
        if (!botVC || botVC.id !== vc.id) {
          player.connect(vc);
        }

        if (tracks.length === 1) {
          const track = tracks[0];
          if (!player.currentTrack) {
            player.currentTrack = track;
            await player.streamTrack(track);
            if (player.isPermanentPanel && player.nowPlayingMessage) {
              // Update the permanent panel and show a brief ack on the loading message
              await player.sendNowPlaying(track);
              await loading.edit({ embeds: [ok(`▶️ Now playing **${track.title}**`)] });
            } else {
              // Turn loading message into the now-playing panel
              player.nowPlayingMessage = loading;
              await loading.edit({
                embeds: [buildNowPlayingEmbed(track, player)],
                components: buildMusicControls(player),
              });
            }
          } else {
            player.queue.push(track);
            const pos = player.queue.length;
            await loading.edit({ embeds: [new EmbedBuilder()
              .setColor(0x1DB954)
              .setTitle('➕ Added to Queue')
              .setDescription(`**[${track.title}](${track.url})**`)
              .addFields(
                { name: '⏱️ Duration', value: track.durationStr, inline: true },
                { name: '📍 Position', value: `#${pos}`, inline: true },
              )
              .setImage(track.thumbnail)
              .setFooter(BOT_FOOTER)
            ] });
          }
        } else {
          // Playlist / multiple tracks
          for (const t of tracks) player.queue.push(t);
          if (!player.currentTrack) {
            const first = player.queue.shift()!;
            player.currentTrack = first;
            await player.streamTrack(first);
            if (player.isPermanentPanel && player.nowPlayingMessage) {
              await player.sendNowPlaying(first);
              await loading.edit({ embeds: [ok(`▶️ Playing **${first.title}** + **${tracks.length - 1}** more queued.`)] });
            } else {
              player.nowPlayingMessage = loading;
              await loading.edit({
                embeds: [buildNowPlayingEmbed(first, player)],
                components: buildMusicControls(player),
              });
            }
          } else {
            await loading.edit({ embeds: [ok(`Added **${tracks.length}** tracks to the queue.`)] });
          }
        }
      } catch (e: any) {
        await loading.edit({ embeds: [err(e.message ?? 'Failed to load track.')] });
      }
    },
  },

  // ── SKIP ──────────────────────────────────────────────────────────────────
  {
    name: 'skip',
    aliases: ['s', 'fs'],
    description: 'Skip the current song',
    category: 'Music',
    usage: 'skip',
    async execute(message) {
      const player = getPlayer(message.guild!.id, message.client);
      if (!player.currentTrack) return message.reply({ embeds: [err('Nothing is playing right now.')] });
      const skipped = player.currentTrack.title;
      player.skip();
      await message.reply({ embeds: [ok(`Skipped **${skipped}**`)] });
    },
  },

  // ── PAUSE ─────────────────────────────────────────────────────────────────
  {
    name: 'pause',
    description: 'Pause playback',
    category: 'Music',
    usage: 'pause',
    async execute(message) {
      const player = getPlayer(message.guild!.id, message.client);
      if (!player.currentTrack) return message.reply({ embeds: [err('Nothing is playing.')] });
      if (player.isPaused) return message.reply({ embeds: [info('Already paused. Use `!resume` to continue.')] });
      player.pause();
      await message.reply({ embeds: [ok('⏸️ Paused.')] });
    },
  },

  // ── RESUME ────────────────────────────────────────────────────────────────
  {
    name: 'resume',
    aliases: ['unpause'],
    description: 'Resume paused playback',
    category: 'Music',
    usage: 'resume',
    async execute(message) {
      const player = getPlayer(message.guild!.id, message.client);
      if (!player.currentTrack) return message.reply({ embeds: [err('Nothing is playing.')] });
      if (!player.isPaused) return message.reply({ embeds: [info('Not paused.')] });
      player.resume();
      await message.reply({ embeds: [ok('▶️ Resumed.')] });
    },
  },

  // ── STOP ──────────────────────────────────────────────────────────────────
  {
    name: 'stop',
    aliases: ['leave', 'dc'],
    description: 'Stop music and disconnect from voice channel',
    category: 'Music',
    usage: 'stop',
    async execute(message) {
      const player = getPlayer(message.guild!.id, message.client);
      if (!player.connection && !player.currentTrack) return message.reply({ embeds: [err('Not in a voice channel.')] });
      deletePlayer(message.guild!.id);
      await message.reply({ embeds: [ok('⏹️ Stopped and left the voice channel.')] });
    },
  },

  // ── NOW PLAYING ───────────────────────────────────────────────────────────
  {
    name: 'nowplaying',
    aliases: ['np', 'current'],
    description: 'Show the currently playing song',
    category: 'Music',
    usage: 'nowplaying',
    async execute(message) {
      const player = getPlayer(message.guild!.id, message.client);
      if (!player.currentTrack) return message.reply({ embeds: [info('Nothing is playing right now.')] });
      await message.reply({ embeds: [buildNowPlayingEmbed(player.currentTrack, player)] });
    },
  },

  // ── QUEUE ─────────────────────────────────────────────────────────────────
  {
    name: 'queue',
    aliases: ['q'],
    description: 'View the current music queue',
    category: 'Music',
    usage: 'queue',
    async execute(message) {
      const player = getPlayer(message.guild!.id, message.client);
      if (!player.currentTrack && !player.queue.length)
        return message.reply({ embeds: [info('The queue is empty.')] });

      const lines: string[] = [];
      if (player.currentTrack) {
        lines.push(`**🎵 Now Playing:**\n▶ [${player.currentTrack.title}](${player.currentTrack.url}) \`${player.currentTrack.durationStr}\``);
      }
      if (player.queue.length) {
        lines.push('\n**📋 Up Next:**');
        const show = player.queue.slice(0, 15);
        show.forEach((t, i) => {
          lines.push(`\`${i + 1}.\` [${t.title}](${t.url}) \`${t.durationStr}\``);
        });
        if (player.queue.length > 15) lines.push(`\n*...and ${player.queue.length - 15} more*`);

        const totalSecs = player.queue.reduce((a, t) => a + t.duration, 0);
        lines.push(`\n⏳ Total queue time: **${fmtDuration(totalSecs)}**`);
      }

      await message.reply({ embeds: [new EmbedBuilder()
        .setColor(0x1DB954)
        .setTitle(`📋 Music Queue — ${player.queue.length} track${player.queue.length !== 1 ? 's' : ''} queued`)
        .setDescription(lines.join('\n').slice(0, 4000))
        .addFields(
          { name: '🔁 Loop', value: player.loop === 'off' ? 'Off' : player.loop === 'track' ? '🔂 Track' : '🔁 Queue', inline: true },
          { name: '📻 Autoplay', value: player.autoplay ? '✅ On' : '❌ Off', inline: true },
          { name: '🔊 Volume', value: `${player.volume}%`, inline: true },
        )
        .setFooter(BOT_FOOTER)
      ] });
    },
  },

  // ── VOLUME ────────────────────────────────────────────────────────────────
  {
    name: 'volume',
    aliases: ['vol'],
    description: 'Set the volume (0–800%)',
    category: 'Music',
    usage: 'volume <0-800>',
    async execute(message, args) {
      const player = getPlayer(message.guild!.id, message.client);
      if (!args[0]) {
        const cur = player.volume;
        const curFilled = Math.floor((cur / 800) * 10);
        const curBar = '█'.repeat(curFilled) + '░'.repeat(10 - curFilled);
        return message.reply({ embeds: [info(`Current volume: **${cur}%**\n\`[${curBar}]\`\nUsage: \`!volume <0-800>\` • 100% = normal • 800% = 💥 MAX BOOM`)] });
      }
      const vol = parseInt(args[0]);
      if (isNaN(vol) || vol < 0 || vol > 800)
        return message.reply({ embeds: [err('Volume must be a number between **0** and **800**.\n`100` = normal • `400` = 4x • `800` = 💥 MAX BOOM')] });
      player.setVolume(vol);
      const filled = Math.floor((vol / 800) * 10);
      const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
      const label = vol === 0 ? ' 🔇' : vol <= 100 ? '' : vol <= 200 ? ' 🔥' : vol <= 400 ? ' 🔥🔥' : vol <= 600 ? ' 🔥🔥🔥' : ' 💥💥💥';
      const desc = vol === 0 ? '*Muted*' : vol < 100 ? '*Quiet*' : vol === 100 ? '*Normal volume*' : `*${(vol / 100).toFixed(1)}x boost*${vol >= 600 ? ' — 💥 VC BOOMED' : ''}`;
      await message.reply({ embeds: [new EmbedBuilder()
        .setColor(vol >= 600 ? 0xFF0000 : vol >= 300 ? 0xFF6600 : 0x1DB954)
        .setTitle('🔊 Volume Updated')
        .setDescription(`\`[${bar}]\` **${vol}%**${label}\n${desc}`)
        .setFooter(BOT_FOOTER)
      ] });
    },
  },

  // ── LOOP ──────────────────────────────────────────────────────────────────
  {
    name: 'loop',
    aliases: ['repeat'],
    description: 'Toggle loop mode: off → track → queue → off',
    category: 'Music',
    usage: 'loop [off|track|queue]',
    async execute(message, args) {
      const player = getPlayer(message.guild!.id, message.client);
      const modes: Array<'off' | 'track' | 'queue'> = ['off', 'track', 'queue'];
      if (args[0] && modes.includes(args[0] as any)) {
        player.loop = args[0] as any;
      } else {
        const idx = modes.indexOf(player.loop);
        player.loop = modes[(idx + 1) % modes.length];
      }
      const labels: Record<string, string> = { off: '❌ Off', track: '🔂 Track (repeat current song)', queue: '🔁 Queue (repeat all songs)' };
      await message.reply({ embeds: [ok(`Loop mode set to **${labels[player.loop]}**`)] });
    },
  },

  // ── SHUFFLE ───────────────────────────────────────────────────────────────
  {
    name: 'shuffle',
    description: 'Shuffle the queue',
    category: 'Music',
    usage: 'shuffle',
    async execute(message) {
      const player = getPlayer(message.guild!.id, message.client);
      if (!player.queue.length) return message.reply({ embeds: [err('The queue is empty — nothing to shuffle.')] });
      player.shuffleQueue();
      await message.reply({ embeds: [ok(`🔀 Shuffled **${player.queue.length}** tracks in the queue.`)] });
    },
  },

  // ── AUTOPLAY ─────────────────────────────────────────────────────────────
  {
    name: 'autoplay',
    aliases: ['ap'],
    description: 'Toggle autoplay — automatically plays related songs when the queue is empty',
    category: 'Music',
    usage: 'autoplay',
    async execute(message) {
      const player = getPlayer(message.guild!.id, message.client);
      player.autoplay = !player.autoplay;
      await message.reply({ embeds: [ok(`📻 Autoplay is now **${player.autoplay ? '✅ ON' : '❌ OFF'}**`)] });
    },
  },

  // ── REMOVE ────────────────────────────────────────────────────────────────
  {
    name: 'remove',
    aliases: ['rm'],
    description: 'Remove a song from the queue by position',
    category: 'Music',
    usage: 'remove <position>',
    async execute(message, args) {
      const player = getPlayer(message.guild!.id, message.client);
      const pos = parseInt(args[0]);
      if (isNaN(pos) || pos < 1 || pos > player.queue.length)
        return message.reply({ embeds: [err(`Invalid position. Queue has **${player.queue.length}** tracks.`)] });
      const removed = player.queue.splice(pos - 1, 1)[0];
      await message.reply({ embeds: [ok(`Removed **${removed.title}** from the queue.`)] });
    },
  },

  // ── CLEAR QUEUE ───────────────────────────────────────────────────────────
  {
    name: 'clearqueue',
    aliases: ['cq', 'clear'],
    description: 'Clear all songs from the queue',
    category: 'Music',
    usage: 'clearqueue',
    async execute(message) {
      const player = getPlayer(message.guild!.id, message.client);
      const count = player.queue.length;
      player.queue = [];
      await message.reply({ embeds: [ok(`🗑️ Cleared **${count}** track${count !== 1 ? 's' : ''} from the queue.`)] });
    },
  },

  // ── MOVE TO FRONT ─────────────────────────────────────────────────────────
  {
    name: 'skipto',
    aliases: ['jumpto'],
    description: 'Jump to a specific position in the queue',
    category: 'Music',
    usage: 'skipto <position>',
    async execute(message, args) {
      const player = getPlayer(message.guild!.id, message.client);
      const pos = parseInt(args[0]);
      if (isNaN(pos) || pos < 1 || pos > player.queue.length)
        return message.reply({ embeds: [err(`Invalid position. Queue has **${player.queue.length}** tracks.`)] });
      player.queue.splice(0, pos - 1);
      player.skip();
      await message.reply({ embeds: [ok(`⏭️ Jumped to position **${pos}**: **${player.queue[0]?.title ?? '—'}**`)] });
    },
  },

  // ── SEARCH ────────────────────────────────────────────────────────────────
  {
    name: 'search',
    description: 'Search YouTube and pick a result to play',
    category: 'Music',
    usage: 'search <query>',
    async execute(message, args) {
      const vc = requireVC(message.member);
      if (!vc) return message.reply({ embeds: [err('You must be in a voice channel.')] });
      if (!args.length) return message.reply({ embeds: [err('Provide a search query.')] });

      const loading = await message.reply({ embeds: [new EmbedBuilder().setColor(0x1DB954).setDescription(`🔍 Searching for **${args.join(' ')}**…`).setFooter(BOT_FOOTER)] });
      try {
        const results = await (await import('play-dl')).default.search(args.join(' '), { source: { youtube: 'video' }, limit: 5 });
        if (!results.length) return loading.edit({ embeds: [err('No results found.')] });

        const lines = results.map((v, i) =>
          `\`${i + 1}.\` **[${v.title}](${v.url})** \`${fmtDuration(v.durationInSec ?? 0)}\``
        ).join('\n');

        await loading.edit({ embeds: [new EmbedBuilder()
          .setColor(0x1DB954)
          .setTitle(`🔍 Search Results for: ${args.join(' ')}`)
          .setDescription(`${lines}\n\nType a number (1–${results.length}) to play, or \`cancel\` to abort.`)
          .setFooter(BOT_FOOTER)
        ] });

        const filter = (m: any) => m.author.id === message.author.id &&
          (m.content === 'cancel' || (parseInt(m.content) >= 1 && parseInt(m.content) <= results.length));

        const collected = await (message.channel as TextChannel).awaitMessages({ filter, max: 1, time: 30_000 });
        const resp = collected.first();
        if (!resp || resp.content === 'cancel') {
          await loading.edit({ embeds: [info('Search cancelled.')] });
          return;
        }

        const pick = results[parseInt(resp.content) - 1];
        resp.delete().catch(() => {});

        const track = {
          title: pick.title ?? 'Unknown',
          url: pick.url,
          thumbnail: pick.thumbnails?.[0]?.url ?? '',
          duration: pick.durationInSec ?? 0,
          durationStr: fmtDuration(pick.durationInSec ?? 0),
          requestedBy: message.author.id,
          source: 'youtube' as const,
        };

        const player = getPlayer(message.guild!.id, message.client);
        player.textChannelId = message.channel.id;
        const botVC = message.guild!.members.me?.voice.channel;
        if (!botVC || botVC.id !== vc.id) player.connect(vc);

        if (!player.currentTrack) {
          player.currentTrack = track;
          await player.streamTrack(track);
          await loading.edit({ embeds: [buildNowPlayingEmbed(track, player)] });
        } else {
          player.queue.push(track);
          await loading.edit({ embeds: [ok(`Added **${track.title}** to queue at position **#${player.queue.length}**`)] });
        }
      } catch (e: any) {
        await loading.edit({ embeds: [err(e.message ?? 'Search failed.')] });
      }
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // ── LIKED SONGS ───────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────

  {
    name: 'like',
    aliases: ['fav', 'favourite'],
    description: 'Like the current song — adds it to your Liked Songs playlist',
    category: 'Music',
    usage: 'like',
    async execute(message) {
      const player = getPlayer(message.guild!.id, message.client);
      if (!player.currentTrack) return message.reply({ embeds: [err('Nothing is playing to like.')] });
      const track = player.currentTrack;
      if (isLikedSong(message.author.id, track.url)) {
        return message.reply({ embeds: [info(`**${track.title}** is already in your Liked Songs. Use \`!unlike\` to remove it.`)] });
      }
      addLikedSong(message.author.id, {
        title: track.title, url: track.url, duration: track.duration,
        durationStr: track.durationStr, thumbnail: track.thumbnail, liked_at: Date.now(),
      });
      await message.reply({ embeds: [new EmbedBuilder()
        .setColor(0x1DB954)
        .setTitle('❤️ Added to Liked Songs')
        .setDescription(`**${track.title}** has been added to your Liked Songs!`)
        .setFooter(BOT_FOOTER)
      ] });
    },
  },

  {
    name: 'unlike',
    aliases: ['unfav'],
    description: 'Remove the current song from your Liked Songs',
    category: 'Music',
    usage: 'unlike',
    async execute(message) {
      const player = getPlayer(message.guild!.id, message.client);
      if (!player.currentTrack) return message.reply({ embeds: [err('Nothing is playing.')] });
      const track = player.currentTrack;
      if (!isLikedSong(message.author.id, track.url))
        return message.reply({ embeds: [info(`**${track.title}** is not in your Liked Songs.`)] });
      removeLikedSong(message.author.id, track.url);
      await message.reply({ embeds: [ok(`💔 Removed **${track.title}** from your Liked Songs.`)] });
    },
  },

  {
    name: 'liked',
    aliases: ['favorites', 'likedsongs'],
    description: 'Play your Liked Songs',
    category: 'Music',
    usage: 'liked',
    async execute(message) {
      const vc = requireVC(message.member);
      if (!vc) return message.reply({ embeds: [err('You must be in a voice channel.')] });
      const songs = getLikedSongs(message.author.id);
      if (!songs.length) return message.reply({ embeds: [info('Your Liked Songs playlist is empty. Use `!like` while a song is playing to add songs.')] });

      const player = getPlayer(message.guild!.id, message.client);
      player.textChannelId = message.channel.id;
      const botVC = message.guild!.members.me?.voice.channel;
      if (!botVC || botVC.id !== vc.id) player.connect(vc);

      const tracks: Track[] = songs.map(s => ({
        title: s.title, url: s.url, thumbnail: s.thumbnail,
        duration: s.duration, durationStr: s.durationStr,
        requestedBy: message.author.id, source: 'query' as const,
      }));

      // Shuffle liked songs for variety
      const shuffled = [...tracks].sort(() => Math.random() - 0.5);
      for (const t of shuffled) player.queue.push(t);

      if (!player.currentTrack) {
        const first = player.queue.shift()!;
        player.currentTrack = first;
        await player.streamTrack(first);
        await message.reply({ embeds: [new EmbedBuilder()
          .setColor(0x1DB954)
          .setTitle('❤️ Playing Liked Songs')
          .setDescription(`Added **${shuffled.length}** liked songs to the queue (shuffled).`)
          .setFooter(BOT_FOOTER)
        ] });
      } else {
        await message.reply({ embeds: [ok(`Added **${shuffled.length}** liked songs to the queue.`)] });
      }
    },
  },

  {
    name: 'likedlist',
    aliases: ['myliked'],
    description: 'View all your Liked Songs',
    category: 'Music',
    usage: 'likedlist',
    async execute(message) {
      const songs = getLikedSongs(message.author.id);
      if (!songs.length) return message.reply({ embeds: [info('Your Liked Songs playlist is empty. Use `!like` while a song plays.')] });
      const lines = songs.slice(0, 20).map((s, i) => `\`${i + 1}.\` **${s.title}** \`${s.durationStr}\``).join('\n');
      await message.reply({ embeds: [new EmbedBuilder()
        .setColor(0x1DB954)
        .setTitle(`❤️ Your Liked Songs — ${songs.length} total`)
        .setDescription(`${lines}${songs.length > 20 ? `\n\n*...and ${songs.length - 20} more*` : ''}`)
        .setFooter(BOT_FOOTER)
      ] });
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // ── PLAYLISTS ─────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────

  {
    name: 'playlist',
    aliases: ['pl'],
    description: 'Manage personal playlists — create, add, play, list, view, delete',
    category: 'Music',
    usage: 'playlist <create|add|play|list|view|delete|remove|shuffle> [name] [query]',
    async execute(message, args) {
      const sub = args[0]?.toLowerCase();

      // ── LIST ─────────────────────────────────────────────────────────────
      if (!sub || sub === 'list' || sub === 'ls') {
        const playlists = getUserPlaylists(message.author.id);
        if (!playlists.length) return message.reply({ embeds: [info('You have no playlists. Create one with `!playlist create <name>`')] });
        const lines = playlists.map((p, i) =>
          `\`${i + 1}.\` **${p.name}** — ${p.songs.length} song${p.songs.length !== 1 ? 's' : ''} • <t:${Math.floor(p.created_at / 1000)}:d>`
        ).join('\n');
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor(0x1DB954)
          .setTitle(`🎵 Your Playlists (${playlists.length})`)
          .setDescription(lines)
          .setFooter(BOT_FOOTER)
        ] });
      }

      // ── CREATE ────────────────────────────────────────────────────────────
      if (sub === 'create' || sub === 'new') {
        const name = args.slice(1).join(' ').trim();
        if (!name) return message.reply({ embeds: [err('Provide a playlist name.\nExample: `!playlist create My Favorites`')] });
        if (name.length > 32) return message.reply({ embeds: [err('Playlist name must be 32 characters or less.')] });
        const existing = getUserPlaylists(message.author.id).find(p => p.name.toLowerCase() === name.toLowerCase());
        if (existing) return message.reply({ embeds: [err(`You already have a playlist named **${name}**.`)] });
        createPlaylist(message.author.id, name);
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor(0x1DB954)
          .setTitle('✅ Playlist Created')
          .setDescription(`**${name}** is ready! Add songs with \`!playlist add ${name} <song>\``)
          .setFooter(BOT_FOOTER)
        ] });
      }

      // ── DELETE ────────────────────────────────────────────────────────────
      if (sub === 'delete' || sub === 'del' || sub === 'remove' && args[2] === undefined) {
        const name = args.slice(1).join(' ').trim();
        if (!name) return message.reply({ embeds: [err('Provide a playlist name.')] });
        const pl = getPlaylist(message.author.id, name);
        if (!pl) return message.reply({ embeds: [err(`Playlist **${name}** not found.`)] });
        deletePlaylist(message.author.id, name);
        return message.reply({ embeds: [ok(`🗑️ Deleted playlist **${name}**.`)] });
      }

      // ── ADD SONG ──────────────────────────────────────────────────────────
      if (sub === 'add') {
        const name = args[1];
        const query = args.slice(2).join(' ').trim();
        if (!name) return message.reply({ embeds: [err('Provide a playlist name.\nExample: `!playlist add MyPlaylist Shape of You`')] });
        const pl = getPlaylist(message.author.id, name);
        if (!pl) return message.reply({ embeds: [err(`Playlist **${name}** not found. Create it first with \`!playlist create ${name}\``)] });

        let track;
        if (!query) {
          // Add current song
          const player = getPlayer(message.guild!.id, message.client);
          if (!player.currentTrack) return message.reply({ embeds: [err('No song is playing. Provide a query or play a song first.')] });
          track = player.currentTrack;
        } else {
          const loading = await message.reply({ embeds: [new EmbedBuilder().setColor(0x1DB954).setDescription(`🔍 Searching for **${query}**…`).setFooter(BOT_FOOTER)] });
          try {
            const tracks = await resolveQuery(query, message.author.id);
            track = tracks[0];
            await loading.delete().catch(() => {});
          } catch (e: any) {
            await loading.edit({ embeds: [err(e.message)] });
            return;
          }
        }

        if (pl.songs.length >= 100) return message.reply({ embeds: [err('Playlist is full (max 100 songs).')] });
        addToPlaylist(message.author.id, name, {
          title: track.title, url: track.url, duration: track.duration,
          durationStr: track.durationStr, thumbnail: track.thumbnail, added_at: Date.now(),
        });
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor(0x1DB954)
          .setTitle('➕ Added to Playlist')
          .setDescription(`**${track.title}** → **${pl.name}** (${pl.songs.length + 1} songs)`)
          .setFooter(BOT_FOOTER)
        ] });
      }

      // ── REMOVE SONG ───────────────────────────────────────────────────────
      if (sub === 'remove' || sub === 'rm') {
        const name = args[1];
        const pos = parseInt(args[2]);
        if (!name || isNaN(pos)) return message.reply({ embeds: [err('Usage: `!playlist remove <name> <position>`')] });
        const pl = getPlaylist(message.author.id, name);
        if (!pl) return message.reply({ embeds: [err(`Playlist **${name}** not found.`)] });
        if (pos < 1 || pos > pl.songs.length) return message.reply({ embeds: [err(`Position must be between 1 and ${pl.songs.length}.`)] });
        const removed = pl.songs[pos - 1];
        removeFromPlaylist(message.author.id, name, pos - 1);
        return message.reply({ embeds: [ok(`Removed **${removed.title}** from **${name}**.`)] });
      }

      // ── VIEW ──────────────────────────────────────────────────────────────
      if (sub === 'view' || sub === 'show' || sub === 'info') {
        const name = args.slice(1).join(' ').trim();
        if (!name) return message.reply({ embeds: [err('Provide a playlist name.')] });
        const pl = getPlaylist(message.author.id, name);
        if (!pl) return message.reply({ embeds: [err(`Playlist **${name}** not found.`)] });
        if (!pl.songs.length) return message.reply({ embeds: [info(`**${name}** is empty. Add songs with \`!playlist add ${name} <song>\``)] });
        const lines = pl.songs.slice(0, 20).map((s, i) => `\`${i + 1}.\` **${s.title}** \`${s.durationStr}\``).join('\n');
        const total = pl.songs.reduce((a, s) => a + s.duration, 0);
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor(0x1DB954)
          .setTitle(`🎵 ${pl.name} (${pl.songs.length} songs)`)
          .setDescription(`${lines}${pl.songs.length > 20 ? `\n\n*...and ${pl.songs.length - 20} more*` : ''}`)
          .addFields({ name: '⏱️ Total Duration', value: fmtDuration(total), inline: true })
          .setFooter(BOT_FOOTER)
        ] });
      }

      // ── PLAY PLAYLIST ─────────────────────────────────────────────────────
      if (sub === 'play') {
        const vc = requireVC(message.member);
        if (!vc) return message.reply({ embeds: [err('You must be in a voice channel.')] });
        const name = args.slice(1).join(' ').trim();
        if (!name) return message.reply({ embeds: [err('Provide a playlist name.')] });
        const pl = getPlaylist(message.author.id, name);
        if (!pl) return message.reply({ embeds: [err(`Playlist **${name}** not found.`)] });
        if (!pl.songs.length) return message.reply({ embeds: [info(`**${name}** is empty.`)] });

        const player = getPlayer(message.guild!.id, message.client);
        player.textChannelId = message.channel.id;
        const botVC = message.guild!.members.me?.voice.channel;
        if (!botVC || botVC.id !== vc.id) player.connect(vc);

        const tracks: Track[] = pl.songs.map(s => ({
          title: s.title, url: s.url, thumbnail: s.thumbnail,
          duration: s.duration, durationStr: s.durationStr,
          requestedBy: message.author.id, source: 'query' as const,
        }));
        for (const t of tracks) player.queue.push(t);

        if (!player.currentTrack) {
          const first = player.queue.shift()!;
          player.currentTrack = first;
          await player.streamTrack(first);
          await message.reply({ embeds: [new EmbedBuilder()
            .setColor(0x1DB954)
            .setTitle(`▶️ Playing Playlist — ${pl.name}`)
            .setDescription(`Loaded **${tracks.length}** songs. Now playing **${first.title}**.`)
            .setFooter(BOT_FOOTER)
          ] });
        } else {
          await message.reply({ embeds: [ok(`Added **${tracks.length}** songs from **${name}** to the queue.`)] });
        }
        return;
      }

      // ── SHUFFLE PLAY ──────────────────────────────────────────────────────
      if (sub === 'shuffle') {
        const vc = requireVC(message.member);
        if (!vc) return message.reply({ embeds: [err('You must be in a voice channel.')] });
        const name = args.slice(1).join(' ').trim();
        if (!name) return message.reply({ embeds: [err('Provide a playlist name.')] });
        const pl = getPlaylist(message.author.id, name);
        if (!pl) return message.reply({ embeds: [err(`Playlist **${name}** not found.`)] });
        if (!pl.songs.length) return message.reply({ embeds: [info(`**${name}** is empty.`)] });

        const player = getPlayer(message.guild!.id, message.client);
        player.textChannelId = message.channel.id;
        const botVC = message.guild!.members.me?.voice.channel;
        if (!botVC || botVC.id !== vc.id) player.connect(vc);

        const tracks: Track[] = pl.songs.map(s => ({
          title: s.title, url: s.url, thumbnail: s.thumbnail,
          duration: s.duration, durationStr: s.durationStr,
          requestedBy: message.author.id, source: 'query' as const,
        })).sort(() => Math.random() - 0.5);

        for (const t of tracks) player.queue.push(t);

        if (!player.currentTrack) {
          const first = player.queue.shift()!;
          player.currentTrack = first;
          await player.streamTrack(first);
          await message.reply({ embeds: [new EmbedBuilder()
            .setColor(0x1DB954)
            .setTitle(`🔀 Shuffle Playing — ${pl.name}`)
            .setDescription(`Loaded **${tracks.length}** songs in random order.`)
            .setFooter(BOT_FOOTER)
          ] });
        } else {
          await message.reply({ embeds: [ok(`Shuffled **${tracks.length}** songs from **${name}** into the queue.`)] });
        }
        return;
      }

      // ── UNKNOWN SUBCOMMAND ────────────────────────────────────────────────
      await message.reply({ embeds: [new EmbedBuilder()
        .setColor(0x1DB954)
        .setTitle('🎵 Playlist Commands')
        .setDescription([
          '`!playlist list` — View your playlists',
          '`!playlist create <name>` — Create a playlist',
          '`!playlist delete <name>` — Delete a playlist',
          '`!playlist add <name> [song]` — Add a song (or current song)',
          '`!playlist remove <name> <#>` — Remove song by number',
          '`!playlist view <name>` — View songs in a playlist',
          '`!playlist play <name>` — Play a playlist',
          '`!playlist shuffle <name>` — Shuffle play a playlist',
        ].join('\n'))
        .setFooter(BOT_FOOTER)
      ] });
    },
  },

  // ── MUSIC HELP ────────────────────────────────────────────────────────────
  {
    name: 'musichelp',
    aliases: ['mhelp'],
    description: 'Show all music commands',
    category: 'Music',
    usage: 'musichelp',
    async execute(message) {
      await message.reply({ embeds: [new EmbedBuilder()
        .setColor(0x1DB954)
        .setTitle('🎵 Music Commands')
        .addFields(
          { name: '▶️ Playback', value: [
            '`!play <song/URL>` — Play (YouTube URL, Spotify link, or search)',
            '`!skip` — Skip current song',
            '`!pause` / `!resume` — Pause or resume',
            '`!stop` — Stop and leave VC',
            '`!nowplaying` — Show current song',
            '`!search <query>` — Pick from search results',
          ].join('\n'), inline: false },
          { name: '📋 Queue', value: [
            '`!queue` — View the queue',
            '`!shuffle` — Shuffle the queue',
            '`!loop` — Toggle loop (off / track / queue)',
            '`!autoplay` — Toggle autoplay',
            '`!remove <#>` — Remove a song',
            '`!clearqueue` — Clear the queue',
            '`!skipto <#>` — Jump to a position',
          ].join('\n'), inline: false },
          { name: '🔊 Audio', value: '`!volume <0-800>` — Set volume (800 = 💥 MAX BOOM)', inline: false },
          { name: '❤️ Liked Songs', value: [
            '`!like` — Like the current song',
            '`!unlike` — Unlike the current song',
            '`!liked` — Play your liked songs',
            '`!likedlist` — View your liked songs',
          ].join('\n'), inline: false },
          { name: '🎵 Playlists', value: [
            '`!playlist list` — View playlists',
            '`!playlist create <name>` — Create',
            '`!playlist add <name> [song]` — Add song',
            '`!playlist play <name>` — Play',
            '`!playlist shuffle <name>` — Shuffle play',
            '`!playlist view <name>` — View songs',
            '`!playlist remove <name> <#>` — Remove song',
            '`!playlist delete <name>` — Delete',
          ].join('\n'), inline: false },
          { name: '🌐 Other', value: '`!247` — Toggle 24/7 mode (bot stays in VC permanently)', inline: false },
        )
        .setFooter(BOT_FOOTER)
      ] });
    },
  },

  // ── 24/7 MODE ─────────────────────────────────────────────────────────────
  {
    name: '247',
    aliases: ['nonstop', '24/7'],
    description: 'Toggle 24/7 mode — bot stays in your VC permanently and reconnects if kicked',
    category: 'Music',
    usage: '247',
    async execute(message) {
      const vc = message.member?.voice.channel;
      const player = getPlayer(message.guild!.id, message.client);

      if (player.is247) {
        // Disable 24/7
        player.is247 = false;
        player.vc247Id = '';
        await message.reply({ embeds: [new EmbedBuilder()
          .setColor(COLORS.error)
          .setTitle('🌐 24/7 Mode — Disabled')
          .setDescription('The bot will now leave the voice channel after **5 minutes of inactivity**.')
          .setFooter(BOT_FOOTER)
        ] });
      } else {
        // Enable 24/7
        if (!vc) return message.reply({ embeds: [err('You must be in a voice channel to enable 24/7 mode.')] });
        const botVC = message.guild!.members.me?.voice.channel;
        if (!botVC || botVC.id !== vc.id) {
          player.textChannelId = message.channel.id;
          player.connect(vc);
        }
        player.is247 = true;
        player.vc247Id = vc.id;
        await message.reply({ embeds: [new EmbedBuilder()
          .setColor(0x1DB954)
          .setTitle('🌐 24/7 Mode — Enabled')
          .setDescription([
            `The bot will stay in **${vc.name}** permanently.`,
            'It will reconnect automatically if disconnected.',
            '',
            'Use `!247` again to disable, or `!stop` to force disconnect.',
          ].join('\n'))
          .setFooter(BOT_FOOTER)
        ] });
      }
    },
  },

  // ── SET MUSIC PANEL ────────────────────────────────────────────────────────
  {
    name: 'setmusicpanel',
    aliases: ['musicpanel', 'muspanel', 'smp'],
    description: 'Pin a permanent music control panel (with Search, 24/7 & all controls) in this channel',
    category: 'Music',
    usage: 'setmusicpanel',
    async execute(message) {
      const member = message.member;
      if (!member?.permissions.has(0x20n)) { // MANAGE_CHANNELS
        return message.reply({ embeds: [err('You need **Manage Channels** permission to set up the music panel.')] });
      }

      const player = getPlayer(message.guild!.id, message.client);
      player.textChannelId = message.channel.id;

      // Delete the command message to keep the channel clean
      message.delete().catch(() => {});

      // Send the idle panel
      const panel = await (message.channel as any).send({
        embeds: [buildIdleEmbed()],
        components: buildMusicControls(player),
      });

      // Store reference in DB and on player
      setMusicPanel(message.guild!.id, message.channel.id, panel.id);
      player.nowPlayingMessage = panel;
      player.isPermanentPanel = true;

      // If already playing, update the panel with now-playing info
      if (player.currentTrack) {
        await panel.edit({
          embeds: [buildNowPlayingEmbed(player.currentTrack, player)],
          components: buildMusicControls(player),
        }).catch(() => {});
      }

      // Confirm in a short temp message
      const confirm = await (message.channel as any).send({ embeds: [
        new EmbedBuilder()
          .setColor(0x1DB954)
          .setDescription('✅ Music panel pinned! This message will disappear in 5 seconds.')
          .setFooter(BOT_FOOTER),
      ] });
      setTimeout(() => confirm.delete().catch(() => {}), 5000);
    },
  },

  // ── MUSIC HISTORY ──────────────────────────────────────────────────────────
  {
    name: 'musichistory',
    aliases: ['mhistory', 'played', 'recenttracks'],
    description: 'Show the last 20 songs played in this server',
    category: 'Music',
    usage: 'musichistory',
    async execute(message) {
      const player = getPlayer(message.guild!.id, message.client);
      const hist = player.previousTracks;

      if (!hist.length) {
        return message.reply({ embeds: [info('No songs have been played yet this session.\nQueue something with `!play <song>`!')] });
      }

      const lines = hist.map((t, i) =>
        `\`${String(i + 1).padStart(2, '0')}.\` **${t.title}** \`[${t.durationStr}]\` — <@${t.requestedBy === 'autoplay' ? message.client.user!.id : t.requestedBy}>${t.requestedBy === 'autoplay' ? ' *(autoplay)*' : ''}`
      ).join('\n');

      await message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x1DB954)
            .setTitle('🎵 Recently Played')
            .setDescription(lines)
            .addFields(
              { name: 'Tip', value: 'Re-queue any song with `!requeue <number>` (e.g. `!requeue 3`)', inline: false },
            )
            .setFooter({ text: `${hist.length} track${hist.length !== 1 ? 's' : ''} in history • ${BOT_FOOTER.text}` })
            .setTimestamp()
        ],
      });
    },
  },

  // ── NIGHTCORE ─────────────────────────────────────────────────────────────
  {
    name: 'nightcore',
    aliases: ['nc', 'nightcoremode'],
    description: 'Toggle nightcore mode (1.25× speed + pitch). Restarts the current track.',
    category: 'Music',
    usage: 'nightcore',
    async execute(message) {
      const player = getPlayer(message.guild!.id, message.client);
      const next = !player.nightcore;
      player.setNightcore(next);

      const embed = new EmbedBuilder()
        .setColor(next ? 0xFF69B4 : 0x5865F2)
        .setTitle(next ? '🌸 Nightcore — ON' : '🌸 Nightcore — OFF')
        .setDescription(
          next
            ? '**Enabled!** Speed & pitch boosted ×1.25.\nSounds best with pop/electronic tracks.\n\n🔄 Restarting current track to apply...'
            : '**Disabled.** Back to normal playback.' + (player.currentTrack ? '\n\n🔄 Restarting current track to apply...' : '')
        )
        .setFooter(BOT_FOOTER);

      return message.reply({ embeds: [embed] });
    },
  },

  // ── SLOWED + REVERB ───────────────────────────────────────────────────────
  {
    name: 'slowed',
    aliases: ['slowmode', 'slowedreverb', 'lofi'],
    description: 'Toggle slowed + reverb mode (×0.8 speed & pitch, soft echo). Restarts the current track.',
    category: 'Music',
    usage: 'slowed',
    async execute(message) {
      const player = getPlayer(message.guild!.id, message.client);
      const next = !player.slowed;
      player.setSlowed(next);

      const embed = new EmbedBuilder()
        .setColor(next ? 0x6C5CE7 : 0x5865F2)
        .setTitle(next ? '🌊 Slowed + Reverb — ON' : '🌊 Slowed + Reverb — OFF')
        .setDescription(
          next
            ? '**Enabled!** Speed & pitch lowered ×0.8 with a soft reverb echo.\nPerfect for lo-fi, R&B, and chill tracks.\n\n🔄 Restarting current track to apply...'
            : '**Disabled.** Back to normal playback.' + (player.currentTrack ? '\n\n🔄 Restarting current track to apply...' : '')
        )
        .setFooter(BOT_FOOTER);

      return message.reply({ embeds: [embed] });
    },
  },

  // ── BASS BOOST ────────────────────────────────────────────────────────────
  {
    name: 'bassboost',
    aliases: ['bb', 'bass'],
    description: 'Set bass boost level (0 = off, 1–5). Restarts the current track instantly.',
    category: 'Music',
    usage: 'bassboost [0-5 | off]',
    async execute(message) {
      const player = getPlayer(message.guild!.id, message.client);

      const args = message.content.trim().split(/\s+/).slice(1);
      const input = args[0]?.toLowerCase();

      // No arg → show current status
      if (!input) {
        const level = player.bassBoost;
        const bar = '🟩'.repeat(level) + '⬛'.repeat(5 - level);
        return message.reply({ embeds: [
          new EmbedBuilder()
            .setColor(level > 0 ? 0xFFAA00 : 0x5865F2)
            .setTitle('🎸 Bass Boost')
            .setDescription(
              level > 0
                ? `**Level ${level}/5** ${bar}\n+${level * 5} dB at 110 Hz`
                : `**Off** ${bar}\nUse \`!bassboost <1-5>\` to enable.`
            )
            .setFooter(BOT_FOOTER),
        ] });
      }

      const num = input === 'off' ? 0 : parseInt(input, 10);
      if (isNaN(num) || num < 0 || num > 5) {
        return message.reply({ embeds: [err('Choose a level between **0–5** or `off`.\n`1` = light  •  `3` = medium  •  `5` = extreme')] });
      }

      player.setBassBoost(num);

      const bar = '🟩'.repeat(num) + '⬛'.repeat(5 - num);
      const restarting = !!(player.currentTrack);

      const embed = new EmbedBuilder()
        .setColor(num > 0 ? 0xFFAA00 : 0x5865F2)
        .setTitle('🎸 Bass Boost')
        .setDescription(
          num > 0
            ? `Set to **Level ${num}/5** ${bar}\n+${num * 5} dB at 110 Hz${restarting ? '\n\n🔄 Restarting current track to apply...' : ''}`
            : `**Turned off** ${bar}${restarting ? '\n\n🔄 Restarting current track to apply...' : ''}`
        )
        .setFooter(BOT_FOOTER);

      return message.reply({ embeds: [embed] });
    },
  },

  // ── REQUEUE FROM HISTORY ──────────────────────────────────────────────────
  {
    name: 'requeue',
    aliases: ['rq', 'replay', 'requeuetrack'],
    description: 'Re-add a song from history to the queue by its number (use !musichistory to see numbers)',
    category: 'Music',
    usage: 'requeue <number>',
    async execute(message) {
      const player = getPlayer(message.guild!.id, message.client);
      const hist = player.previousTracks;

      if (!hist.length) {
        return message.reply({ embeds: [info('No history yet — play something first!')] });
      }

      const args = message.content.trim().split(/\s+/).slice(1);
      const numStr = args[0];
      if (!numStr) {
        return message.reply({ embeds: [err('Please provide a track number.\nUsage: `!requeue <number>`\nSee numbers with `!musichistory`')] });
      }

      const num = parseInt(numStr, 10);
      if (isNaN(num) || num < 1 || num > hist.length) {
        return message.reply({ embeds: [err(`Invalid number. Pick between **1** and **${hist.length}**.\nSee the list with \`!musichistory\``)] });
      }

      const track: Track = { ...hist[num - 1], requestedBy: message.author.id };
      player.queue.push(track);

      const embed = new EmbedBuilder()
        .setColor(0x1DB954)
        .setDescription(`🔁 **[${track.title}](${track.url})** \`[${track.durationStr}]\` added back to the queue.\n**Position:** #${player.queue.length}`)
        .setFooter(BOT_FOOTER);

      if (track.thumbnail) embed.setThumbnail(track.thumbnail);

      await message.reply({ embeds: [embed] });

      // If nothing is playing, start immediately
      if (!player.isPlaying && !player.isPaused) {
        const next = player.queue.shift()!;
        player.currentTrack = next;
        await player.streamTrack(next);
        await player.sendNowPlaying(next);
      }
    },
  },

  // ── REMOVE MUSIC PANEL ────────────────────────────────────────────────────
  {
    name: 'removemusicpanel',
    aliases: ['rmp', 'delmusicpanel'],
    description: 'Remove the permanent music control panel from this server',
    category: 'Music',
    usage: 'removemusicpanel',
    async execute(message) {
      const member = message.member;
      if (!member?.permissions.has(0x20n)) {
        return message.reply({ embeds: [err('You need **Manage Channels** permission to remove the music panel.')] });
      }

      const player = getPlayer(message.guild!.id, message.client);

      if (player.nowPlayingMessage && player.isPermanentPanel) {
        try { await player.nowPlayingMessage.delete(); } catch {}
        player.nowPlayingMessage = null;
        player.isPermanentPanel = false;
      }

      deleteMusicPanel(message.guild!.id);
      await message.reply({ embeds: [ok('🗑️ Permanent music panel removed.')] });
    },
  },
];

export default musicCommands;
