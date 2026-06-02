import { GuildMember, PermissionFlagsBits } from 'discord.js';
import { getBotRole } from '../database.js';

export const BOT_OWNER_ID = '1391063304419545128';
export const PREFIX = '!';

export function isBotOwner(userId: string): boolean {
  return userId === BOT_OWNER_ID;
}

export function isBotStaff(userId: string): boolean {
  if (isBotOwner(userId)) return true;
  const role = getBotRole(userId);
  return role === 'developer' || role === 'helper';
}

export function canModerate(mod: GuildMember, target: GuildMember): boolean {
  if (mod.guild.ownerId === mod.id) return true;
  if (target.guild.ownerId === target.id) return false;
  return mod.roles.highest.comparePositionTo(target.roles.highest) > 0;
}

export function hasPermission(member: GuildMember, ...perms: bigint[]): boolean {
  if (member.guild.ownerId === member.id) return true;
  return member.permissions.has(perms as bigint[]);
}

export const Perms = PermissionFlagsBits;
