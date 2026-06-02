import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH ?? path.join(__dirname, '..', 'bot-data.json');

interface DbData {
  warnings: Warning[];
  mutes: Record<string, Mute>;
  vc_bans: Record<string, VcBan>;
  afk: Record<string, AfkEntry>;
  guild_settings: Record<string, Record<string, string>>;
  log_settings: Record<string, Record<string, string>>;
  automod_settings: Record<string, Record<string, AutomodSetting>>;
  welcome_settings: Record<string, WelcomeSetting>;
  leave_settings: Record<string, WelcomeSetting>;
  tempvc_settings: Record<string, TempVcSetting>;
  active_tempvcs: Record<string, TempVc>;
  nsfw_access: Record<string, AccessEntry>;
  nopfx_access: Record<string, AccessEntry>;
  bot_roles: Record<string, BotRole>;
  voice_stats: Record<string, Record<string, VoiceStat>>;
  message_stats: Record<string, Record<string, MsgStat>>;
  bot_247: Record<string, string>;
  bios: Record<string, Record<string, string>>;
  giveaways: Record<string, Giveaway>;
  bot_config: BotConfig;
  ticket_settings: Record<string, TicketSettings>;
  active_tickets: Record<string, ActiveTicket>;
  ticket_counter: Record<string, number>;
  autoresponder: Record<string, string>;
  autoreact: Record<string, string>;
  temp_roles: TempRole[];
  automod_whitelist: Record<string, string[]>;
  media_only_channels: Record<string, string[]>;
  jail_settings: Record<string, JailSetting>;
  jailed_users: Record<string, JailedUser>;
  guild_banners: Record<string, string>;
  guild_pfps: Record<string, string>;
  music_panels: Record<string, { channel_id: string; message_id: string }>;
  whitelist_data: Record<string, Record<string, string[]>>;
  whitelist_punishment: Record<string, string>;
  whitelist_log: Record<string, WhitelistLogEntry[]>;
}

export interface WhitelistLogEntry {
  action: 'grant' | 'revoke' | 'punishment_change';
  by_id: string;
  by_tag: string;
  target_id?: string;
  target_tag?: string;
  perms?: string[];
  punishment?: string;
  old_punishment?: string;
  timestamp: number;
}

interface Warning { id: number; guild_id: string; user_id: string; reason: string; moderator_id: string; timestamp: number }
interface Mute { guild_id: string; user_id: string; reason?: string; moderator_id?: string; timestamp?: number }
interface VcBan { guild_id: string; user_id: string; reason?: string; banned_by?: string }
interface AfkEntry { reason: string; timestamp: number; dm_notifications: boolean }
interface AutomodSetting { enabled: boolean; punishment: string; extra: string }
interface WelcomeSetting { channel_id: string; message: string; enabled: boolean }
interface TempVcSetting { trigger_channel_id: string; interface_channel_id: string; category_id?: string; enabled: boolean; panel_message_id?: string }
interface TicketButton { id: string; label: string; emoji: string; style: string }
interface TicketSettings { panel_channel_id: string; category_id?: string; log_channel_id?: string; panel_message_id?: string; enabled: boolean; custom_buttons?: TicketButton[]; ping_role_id?: string }
interface ActiveTicket { channel_id: string; user_id: string; guild_id: string; type: string; created_at: number; ticket_number: number }
interface TempRole { guild_id: string; user_id: string; role_id: string; expires_at: number; given_by: string }
interface TempVc { channel_id: string; owner_id: string; guild_id: string; locked: boolean; hidden: boolean }
interface AccessEntry { granted_by: string; expires_at: number }
interface BotRole { role_type: string; assigned_by: string }
interface JailSetting { channel_id: string; role_id: string; enabled: boolean }
interface JailedUser { guild_id: string; user_id: string; roles: string[]; jailed_by: string; reason: string; jailed_at: number }
export interface VoiceStat { daily: number; weekly: number; alltime: number; last_join?: number }
export interface MsgStat { daily: number; weekly: number; alltime: number }
export interface Giveaway {
  messageId: string;
  channelId: string;
  guildId: string;
  prize: string;
  hostId: string;
  endTime: number;
  winnerCount: number;
  ended: boolean;
  winners: string[];
}
export interface BotConfig {
  status_type?: string;
  status_text?: string;
  bot_bio?: string;
}

