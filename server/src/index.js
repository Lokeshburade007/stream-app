import "dotenv/config";
import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");
import crypto from "crypto";
import http from "http";
import path from "path";
import fs from "fs";
import { Readable } from "stream";
import { fileURLToPath } from "url";
import express from "express";
import multer from "multer";
import { Server as SocketIOServer } from "socket.io";
import mongoose from "mongoose";
import securepoolApi from "securepool/api";
const { createSecurePool } = securepoolApi;
import {
  findLiveMedia,
  getLiveCatalog,
  resolveArchiveStreamUrl,
  searchLiveMedia
} from "./freeMovieApi.js";
import {
  getSeriesEpisodes,
  getTopTvSeries
} from "./seriesApi.js";
import { isSupportedVideo, MediaTranscoder } from "./transcoder.js";
import { setupWatchParty } from "./watchParty.js";
import { WatchProgress } from "./watchProgress.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || "5001", 10);
const MONGO_URL = process.env.MONGO_URL || "mongodb://localhost:27017/stream_hub";
const MEDIA_ROOT = path.resolve(__dirname, "../media");

// Read JWT RSA Keys
function getJwtKeys() {
  const privPath = path.resolve(__dirname, "../private.pem");
  const pubPath = path.resolve(__dirname, "../public.pem");

  if (!fs.existsSync(privPath) || !fs.existsSync(pubPath)) {
    console.error("RSA keys private.pem and public.pem not found in server root");
    process.exit(1);
  }

  return {
    privateKey: fs.readFileSync(privPath, "utf-8"),
    publicKey: fs.readFileSync(pubPath, "utf-8"),
  };
}

