# 🚀 StreamHub — Product-Ready Development Blueprint & AI Prompt Roadmap

This document serves as the **master product specification and AI prompt playbook** for completing the development of **StreamHub** into an enterprise-grade, production-ready multi-device media streaming and synchronized watch party platform.

Every phase includes:
1. **Target Architecture & Feature Scope**
2. **Technical Implementation Checklist**
3. **Exact Copy-Paste AI Agent Prompts** formatted for automated execution in Antigravity, Cursor, or Claude Code.

---

## 📑 Table of Contents

1. [Product Overview & Current Baseline](#1-product-overview--current-baseline)
2. [Phase 1: Video Ingestion & Adaptive HLS/DASH Streaming Pipeline](#phase-1-video-ingestion--adaptive-hlsdash-streaming-pipeline)
3. [Phase 2: Production SecurePool Auth & Multi-Device Session Management](#phase-2-production-securepool-auth--multi-device-session-management)
4. [Phase 3: WebRTC Voice Chat & Enhanced Watch Party Experience](#phase-3-webrtc-voice-chat--enhanced-watch-party-experience)
5. [Phase 4: Smart TV (Android TV/Tizen/WebOS) & Mobile PWA Optimization](#phase-4-smart-tv-android-tvtizenwebos--mobile-pwa-optimization)
6. [Phase 5: Media Catalog Ingestion & TMDB Metadata Auto-Enrichment](#phase-5-media-catalog-ingestion--tmdb-metadata-auto-enrichment)
7. [Phase 6: Oracle Cloud VPS Production Deployment (Docker, Redis, Nginx, SSL)](#phase-6-oracle-cloud-vps-production-deployment-docker-redis-nginx-ssl)
8. [Phase 7: End-to-End Automated Testing & Monitoring](#phase-7-end-to-end-automated-testing--monitoring)

---

## 1. Product Overview & Current Baseline

### Current Stack & Architecture
- **Frontend**: Next.js 16 (App Router, Turbopack, Vanilla CSS Netflix Design System, Lucide icons, Socket.io client).
- **Backend**: Node.js, Express, Socket.io, Mongoose (MongoDB `WatchProgress`), HTTP 206 Range Streaming engine.
- **Authentication**: `securepool@1.1.3` (RS256 asymmetric JWT, `private.pem` / `public.pem`, session tracking).
- **Free Streaming Engine**: Internet Archive Open Movies API integration with real-time dynamic search and full-length feature film streaming.
- **Watch Party**: WebSocket room synchronization (play, pause, seek, drift calculation, chat, and floating emoji reactions).

---

## Phase 1: Video Ingestion & Adaptive HLS/DASH Streaming Pipeline

### Goal
Replace raw single-bitrate MP4 streaming with an automated **Adaptive Bitrate (ABR)** transcoding pipeline using **FFmpeg**. Videos are chunked into `.m3u8` master playlists and `.ts` segments (360p, 720p, 1080p, 4K) so mobile users on cellular data and 4K Smart TVs automatically receive the optimal bitrate.

### Technical Tasks
- [ ] Add `fluent-ffmpeg` and `@ffmpeg-installer/ffmpeg` fallback to backend.
- [ ] Implement an automated transcoding worker that converts uploaded/added video files into HLS ladders:
  - `360p` @ 800 kbps
  - `720p` @ 2500 kbps
  - `1080p` @ 5000 kbps
- [ ] Extract and serve WebVTT (`.vtt`) subtitle tracks and chapters.
- [ ] Upgrade `CinemaPlayer.js` with `hls.js` support for seamless quality switching (Auto, 1080p, 720p, 360p) and audio/subtitle track selectors.
- [ ] Generate automated video thumbnail sprites for hover preview scrub bars.

### 🤖 AI Execution Prompt for Phase 1

```markdown
You are an expert streaming video engineer. We are developing StreamHub (Next.js 16 + Node.js backend).
Implement Phase 1: Adaptive Bitrate HLS Streaming Pipeline:

1. In `server/`:
   - Install `fluent-ffmpeg` and set up an automated HLS transcoding service in `server/src/transcoder.js`.
   - Create an endpoint `POST /api/media/upload` (using `multer`) that accepts a video file (MP4/MKV), generates a 10-second preview teaser, extracts video duration/resolution metadata, and spawns background FFmpeg jobs generating:
     - Master playlist `master.m3u8`
     - Quality variants: 360p (800k), 720p (2500k), 1080p (5000k) with 4-second TS segment durations.
     - VTT subtitle tracks and thumbnail storyboard sprite (`thumbnails.vtt`).
   - Serve static HLS segments with appropriate CORS and caching headers (`max-age=86400` for TS chunks, `no-cache` for m3u8 playlists).

2. In `client/`:
   - Install `hls.js` in `client/package.json`.
   - Update `CinemaPlayer.js` to detect whether `movie.videoSource` is an HLS playlist (`.m3u8`) or direct MP4.
   - For HLS streams, initialize `Hls.js` with auto-level switching, manual quality picker in the settings menu, and subtitle/audio track selectors.
   - Implement hover thumbnail preview above the scrub bar using the VTT storyboard.
   - Maintain all existing Watch Party synchronization, finite-number guards, and keyboard shortcuts.
```

---

## Phase 2: Production SecurePool Auth & Multi-Device Session Management

### Goal
Upgrade the authentication implementation to full enterprise security: production email SMTP OTP verification, multi-account device switching, token rotation with refresh tokens, and tenant/household access control.

### Technical Tasks
- [ ] Configure environment variables in `server/.env` for production SMTP (Resend, SendGrid, or Gmail App Passwords).
- [ ] Enable `securepool` built-in email verification flow:
  - `POST /auth/register` -> sends real 6-digit OTP email.
  - `POST /auth/verify-email` -> validates OTP, generates user, and signs RS256 token.
  - `POST /auth/refresh` -> token rotation mechanism with refresh tokens.
  - `POST /auth/forgot-password` & `/auth/reset-password`.
- [ ] Multi-Device Session Management UI:
  - Display active devices (e.g., "Living Room TV - Active Now", "iPhone 15 - 2h ago").
  - Provide a "Revoke Other Devices" button leveraging `securepool/api` session endpoints.
- [ ] Implement Household Network grouping (allows friends/family to belong to the same watch group without sharing raw account credentials).

### 🤖 AI Execution Prompt for Phase 2

```markdown
You are an authentication and cybersecurity expert. We are upgrading the SecurePool integration in StreamHub (`securepool@1.1.3`).
Implement Phase 2: Production Authentication and Device Session Management:

1. In `server/src/index.js` and `server/`:
   - Setup `.env.example` and load SMTP email configuration (`EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM`).
   - Pass the email configuration into `createSecurePool({ email: { ... } })` so real OTP verification emails are dispatched.
   - Implement custom claims enriching tokens with user plan (`premium`), avatar, and allowed streaming devices.
   - Mount SecurePool session routes `/sessions` and `/sessions/:id/revoke`.
   - Implement a rate limiter middleware for `/auth/*` endpoints using `express-rate-limit`.

2. In `client/app/components/AuthModal.js`:
   - Build a tabbed interface: "Sign In", "Register", and "Forgot Password".
   - Include the 6-digit animated OTP input with resend countdown timer (60s).
   - Display password strength meter and validation indicators.

3. In `client/app/components/DeviceManagerModal.js`:
   - Create a device management modal showing logged-in sessions (Device name, IP, Location, Last active).
   - Allow users to click "Log Out of All Other Devices" to secure their account across TV, laptop, and phone.
```

---

## Phase 3: WebRTC Voice Chat & Enhanced Watch Party Experience

### Goal
Elevate the Watch Party feature from text chat to a full virtual theater experience. Friends in a room can speak via low-latency WebSockets/WebRTC audio mesh while the movie plays, with spatial audio and automatic ducking when the movie gets loud.

### Technical Tasks
- [ ] WebRTC audio mesh signaling via the existing Socket.io server (`party:offer`, `party:answer`, `party:candidate`).
- [ ] Microphone mute/unmute toggle in `CinemaPlayer.js`.
- [ ] Volume ducking: automatically lower video volume by 30% when friends speak.
- [ ] Synchronized Subtitles: host toggles subtitles, and they automatically display for all participants in sync.
- [ ] Watch Party Room History & Replays: save chat logs and timestamps in MongoDB.
- [ ] Virtual Seats / Avatar presence bar across the bottom/side of the player.

### 🤖 AI Execution Prompt for Phase 3

```markdown
You are a real-time communications engineer specializing in WebRTC and WebSockets.
Implement Phase 3: WebRTC Voice Chat & Synchronized Theater for StreamHub:

1. In `server/src/watchParty.js`:
   - Extend the Socket.io room handlers to support WebRTC mesh signaling:
     - `party:voice_signal` (passes SDP offers, answers, and ICE candidates between room members).
     - `party:user_speaking` (broadcasts audio activity indicators).
   - Add synchronized subtitle state (`subtitlesEnabled`, `subtitleLanguage`) to the room model.

2. In `client/app/components/CinemaPlayer.js`:
   - Integrate a WebRTC voice mesh manager (`useWebRTCVoice` hook):
     - Requests user microphone permission when joining voice lounge.
     - Creates RTCPeerConnections with existing room participants.
     - Adds a persistent Voice Controls widget in the player: Mute/Unmute Mic, Deafen Audio, Output Volume.
     - Shows glowing avatar speaking rings when a friend is talking.
   - Implement automatic audio ducking: when an incoming voice stream is detected, smoothly ease the video element volume from 1.0 down to 0.6.
```

---

## Phase 4: Smart TV (Android TV/Tizen/WebOS) & Mobile PWA Optimization

### Goal
Ensure StreamHub runs natively as an app on **Smart TVs** (Samsung Tizen, LG webOS, Android TV/Google TV, Fire TV) and as a progressive web app (PWA) on iOS and Android phones.

### Technical Tasks
- [ ] Install `next-pwa` or implement native Web App Manifest (`manifest.json`) with streaming category icons and standalone display mode.
- [ ] Spatial Navigation Engine:
  - Implement full keyboard/remote D-Pad navigation (`SpatialNavigation` or keydown handler for `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `Enter`, `Back`).
  - Active focus indicators: glowing red borders and automatic vertical/horizontal scrolling into view.
- [ ] Mobile Gestures:
  - Double-tap left to rewind 10s; double-tap right to skip 10s.
  - Vertical swipe on left side for brightness; vertical swipe on right side for volume.
  - Native Picture-in-Picture (`document.pictureInPictureElement`).
- [ ] Chromecast & Apple AirPlay streaming cast button support.

### 🤖 AI Execution Prompt for Phase 4

```markdown
You are a front-end specialist in Smart TV and mobile video UX.
Implement Phase 4: Smart TV D-Pad Remote Navigation and Mobile PWA for StreamHub:

1. In `client/public/`:
   - Create `manifest.json` configured with `display: "standalone"`, `orientation: "any"`, theme color `#141414`, background color `#141414`, and Netflix-style app icons.
   - Add Service Worker for caching UI assets, fonts, and catalog metadata offline.

2. In `client/app/components/SpatialNavigator.js`:
   - Implement a TV D-Pad remote navigation controller:
     - Automatically identifies focusable elements (`[tabindex]`, buttons, movie cards).
     - Maps remote directional keys (Codes: 38/Up, 40/Down, 37/Left, 39/Right, 13/Enter, 10009/Tizen Return, 461/webOS Back) to spatial movement.
     - Smoothly scrolls the active card into the center of the TV viewport.
     - Pressing Back closes modals or exits the video player back to the catalog.

3. In `client/app/components/CinemaPlayer.js`:
   - Add mobile touch gesture recognition:
     - Double-tap left third to seek -10s with ripple ripple animation.
     - Double-tap right third to seek +10s with ripple animation.
   - Add native AirPlay (`webkitShowPlaybackTargetPicker`) and Google Cast buttons.
```

---

## Phase 5: Media Catalog Ingestion & TMDB Metadata Auto-Enrichment

### Goal
Provide a complete Content Ingestion System so administrators can point the server to a local folder or upload personal movies, and the server automatically queries **The Movie Database (TMDB) API** to fetch high-res 4K posters, backdrops, cast, genres, trailer previews, and ratings.

### Technical Tasks
- [ ] Add TMDB API integration service in `server/src/tmdbApi.js`.
- [ ] Auto-matcher: parses file names (e.g. `Inception.2010.1080p.mkv` -> title: "Inception", year: 2010) and fetches TMDB metadata.
- [ ] Admin Portal `/admin`:
  - Upload movie file or specify server file path.
  - Review and confirm TMDB match.
  - Trigger transcoding and publish to catalog.
- [ ] Auto-fetch YouTube teaser trailers and display background video previews on Hero banner hover.

### 🤖 AI Execution Prompt for Phase 5

```markdown
You are a full-stack media systems architect.
Implement Phase 5: Media Ingestion & TMDB Metadata Auto-Enrichment for StreamHub:

1. In `server/src/tmdbApi.js`:
   - Build a service using TMDB API (v3) to search movies and TV shows by title and year.
   - Normalize and fetch: 4K backdrops (`original`), 2:3 posters (`w500`), IMDb rating, vote average, tagline, overview, director, cast (top 5), and YouTube trailer keys.

2. In `server/src/ingestion.js`:
   - Create a folder watcher or scanning service for `server/media/incoming/`.
   - Parse filenames using regex to extract title and year.
   - Match against TMDB and persist metadata into MongoDB collection `MediaItems`.
   - Add endpoints:
     - `GET /api/admin/scan` -> lists pending files with matched metadata.
     - `POST /api/admin/publish` -> approves and adds item to live catalog.

3. In `client/app/admin/page.js`:
   - Create an Admin Dashboard with SecurePool RBAC protection (role: "admin").
   - Display media library, storage stats, transcoding queue progress, and 1-click TMDB metadata editor.
```

---

## Phase 6: Oracle Cloud VPS Production Deployment (Docker, Redis, Nginx, SSL)

### Goal
Package the complete application into production Docker containers, configure **Redis** for Socket.io multi-core scaling, configure **Nginx** reverse proxy with SSL via Let's Encrypt, and deploy to your **Oracle Cloud Free Tier / Paid VPS**.

### Technical Tasks
- [ ] Create `Dockerfile` for `server` and multi-stage `Dockerfile` for `client`.
- [ ] Create `docker-compose.yml` defining:
  - `stream-frontend` (Next.js production standalone server)
  - `stream-backend` (Node.js API + Socket.io)
  - `redis` (Socket.io adapter for scaling rooms across threads)
  - `mongodb` (Database with persistent volume)
- [ ] Nginx configuration with WebSocket upgrade headers, HTTP/2, Gzip/Brotli compression, and SSL.
- [ ] Bash automated deployment script `deploy.sh`.

### 🤖 AI Execution Prompt for Phase 6

```markdown
You are a DevOps and cloud infrastructure engineer specializing in Oracle Cloud Infrastructure (OCI).
Implement Phase 6: Production Docker & Oracle VPS Deployment Suite for StreamHub:

1. Create `Dockerfile` in `client/`:
   - Multi-stage build for Next.js 16 with `output: "standalone"`.
   - Optimized Alpine Linux image.

2. Create `Dockerfile` in `server/`:
   - Node 22 Alpine image with FFmpeg installed via apk.
   - Production dependencies only.

3. Create root `docker-compose.yml`:
   - Services: `backend`, `frontend`, `mongo`, `redis`.
   - Configure `@socket.io/redis-adapter` in `server/src/index.js` so Watch Party connections scale across multiple node processes.
   - Set persistent volumes for MongoDB data and media storage (`/var/media`).

4. Create `deploy/nginx.conf`:
   - Full reverse proxy configuration routing:
     - `/` -> Frontend port 3000
     - `/api/` & `/auth/` & `/docs` -> Backend port 5001
     - `/socket.io/` -> WebSocket backend with `proxy_set_header Upgrade $http_upgrade`
   - SSL certificates configuration using Certbot / Let's Encrypt.
   - Fast HTTP 206 Range request byte streaming optimizations.

5. Create `deploy.sh`:
   - One-command deployment script for Ubuntu/Oracle Linux that installs Docker, clones repository, generates RSA keys if missing, and runs `docker compose up -d`.
```

---

## Phase 7: End-to-End Automated Testing & Monitoring

### Goal
Ensure 99.9% uptime, zero video playback regressions, and automated monitoring for server performance, streaming bandwidth, and socket connection health.

### Technical Tasks
- [ ] Playwright E2E test suite in `tests/e2e/`:
  - Test 1: User registers and logs in via SecurePool.
  - Test 2: User plays video; verifies `currentTime` advances and controls work without NaN errors.
  - Test 3: Two browser contexts join the same Watch Party room; verify host play/pause syncs in < 500ms.
  - Test 4: Dynamic Free Movies API search returns results and plays stream.
- [ ] Prometheus metrics endpoint `/metrics` on backend tracking active viewers, streaming bandwidth (MB/s), and active rooms.
- [ ] GitHub Actions CI workflow for linting, building, and running tests on every pull request.

### 🤖 AI Execution Prompt for Phase 7

```markdown
You are a QA automation and site reliability engineer.
Implement Phase 7: Playwright Automated Testing & CI/CD Pipeline for StreamHub:

1. Setup Playwright in `tests/`:
   - Create `tests/e2e/streaming.spec.js`:
     - Test catalog loading and hero banner rendering.
     - Test video player launch, play, pause, and seek without non-finite errors.
     - Test Watch Party room creation, link sharing, and multi-user synchronization.
     - Test SecurePool authentication and 1-click demo login.
     - Test Free Movies search via Archive.org API.

2. Create `.github/workflows/ci.yml`:
   - Automated GitHub Actions workflow on push to `main`:
     - Sets up Node.js 22 and MongoDB service container.
     - Runs server and client builds.
     - Executes Playwright test suite in headless Chromium.

3. In `server/src/index.js`:
   - Add a lightweight health and metrics endpoint `/health/extended` returning CPU, memory, active WebSocket connections, and MongoDB connection status.
```

---

## 📌 Summary: How to Use These Prompts

Whenever you are ready to implement a phase:
1. Open the repository in your AI coding environment (Antigravity, Cursor, etc.).
2. Copy the **🤖 AI Execution Prompt** for the corresponding Phase.
3. Paste it directly into the prompt box. The AI agent will have full context, existing files, dependencies, and requirements to execute each phase autonomously and error-free!