let data: DbData = {
  warnings: [], mutes: {}, vc_bans: {}, afk: {},
  guild_settings: {}, log_settings: {}, automod_settings: {},
  welcome_settings: {}, leave_settings: {}, tempvc_settings: {},
  active_tempvcs: {}, nsfw_access: {}, nopfx_access: {}, bot_roles: {},
  voice_stats: {}, message_stats: {}, bot_247: {}, bios: {},
  giveaways: {}, bot_config: {},
  ticket_settings: {}, active_tickets: {}, ticket_counter: {},
  autoresponder: {}, autoreact: {}, temp_roles: [],
  automod_whitelist: {}, media_only_channels: {},
  jail_settings: {}, jailed_users: {},
  guild_banners: {}, guild_pfps: {},
  music_panels: {},
  whitelist_data: {},
  whitelist_punishment: {},
  whitelist_log: {},
};

let saveTimeout: NodeJS.Timeout | null = null;

function load() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const raw = fs.readFileSync(DB_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      data = { ...data, ...parsed };
      if (!data.giveaways) data.giveaways = {};
      if (!data.bot_config) data.bot_config = {};
      if (!data.ticket_settings) data.ticket_settings = {};
      if (!data.active_tickets) data.active_tickets = {};
      if (!data.ticket_counter) data.ticket_counter = {};
      if (!data.autoresponder) data.autoresponder = {};
      if (!data.autoreact) data.autoreact = {};
      if (!data.temp_roles) data.temp_roles = [];
      if (!data.automod_whitelist) data.automod_whitelist = {};
      if (!data.media_only_channels) data.media_only_channels = {};
      if (!data.jail_settings) data.jail_settings = {};
      if (!data.jailed_users) data.jailed_users = {};
      if (!data.guild_banners) data.guild_banners = {};
      if (!data.guild_pfps) data.guild_pfps = {};
      if (!data.whitelist_data) data.whitelist_data = {};
      if (!data.whitelist_punishment) data.whitelist_punishment = {};
    }
  } catch { /* fresh start */ }
}

function save() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try { fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2)); } catch {}
  }, 500);
}

load();

// ── GUILD SETTINGS ────────────────────────────────────────────────────────────
export function getSetting(guildId: string, key: string): string | null {
  return data.guild_settings[guildId]?.[key] ?? null;
}
export function setSetting(guildId: string, key: string, value: string) {
  if (!data.guild_settings[guildId]) data.guild_settings[guildId] = {};
  data.guild_settings[guildId][key] = value;
  save();
}

// ── LOG SETTINGS ──────────────────────────────────────────────────────────────
export function getLogChannel(guildId: string, logType: string): string | null {
  return data.log_settings[guildId]?.[logType] ?? null;
}
export function setLogChannel(guildId: string, logType: string, channelId: string) {
  if (!data.log_settings[guildId]) data.log_settings[guildId] = {};
  data.log_settings[guildId][logType] = channelId;
  save();
}
export function deleteLogChannel(guildId: string, logType: string) {
  if (data.log_settings[guildId]) delete data.log_settings[guildId][logType];
  save();
}

// ── AUTOMOD SETTINGS ──────────────────────────────────────────────────────────
export function getAutomodSetting(guildId: string, feature: string): AutomodSetting | undefined {
  return data.automod_settings[guildId]?.[feature];
}
export function setAutomodSetting(guildId: string, feature: string, enabled: boolean, punishment = 'warn', extra = '') {
  if (!data.automod_settings[guildId]) data.automod_settings[guildId] = {};
  data.automod_settings[guildId][feature] = { enabled, punishment, extra };
  save();
}

// ── WARNINGS ──────────────────────────────────────────────────────────────────
let warnIdCounter = Math.max(0, ...(data.warnings.length ? data.warnings.map(w => w.id) : [0])) + 1;

