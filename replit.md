# Xyla Bot

A full-featured Discord bot with music streaming, moderation, fun commands, giveaways, tickets, temp VCs, AFK, whitelist system, and much more.

## Run & Operate

- `pnpm --filter @workspace/discord-bot run dev` — start the bot (workflow: **Xyla Bot**)
- Workflow auto-restarts on code changes via the "Xyla Bot" workflow

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- discord.js v14, @discordjs/voice, play-dl, yt-dlp-exec
- Flat-file JSON database (`bot-data.json`) — no PostgreSQL needed
- Runtime: `tsx` (no build step)
- yt-dlp binary: `/home/runner/workspace/.pythonlibs/bin/yt-dlp` (installed via pip)

## Where things live

```
artifacts/discord-bot/
  src/
    index.ts            — entry point, loads commands + events, health server on PORT 3999
    client.ts           — BotClient (extends discord.js Client)
    database.ts         — flat-file JSON DB helpers (bot-data.json)
    commands/           — all command files (24 files)
    events/             — event handlers (10 files)
    music/              — MusicManager.ts (yt-dlp + ffmpeg audio pipeline)
    utils/              — embeds.ts, helpers.ts, permissions.ts, state.ts, whitelist.ts
```

## Architecture decisions

- **Flat-file DB**: All persistent data in `bot-data.json` (guilds, warnings, whitelist, music panels, etc.) — no DB provisioning needed.
- **Prefix**: `!` for regular users. Bot owner (`1391063304419545128`) and staff skip prefix checks entirely.
- **Music streaming**: yt-dlp → ffmpeg (raw PCM) → @discordjs/voice. yt-dlp uses iOS player client first to bypass YouTube bot-detection, with android_vr → tv_embedded → web_creator fallbacks.
- **Per-guild bot avatar/banner**: `!setbotguildpfp` and `!setbotguildbanner` call `PATCH /guilds/{id}/members/@me` via Discord REST API directly (rate-limited by Discord — allow a few hours between changes).
- **Preset avatar/banner** (`!setprepfp` / `!setprebanner`): Stores a URL in the DB for display in bot embeds — separate from the actual Discord guild avatar.

## Product

Xyla Bot features: music playback (YouTube + Spotify), full moderation suite, giveaways, ticket system, temp VCs, AFK tracking, bio system, NSFW commands, automod, welcome messages, fun/percentage/reaction GIFs, jail system, role management, whitelist anti-abuse, server stats, and owner-only admin controls.

## User preferences

- Bot owner ID: `1391063304419545128`
- Bot prefix: `!`

## Gotchas

- yt-dlp must be installed via pip — the binary path is `.pythonlibs/bin/yt-dlp`. If music breaks, run `pip install yt-dlp --upgrade`.
- `ffmpeg-static` and `yt-dlp-exec` npm build scripts are blocked by pnpm by default — run `pnpm approve-builds` if reinstalling from scratch.
- Discord rate-limits guild member avatar/banner changes (PATCH /guilds/{id}/members/@me) — only a few changes per hour are allowed.
- The health server listens on port 3999 which is not in Replit's supported workflow port list, so the workflow is configured without `waitForPort` (console output type).

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
