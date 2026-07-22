# postnotify_bot

Automated Discord notification bot that sends rich alerts when TikTok streamers go live. Runs 24/7 via a **GitHub Actions self-triggering loop** — no server, no cost.

---

## Features

- 🔴 Automatic TikTok live detection (~5-minute polling interval)
- 🖼️ Auto-generated landscape preview image (1280×720 — blurred background, avatar, title, stats)
- 📨 Discord rich embed with viewer count, start time, and two action buttons
- 🔕 Deduplication: no repeated notifications for the same live session
- 🔒 Concurrency guard: only one workflow runs at a time, preventing duplicate sends
- 💾 Persistent state via `state.json` committed back to the repository
- 🧹 Auto-cleanup: old workflow runs are deleted automatically
- 🔄 Keepalive: prevents GitHub from auto-disabling scheduled workflows after 60 days of inactivity
- ♾️ Self-triggering loop — runs indefinitely without an external server

---

## How It Works

```text
[workflow_dispatch or daily cron at 00:00 UTC]
        ↓
  [Check TikTok live status for each configured streamer]
        ↓
  [If live and not yet notified for this session:]
        ↓
  [Generate 1280×720 JPEG preview image (Sharp)]
        ↓
  [Send Discord embed + upload preview via multipart FormData]
        ↓
  [Commit state.json to mark session as notified]
        ↓
  [Delete old workflow runs (keep only the latest)]
        ↓
  [Sleep 300 seconds]
        ↓
  [repository_dispatch → trigger next run]
        ↓
  [Loop continues ♾️]
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
| `DISCORD_BOT_TOKEN` | ✅ | Discord bot token from Step 2 |
| `DISCORD_CHANNEL_ID` | ✅ | Target channel ID |
| `TIKTOK_USERNAMES` | ✅ | Comma-separated TikTok usernames (without `@`) |
| `LOOP_TOKEN` | ✅ | GitHub PAT from Step 3 |
| `DISCORD_MENTION` | ❌ | Optional ping string — see examples below |

**`TIKTOK_USERNAMES` example:**
```
streamer1,streamer2,streamer3
```

**`DISCORD_MENTION` examples:**

| Value | Effect |
|-------|--------|
| `@everyone` | Pings everyone |
| `@here` | Pings online members |
| `<@&ROLE_ID>` | Pings a specific role |
| `<@USER_ID>` | Pings a specific user |

If `DISCORD_MENTION` is not set, the notification is sent without any ping.

### Step 5 — Enable GitHub Actions

1. Go to the **Actions** tab in your repository
2. Click **"I understand my workflows, go ahead and enable them"** if prompted
3. Select **TikTok Live Monitor** → click **Run workflow** to start the loop

The loop runs automatically afterward. A daily cron at `00:00 UTC` acts as a safety net to restart the loop if it ever dies.

---

## Stopping the Loop

1. Go to the **Actions** tab
2. Select the running workflow (🟡 In progress)
3. Click **Cancel workflow**

Alternatively, revoke the `LOOP_TOKEN` secret to permanently stop the loop.

---

## Discord Notification Preview

```text
@BOT  🔴 @streamer123 sedang LIVE di TikTok!

┌──────────────────────────────────────────────────┐
│ TikTok LIVE • @streamer123              [avatar] │  ← author
│                                                  │
│ 📺 FLASH SALE EVERY HOUR                        │  ← stream title (clickable)
│                                                  │
│ 🔴 LIVE SEKARANG                                │
│                                                  │
│ @streamer123 sedang melakukan siaran langsung.   │
│ Masuk sekarang sebelum live berakhir.            │
│                                                  │
│ 👁️ Penonton: 1.234                              │
│ ⏱️ Dimulai: 14 minutes ago                      │
│ 📱 Platform: TikTok Live                        │
│                                                  │
│ [Generated 1280×720 preview image]               │
│                                                  │
│ PostNotify • TikTok Live Alert  •  Today at ...  │
├──────────────────────────────────────────────────┤
│  📺 Tonton Live        👤 Lihat Profil           │  ← link buttons
└──────────────────────────────────────────────────┘
```

The attached preview image contains: blurred live thumbnail as background, rounded portrait poster on the right, circular avatar + "LIVE SEKARANG" badge + title + viewer/duration statistics on the left.

---

## Configuration

All configuration is handled via **GitHub Secrets** — no `.env` file needed.

### Adding or Removing Streamers

Edit the `TIKTOK_USERNAMES` secret in GitHub Actions Secrets:

```
streamer1,streamer2,streamer3
```

Usernames without `@`, separated by commas.

### Changing the Polling Interval

Edit `sleep 300` in `.github/workflows/live-monitor.yml`. Default is 300 seconds (5 minutes).

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
- Go to **Actions → TikTok Live Monitor → Enable workflow**
- After the first scheduled run, the keepalive job prevents automatic disabling

If GitHub disables the workflow anyway:
1. Open the **Actions** tab
2. Select **TikTok Live Monitor**
3. Click **Enable workflow**
4. Optionally click **Run workflow** once to confirm everything works

---

## Project Structure

```text
postnotify_bot/
├── package.json                        # Dependencies and scripts
├── tsconfig.json                       # TypeScript configuration
├── state.json                          # Persisted live session state (committed to repo)
├── .github/
│   └── workflows/
│       └── live-monitor.yml            # Self-triggering loop + daily cron + keepalive
└── src/
    ├── app.ts                          # Main runner — orchestrates all modules
    ├── types.ts                        # TypeScript type definitions
    ├── state.ts                        # State load/save/dedup logic
    ├── config/
    │   └── env.ts                      # Environment variable validation
    ├── tiktok/
    │   └── checkLive.ts               # TikTok live checker (fetchIsLive + webcast API)
    └── discord/
        ├── sendEmbed.ts               # Discord notification sender (multipart FormData)
        └── thumbnail-generator.ts     # 1280×720 JPEG preview generator (Sharp)
```

---

## Requirements

- **Bun** (used in GitHub Actions via `oven-sh/setup-bun@v2`)
- **Node.js 18+** compatible runtime (for native `fetch`, `FormData`, `Blob`)
- `sharp` for image generation (installed via `npm install sharp`)

Dependencies are installed automatically during workflow runs.

---

## ⚠️ Important Notes

- **Unofficial API**: This bot uses `tiktok-live-connector` and TikTok's internal webcast API. TikTok may change their API at any time without notice.
- **GitHub Actions minutes**: For **public** repositories, Actions minutes are unlimited. For **private** repositories, the free tier provides 2,000 minutes/month — at a 5-minute interval this bot consumes approximately 290 minutes/day.
- **State management**: `state.json` is committed to the repository after each run to persist live session state across runs.
- **Concurrency**: `cancel-in-progress: true` ensures only one workflow instance is active at a time, preventing race conditions and duplicate notifications.

---

## Disclaimer

This project uses unofficial TikTok APIs. Use at your own risk. The author is not responsible for any consequences arising from its use. Ensure your usage complies with TikTok's Terms of Service.