export function addWarning(guildId: string, userId: string, reason: string, moderatorId: string) {
  data.warnings.push({ id: warnIdCounter++, guild_id: guildId, user_id: userId, reason, moderator_id: moderatorId, timestamp: Date.now() });
  save();
}
export function getWarnings(guildId: string, userId: string) {
  return data.warnings.filter(w => w.guild_id === guildId && w.user_id === userId).sort((a, b) => b.timestamp - a.timestamp);
}
export function getGuildWarnings(guildId: string) {
  return data.warnings.filter(w => w.guild_id === guildId);
}
export function removeWarnings(guildId: string, userId: string, count?: number) {
  const userWarns = data.warnings.filter(w => w.guild_id === guildId && w.user_id === userId).sort((a, b) => b.timestamp - a.timestamp);
  const toRemove = count ? userWarns.slice(0, count).map(w => w.id) : userWarns.map(w => w.id);
  data.warnings = data.warnings.filter(w => !toRemove.includes(w.id));
  save();
}

// ── AFK ───────────────────────────────────────────────────────────────────────
export function isAfk(userId: string): AfkEntry | undefined {
  return data.afk[userId];
}
export function setAfk(userId: string, reason: string, dmNotifications: boolean) {
  data.afk[userId] = { reason, timestamp: Date.now(), dm_notifications: dmNotifications };
  save();
}
export function removeAfk(userId: string) {
  delete data.afk[userId];
  save();
}

// ── NSFW ACCESS ───────────────────────────────────────────────────────────────
export function hasNsfwAccess(userId: string, botOwnerId: string): boolean {
  if (userId === botOwnerId) return true;
  const entry = data.nsfw_access[userId];
  if (!entry) return false;
  if (entry.expires_at > 0 && Date.now() > entry.expires_at) { delete data.nsfw_access[userId]; save(); return false; }
  return true;
}
export function grantNsfwAccess(userId: string, grantedBy: string, days: number) {
  data.nsfw_access[userId] = { granted_by: grantedBy, expires_at: days > 0 ? Date.now() + days * 86400000 : 0 };
  save();
}
export function revokeNsfwAccess(userId: string) {
  delete data.nsfw_access[userId];
  save();
}
export function getNsfwAccessInfo(userId: string): AccessEntry | undefined {
  return data.nsfw_access[userId];
}

// ── NO-PREFIX ACCESS ──────────────────────────────────────────────────────────
export function hasNoPfxAccess(userId: string, botOwnerId: string): boolean {
  if (userId === botOwnerId) return true;
  const entry = data.nopfx_access[userId];
  if (!entry) return false;
  if (entry.expires_at > 0 && Date.now() > entry.expires_at) { delete data.nopfx_access[userId]; save(); return false; }
  return true;
}
export function grantNoPfxAccess(userId: string, grantedBy: string, days: number) {
  data.nopfx_access[userId] = { granted_by: grantedBy, expires_at: days > 0 ? Date.now() + days * 86400000 : 0 };
  save();
}
export function revokeNoPfxAccess(userId: string) {
  delete data.nopfx_access[userId];
  save();
}
export function getNoPfxAccessInfo(userId: string): AccessEntry | undefined {
  return data.nopfx_access[userId];
}

// ── BOT ROLES ─────────────────────────────────────────────────────────────────
export function getBotRole(userId: string): string | null {
  return data.bot_roles[userId]?.role_type ?? null;
}
export function setBotRole(userId: string, roleType: string, assignedBy: string) {
  data.bot_roles[userId] = { role_type: roleType, assigned_by: assignedBy };
  save();
}
export function removeBotRole(userId: string) {
  delete data.bot_roles[userId];
  save();
}
export function getBotRoleUsers(roleType: string) {
  return Object.entries(data.bot_roles).filter(([, v]) => v.role_type === roleType).map(([user_id]) => ({ user_id }));
}

