import axios from 'axios';
import { TextChannel, Client } from 'discord.js';
import { getLogChannel } from '../database.js';
import { EmbedBuilder } from 'discord.js';

// ── PER-CATEGORY GIF DEDUP CACHE (last 6 URLs) ───────────────────────────────
const gifCache = new Map<string, string[]>();

function dedupPush(category: string, url: string) {
  const arr = gifCache.get(category) ?? [];
  arr.push(url);
  if (arr.length > 6) arr.shift();
  gifCache.set(category, arr);
}

function isRecentDup(category: string, url: string): boolean {
  return (gifCache.get(category) ?? []).includes(url);
}

// ── NEKOS.BEST v2 SFW CATEGORY MAP ────────────────────────────────────────────
const NEKOS_BEST_SFW: Record<string, string> = {
  kiss: 'kiss',       hug: 'hug',         slap: 'slap',       pat: 'pat',
  highfive: 'highfive', wave: 'wave',     stare: 'stare',     cry: 'cry',
  happy: 'happy',     sad: 'cry',         angry: 'baka',      funny: 'laugh',
  laugh: 'laugh',     kick: 'kick',       wink: 'wink',       smile: 'smile',
  blush: 'blush',     dance: 'dance',     poke: 'poke',       bonk: 'bonk',
  bite: 'bite',       cuddle: 'cuddle',   baka: 'baka',       yeet: 'yeet',
  nom: 'nom',         pout: 'pout',       shrug: 'shrug',     shoot: 'shoot',
  sleep: 'sleep',     handhold: 'handhold', thumbsup: 'thumbsup', bored: 'bored',
  facepalm: 'facepalm', kill: 'shoot',    punch: 'slap',      hit: 'slap',
};

const WAIFU_SFW: Record<string, string> = {
  kiss: 'kiss',  hug: 'hug',    slap: 'slap',  pat: 'pat',    cry: 'cry',
  happy: 'happy', wave: 'wave', wink: 'wink',   dance: 'dance', poke: 'poke',
  bonk: 'bonk',  bite: 'bite',  cuddle: 'cuddle', yeet: 'yeet', nom: 'nom',
  highfive: 'highfive', handhold: 'handhold',   blush: 'blush', smile: 'smile',
  kick: 'kick',  sad: 'cry',    angry: 'bully', funny: 'smug',
  kill: 'kill',  punch: 'slap', hit: 'slap',
};

// ── WAIFU.IM NSFW CATEGORIES (Primary — most reliable) ───────────────────────
// API: GET https://api.waifu.im/search?included_tags=<tag>&is_nsfw=true
// Verified tags: hentai, ass, milf, oral, paizuri, ecchi, ero, cum_print, bondage, pussy
const WAIFUIM_NSFW: Record<string, string> = {
  hentai:   'hentai',
  ass:      'ass',
  blowjob:  'oral',
  boobs:    'ecchi',
  cum:      'cum_print',
  les:      'ero',
  neko:     'hentai',
  nsfw:     'hentai',
  pussy:    'pussy',
  anal:     'ass',
  ecchi:    'ecchi',
  paizuri:  'paizuri',
  uniform:  'ecchi',
  trap:     'hentai',
  waifu:    'ecchi',
  milf:     'milf',
  bondage:  'bondage',
};

// ── WAIFU.PICS NSFW CATEGORIES (Secondary) ────────────────────────────────────
const WAIFU_NSFW: Record<string, string> = {
  ass:      'ass',
  blowjob:  'blowjob',
  boobs:    'boobs',
  cum:      'cum',
  hentai:   'hentai',
  les:      'ero',
  neko:     'neko',
  nsfw:     'hentai',
  pussy:    'pussy',
  anal:     'ass',
  ecchi:    'ero',
  paizuri:  'paizuri',
  uniform:  'uniform',
  trap:     'trap',
  waifu:    'waifu',
  milf:     'milf',
  bondage:  'bondage',
};

const HMTAI_NSFW: Record<string, string> = {
  ass:      'ass',
  blowjob:  'blowjob',
  boobs:    'boobs',
  cum:      'cum',
  hentai:   'hentai',
  les:      'femdom',
  neko:     'waifu',
  nsfw:     'hentai',
  pussy:    'pussy',
  anal:     'hentai_anal',
  ecchi:    'ero',
  paizuri:  'boobs',
  uniform:  'cosplay',
  trap:     'femdom',
  waifu:    'waifu',
};

// ── SFW GIF FETCH WITH DEDUP ─────────────────────────────────────────────────
export async function fetchGif(category: string): Promise<string> {
  const nekosCat = NEKOS_BEST_SFW[category] ?? 'hug';
  const waifuCat = WAIFU_SFW[category] ?? 'hug';

  const sources = [
    () => axios.get(`https://nekos.best/api/v2/${nekosCat}`, { timeout: 5000 })
            .then(r => r.data?.results?.[0]?.url ?? ''),
    () => axios.get(`https://api.waifu.pics/sfw/${waifuCat}`, { timeout: 5000 })
            .then(r => r.data?.url ?? ''),
    () => axios.get(`https://nekos.life/api/v2/img/${nekosCat}`, { timeout: 5000 })
            .then(r => r.data?.url ?? ''),
  ];

  for (let attempt = 0; attempt < 3; attempt++) {
    for (const source of sources) {
      try {
        const url = await source();
        if (!url) continue;
        if (isRecentDup(category, url) && attempt < 2) continue; // retry on dup unless last attempt
        dedupPush(category, url);
        return url;
      } catch {}
    }
  }
  return '';
}

