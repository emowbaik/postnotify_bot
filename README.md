# 🔴 postnotify\_bot

> Discord bot yang mengirim notifikasi otomatis ketika streamer TikTok mulai live.
> Berjalan 24/7 via **GitHub Actions self-triggering loop** — tanpa server, tanpa biaya.

---

## ✨ Fitur

- 🔴 Deteksi live TikTok secara otomatis (~1 menit delay)
- 📨 Notifikasi Discord dengan rich embed (thumbnail, judul, viewer count, waktu mulai)
- 🔕 Anti-spam: tidak mengirim notifikasi duplikat untuk sesi live yang sama
- 💾 State persisten via `state.json` yang di-commit ke repo
- ♾️ Self-triggering loop — berjalan terus tanpa server eksternal

---

## 🛠️ Setup

### 1. Fork / Clone repositori ini

```bash
git clone https://github.com/YOUR_USERNAME/postnotify_bot
cd postnotify_bot
```

### 2. Buat Discord Bot

1. Buka [Discord Developer Portal](https://discord.com/developers/applications)
2. Buat aplikasi baru → **Bot** → salin **Bot Token**
3. Invite bot ke server kamu dengan permission **Send Messages** + **Embed Links**
4. Salin **Channel ID** dari channel tujuan notifikasi (klik kanan channel → Copy Channel ID)

### 3. Buat GitHub Personal Access Token (LOOP\_TOKEN)

Ini dibutuhkan agar workflow bisa memicu dirinya sendiri.

1. Buka [GitHub Settings → Developer Settings → Personal Access Tokens (Classic)](https://github.com/settings/tokens)
2. Klik **Generate new token (classic)**
3. Beri nama: `postnotify-loop-token`
4. Centang scope: ✅ `repo` (seluruh cakupan di bawahnya)
5. Salin token yang muncul

### 4. Tambahkan GitHub Secrets

Buka repositori GitHub → **Settings → Secrets and variables → Actions → New repository secret**

| Secret | Nilai | Contoh |
|---|---|---|
| `DISCORD_BOT_TOKEN` | Token bot Discord | `MTIzNDU2Nzg5...` |
| `DISCORD_CHANNEL_ID` | ID channel tujuan | `1234567890123456789` |
| `DISCORD_MENTION` | Role/user untuk di-ping *(opsional)* | `<@&987654321>` atau `@everyone` |
| `TIKTOK_USERNAMES` | Comma-separated username TikTok | `streamer1,streamer2,streamer3` |
| `LOOP_TOKEN` | GitHub PAT dari langkah 3 | `ghp_xxxxxxxxxxxx` |

> **Tip**: `DISCORD_MENTION` bersifat opsional. Jika tidak diset, notifikasi dikirim tanpa mention.

### 5. Jalankan bot pertama kali

1. Buka tab **Actions** di repositori GitHub kamu
2. Pilih workflow **"TikTok Live Monitor"**
3. Klik **Run workflow** → **Run workflow**
4. Loop akan berjalan otomatis setelahnya!

---

## 📋 Cara Menghentikan Loop

1. Buka tab **Actions**
2. Pilih run yang sedang berjalan (status 🟡 In progress)
3. Klik **Cancel workflow**

Loop juga bisa dihentikan dengan me-revoke `LOOP_TOKEN`.

---

## 🔔 Contoh Notifikasi Discord

```
<@&ROLE_ID> 🔴 streamer123 sedang LIVE!

┌─────────────────────────────────────┐
│ 🔴 streamer123 sedang LIVE di TikTok│
│                                     │
│ 📺 Judul   Gaming bareng subscriber │
│ 👥 Viewers  1,234                   │
│ 🕐 Mulai    3 menit yang lalu       │
│                                     │
│ [thumbnail gambar live]             │
│                                     │
│ TikTok Live Notifier • postnotify_bot│
└─────────────────────────────────────┘
```

---

## ⚙️ Konfigurasi

Semua konfigurasi dilakukan via **GitHub Secrets** — tidak ada file `.env` yang perlu diedit.

### Menambah / menghapus streamer

Edit secret `TIKTOK_USERNAMES` di GitHub Secrets:

```
streamer1,streamer2,streamer3
```

Username tanpa `@`. Pisahkan dengan koma.

---

## 🏗️ Arsitektur

```
.github/workflows/live-monitor.yml   ← Self-triggering GitHub Actions loop
src/
├── app.ts                           ← Main runner
├── types.ts                         ← TypeScript types
├── state.ts                         ← State management (state.json)
├── config/
│   └── env.ts                       ← Env variable validation
├── tiktok/
│   └── checkLive.ts                 ← TikTok live status checker
└── discord/
    └── sendEmbed.ts                 ← Discord rich embed sender
state.json                           ← Persisted state (committed to repo)
```

**Loop pattern:**
```
[workflow_dispatch or schedule cron]
        ↓
  [check TikTok live status]
        ↓
  [send Discord notification if new live]
        ↓
  [commit state.json]
        ↓
  [sleep 60 seconds]
        ↓
  [repository_dispatch → trigger next run]
        ↓
  [loop continues ♾️]
```

---

## ⚠️ Catatan Penting

- **API tidak resmi**: Bot ini menggunakan `tiktok-live-connector` yang memanfaatkan API internal TikTok. TikTok dapat mengubah API kapan saja.
- **GitHub Actions minutes**: Self-triggering loop mengonsumsi GitHub Actions minutes. Akun gratis mendapat 2,000 menit/bulan. Dengan interval ~1 menit, bot ini mengonsumsi sekitar 1,440 menit/hari — pertimbangkan untuk meningkatkan sleep duration jika minutes terbatas.
- **Loop otomatis restart**: Setiap hari pukul 00:00 UTC, cron schedule akan memulai ulang loop jika sebelumnya mati.

---

## 📄 License

MIT — lihat [LICENSE](LICENSE)