// ── VOICE STATS ───────────────────────────────────────────────────────────────
export function updateVoiceStats(guildId: string, userId: string, seconds: number) {
  if (!data.voice_stats[guildId]) data.voice_stats[guildId] = {};
  const s = data.voice_stats[guildId][userId] ?? { daily: 0, weekly: 0, alltime: 0 };
  s.daily += seconds; s.weekly += seconds; s.alltime += seconds;
  data.voice_stats[guildId][userId] = s;
  save();
}
export function getVoiceStats(guildId: string, userId: string): VoiceStat | undefined {
  return data.voice_stats[guildId]?.[userId];
}
export function getAllVoiceStats(guildId: string): Array<{ userId: string; stats: VoiceStat }> {
  const stats = data.voice_stats[guildId];
  if (!stats) return [];
  return Object.entries(stats).map(([userId, s]) => ({ userId, stats: s }));
}
export function setVoiceJoinTime(guildId: string, userId: string, time: number) {
  if (!data.voice_stats[guildId]) data.voice_stats[guildId] = {};
  if (!data.voice_stats[guildId][userId]) data.voice_stats[guildId][userId] = { daily: 0, weekly: 0, alltime: 0 };
  data.voice_stats[guildId][userId].last_join = time;
}
export function getVoiceJoinTime(guildId: string, userId: string): number | undefined {
  return data.voice_stats[guildId]?.[userId]?.last_join;
}
export function resetVoiceStats(guildId: string, userId: string) {
  if (data.voice_stats[guildId]?.[userId]) {
    const lastJoin = data.voice_stats[guildId][userId].last_join;
    data.voice_stats[guildId][userId] = { daily: 0, weekly: 0, alltime: 0, last_join: lastJoin };
    save();
  }
}
export function resetAllVoiceStats(guildId: string) {
  if (data.voice_stats[guildId]) {
    for (const userId in data.voice_stats[guildId]) {
      const lastJoin = data.voice_stats[guildId][userId].last_join;
      data.voice_stats[guildId][userId] = { daily: 0, weekly: 0, alltime: 0, last_join: lastJoin };
    }
    save();
  }
}

// ── MESSAGE STATS ─────────────────────────────────────────────────────────────
export function updateMessageStats(guildId: string, userId: string) {
  if (!data.message_stats[guildId]) data.message_stats[guildId] = {};
  const s = data.message_stats[guildId][userId] ?? { daily: 0, weekly: 0, alltime: 0 };
  s.daily++; s.weekly++; s.alltime++;
  data.message_stats[guildId][userId] = s;
  save();
}
export function getMessageStats(guildId: string, userId: string): MsgStat | undefined {
  return data.message_stats[guildId]?.[userId];
}
export function getAllMessageStats(guildId: string): Array<{ userId: string; stats: MsgStat }> {
  const stats = data.message_stats[guildId];
  if (!stats) return [];
  return Object.entries(stats).map(([userId, s]) => ({ userId, stats: s }));
}
export function resetMessageStats(guildId: string, userId: string) {
  if (data.message_stats[guildId]?.[userId]) {
    data.message_stats[guildId][userId] = { daily: 0, weekly: 0, alltime: 0 };
    save();
  }
}
export function resetAllMessageStats(guildId: string) {
  if (data.message_stats[guildId]) {
    for (const userId in data.message_stats[guildId]) {
      data.message_stats[guildId][userId] = { daily: 0, weekly: 0, alltime: 0 };
    }
    save();
  }
}

// ── VC BAN ────────────────────────────────────────────────────────────────────
export function isVcBanned(guildId: string, userId: string): boolean {
  return !!(data.vc_bans[`${guildId}:${userId}`]);
}
export function addVcBan(guildId: string, userId: string, reason: string, bannedBy: string) {
  data.vc_bans[`${guildId}:${userId}`] = { guild_id: guildId, user_id: userId, reason, banned_by: bannedBy };
  save();
}
export function removeVcBan(guildId: string, userId: string) {
  delete data.vc_bans[`${guildId}:${userId}`];
  save();
}

// ── WELCOME / LEAVE ───────────────────────────────────────────────────────────
export function getWelcomeSettings(guildId: string) { return data.welcome_settings[guildId]; }
export function setWelcomeSettings(guildId: string, s: WelcomeSetting) { data.welcome_settings[guildId] = s; save(); }
export function getLeaveSettings(guildId: string) { return data.leave_settings[guildId]; }
export function setLeaveSettings(guildId: string, s: WelcomeSetting) { data.leave_settings[guildId] = s; save(); }