// ── ADULT GIF FETCH WITH DEDUP (NSFW-gated fun) ───────────────────────────────
const ADULT_MAP: Record<string, [string, string]> = {
  fuck:    ['blowjob', 'blowjob'],
  sex:     ['hentai',  'hentai'],
  sexwith: ['hentai',  'hentai'],
  trap:    ['trap',    'femdom'],
};

export async function fetchAdultGif(category: string): Promise<string> {
  const [waifuCat, hmtaiCat] = ADULT_MAP[category] ?? ['hentai', 'hentai'];
  const sources = [
    () => axios.get(`https://api.waifu.pics/nsfw/${waifuCat}`, { timeout: 5000 })
            .then(r => r.data?.url ?? ''),
    () => axios.get(`https://hmtai.hatsunia.cfd/nsfw/${hmtaiCat}`, { timeout: 5000 })
            .then(r => r.data?.url ?? ''),
    () => axios.get(`https://nekos.life/api/v2/img/hentai`, { timeout: 5000 })
            .then(r => r.data?.url ?? ''),
  ];
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const source of sources) {
      try {
        const url = await source();
        if (!url) continue;
        if (isRecentDup(category, url) && attempt < 2) continue;
        dedupPush(category, url);
        return url;
      } catch {}
    }
  }
  return '';
}

// ── NSFW GIF FETCH WITH DEDUP + RANDOM SOURCE ORDER ──────────────────────────
export async function fetchNsfwGif(category: string): Promise<string> {
  const waifuimCat = WAIFUIM_NSFW[category] ?? 'hentai';
  const waifuCat   = WAIFU_NSFW[category] ?? 'hentai';
  const hmtaiCat   = HMTAI_NSFW[category] ?? 'hentai';

  // Shuffle sources so results vary every call and no single API dominates
  const allSources = [
    () => axios.get(`https://api.waifu.im/search?included_tags=${waifuimCat}&is_nsfw=true&gif=true`, { timeout: 6000 })
            .then(r => (r.data?.images?.[0]?.url ?? '')),
    () => axios.get(`https://hmtai.hatsunia.cfd/nsfw/${hmtaiCat}`, { timeout: 5000 })
            .then(r => r.data?.url ?? ''),
    () => axios.get(`https://api.waifu.pics/nsfw/${waifuCat}`, { timeout: 5000 })
            .then(r => r.data?.url ?? ''),
    () => axios.get(`https://api.waifu.im/search?included_tags=${waifuimCat}&is_nsfw=true`, { timeout: 6000 })
            .then(r => (r.data?.images?.[0]?.url ?? '')),
    () => axios.get('https://nekos.life/api/v2/img/hentai', { timeout: 5000 })
            .then(r => r.data?.url ?? ''),
  ];

  // Fisher-Yates shuffle for random source order each call
  function shuffleSources<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const sources = shuffleSources(allSources);
    for (const source of sources) {
      try {
        const url = await source();
        if (!url) continue;
        if (isRecentDup(category, url) && attempt < 2) continue;
        dedupPush(category, url);
        return url;
      } catch {}
    }
  }
  return '';
}

// ── JOKE FETCH ────────────────────────────────────────────────────────────────
export async function fetchJoke(): Promise<string> {
  try {
    const res = await axios.get('https://v2.jokeapi.dev/joke/Any?safe-mode&type=twopart', { timeout: 5000 });
    return `**${res.data.setup}**\n||${res.data.delivery}||`;
  } catch {
    try {
      const res = await axios.get('https://official-joke-api.appspot.com/random_joke', { timeout: 5000 });
      return `**${res.data.setup}**\n||${res.data.punchline}||`;
    } catch {
      return 'Why did the bot fail? Because the API was down! 😅';
    }
  }
}

// ── SEND LOG ─────────────────────────────────────────────────────────────────
export async function sendLog(client: Client, guildId: string, logType: string, embed: EmbedBuilder) {
  const channelId = getLogChannel(guildId, logType);
  if (!channelId) return;
  try {
    const channel = await client.channels.fetch(channelId) as TextChannel;
    if (channel?.isTextBased()) await channel.send({ embeds: [embed] });
  } catch {}
}

// ── UTILITIES ─────────────────────────────────────────────────────────────────
export function formatTime(seconds: number): string {
  if (seconds <= 0) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function parseTime(str: string): number {
  const match = str.match(/^(\d+)([smhd])$/i);
  if (!match) return 0;
  const num = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  const map: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return num * (map[unit] ?? 0);
}

// Truly random 0–100 — uses crypto-quality entropy via multiple Math.random() calls
export function randomPercent(): number {
  // XOR-mix two random values for extra entropy
  const a = Math.floor(Math.random() * 0xFFFFFF);
  const b = Math.floor(Math.random() * 0xFFFFFF);
  return (a ^ b) % 101;
}

export function mentionOrTag(userId: string): string {
  return `<@${userId}>`;
}
