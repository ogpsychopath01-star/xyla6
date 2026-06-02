---
name: Xyla Bot — music fix and workflow quirks
description: yt-dlp client strategy for YouTube streaming + Replit workflow port constraint for the discord bot
---

## yt-dlp YouTube streaming fix

YouTube bot-detection blocks the default yt-dlp client in 2025/2026. The fix is to force the iOS player client, which YouTube still serves cleanly without challenges.

**Attempt order in getDirectAudioUrl():**
1. `--extractor-args "youtube:player_client=ios"` — most reliable, returns m4a
2. `--extractor-args "youtube:player_client=android_vr"` — returns seekable webm/opus
3. `--extractor-args "youtube:player_client=tv_embedded"`
4. `--extractor-args "youtube:player_client=web_creator"`
5. Default client (no extractor-args)
6. `-f best` fallback

Also add `--force-ipv4` and `--no-check-certificate` to every attempt.

**Why:** YouTube detects server-side requests and blocks the default web client. Mobile/TV clients are trusted and return audio URLs without bot challenges.

**How to apply:** Any time yt-dlp fails with "Sign in" or "bot" errors, ensure iOS client is the first attempt.

## yt-dlp binary location

Installed via pip: `/home/runner/workspace/.pythonlibs/bin/yt-dlp`
If music breaks after repl restart: `pip install yt-dlp --upgrade`

## Replit workflow port constraint

The discord bot health server runs on port 3999. Replit only supports these ports for workflow `waitForPort`: 3000, 3001, 3002, 3003, 4200, 5000, 5173, 6000, 6800, 8000, 8008, 8080, 8099, 9000.

**Fix:** Configure the workflow with `outputType: "console"` and NO `waitForPort`. The workflow runs fine but Replit won't do HTTP health-check detection on it.

## pnpm build script approval

`ffmpeg-static` and `yt-dlp-exec` have their npm build scripts blocked by pnpm by default. Run `pnpm approve-builds` after fresh install to enable them.