// ── TEMP VC ───────────────────────────────────────────────────────────────────
export function getTempVcSettings(guildId: string) { return data.tempvc_settings[guildId]; }
export function setTempVcSettings(guildId: string, s: TempVcSetting) { data.tempvc_settings[guildId] = s; save(); }
export function updateTempVcSettings(guildId: string, patch: Partial<TempVcSetting>) {
  if (!data.tempvc_settings[guildId]) return;
  Object.assign(data.tempvc_settings[guildId], patch);
  save();
}
export function getActiveTempVc(channelId: string) { return data.active_tempvcs[channelId]; }
export function setActiveTempVc(channelId: string, t: TempVc) { data.active_tempvcs[channelId] = t; save(); }
export function deleteActiveTempVc(channelId: string) { delete data.active_tempvcs[channelId]; save(); }
export function updateTempVc(channelId: string, patch: Partial<TempVc>) {
  if (data.active_tempvcs[channelId]) { Object.assign(data.active_tempvcs[channelId], patch); save(); }
}

// ── BOT 24/7 ─────────────────────────────────────────────────────────────────
export function get247Channel(guildId: string) { return data.bot_247[guildId]; }
export function set247Channel(guildId: string, channelId: string) { data.bot_247[guildId] = channelId; save(); }
export function remove247Channel(guildId: string) { delete data.bot_247[guildId]; save(); }
export function getAll247() { return Object.entries(data.bot_247).map(([guild_id, channel_id]) => ({ guild_id, channel_id })); }

// ── BIO CARDS ─────────────────────────────────────────────────────────────────
export function getBio(guildId: string, userId: string): string | null {
  return data.bios[guildId]?.[userId] || null;
}
export function setBio(guildId: string, userId: string, bio: string) {
  if (!data.bios[guildId]) data.bios[guildId] = {};
  data.bios[guildId][userId] = bio;
  save();
}

// ── GIVEAWAYS ─────────────────────────────────────────────────────────────────
export function createGiveaway(
  messageId: string, channelId: string, guildId: string,
  prize: string, hostId: string, endTime: number, winnerCount: number
) {
  data.giveaways[messageId] = { messageId, channelId, guildId, prize, hostId, endTime, winnerCount, ended: false, winners: [] };
  save();
}
export function getGiveaway(messageId: string): Giveaway | undefined {
  return data.giveaways[messageId];
}
export function getAllGiveaways(): Record<string, Giveaway> {
  return data.giveaways ?? {};
}
export function endGiveawayInDB(messageId: string, winners: string[]) {
  if (data.giveaways[messageId]) {
    data.giveaways[messageId].ended = true;
    data.giveaways[messageId].winners = winners;
    save();
  }
}
export function deleteGiveaway(messageId: string) {
  delete data.giveaways[messageId];
  save();
}

// ── BOT CONFIG ────────────────────────────────────────────────────────────────
export function getBotConfig(key: keyof BotConfig): string | undefined {
  return data.bot_config[key];
}
export function setBotConfig(key: keyof BotConfig, value: string) {
  data.bot_config[key] = value;
  save();
}

// ── DAILY / WEEKLY STAT RESET SCHEDULER ──────────────────────────────────────
function getMsUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime() - now.getTime();
}

function getMsUntilNextMonday(): number {
  const now = new Date();
  const ms  = getMsUntilMidnight();
  const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
  return ms + (daysUntilMonday - 1) * 86400000;
}

export function startStatResetScheduler() {
  function scheduleDailyReset() {
    setTimeout(() => {
      for (const guildId in data.voice_stats) {
        for (const userId in data.voice_stats[guildId]) {
          data.voice_stats[guildId][userId].daily = 0;
        }
      }
      for (const guildId in data.message_stats) {
        for (const userId in data.message_stats[guildId]) {
          data.message_stats[guildId][userId].daily = 0;
        }
      }
      save();
      console.log('📅 Daily stats reset at midnight.');
      scheduleDailyReset();
    }, getMsUntilMidnight());
  }

  function scheduleWeeklyReset() {
    setTimeout(() => {
      for (const guildId in data.voice_stats) {
        for (const userId in data.voice_stats[guildId]) {
          data.voice_stats[guildId][userId].weekly = 0;
        }
      }
      for (const guildId in data.message_stats) {
        for (const userId in data.message_stats[guildId]) {
          data.message_stats[guildId][userId].weekly = 0;
        }
      }
      save();
      console.log('📆 Weekly stats reset on Monday.');
      scheduleWeeklyReset();
    }, getMsUntilNextMonday());
  }

  scheduleDailyReset();
  scheduleWeeklyReset();
}

