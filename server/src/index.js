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
const configuredQuotaGb = Number(process.env.VIDEO_STORAGE_QUOTA_GB || 20);
const LIBRARY_QUOTA_BYTES = (Number.isFinite(configuredQuotaGb) && configuredQuotaGb > 0 ? configuredQuotaGb : 20) * 1024 * 1024 * 1024;
// A source and its generated HLS package coexist during encoding. With the
// standard 20 GB quota, the 10 GB source cap leaves 10 GB for the encode.
const MAX_UPLOAD_BYTES = Math.min(10 * 1024 * 1024 * 1024, Math.floor(LIBRARY_QUOTA_BYTES * (2 / 3)));
const TRANSCODE_HEADROOM_BYTES = Math.max(1024 * 1024 * 1024, Math.min(2 * 1024 * 1024 * 1024, Math.floor(LIBRARY_QUOTA_BYTES * 0.1)));
const HOST_CONFIG = (process.env.HOST_EMAIL || "buradepiyush@gmail.com").trim().toLowerCase();
const HOST_EMAILS = new Set([
  HOST_CONFIG,
  "buradepiyush@gmail.com",
  "lokesh-demo@streamhub.io",
  "lokeshburade007@gmail.com"
]);

function isHostEmail(email) {
  if (!email) return false;
  return HOST_EMAILS.has(String(email).trim().toLowerCase());
}

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
  const transcoder = new MediaTranscoder({
    mediaRoot: MEDIA_ROOT,
    quotaBytes: LIBRARY_QUOTA_BYTES,
    maxSourceBytes: MAX_UPLOAD_BYTES,
    transcodeHeadroomBytes: TRANSCODE_HEADROOM_BYTES
  });
  await transcoder.initialize();

  // node --watch and process managers stop the Node parent during a reload but
  // may leave a spawned FFmpeg child alive. Kill active workers first so they
  // cannot continue filling disk after the API process has gone away.
  let mediaShutdownStarted = false;
  const stopMediaWorkers = () => {
    if (mediaShutdownStarted) return;
    mediaShutdownStarted = true;
    transcoder.cancelAllJobs();
    setTimeout(() => process.exit(0), 250).unref();
  };
  process.once("SIGINT", stopMediaWorkers);
  process.once("SIGTERM", stopMediaWorkers);

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

  const getAccessClaims = async (req) => {
    const authorization = req.headers.authorization || "";
    if (!authorization.startsWith("Bearer ")) {
      return null;
    }
    try {
      const token = authorization.slice("Bearer ".length);
      const verified = await tokenService.verifyAccessToken(token);
      if (!verified) return null;

      // Extract full verified payload claims signed by SecurePool RS256 key
      const parts = token.split(".");
      if (parts.length >= 2) {
        const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
        return { ...verified, ...payload };
      }
      return verified;
    } catch {
      return null;
    }
  };

  const requireHost = async (req, res, next) => {
    const claims = await getAccessClaims(req);
    if (!claims) {
      return res.status(401).json({ error: "Your sign-in session is missing or expired. Sign in again as Lokesh (Host)." });
    }
    if (!isHostEmail(claims.email)) {
      return res.status(403).json({ error: `This account is not the configured library host. Sign in as ${HOST_EMAIL}.` });
    }
    req.hostUser = { userId: claims.sub, email: claims.email };
    next();
  };

  const upload = multer({
    storage: {
      _handleFile: (req, file, callback) => {
        const extension = path.extname(file.originalname || "").toLowerCase();
        const destination = transcoder.getUploadDirectory();
        const filename = `${crypto.randomUUID()}${extension}`;
        const targetPath = path.join(destination, filename);
        const output = fs.createWriteStream(targetPath, { flags: "wx" });
        let bytes = 0;
        let settled = false;
        const finish = (error, info) => {
          if (settled) return;
          settled = true;
          if (error) {
            output.destroy();
            fs.unlink(targetPath, () => callback(error));
            return;
          }
          callback(null, info);
        };
        file.stream.on("data", (chunk) => {
          bytes += chunk.length;
          if (bytes > req.maxSourceBytes) {
            file.stream.destroy(new multer.MulterError("LIMIT_FILE_SIZE", file.fieldname));
          }
        });
        file.stream.once("error", (error) => finish(error));
        output.once("error", (error) => finish(error));
        output.once("finish", () => finish(null, { destination, filename, path: targetPath, size: bytes }));
        file.stream.pipe(output);
      },
      _removeFile: (_req, file, callback) => fs.unlink(file.path, callback)
    },
    limits: { fileSize: MAX_UPLOAD_BYTES },
    fileFilter: (_req, file, callback) => {
      if (!isSupportedVideo(file.originalname)) {
        callback(new Error("Only MP4, MKV, MOV, M4V, and WebM video files are supported"));
        return;
      }
      callback(null, true);
    }
  });

  const reserveLibraryImportSpace = async (req, res, next) => {
    const storage = await transcoder.getStorageStats();
    if (storage.activeJob) {
      const existingImport = req.sourceUrl ? transcoder.getRemoteImport(req.sourceUrl) : null;
      if (existingImport?.type === "active") {
        req.existingImportJob = existingImport.job;
        return next();
      }
      return res.status(409).json({ error: "Wait for the current download or encoding job to finish before importing another video." });
    }
    const maxSourceBytes = transcoder.getSourceLimit(storage);
    if (maxSourceBytes < 1024 * 1024) {
      return res.status(409).json({ error: "The library does not have enough free storage for another video. Delete a title first." });
    }
    const requestBytes = Number(req.headers["content-length"] || 0);
    if (requestBytes && requestBytes > maxSourceBytes + 1024 * 1024) {
      return res.status(413).json({ error: `Import exceeds the currently available ${Math.floor(maxSourceBytes / 1024 / 1024)} MB source limit.` });
    }
    req.maxSourceBytes = maxSourceBytes;
    next();
  };

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
  app.use("/media/hls", (req, res, next) => {
    const match = req.path.match(/^\/([^\/]+)\/(?:v(\d+)\/)?(segment_\d+\.ts)$/);
    if (match) {
      const [, jobId, variantNum, segmentName] = match;
      const directPath = path.join(transcoder.hlsRoot, jobId, segmentName);
      if (!fs.existsSync(directPath)) {
        const candidatePaths = [
          path.join(transcoder.hlsRoot, jobId, variantNum ? `v${variantNum}` : "v0", segmentName),
          path.join(transcoder.hlsRoot, jobId, `segment_${variantNum || 0}_${segmentName.replace(/^segment_/, "")}`)
        ];
        for (const candidate of candidatePaths) {
          if (fs.existsSync(candidate)) {
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
            res.setHeader("Content-Type", "video/mp2t");
            res.setHeader("Cache-Control", "public, max-age=86400, immutable");
            return res.sendFile(candidate);
          }
        }
      }
    }
    next();
  }, express.static(transcoder.hlsRoot, {
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

  // The host library can contain multiple titles. Each temporary source and
  // all generated HLS assets share one strict server-side storage quota.
  app.get("/api/library/access", async (req, res) => {
    const claims = await getAccessClaims(req);
    if (!claims) return res.status(401).json({ canManage: false });
    res.json({
      canManage: isHostEmail(claims.email)
    });
  });

  app.get("/api/library", requireHost, async (_req, res) => {
    const [storage, orphaned, mediaStorage] = await Promise.all([
      transcoder.getStorageStats(),
      transcoder.getOrphanedMedia(),
      transcoder.getCompletedMediaStorage()
    ]);
    res.json({
      storage,
      maxUploadBytes: transcoder.getSourceLimit(storage),
      activeJob: transcoder.getActiveJob(),
      media: transcoder.getCompletedMedia(),
      orphaned,
      mediaStorage
    });
  });

  app.post("/api/media/upload", requireHost, reserveLibraryImportSpace, async (req, res) => {
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

  const preventDuplicateUrlImport = (req, res, next) => {
    const sourceUrl = typeof req.body?.url === "string" ? req.body.url.trim() : "";
    if (!sourceUrl) return res.status(400).json({ error: "Provide a direct HTTPS video file URL." });
    req.sourceUrl = sourceUrl;
    const existingImport = transcoder.getRemoteImport(sourceUrl);
    if (existingImport?.type === "completed") {
      return res.status(200).json({
        message: "This direct video URL is already in your library.",
        alreadyImported: true,
        media: existingImport.media
      });
    }
    if (existingImport?.type === "active") {
      return res.status(200).json({
        message: "This direct video URL is already being processed. Showing its server-side progress.",
        alreadyStarted: true,
        job: existingImport.job,
        statusUrl: `/api/media/uploads/${existingImport.job.id}`
      });
    }
    next();
  };

  app.post("/api/media/import-url", requireHost, preventDuplicateUrlImport, reserveLibraryImportSpace, (req, res) => {
    if (req.existingImportJob) {
      return res.status(200).json({
        message: "This direct video URL is already being processed. Showing its server-side progress.",
        alreadyStarted: true,
        job: req.existingImportJob,
        statusUrl: `/api/media/uploads/${req.existingImportJob.id}`
      });
    }
    const job = transcoder.startRemoteImport(req.sourceUrl, req.maxSourceBytes);
    res.status(202).json({
      message: "Server-side video download started. It will be validated, encoded, and added to the library when complete.",
      job,
      statusUrl: `/api/media/uploads/${job.id}`
    });
  });

  app.delete("/api/library/:mediaId", requireHost, async (req, res) => {
    if (transcoder.hasActiveJob()) {
      return res.status(409).json({ error: "Wait for the current encoding job to finish before deleting the library movie." });
    }
    try {
      const deleted = await transcoder.deleteMedia(req.params.mediaId);
      if (!deleted) return res.status(404).json({ error: "Library movie not found" });
      res.json({ message: "Library movie and its HLS files were deleted", storage: await transcoder.getStorageStats() });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/library/orphans/:orphanId", requireHost, async (req, res) => {
    try {
      await transcoder.deleteOrphanedMedia(req.params.orphanId);
      const [storage, orphaned] = await Promise.all([
        transcoder.getStorageStats(),
        transcoder.getOrphanedMedia()
      ]);
      res.json({ message: "Unlisted server files were deleted", storage, orphaned });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/media/uploads/:jobId", requireHost, async (req, res) => {
    const job = transcoder.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: "Upload job not found" });
    const storage = await transcoder.getStorageStats();
    res.json({
      ...job,
      storage,
      maxUploadBytes: transcoder.getSourceLimit(storage)
    });
  });

  app.delete("/api/media/uploads/:jobId", requireHost, async (req, res) => {
    const job = transcoder.cancelJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: "Upload job not found" });
    res.status(202).json({
      message: "The server job is being cancelled and its temporary files will be removed.",
      job
    });
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
      const { name = "Lokesh", email = "buradepiyush@gmail.com", tenantId = "default" } = req.body;
      const isHost = isHostEmail(email);
      const userId = `usr_${Buffer.from(email).toString("hex").substring(0, 12)}`;

      const accessToken = await tokenService.generateAccessToken(userId, tenantId, {
        email,
        name: isHost ? (name.includes("Host") ? name : `${name} (Host)`) : name,
        role: isHost ? "host" : "premium_member",
        isHost,
        streamingDevices: ["Smart TV", "Laptop", "Mobile"]
      });

      const refreshToken = await tokenService.generateRefreshToken(userId);

      res.json({
        message: "Logged in via SecurePool token",
        user: {
          id: userId,
          name: isHost ? (name.includes("Host") ? name : `${name} (Host)`) : name,
          email,
          role: isHost ? "host" : "premium_member",
          isHost,
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
    console.log(`🎞️  Video Library:        ${Math.round(LIBRARY_QUOTA_BYTES / 1024 / 1024 / 1024)} GB · Host ${HOST_EMAIL}`);
    console.log(`======================================================\n`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start StreamHub server:", err);
  process.exit(1);
});
