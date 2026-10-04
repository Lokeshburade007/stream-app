import http from "http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
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
import { setupWatchParty } from "./watchParty.js";
import { WatchProgress } from "./watchProgress.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || "5001", 10);
const MONGO_URL = process.env.MONGO_URL || "mongodb://localhost:27017/stream_hub";

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

  // Connect Mongoose for custom stream models (WatchProgress)
  try {
    await mongoose.connect(MONGO_URL);
    console.log(`Connected to MongoDB at ${MONGO_URL}`);
  } catch (err) {
    console.warn(`MongoDB direct connect warning: ${err.message}. SecurePool handles repository connections.`);
  }

  // Initialize SecurePool Auth Framework
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

  // Create HTTP server
  const httpServer = http.createServer(app);

  // Setup WebSocket with Socket.io for Real-Time Watch Parties
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const watchPartyManager = setupWatchParty(io, tokenService, findLiveMedia);

  // -------------------------------------------------------------
  // Custom Media Streaming & Watch Party REST APIs
  // -------------------------------------------------------------

  // 1. Get the live catalogue. Upstream data is cached for ten minutes to keep
  // the key-free providers responsive and avoid unnecessary rate-limit pressure.
  app.get("/api/media", async (req, res) => {
    try {
      const catalog = await getLiveCatalog({ forceRefresh: req.query.refresh === "1" });
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
      const catalog = await getLiveCatalog();
      res.json({ movies: catalog.all.filter((media) => media.playable) });
    } catch (err) {
      res.status(502).json({ error: "Free movies are temporarily unavailable", detail: err.message });
    }
  });

  // 4. Get single media details
  app.get("/api/media/:id", async (req, res) => {
    const media = await findLiveMedia(req.params.id);
    if (!media) {
      return res.status(404).json({ error: "Title not found" });
    }
    res.json(media);
  });

  // 5. Resolve a concrete video file only when playback starts. Archive items do
  // not have a universal filename, so guessing `${identifier}.mp4` is unreliable.
  app.get("/api/archive/stream/:identifier", async (req, res) => {
    try {
      const streamUrl = await resolveArchiveStreamUrl(req.params.identifier);
      if (!streamUrl) return res.status(404).json({ error: "No browser-playable video file was found" });
      res.redirect(302, streamUrl);
    } catch (err) {
      res.status(502).json({ error: "Archive stream is temporarily unavailable", detail: err.message });
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
        const media = await findLiveMedia(item.mediaId);
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