// ── AUTORESPONDER ─────────────────────────────────────────────────────────────
export function getAutoresponder(userId: string): string | undefined { return data.autoresponder[userId]; }
export function setAutoresponder(userId: string, msg: string) { data.autoresponder[userId] = msg; save(); }
export function removeAutoresponder(userId: string) { delete data.autoresponder[userId]; save(); }

// ── AUTOREACT ─────────────────────────────────────────────────────────────────
export function getAutoreact(userId: string): string | undefined { return data.autoreact[userId]; }
export function setAutoreact(userId: string, emoji: string) { data.autoreact[userId] = emoji; save(); }
export function removeAutoreact(userId: string) { delete data.autoreact[userId]; save(); }

// ── TEMP ROLES ────────────────────────────────────────────────────────────────
export interface TempRoleEntry { guild_id: string; user_id: string; role_id: string; expires_at: number; given_by: string }
export function addTempRole(entry: TempRoleEntry) {
  data.temp_roles = data.temp_roles.filter(r => !(r.guild_id === entry.guild_id && r.user_id === entry.user_id && r.role_id === entry.role_id));
  data.temp_roles.push(entry); save();
}
export function getExpiredTempRoles(): TempRoleEntry[] {
  return data.temp_roles.filter(r => Date.now() >= r.expires_at) as TempRoleEntry[];
}
export function removeTempRole(guildId: string, userId: string, roleId: string) {
  data.temp_roles = data.temp_roles.filter(r => !(r.guild_id === guildId && r.user_id === userId && r.role_id === roleId));
  save();
}
export function getTempRolesForUser(guildId: string, userId: string): TempRoleEntry[] {
  return data.temp_roles.filter(r => r.guild_id === guildId && r.user_id === userId) as TempRoleEntry[];
}

// ── TICKET SYSTEM ─────────────────────────────────────────────────────────────
export function getTicketSettings(guildId: string): TicketSettings | undefined {
  return data.ticket_settings[guildId];
}
export function setTicketSettings(guildId: string, s: TicketSettings) {
  data.ticket_settings[guildId] = s;
  save();
}
export function updateTicketSettings(guildId: string, patch: Partial<TicketSettings>) {
  if (!data.ticket_settings[guildId]) return;
  Object.assign(data.ticket_settings[guildId], patch);
  save();
}
export function getActiveTicket(channelId: string): ActiveTicket | undefined {
  return data.active_tickets[channelId];
}
export function getActiveTicketByUser(guildId: string, userId: string): ActiveTicket | undefined {
  return Object.values(data.active_tickets).find(t => t.guild_id === guildId && t.user_id === userId);
}
export function createTicket(channelId: string, userId: string, guildId: string, type: string): number {
  if (!data.ticket_counter[guildId]) data.ticket_counter[guildId] = 0;
  data.ticket_counter[guildId]++;
  const num = data.ticket_counter[guildId];
  data.active_tickets[channelId] = { channel_id: channelId, user_id: userId, guild_id: guildId, type, created_at: Date.now(), ticket_number: num };
  save();
  return num;
}
export function deleteTicket(channelId: string) {
  delete data.active_tickets[channelId];
  save();
}

// ── AUTOMOD WHITELIST ─────────────────────────────────────────────────────────
export function getAutomodWhitelist(guildId: string): string[] {
  return data.automod_whitelist[guildId] ?? [];
}
export function addAutomodWhitelist(guildId: string, channelId: string) {
  if (!data.automod_whitelist[guildId]) data.automod_whitelist[guildId] = [];
  if (!data.automod_whitelist[guildId].includes(channelId)) {
    data.automod_whitelist[guildId].push(channelId);
    save();
  }
}
export function removeAutomodWhitelist(guildId: string, channelId: string) {
  if (!data.automod_whitelist[guildId]) return;
  data.automod_whitelist[guildId] = data.automod_whitelist[guildId].filter(id => id !== channelId);
  save();
}

