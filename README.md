# postnotify_bot

Automated Discord notification bot that sends rich alerts when TikTok creators or YouTube channels go live. Runs continuously through a **GitHub Actions self-triggering loop**—no dedicated server required.

---

## Features

- 🔴 Automatic TikTok and YouTube live detection (~5-minute polling interval)
- ▶️ Active YouTube livestream and Premiere detection through unofficial internal web API data
- 🧭 Separate Discord channel and mention routing for YouTube alerts
- 🖼️ Platform-aware 1280×720 preview image with blurred background, avatar, title, and statistics
- 📨 Discord rich embeds with viewer count, start time, platform, and action buttons
- 🔕 Platform-prefixed session deduplication prevents repeated notifications for one broadcast
- 🔒 Workflow concurrency guard prevents overlapping runs and duplicate sends
- 💾 Persistent notification state through repository-backed `state.json`
- 🧹 Automatic cleanup keeps only the latest workflow run
- 🔄 Daily keepalive protects scheduled workflows from GitHub's 60-day inactivity disablement
- ♾️ Self-triggering loop runs without an external scheduler or server

---

## How It Works

```text
[manual dispatch or daily cron at 00:00 UTC]
        ↓
[Check configured TikTok usernames and YouTube channel IDs in parallel]
        ↓
[Detect active TikTok lives, YouTube lives, and airing Premieres]
        ↓
[Ignore session if platform:creator:broadcast ID already exists in state]
        ↓
[Generate platform-aware 1280×720 JPEG preview with Sharp]
        ↓
[Route TikTok or YouTube embed to its configured Discord channel]
        ↓
[Commit state.json, delete old runs, then sleep 300 seconds]
        ↓
[repository_dispatch triggers next run]
        ↓
[Loop continues]
```

---

## Setup Guide

### Step 1 — Fork This Repository

Fork to your own GitHub account so you can add Secrets and run Actions.

```bash
git clone https://github.com/YOUR_USERNAME/postnotify_bot
cd postnotify_bot
```

### Step 2 — Create a Discord Bot

