# 🔴 postnotify\_bot

> Discord bot yang mengirim notifikasi otomatis ketika streamer TikTok mulai live.
> Berjalan 24/7 via **GitHub Actions self-triggering loop** — tanpa server, tanpa biaya.

---

## ✨ Fitur

- 🔴 Deteksi live TikTok secara otomatis (~5 menit interval)
- 🖼️ Preview gambar landscape 1280×720 yang di-generate otomatis (background blur, avatar, judul, statistik)
- 📨 Notifikasi Discord dengan rich embed (penonton, waktu mulai, tombol Tonton Live & Lihat Profil)
- 🔕 Anti-spam: tidak mengirim notifikasi duplikat untuk sesi live yang sama
- 🔒 Concurrency guard: hanya 1 workflow aktif sekaligus, mencegah duplikat
- 💾 State persisten via `state.json` yang di-commit ke repo
- 🧹 Auto-cleanup: workflow run lama dihapus otomatis
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
3. Invite bot ke server kamu dengan permission **Send Messages** + **Embed Links** + **Attach Files**
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

> **Tip**: `DISCORD_MENTION` bersifat opsional. Jika tidak diset, notifikasi dikirim tanpa mention. Mendukung role mention (`<@&ID>`), user mention (`<@ID>`), `@everyone`, dan `@here`.

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
@BOT 🔴 @streamer123 sedang LIVE di TikTok!

┌─────────────────────────────────────────┐
│ TikTok LIVE • @streamer123              │  ← author + avatar
│                                         │
│ 📺 Gaming bareng subscriber             │  ← judul live (clickable)
│                                         │
│ 🔴 LIVE SEKARANG                        │
│                                         │
│ @streamer123 sedang melakukan siaran     │
│ langsung. Masuk sekarang sebelum live    │
│ berakhir.                               │
│                                         │
│ 👁️ Penonton: 1.234                      │
│ ⏱️ Dimulai: 5 menit yang lalu           │
│ 📱 Platform: TikTok Live               │
│                                         │
│ [preview landscape 1280×720]            │
│                                         │
│ PostNotify • TikTok Live Alert          │
├─────────────────────────────────────────┤
│ 📺 Tonton Live    👤 Lihat Profil       │  ← button links
└─────────────────────────────────────────┘
```

Preview image berisi: background blur dari thumbnail live, poster portrait di kanan, avatar + username + badge "LIVE SEKARANG" + judul + statistik penonton & durasi di kiri.

---

## ⚙️ Konfigurasi

Semua konfigurasi dilakukan via **GitHub Secrets** — tidak ada file `.env` yang perlu diedit.

### Menambah / menghapus streamer

Edit secret `TIKTOK_USERNAMES` di GitHub Secrets:

```
streamer1,streamer2,streamer3
```

Username tanpa `@`. Pisahkan dengan koma.

### Mengubah interval polling

Edit `sleep 300` di `.github/workflows/live-monitor.yml` (default: 300 detik = 5 menit).

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
│   └── checkLive.ts                 ← TikTok live checker (HTTP API)
└── discord/
    ├── sendEmbed.ts                 ← Discord notifikasi + FormData upload
    └── thumbnail-generator.ts       ← Preview image generator (Sharp)
state.json                           ← Persisted state (committed to repo)
```

**Loop pattern:**
```
[workflow_dispatch or schedule cron]
        ↓
  [check TikTok live status]
        ↓
  [generate preview image + send Discord notification]
        ↓
  [commit state.json]
        ↓
  [cleanup old workflow runs]
        ↓
  [sleep 300 seconds]
        ↓
  [repository_dispatch → trigger next run]
        ↓
  [loop continues ♾️]
```

---

## ⚠️ Catatan Penting

- **API tidak resmi**: Bot ini menggunakan `tiktok-live-connector` + TikTok webcast API internal. TikTok dapat mengubah API kapan saja.
- **GitHub Actions minutes**: Self-triggering loop mengonsumsi GitHub Actions minutes. Untuk repo **public**, minutes tidak terbatas. Untuk repo **private**, akun gratis mendapat 2.000 menit/bulan — dengan interval 5 menit, bot ini mengonsumsi sekitar ~290 menit/hari.
- **Loop otomatis restart**: Setiap hari pukul 00:00 UTC, cron schedule akan memulai ulang loop jika sebelumnya mati.
- **Concurrency**: Hanya 1 workflow run aktif sekaligus (`cancel-in-progress: true`), mencegah notifikasi duplikat.
- **Dependency**: Memerlukan `sharp` untuk generate preview image.

---

## 📄 License

MIT — lihat [LICENSE](LICENSE)