async function startServer() {
  const { privateKey, publicKey } = getJwtKeys();
  const transcoder = new MediaTranscoder({ mediaRoot: MEDIA_ROOT });
  await transcoder.initialize();

  // Connect Mongoose for custom stream models (WatchProgress)
  try {
    await mongoose.connect(MONGO_URL);
    console.log(`Connected to MongoDB at ${MONGO_URL}`);
  } catch (err) {
    console.warn(`MongoDB direct connect warning: ${err.message}. SecurePool handles repository connections.`);
  }

  // Initialize SecurePool Auth Framework
  const smtpConfigured = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"].every((key) => Boolean(process.env[key]));
  if (!smtpConfigured) {
    console.warn("OTP email is disabled: configure SMTP_HOST, SMTP_USER, and SMTP_PASS in server/.env");
  }
  const securePool = await createSecurePool({
    database: {
      type: "mongo",
      url: MONGO_URL,
    },
    jwt: {
      privateKey,
      publicKey,
      accessTokenExpirySeconds: 86400, // 24 hours for seamless streaming session
    },
    ...(smtpConfigured ? {
      email: {
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || "587", 10),
        secure: process.env.SMTP_SECURE === "true",
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
        from: process.env.SMTP_FROM || process.env.SMTP_USER
      }
    } : {}),
    security: {
      enableRateLimit: false,
      corsOrigins: "*",
    },
    customClaims: async ({ userId }) => {
      return {
        role: "subscriber",
        plan: "premium_4k",
        platform: "StreamHub"
      };
    }
  });

  const { app, authMiddleware, tokenService } = securePool;

  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, callback) => callback(null, transcoder.getUploadDirectory()),
      filename: (_req, file, callback) => {
        const extension = path.extname(file.originalname || "").toLowerCase();
        callback(null, `${crypto.randomUUID()}${extension}`);
      }
    }),
    limits: { fileSize: 20 * 1024 * 1024 * 1024 },
    fileFilter: (_req, file, callback) => {
      if (!isSupportedVideo(file.originalname)) {
        callback(new Error("Only MP4, MKV, MOV, M4V, and WebM video files are supported"));
        return;
      }
      callback(null, true);
    }
  });

  const resolveMedia = async (mediaId) => transcoder.getMediaById(mediaId) || findLiveMedia(mediaId);

  async function getCombinedCatalog({ forceRefresh = false } = {}) {
    const liveCatalog = await getLiveCatalog({ forceRefresh });
    const personalLibrary = transcoder.getCompletedMedia();
    const categories = [
      ...(personalLibrary.length ? [{
        id: "my-library",
        title: "My Library",
        subtitle: "Uploaded videos · adaptive HLS",
        items: personalLibrary
      }] : []),
      ...liveCatalog.categories
    ];

    return {
      ...liveCatalog,
      featured: personalLibrary[0] || liveCatalog.featured,
      categories,
      all: [...personalLibrary, ...liveCatalog.all],
      totalTitles: personalLibrary.length + liveCatalog.totalTitles
    };
  }

  // Create HTTP server
  const httpServer = http.createServer(app);

  // Setup WebSocket with Socket.io for Real-Time Watch Parties
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const watchPartyManager = setupWatchParty(io, tokenService, resolveMedia);

  // -------------------------------------------------------------
  // Custom Media Streaming & Watch Party REST APIs
  // -------------------------------------------------------------

  // HLS playlists change as an encode is published while immutable segments can
  // be cached aggressively. CORS is required for hls.js on a separate frontend.
  app.use("/media/hls", express.static(transcoder.hlsRoot, {
    setHeaders: (res, filePath) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      if (filePath.endsWith(".m3u8")) {
        res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
        res.setHeader("Cache-Control", "no-cache");
      } else if (filePath.endsWith(".ts")) {
        res.setHeader("Content-Type", "video/mp2t");
        res.setHeader("Cache-Control", "public, max-age=86400, immutable");
      } else if (filePath.endsWith(".vtt")) {
        res.setHeader("Content-Type", "text/vtt; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=3600");
      } else {
        res.setHeader("Cache-Control", "public, max-age=86400");
      }
    }
  }));

  // Uploading starts a background encode. Clients poll the status endpoint and
  // completed files are immediately included in the My Library catalogue row.
  app.post("/api/media/upload", (req, res) => {
    upload.single("video")(req, res, (error) => {
      if (error) return res.status(400).json({ error: error.message });
      if (!req.file) return res.status(400).json({ error: "Attach a video file in the 'video' field" });

      const job = transcoder.start(req.file);
      res.status(202).json({
        message: "Upload accepted. Adaptive HLS encoding has started in the background.",
        job,
        statusUrl: `/api/media/uploads/${job.id}`
      });
    });
  });

  app.get("/api/media/uploads/:jobId", (req, res) => {
    const job = transcoder.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: "Upload job not found" });
    res.json(job);
  });

  // 1. Get the live catalogue. Upstream data is cached for ten minutes to keep
  // the key-free providers responsive and avoid unnecessary rate-limit pressure.
  app.get("/api/media", async (req, res) => {
    try {
      const catalog = await getCombinedCatalog({ forceRefresh: req.query.refresh === "1" });
      res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
      res.json(catalog);
    } catch (err) {
      res.status(502).json({ error: "Live catalogue is temporarily unavailable", detail: err.message });
    }
  });

  // 2. Search both free-to-stream films and live series metadata.
  app.get("/api/movies/search", async (req, res) => {
    try {
      const q = (req.query.q || "").toString();
      if (!q.trim()) return res.json({ results: [] });
      const results = await searchLiveMedia(q);
      res.json({ results });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 3. Get the streamable part of the current catalogue.
  app.get("/api/movies/free", async (req, res) => {
    try {
      const catalog = await getCombinedCatalog();
      res.json({ movies: catalog.all.filter((media) => media.playable) });
    } catch (err) {
      res.status(502).json({ error: "Free movies are temporarily unavailable", detail: err.message });
    }
  });

  // 3b. Get Series & Shows listing from the live TV guide.
  app.get("/api/series", async (req, res) => {
    try {
      const topShows = await getTopTvSeries(30);
      res.json({
        series: topShows,
        total: topShows.length,
        streamableCount: 0
      });
    } catch (err) {
      res.status(502).json({ error: "Series catalog is temporarily unavailable", detail: err.message });
    }
  });

  // 3c. Get Seasons & Episodes for a specific series
  app.get("/api/series/:id/episodes", async (req, res) => {
    try {
      const episodesData = await getSeriesEpisodes(req.params.id);
      res.json(episodesData);
    } catch (err) {
      res.status(502).json({ error: "Episodes temporarily unavailable", detail: err.message });
    }
  });

  // 4. Get single media details
  app.get("/api/media/:id", async (req, res) => {
    const media = await resolveMedia(req.params.id);
    if (!media) {
      return res.status(404).json({ error: "Title not found" });
    }
    res.json(media);
  });

  // 5. Relay a concrete Archive video file through this origin. A redirect makes
  // the browser load archive.org directly; some files correctly opt out of
  // cross-origin embedding (CORP), which prevents the <video> element from
  // playing them. Forwarding byte ranges keeps seeking and playback working
  // without weakening the upstream file's browser policy.
  app.get("/api/archive/stream/:identifier", async (req, res) => {
    const abortController = new AbortController();
    const abortUpstream = () => abortController.abort();
    req.once("aborted", abortUpstream);
    res.once("close", abortUpstream);

    try {
      const streamUrl = await resolveArchiveStreamUrl(req.params.identifier);
      if (!streamUrl) return res.status(404).json({ error: "No browser-playable video file was found" });

      const upstream = await fetch(streamUrl, {
        headers: {
          ...(req.headers.range ? { Range: req.headers.range } : {}),
          "User-Agent": "StreamHub/1.0 (playback relay)"
        },
        signal: abortController.signal
      });

      if (!upstream.ok && upstream.status !== 206) {
        return res.status(upstream.status).json({ error: "Archive video file is unavailable" });
      }

      const copyHeader = (name) => {
        const value = upstream.headers.get(name);
        if (value) res.setHeader(name, value);
      };
      ["content-type", "content-length", "content-range", "accept-ranges", "last-modified", "etag"].forEach(copyHeader);
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.setHeader("Cache-Control", "private, no-store");
      res.status(upstream.status);

      if (!upstream.body) return res.end();
      const body = Readable.fromWeb(upstream.body);
      await new Promise((resolve, reject) => {
        body.once("error", reject);
        res.once("finish", resolve);
        res.once("close", resolve);
        body.pipe(res);
      });
    } catch (err) {
      if (err.name === "AbortError") return;
      res.status(502).json({ error: "Archive stream is temporarily unavailable", detail: err.message });
    } finally {
      req.removeListener("aborted", abortUpstream);
      res.removeListener("close", abortUpstream);
    }
  });

  // 6. Legacy local sample stream retained for development previews.
  app.get("/api/media/stream/:id", (req, res) => {
    // Look for local video file in media/ folder
    const localVideoPath = path.resolve(__dirname, "../media/sample_teaser.mp4");

    if (!fs.existsSync(localVideoPath)) {
      return res.status(404).json({ error: "Video stream file not found on server" });
    }

    const stat = fs.statSync(localVideoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      // Range header format: "bytes=0-1048575"
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize) {
        res.status(416).send(`Requested range not satisfiable: ${start} >= ${fileSize}`);
        return;
      }

      const chunksize = end - start + 1;
      const file = fs.createReadStream(localVideoPath, { start, end });

      const head = {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Content-Type": "video/mp4",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache",
      };

      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        "Content-Length": fileSize,
        "Content-Type": "video/mp4",
        "Accept-Ranges": "bytes",
        "Access-Control-Allow-Origin": "*",
      };
      res.writeHead(200, head);
      fs.createReadStream(localVideoPath).pipe(res);
    }
  });

  // 7. Save cross-device watch progress (phone -> TV -> laptop)
  app.post("/api/user/progress", async (req, res) => {
    try {
      const { userId, mediaId, positionSeconds, durationSeconds, device } = req.body;
      if (!userId || !mediaId) {
        return res.status(400).json({ error: "userId and mediaId are required" });
      }

      const percentage = durationSeconds > 0 ? Math.round((positionSeconds / durationSeconds) * 100) : 0;
      const completed = percentage >= 95;

      const progress = await WatchProgress.findOneAndUpdate(
        { userId, mediaId },
        {
          userId,
          mediaId,
          positionSeconds: Math.floor(positionSeconds),
          durationSeconds: Math.floor(durationSeconds),
          percentage,
          completed,
          device: device || "Web Player",
          updatedAt: new Date()
        },
        { upsert: true, new: true }
      );

      res.json({ success: true, progress });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 8. Get continue watching row for user
  app.get("/api/user/continue-watching", async (req, res) => {
    try {
      const userId = (req.query.userId || req.headers["x-user-id"] || "demo_user").toString();
      const progressList = await WatchProgress.find({ userId, completed: false })
        .sort({ updatedAt: -1 })
        .limit(10);

      const enriched = (await Promise.all(progressList.map(async (item) => {
        const media = await resolveMedia(item.mediaId);
        return {
          ...item.toObject(),
          media: media || null
        };
      }))).filter((item) => item.media !== null);

      res.json({ continueWatching: enriched });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 9. Get active watch parties
  app.get("/api/rooms/active", (req, res) => {
    res.json({
      rooms: watchPartyManager.getActiveRoomsSummary()
    });
  });

  // Room metadata is fetched before opening the player. The player itself is
  // the only socket that joins, avoiding short-lived setup sockets appearing as
  // phantom participants or deleting the room on disconnect.
  app.get("/api/rooms/:roomCode", (req, res) => {
    const room = watchPartyManager.getRoom(req.params.roomCode);
    if (!room) return res.status(404).json({ error: "Watch Party room does not exist or has expired" });
    res.json(room);
  });

  // Lets the client fail clearly before it asks SecurePool to issue an OTP on
  // a server that has no configured email transport.
  app.get("/api/auth/email-status", (_req, res) => {
    res.json({ otpEmailEnabled: smtpConfigured });
  });

  // 7. Instant Demo / Quick Access Login (generates valid RS256 token signed by SecurePool key)
  app.post("/auth/quick-access", async (req, res) => {
    try {
      const { name = "Lokesh", email = "lokesh@streamhub.io", tenantId = "default" } = req.body;
      const userId = `usr_${Buffer.from(email).toString("hex").substring(0, 12)}`;

      const accessToken = await tokenService.generateAccessToken(userId, tenantId, {
        email,
        name,
        role: "premium_member",
        streamingDevices: ["Smart TV", "Laptop", "Mobile"]
      });

      const refreshToken = await tokenService.generateRefreshToken(userId);

      res.json({
        message: "Logged in via SecurePool token",
        user: {
          id: userId,
          name,
          email,
          role: "premium_member",
          avatarColor: "#E50914"
        },
        accessToken,
        refreshToken
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Start HTTP and WebSocket listener
  httpServer.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 StreamHub Media & Watch Party Server is LIVE`);
    console.log(`📡 HTTP API & Streaming: http://localhost:${PORT}`);
    console.log(`📖 Swagger Docs:         http://localhost:${PORT}/docs`);
    console.log(`⚡ WebSocket Engine:      Active on port ${PORT}`);
    console.log(`======================================================\n`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start StreamHub server:", err);
  process.exit(1);
});