1. Open the [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application → **Bot** → copy the **Bot Token**
3. Invite the bot to your server with permissions: **Send Messages** + **Embed Links** + **Attach Files**
4. Copy the **Channel ID** of the target notification channel (right-click channel → Copy Channel ID)

### Step 3 — Create a GitHub Personal Access Token (LOOP\_TOKEN)

Required so the workflow can trigger itself.

1. Go to [GitHub Settings → Developer Settings → Personal Access Tokens (Classic)](https://github.com/settings/tokens)
2. Click **Generate new token (classic)**
3. Name it: `postnotify-loop-token`
4. Check scope: ✅ `repo` (all sub-scopes)
5. Copy the generated token

### Step 4 — Configure GitHub Secrets

Go to your repository → **Settings → Secrets and variables → Actions → New repository secret**

| Secret | Required | Description |
|--------|:--------:|-------------|
| `DISCORD_BOT_TOKEN` | ✅ | Shared Discord bot token from Step 2 |
| `DISCORD_CHANNEL_ID` | ✅ | Discord channel for TikTok alerts |
| `TIKTOK_USERNAMES` | ✅ | Comma-separated TikTok usernames without `@` |
| `LOOP_TOKEN` | ✅ | GitHub PAT from Step 3 |
| `DISCORD_MENTION` | ❌ | Optional ping for TikTok alerts |
| `YOUTUBE_CHANNEL_IDS` | ❌ | Comma-separated YouTube channel IDs beginning with `UC` |
| `YOUTUBE_DISCORD_CHANNEL_ID` | Conditional | Required when `YOUTUBE_CHANNEL_IDS` is set; receives YouTube alerts |
| `YOUTUBE_DISCORD_MENTION` | ❌ | Optional ping for YouTube alerts |

**Creator examples:**

```text
TIKTOK_USERNAMES=streamer1,streamer2,streamer3
YOUTUBE_CHANNEL_IDS=UCxxxxxxxxxxxxxxxxxxxxxx,UCyyyyyyyyyyyyyyyyyyyyyy
```

Find a YouTube channel ID in the channel page source, an About-page URL, or through a channel ID lookup. Use the immutable `UC...` ID, not a handle such as `@creator`.

YouTube monitoring activates only when both `YOUTUBE_CHANNEL_IDS` and `YOUTUBE_DISCORD_CHANNEL_ID` are present. TikTok configuration remains required.

**Mention examples:**

| Value | Effect |
|-------|--------|
| `@everyone` | Pings everyone |
| `@here` | Pings online members |
| `<@&ROLE_ID>` | Pings a specific role |
| `<@USER_ID>` | Pings a specific user |

Leave either mention secret unset to send that platform's notification without a ping.

### Step 5 — Enable GitHub Actions

1. Go to the **Actions** tab in your repository
2. Click **"I understand my workflows, go ahead and enable them"** if prompted
3. Select **PostNotify Live Monitor** → click **Run workflow** to start the loop

The loop runs automatically afterward. A daily cron at `00:00 UTC` acts as a safety net to restart the loop if it ever dies.

---

## Stopping the Loop

1. Go to the **Actions** tab
2. Select the running workflow (🟡 In progress)
3. Click **Cancel workflow**

Alternatively, revoke the `LOOP_TOKEN` secret to permanently stop the loop.

---

TikTok alert:

```text
🔴 @streamer123 sedang LIVE di TikTok!
TikTok LIVE • @streamer123
📱 Platform: TikTok Live
[📺 Tonton Live] [👤 Lihat Profil]
```

YouTube alert:

```text
🔴 Example Channel sedang LIVE di YouTube!
YouTube LIVE • Example Channel
📱 Platform: YouTube Live
[📺 Tonton Live] [👤 Lihat Channel]
```

Both embeds upload a generated 1280×720 preview. TikTok uses its pink accent; YouTube uses its red accent. When a remote thumbnail or avatar is unavailable, the generator produces a local platform-aware fallback.

---

## Configuration

All runtime configuration comes from **GitHub Secrets**; no `.env` file is required in Actions.

### Changing Monitored Creators

Update `TIKTOK_USERNAMES` or `YOUTUBE_CHANNEL_IDS` with comma-separated values. TikTok entries omit `@`; YouTube entries use channel IDs beginning with `UC`.

### YouTube Detection

YouTube checks use the channel `/live` page and embedded `ytInitialData` first. If no active renderer is found, the bot performs one bounded Innertube `browse` request using the page's internal client key. No official YouTube API key or quota is required.

The detector only reports broadcasts marked active now. Scheduled streams and Premieres that have not started are ignored. Viewer count or start time may be unavailable in unofficial responses; alerts still send with safe fallback values.

### Separate Discord Routing

TikTok alerts use `DISCORD_CHANNEL_ID` and `DISCORD_MENTION`. YouTube alerts use `YOUTUBE_DISCORD_CHANNEL_ID` and `YOUTUBE_DISCORD_MENTION`. Both routes share `DISCORD_BOT_TOKEN`.

### Changing the Polling Interval

Edit `sleep 300` in `.github/workflows/live-monitor.yml`. Default: 300 seconds (approximately 5 minutes).

---

## GitHub Actions Keepalive

GitHub automatically **disables** scheduled workflows after **60 days of inactivity** (particularly on public repositories and forks).

This project includes [`liskin/gh-workflow-keepalive@v1`](https://github.com/liskin/gh-workflow-keepalive) to prevent that.

**How it works:**
- On every `schedule` trigger (daily cron at `00:00 UTC`), a separate `workflow-keepalive` job runs
- It calls the GitHub API to re-enable the workflow if GitHub has marked it as disabled
- It does **not** create dummy commits or modify Git history

**For forks:**
- A newly forked repository may still require one manual enable
- Go to **Actions → PostNotify Live Monitor → Enable workflow**
- After the first scheduled run, the keepalive job prevents automatic disabling

If GitHub disables the workflow anyway:
1. Open the **Actions** tab
2. Select **PostNotify Live Monitor**
3. Click **Enable workflow**
4. Optionally click **Run workflow** once to confirm everything works

---

## Project Structure

```text
postnotify_bot/
├── package.json                        # Dependencies and scripts
├── tsconfig.json                       # TypeScript configuration
├── state.json                          # Persisted platform session keys
├── .github/
│   └── workflows/
│       └── live-monitor.yml            # Loop, cron, Discord secrets, and keepalive
└── src/
    ├── app.ts                          # Multi-platform orchestration and routing
    ├── types.ts                        # Shared live result and state types
    ├── state.ts                        # State load, save, migration, and deduplication
    ├── config/
    │   └── env.ts                      # GitHub Actions environment validation
    ├── tiktok/
    │   └── checkLive.ts               # TikTok connector and webcast API detector
    ├── youtube/
    │   └── checkLive.ts               # YouTube page data and Innertube detector
    └── discord/
        ├── sendEmbed.ts               # Platform-aware multipart Discord sender
        └── thumbnail-generator.ts     # Platform-aware 1280×720 JPEG generator
```

---

## Requirements

- **Bun** (used in GitHub Actions via `oven-sh/setup-bun@v2`)
- **Node.js 18+** compatible runtime (for native `fetch`, `FormData`, `Blob`)
- `sharp` for image generation (installed via `npm install sharp`)

Dependencies are installed automatically during workflow runs.

---

## ⚠️ Important Notes

- **Unofficial APIs:** TikTok checks use `tiktok-live-connector` and internal webcast data. YouTube checks use public page data and unofficial Innertube endpoints. Either platform can change its payload without notice.
- **YouTube availability:** GitHub Actions IP addresses may occasionally receive consent pages, throttling, or blocking. A failed channel check logs a warning instead of crashing the full run.
- **Viewer metadata:** YouTube viewer count and exact start time are best-effort because unofficial payloads do not always expose them.
- **GitHub Actions minutes:** Public repositories receive unlimited standard Actions minutes. Private repository quotas depend on the account plan; a continuously sleeping loop consumes billed runner time.
- **State management:** `state.json` stores `platform:creator:broadcast` keys and is committed after each run.
- **Concurrency:** `cancel-in-progress: true` allows only one active workflow in the `live-monitor` group.

---

## Disclaimer

This project depends on unofficial TikTok and YouTube interfaces. Use it at your own risk, follow both platforms' Terms of Service, and expect detector maintenance when upstream payloads change.
