# 🎬 StreamHub — Private Cinema & Multi-Device Watch Party

A next-generation streaming and synchronized watch party platform built with **Next.js 16**, **Node.js Express**, **Socket.io**, and **SecurePool** (`securepool@1.1.3`) authentication. Features an ultra-responsive Netflix-inspired dark aesthetic, HTTP 206 Partial Content Range video streaming, live cross-device watch history, and real-time synchronized playback rooms with chat and emoji reactions.

Integrated with the **Internet Archive Open Movies API** for streaming free feature films and public domain classics with complete metadata.

> 📖 **Developer & AI Prompt Blueprint**: Looking to extend this project to full enterprise production? See [DEVELOPMENT_PROMPT.md](DEVELOPMENT_PROMPT.md) for the complete 7-phase architecture blueprint with copy-paste AI prompts for HLS transcoding, WebRTC voice chat, Smart TV D-Pad navigation, TMDB auto-ingestion, and Oracle VPS Docker deployment.

---

## 🌟 Key Features

- **Netflix-Grade Cinematic UI**:
  - Hero featured banner with 4K HDR badges, Dolby Atmos tags, match scores, and direct action triggers.
  - Horizontal scrolling category tracks with smooth card hover scaling, synopsis preview, and metadata badges.
  - Smart TV Remote D-Pad Navigation mode with enlarged focus indicators.
- **Ultra-Low Latency Video Streaming Engine**:
  - Implements **HTTP 206 Partial Content** byte-range requests for instant scrubbing and zero-lag playback on Smart TV, Laptop, and Mobile browsers.
  - Uploads MP4, MKV, MOV, M4V, and WebM into adaptive HLS (`.m3u8`) ladders at 360p, 720p, and 1080p.
  - Produces a preview clip, subtitle and chapter VTT files, plus a storyboard sprite for scrub-hover previews.
  - Uses hls.js for adaptive browser playback, manual quality selection, and available audio/subtitle tracks.
- **Free Movies Streaming API & Metadata**:
  - Integrated with the **Internet Archive Open Feature Films API**.
  - Verified full-length classics (*Night of the Living Dead*, *The Fast And The Furious (1955)*, *Voyage to the Planet of Prehistoric Women*, *House on Haunted Hill*, *The Stranger* by Orson Welles, *Jungle Book*).
  - Dynamic live search querying the Internet Archive in real time with playable streaming links and metadata.
- **Real-Time Watch Party (Socket.io)**:
  - Generate shareable 6-character room codes (e.g. `NET892`) or 1-click invite links.
  - Sub-second playback synchronization (play, pause, seek, and buffer status sync across all connected friends).
  - "⚡ Sync to Host" one-click button with live drift detection.
  - Real-time side drawer with live chat, member presence, and floating emoji reactions (🍿 🔥 😱 😂 ❤️ 👏).
  - Host controls lock toggle (Host-only controls vs. Collaborative mode).
- **SecurePool Authentication Framework (`securepool@1.1.3`)**:
  - RS256 asymmetric cryptographic JWT token signing (`private.pem` & `public.pem`).
  - Session tracking with device fingerprinting and MongoDB persistence.
  - 1-Click Multi-Device Demo profiles for rapid testing on Smart TV, Laptop, and Phone.
  - Interactive Swagger API docs at `/docs`.
- **Cross-Device "Continue Watching" Sync**:
  - Automatically saves playback timestamps to MongoDB every 5 seconds.
  - Seamlessly resumes playback when switching between phone, TV, or laptop.

---

## 📸 Application Screenshots

### 1. Netflix-Style Home Dashboard & Featured Hero Banner
![StreamHub Home Dashboard](docs/screenshots/01_home_dashboard.png)

### 2. Real-Time Synchronized Watch Party & Live Chat
![Watch Party Room](docs/screenshots/05_watch_party_room.png)

### 3. Fullscreen Cinema Video Player with Custom Controls
![Cinema Video Player](docs/screenshots/04_cinema_player.png)

### 4. SecurePool RS256 Authentication with 1-Click Multi-Device Demo Profiles
![SecurePool Authentication](docs/screenshots/02_securepool_auth.png)

### 5. Watch Party Launcher (Host Room or Join with Code)
![Watch Party Modal](docs/screenshots/03_watch_party_modal.png)

### 6. Cross-Device "Continue Watching" & Streaming Tracks
![Catalog Tracks](docs/screenshots/06_catalog_scroll.png)

---

## 🏗️ Architecture