// ── MEDIA-ONLY CHANNELS ───────────────────────────────────────────────────────
export function getMediaOnlyChannels(guildId: string): string[] {
  return data.media_only_channels[guildId] ?? [];
}
export function addMediaOnlyChannel(guildId: string, channelId: string) {
  if (!data.media_only_channels[guildId]) data.media_only_channels[guildId] = [];
  if (!data.media_only_channels[guildId].includes(channelId)) {
    data.media_only_channels[guildId].push(channelId);
    save();
  }
}
export function removeMediaOnlyChannel(guildId: string, channelId: string) {
  if (!data.media_only_channels[guildId]) return;
  data.media_only_channels[guildId] = data.media_only_channels[guildId].filter(id => id !== channelId);
  save();
}
export function isMediaOnlyChannel(guildId: string, channelId: string): boolean {
  return (data.media_only_channels[guildId] ?? []).includes(channelId);
}

// ── JAIL SYSTEM ───────────────────────────────────────────────────────────────
export interface JailSettingEntry { channel_id: string; role_id: string; enabled: boolean }
export function getJailSetting(guildId: string): JailSettingEntry | undefined {
  return data.jail_settings[guildId];
}
export function setJailSetting(guildId: string, s: JailSettingEntry) {
  data.jail_settings[guildId] = s; save();
}
export function updateJailSetting(guildId: string, patch: Partial<JailSettingEntry>) {
  if (!data.jail_settings[guildId]) return;
  Object.assign(data.jail_settings[guildId], patch); save();
}

export interface JailedUserEntry { guild_id: string; user_id: string; roles: string[]; jailed_by: string; reason: string; jailed_at: number }
export function getJailedUser(guildId: string, userId: string): JailedUserEntry | undefined {
  return data.jailed_users[`${guildId}:${userId}`];
}
export function setJailedUser(guildId: string, userId: string, entry: JailedUserEntry) {
  data.jailed_users[`${guildId}:${userId}`] = entry; save();
}
export function removeJailedUser(guildId: string, userId: string) {
  delete data.jailed_users[`${guildId}:${userId}`]; save();
}
export function getAllJailedUsers(guildId: string): JailedUserEntry[] {
  return Object.values(data.jailed_users).filter(j => j.guild_id === guildId);
}

// ── GUILD BANNERS / PFPS ──────────────────────────────────────────────────────
export function getGuildBanner(guildId: string): string | undefined { return data.guild_banners[guildId]; }
export function setGuildBanner(guildId: string, url: string) { data.guild_banners[guildId] = url; save(); }
export function getGuildPfp(guildId: string): string | undefined { return data.guild_pfps[guildId]; }
export function setGuildPfp(guildId: string, url: string) { data.guild_pfps[guildId] = url; save(); }

// ── GUILD BANNERS / PFPS ──────────────────────────────────────────────────────
// (already defined above — keeping this comment as a section marker)

// ── MUSIC: LIKED SONGS ────────────────────────────────────────────────────────
export interface LikedSongEntry {
  title: string; url: string; duration: number; durationStr: string;
  thumbnail: string; liked_at: number;
}

function getLikedStore(): Record<string, LikedSongEntry[]> {
  if (!(data as any).liked_songs) (data as any).liked_songs = {};
  return (data as any).liked_songs;
}

export function getLikedSongs(userId: string): LikedSongEntry[] {
  return getLikedStore()[userId] ?? [];
}
export function isLikedSong(userId: string, url: string): boolean {
  return getLikedSongs(userId).some(s => s.url === url);
}
export function addLikedSong(userId: string, song: LikedSongEntry) {
  const store = getLikedStore();
  if (!store[userId]) store[userId] = [];
  if (!store[userId].some(s => s.url === song.url)) {
    store[userId].unshift(song);
    save();
  }
}
export function removeLikedSong(userId: string, url: string) {
  const store = getLikedStore();
  if (store[userId]) {
    store[userId] = store[userId].filter(s => s.url !== url);
    save();
  }
}

// ── MUSIC: PLAYLISTS ──────────────────────────────────────────────────────────
export interface PlaylistSongEntry {
  title: string; url: string; duration: number; durationStr: string;
  thumbnail: string; added_at: number;
}
export interface PlaylistEntry {
  name: string; owner_id: string; songs: PlaylistSongEntry[]; created_at: number;
}

function getPlaylistStore(): Record<string, PlaylistEntry> {
  if (!(data as any).playlists) (data as any).playlists = {};
  return (data as any).playlists;
}

function playlistKey(userId: string, name: string) {
  return `${userId}::${name.toLowerCase()}`;
}

