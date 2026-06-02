let maintenanceMode = false;
const suspendedGuilds = new Set<string>();

export function isMaintenanceMode(): boolean {
  return maintenanceMode;
}
export function setMaintenanceMode(value: boolean): void {
  maintenanceMode = value;
}

// ── PER-GUILD SUSPENSION ─────────────────────────────────────────────────────
export function suspendGuild(guildId: string): void {
  suspendedGuilds.add(guildId);
}
export function resumeGuild(guildId: string): void {
  suspendedGuilds.delete(guildId);
}
export function isGuildSuspended(guildId: string): boolean {
  return suspendedGuilds.has(guildId);
}
export function getSuspendedGuilds(): string[] {
  return Array.from(suspendedGuilds);
}