```
stream-app/
├── client/                     # Next.js 16 App Router Frontend
│   ├── app/
│   │   ├── components/
│   │   │   ├── Navbar.js       # Navigation, TV mode, profile & search
│   │   │   ├── HeroBanner.js   # 4K Cinematic hero banner
│   │   │   ├── MovieRow.js     # Category tracks with progress bars
│   │   │   ├── CinemaPlayer.js # Fullscreen player with live sync & chat
│   │   │   ├── WatchPartyModal.js # Host or join party rooms
│   │   │   ├── AuthModal.js    # SecurePool login & demo profiles
│   │   │   └── InfoModal.js    # Movie synopsis & streaming details
│   │   ├── globals.css         # Netflix design system & animations
│   │   ├── layout.js           # Root layout & SEO meta tags
│   │   └── page.js             # Main catalog and party orchestrator
│   └── public/
│       ├── backdrops/          # Cinematic 16:9 movie backdrops
│       └── posters/            # 2:3 Portrait movie artwork
│
└── server/                     # Node.js + Express Backend
    ├── src/
    │   ├── index.js            # Express server, SecurePool & streaming APIs
    │   ├── transcoder.js        # Upload worker, FFmpeg HLS pipeline & previews
    │   ├── catalog.js          # Curated media metadata
    │   ├── freeMovieApi.js     # Archive.org Free Movies API service
    │   ├── watchParty.js       # Real-time WebSocket room synchronizer
    │   └── watchProgress.js    # Mongoose model for cross-device resume
    ├── media/                  # Local video cache for range requests
    ├── private.pem             # RSA Private Key for SecurePool JWT signing
    └── public.pem              # RSA Public Key for SecurePool JWT verification
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js 20+**
- **MongoDB 6+** (running locally on port 27017 or MongoDB Atlas connection string)

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/Lokeshburade007/stream-app.git
cd stream-app

# Install Server dependencies
cd server
npm install

# Install Client dependencies
cd ../client
npm install
```

### 2. Run Locally

**Terminal 1 — Backend Server:**
```bash
cd server
npm run dev
# Server running at http://localhost:5001
# Swagger Docs at http://localhost:5001/docs
```

**Terminal 2 — Frontend Application:**
```bash
cd client
npm run dev
# Next.js running at http://localhost:3000
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Server health check |
| `GET` | `/docs` | Swagger API documentation |
| `POST` | `/auth/quick-access` | Instant 1-click SecurePool RS256 token issuance |
| `POST` | `/auth/login` | Standard SecurePool credential login |
| `POST` | `/auth/register` | SecurePool account registration + OTP verification |
| `GET` | `/api/media` | Full media catalog with categories and featured banner |
| `GET` | `/api/media/:id` | Individual title metadata |
| `GET` | `/api/media/stream/:id` | HTTP 206 Partial Content byte-range video stream |
| `POST` | `/api/media/upload` | Upload a `video` multipart field and start background HLS encoding |
| `GET` | `/api/media/uploads/:jobId` | Retrieve HLS encoding job status and completed media metadata |
| `GET` | `/api/movies/free` | Curated free streaming movies list |
| `GET` | `/api/movies/search?q=...` | Live Internet Archive free movie search |
| `POST` | `/api/user/progress` | Save playback timestamp (cross-device resume) |
| `GET` | `/api/user/continue-watching` | Retrieve user's in-progress titles |
| `GET` | `/api/rooms/active` | List of currently active live Watch Party rooms |

### Uploading a personal video

The backend transcodes uploads in the background. Once a job reports `completed`,
the video appears under **My Library** and is available for adaptive playback and
watch parties.

```bash
curl -F "video=@/absolute/path/to/video.mp4" http://localhost:5001/api/media/upload
```

Poll the returned `statusUrl` until `status` is `completed`. Generated uploads and
HLS segments live under `server/media/` and are intentionally ignored by Git.

---

## 🌐 Deploying to Oracle Cloud VPS

1. **Setup Oracle Linux / Ubuntu VPS**:
   ```bash
   sudo apt update && sudo apt install -y nodejs npm git mongodb-org
   npm install -g pm2
   ```

2. **Clone & Build**:
   ```bash
   git clone https://github.com/Lokeshburade007/stream-app.git
   cd stream-app/server && npm install
   cd ../client && npm install && npm run build
   ```

3. **Start with PM2**:
   ```bash
   # Start backend
   cd ../server
   pm2 start src/index.js --name "streamhub-backend"

   # Start frontend
   cd ../client
   pm2 start npm --name "streamhub-frontend" -- start
   ```

4. **Nginx Reverse Proxy**:
   Configure Nginx with WebSocket support (`Upgrade $http_upgrade`, `Connection "Upgrade"`) and proxy pass port 3000 for frontend and port 5001 for `/api` and `/socket.io`.

---

## 📄 License

MIT © [Lokesh Burade](https://github.com/Lokeshburade007)