export function getUserPlaylists(userId: string): PlaylistEntry[] {
  const store = getPlaylistStore();
  return Object.values(store).filter(p => p.owner_id === userId);
}
export function getPlaylist(userId: string, name: string): PlaylistEntry | undefined {
  return getPlaylistStore()[playlistKey(userId, name)];
}
export function createPlaylist(userId: string, name: string) {
  const store = getPlaylistStore();
  store[playlistKey(userId, name)] = { name, owner_id: userId, songs: [], created_at: Date.now() };
  save();
}
export function deletePlaylist(userId: string, name: string) {
  delete getPlaylistStore()[playlistKey(userId, name)];
  save();
}
export function addToPlaylist(userId: string, name: string, song: PlaylistSongEntry) {
  const pl = getPlaylistStore()[playlistKey(userId, name)];
  if (!pl) return;
  pl.songs.push(song);
  save();
}
export function removeFromPlaylist(userId: string, name: string, index: number) {
  const pl = getPlaylistStore()[playlistKey(userId, name)];
  if (!pl) return;
  pl.songs.splice(index, 1);
  save();
}
export function getPlaylistSong(userId: string, name: string, index: number): PlaylistSongEntry | undefined {
  return getPlaylistStore()[playlistKey(userId, name)]?.songs[index];
}

// ── MUSIC PANEL ───────────────────────────────────────────────────────────────
export function getMusicPanel(guildId: string): { channel_id: string; message_id: string } | null {
  return data.music_panels?.[guildId] ?? null;
}
export function setMusicPanel(guildId: string, channelId: string, messageId: string) {
  if (!data.music_panels) data.music_panels = {};
  data.music_panels[guildId] = { channel_id: channelId, message_id: messageId };
  save();
}
export function deleteMusicPanel(guildId: string) {
  if (data.music_panels) { delete data.music_panels[guildId]; save(); }
}

// ── GENERIC DB REF ────────────────────────────────────────────────────────────
export const db = { data };

// ── WHITELIST SYSTEM ──────────────────────────────────────────────────────────
export function isUserWhitelisted(guildId: string, userId: string, permission: string): boolean {
  const perms = data.whitelist_data[guildId]?.[userId] ?? [];
  return perms.includes(permission) || perms.includes('all');
}

export function addUserWhitelist(guildId: string, userId: string, permission: string) {
  if (!data.whitelist_data[guildId]) data.whitelist_data[guildId] = {};
  if (!data.whitelist_data[guildId][userId]) data.whitelist_data[guildId][userId] = [];
  if (!data.whitelist_data[guildId][userId].includes(permission)) {
    data.whitelist_data[guildId][userId].push(permission);
    save();
  }
}

export function removeUserWhitelist(guildId: string, userId: string, permission?: string) {
  if (!data.whitelist_data[guildId]?.[userId]) return;
  if (!permission) {
    delete data.whitelist_data[guildId][userId];
  } else {
    data.whitelist_data[guildId][userId] = data.whitelist_data[guildId][userId].filter(p => p !== permission);
    if (!data.whitelist_data[guildId][userId].length) delete data.whitelist_data[guildId][userId];
  }
  save();
}

export function getUserWhitelistPerms(guildId: string, userId: string): string[] {
  return data.whitelist_data[guildId]?.[userId] ?? [];
}

export function getGuildWhitelistMap(guildId: string): Record<string, string[]> {
  return data.whitelist_data[guildId] ?? {};
}

export function getWhitelistPunishment(guildId: string): string {
  return data.whitelist_punishment[guildId] ?? 'warn';
}

export function setWhitelistPunishment(guildId: string, punishment: string) {
  data.whitelist_punishment[guildId] = punishment;
  save();
}

// ── WHITELIST AUDIT LOG ────────────────────────────────────────────────────────
export function addWhitelistLog(guildId: string, entry: WhitelistLogEntry) {
  if (!data.whitelist_log) data.whitelist_log = {};
  if (!data.whitelist_log[guildId]) data.whitelist_log[guildId] = [];
  data.whitelist_log[guildId].unshift(entry);
  if (data.whitelist_log[guildId].length > 50) data.whitelist_log[guildId].length = 50;
  save();
}

export function getWhitelistLog(guildId: string): WhitelistLogEntry[] {
  return data.whitelist_log?.[guildId] ?? [];
}
