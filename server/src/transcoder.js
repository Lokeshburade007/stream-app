import crypto from "crypto";
import { lookup } from "node:dns/promises";
import fs from "fs";
import net from "node:net";
import path from "path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";

const fsp = fs.promises;

const QUALITY_LADDER = [
  { id: "360p", width: 640, height: 360, bitrate: 800, maxrate: 856, buffer: 1200 },
  { id: "720p", width: 1280, height: 720, bitrate: 2500, maxrate: 2675, buffer: 3750 },
  { id: "1080p", width: 1920, height: 1080, bitrate: 5000, maxrate: 5350, buffer: 7500 },
  // This is a real 3840×2160 rendition, not an upscaled label. It is added
  // only when the source has a 4K-capable dimension.
  { id: "2160p", width: 3840, height: 2160, bitrate: 16000, maxrate: 17120, buffer: 24000 }
];

const VIDEO_EXTENSIONS = new Set([".mp4", ".mkv", ".mov", ".webm", ".m4v"]);
const QUOTA_GUARD_BYTES = 32 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const JOB_ID_PATTERN = /^[a-f0-9-]{36}$/i;
const TERMINAL_JOB_STATUSES = new Set(["completed", "failed", "cancelled"]);

if (ffmpegInstaller?.path) {
  ffmpeg.setFfmpegPath(ffmpegInstaller.path);
}

if (ffprobeInstaller?.path) {
  ffmpeg.setFfprobePath(ffprobeInstaller.path);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isTerminalJob(job) {
  return TERMINAL_JOB_STATUSES.has(job.status);
}

function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getHlsQualityLadder(sourceWidth, sourceHeight) {
  const width = asNumber(sourceWidth);
  const height = asNumber(sourceHeight);
  const selected = QUALITY_LADDER.filter((quality) => {
    if (quality.id === "360p") return true;
    // A wide cinematic 4K source can be shorter than 2160 pixels, while a
    // vertical 4K source can be narrower than 3840. Either dimension is a
    // valid indicator that this rendition will not invent extra detail.
    return width >= quality.width || height >= quality.height;
  });

  return selected.length ? selected : [QUALITY_LADDER[0]];
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return hours ? `${hours}h${minutes ? ` ${minutes}m` : ""}` : (minutes ? `${minutes}m` : `${total}s`);
}

function formatVttTime(seconds) {
  const safeSeconds = Math.max(0, seconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = Math.floor(safeSeconds % 60);
  const millis = Math.round((safeSeconds - Math.floor(safeSeconds)) * 1000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function titleFromFilename(filename) {
  return path
    .basename(filename, path.extname(filename))
    .replace(/[._-]+/g, " ")
    .replace(/\b(2160p|1080p|720p|480p|x264|x265|hevc|bluray|web[- ]?dl|webrip|hdr|dv|proper|repack)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim() || "Untitled upload";
}

function sourceFingerprint(sourceUrl) {
  return sourceUrl
    ? crypto.createHash("sha256").update(sourceUrl.trim()).digest("hex")
    : null;
}

function metadataText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function metadataYear(tags = {}) {
  const candidate = metadataText(tags.date || tags.year || tags.creation_time);
  const match = candidate.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : new Date().getFullYear();
}

function isPrivateAddress(address) {
  if (net.isIPv4(address)) {
    const [first, second] = address.split(".").map(Number);
    return first === 0 || first === 10 || first === 127 || first >= 224 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 198 && (second === 18 || second === 19));
  }

  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    if (normalized === "::" || normalized === "::1" || normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb") ||
      normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    const mappedV4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return Boolean(mappedV4 && isPrivateAddress(mappedV4[1]));
  }

  return true;
}

async function validateRemoteUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Enter a valid direct HTTPS video URL");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || (parsed.port && parsed.port !== "443")) {
    throw new Error("Only public HTTPS video download URLs on port 443 are allowed");
  }
  const hostname = parsed.hostname.toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new Error("Private or local download URLs are not allowed");
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("The download URL must resolve only to a public internet address");
  }
  return parsed;
}

function filenameFromRemoteUrl(url, contentDisposition) {
  const dispositionName = contentDisposition?.match(/filename\*?=(?:UTF-8''|"?)([^";]+)/i)?.[1];
  const candidate = dispositionName ? decodeURIComponent(dispositionName).replace(/[\\/]/g, " ") : path.basename(url.pathname);
  const safe = candidate.replace(/[^a-zA-Z0-9._() -]/g, " ").trim();
  return isSupportedVideo(safe) ? safe : "remote-video.mp4";
}

async function getDownloadResponse(rawUrl, signal) {
  let current = await validateRemoteUrl(rawUrl);
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetch(current, {
      redirect: "manual",
      signal,
      headers: { Accept: "video/*,application/octet-stream;q=0.9" }
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("The video URL redirected without a destination");
      if (redirectCount === MAX_REDIRECTS) throw new Error("The video URL redirected too many times");
      current = await validateRemoteUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok || !response.body) throw new Error(`The video URL returned HTTP ${response.status}`);
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (contentType && !contentType.startsWith("video/") && !contentType.includes("octet-stream") && !contentType.includes("binary")) {
      throw new Error("The URL did not return a direct video file");
    }
    return { response, finalUrl: current };
  }
  throw new Error("Unable to retrieve the video URL");
}

function runFfmpeg(command) {
  return new Promise((resolve, reject) => {
    command
      .on("error", reject)
      .on("end", resolve)
      .run();
  });
}

function probe(inputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (error, metadata) => {
      if (error) reject(error);
      else resolve(metadata);
    });
  });
}

async function ensureDirectory(directory) {
  await fsp.mkdir(directory, { recursive: true });
}

async function directoryBytes(directory) {
  let total = 0;
  let entries = [];
  try {
    entries = await fsp.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return 0;
    throw error;
  }

  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) total += await directoryBytes(target);
    else if (entry.isFile()) total += (await fsp.stat(target)).size;
  }
  return total;
}

export function isSupportedVideo(filename) {
  return VIDEO_EXTENSIONS.has(path.extname(filename || "").toLowerCase());
}

export class MediaTranscoder {
  constructor({ mediaRoot, publicBasePath = "/media/hls", quotaBytes = 20 * 1024 * 1024 * 1024, maxSourceBytes = 10 * 1024 * 1024 * 1024, transcodeHeadroomBytes = 1 * 1024 * 1024 * 1024 }) {
    this.mediaRoot = mediaRoot;
    this.uploadRoot = path.join(mediaRoot, "uploads");
    this.hlsRoot = path.join(mediaRoot, "hls");
    this.publicBasePath = publicBasePath.replace(/\/$/, "");
    this.quotaBytes = quotaBytes;
    this.maxSourceBytes = maxSourceBytes;
    this.transcodeHeadroomBytes = transcodeHeadroomBytes;
    this.manifestPath = path.join(mediaRoot, "library.json");
    this.jobs = new Map();
    this.completedMedia = new Map();
  }

  async initialize() {
    await Promise.all([ensureDirectory(this.uploadRoot), ensureDirectory(this.hlsRoot)]);
    try {
      const saved = JSON.parse(await fsp.readFile(this.manifestPath, "utf8"));
      let manifestChanged = false;
      for (const media of Array.isArray(saved) ? saved : []) {
        const jobId = String(media.id || "").replace(/^local_/, "");
        if (!/^[a-f0-9-]{36}$/i.test(jobId)) continue;
        try {
          await fsp.access(path.join(this.hlsRoot, jobId, "master.m3u8"));
          const baseUrl = `${this.publicBasePath}/${jobId}`;
          const posterPath = path.join(this.hlsRoot, jobId, "poster.jpg");
          try {
            await fsp.access(posterPath);
          } catch {
            const previewPath = path.join(this.hlsRoot, jobId, "preview.mp4");
            try {
              await fsp.access(previewPath);
              if (await this.createPoster(previewPath, posterPath, Math.min(asNumber(media.duration) || 10, 10))) {
                media.poster = `${baseUrl}/poster.jpg`;
                media.backdrop = `${baseUrl}/poster.jpg`;
                manifestChanged = true;
              }
            } catch {}
          }
          if (asNumber(media.duration) > 0 && (!media.durationFormatted || media.durationFormatted === "0m")) {
            media.durationFormatted = formatDuration(media.duration);
            manifestChanged = true;
          }
          this.completedMedia.set(media.id, media);
        } catch {}
      }
      if (manifestChanged) await this.saveManifest();
    } catch (error) {
      if (error.code !== "ENOENT") console.warn("Unable to load media library manifest:", error.message);
    }
  }

  getUploadDirectory() {
    return this.uploadRoot;
  }

  getJob(jobId) {
    const job = this.jobs.get(jobId);
    return job ? this.serializeJob(job) : null;
  }

  getActiveJob() {
    const activeJob = [...this.jobs.values()].find((job) => !isTerminalJob(job));
    return activeJob ? this.serializeJob(activeJob) : null;
  }

  getRemoteImport(sourceUrl) {
    const fingerprint = sourceFingerprint(sourceUrl);
    if (!fingerprint) return null;
    const activeJob = [...this.jobs.values()].find((job) =>
      job.sourceFingerprint === fingerprint && !isTerminalJob(job)
    );
    if (activeJob) return { type: "active", job: this.serializeJob(activeJob) };

    const completedMedia = [...this.completedMedia.values()].find((media) => media.sourceFingerprint === fingerprint);
    return completedMedia ? { type: "completed", media: completedMedia } : null;
  }

  getCompletedMedia() {
    return [...this.completedMedia.values()];
  }

  getMediaById(mediaId) {
    return this.completedMedia.get(mediaId) || null;
  }

  hasActiveJob() {
    return [...this.jobs.values()].some((job) => !isTerminalJob(job));
  }

  async getStorageStats() {
    const [temporarySourceBytes, hlsBytes] = await Promise.all([
      directoryBytes(this.uploadRoot),
      directoryBytes(this.hlsRoot)
    ]);
    const usedBytes = temporarySourceBytes + hlsBytes;
    return {
      quotaBytes: this.quotaBytes,
      usedBytes,
      temporarySourceBytes,
      hlsBytes,
      availableBytes: Math.max(0, this.quotaBytes - usedBytes),
      mediaCount: this.completedMedia.size,
      activeJob: this.hasActiveJob()
    };
  }

  getSourceLimit(stats) {
    // The HLS quota guard is applied separately during encoding. Do not deduct
    // it here, so an empty 20 GB library can accept the advertised 10 GB file.
    return Math.max(0, Math.min(this.maxSourceBytes, stats.availableBytes - this.transcodeHeadroomBytes));
  }

  async saveManifest() {
    const temporaryPath = `${this.manifestPath}.tmp`;
    await fsp.writeFile(temporaryPath, JSON.stringify(this.getCompletedMedia(), null, 2), "utf8");
    await fsp.rename(temporaryPath, this.manifestPath);
  }

  async deleteMedia(mediaId) {
    const media = this.completedMedia.get(mediaId);
    if (!media) return false;
    const jobId = String(mediaId).replace(/^local_/, "");
    if (!JOB_ID_PATTERN.test(jobId)) throw new Error("Invalid library media identifier");
    await fsp.rm(path.join(this.hlsRoot, jobId), { recursive: true, force: true });
    this.completedMedia.delete(mediaId);
    await this.saveManifest();
    return true;
  }

  async getOrphanedMedia() {
    const [hlsEntries, uploadEntries] = await Promise.all([
      fsp.readdir(this.hlsRoot, { withFileTypes: true }).catch((error) => error.code === "ENOENT" ? [] : Promise.reject(error)),
      fsp.readdir(this.uploadRoot, { withFileTypes: true }).catch((error) => error.code === "ENOENT" ? [] : Promise.reject(error))
    ]);
    const listedJobIds = new Set([...this.completedMedia.keys()]
      .map((mediaId) => String(mediaId).replace(/^local_/, ""))
      .filter((jobId) => JOB_ID_PATTERN.test(jobId)));
    const activeJobs = [...this.jobs.values()].filter((job) => !isTerminalJob(job));
    const activeJobIds = new Set(activeJobs.map((job) => job.id));
    const activeInputPaths = new Set(activeJobs.map((job) => path.resolve(job.inputPath)));
    const orphaned = [];

    for (const entry of hlsEntries) {
      if (!entry.isDirectory() || !JOB_ID_PATTERN.test(entry.name) || listedJobIds.has(entry.name) || activeJobIds.has(entry.name)) continue;
      const target = path.join(this.hlsRoot, entry.name);
      orphaned.push({
        id: `hls:${entry.name}`,
        kind: "hls",
        title: "Unlisted encoded video",
        detail: "Generated HLS playlists and segments not present in My Library",
        sizeBytes: await directoryBytes(target)
      });
    }

    for (const entry of uploadEntries) {
      if (!entry.isFile()) continue;
      const target = path.join(this.uploadRoot, entry.name);
      if (activeInputPaths.has(path.resolve(target))) continue;
      orphaned.push({
        id: `upload:${entry.name}`,
        kind: "source",
        title: "Unlisted temporary source",
        detail: entry.name,
        sizeBytes: (await fsp.stat(target)).size
      });
    }

    return orphaned.sort((left, right) => right.sizeBytes - left.sizeBytes);
  }

  async getCompletedMediaStorage() {
    const entries = await Promise.all([...this.completedMedia.values()].map(async (media) => {
      const jobId = String(media.id || "").replace(/^local_/, "");
      if (!JOB_ID_PATTERN.test(jobId)) return [media.id, 0];
      return [media.id, await directoryBytes(path.join(this.hlsRoot, jobId))];
    }));
    return Object.fromEntries(entries);
  }

  async deleteOrphanedMedia(orphanId) {
    const value = String(orphanId || "");
    const activeJobs = [...this.jobs.values()].filter((job) => !isTerminalJob(job));
    if (value.startsWith("hls:")) {
      const jobId = value.slice("hls:".length);
      if (!JOB_ID_PATTERN.test(jobId)) throw new Error("Invalid unlisted HLS identifier");
      if (this.completedMedia.has(`local_${jobId}`)) throw new Error("This is a listed library title; use its normal Delete button");
      if (activeJobs.some((job) => job.id === jobId)) throw new Error("This video is still being processed and cannot be deleted");
      await fsp.rm(path.join(this.hlsRoot, jobId), { recursive: true, force: true });
      return true;
    }

    if (value.startsWith("upload:")) {
      const filename = value.slice("upload:".length);
      if (!filename || path.basename(filename) !== filename) throw new Error("Invalid unlisted source identifier");
      const target = path.join(this.uploadRoot, filename);
      if (activeJobs.some((job) => path.resolve(job.inputPath) === path.resolve(target))) {
        throw new Error("This source is still being processed and cannot be deleted");
      }
      await fsp.unlink(target).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
      return true;
    }

    throw new Error("Invalid unlisted library item");
  }

  createJob({ originalName, inputPath, sourceUrl = null }) {
    const jobId = crypto.randomUUID();
    const outputDirectory = path.join(this.hlsRoot, jobId);
    return {
      id: jobId,
      status: "queued",
      progress: 0,
      originalName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: null,
      outputDirectory,
      inputPath,
      sourceUrl,
      sourceFingerprint: sourceFingerprint(sourceUrl),
      cancelled: false,
      abortController: null,
      activeCommand: null,
      media: null
    };
  }

  async failJob(job, error) {
    const terminalStatus = job.cancelled ? "cancelled" : "failed";
    this.updateJob(job, {
      status: "cleaning up",
      error: job.cancelled ? "Cancelled by host" : (error.message || "Transcoding failed")
    });
    console.error(`HLS transcode ${job.id} failed:`, error);
    await this.cleanupJob(job);
    this.updateJob(job, { status: terminalStatus });
  }

  cancelJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    if (isTerminalJob(job)) return this.serializeJob(job);
    job.cancelled = true;
    this.updateJob(job, { status: "cancelling", error: null });
    job.abortController?.abort();
    job.activeCommand?.kill("SIGKILL");
    return this.serializeJob(job);
  }

  cancelAllJobs() {
    return [...this.jobs.values()]
      .filter((job) => !isTerminalJob(job))
      .map((job) => this.cancelJob(job.id));
  }

  throwIfCancelled(job) {
    if (job.cancelled) throw new Error("Cancelled by host");
  }

  start(file) {
    const job = this.createJob({ originalName: file.originalname, inputPath: file.path });
    this.jobs.set(job.id, job);
    void this.process(job).catch((error) => {
      void this.failJob(job, error);
    });

    return this.serializeJob(job);
  }

  startRemoteImport(sourceUrl, maxBytes) {
    const job = this.createJob({
      originalName: "remote-video.mp4",
      inputPath: path.join(this.uploadRoot, `${crypto.randomUUID()}.download`),
      sourceUrl
    });
    this.jobs.set(job.id, job);
    void this.downloadAndProcess(job, maxBytes).catch((error) => {
      void this.failJob(job, error);
    });
    return this.serializeJob(job);
  }

  async downloadAndProcess(job, maxBytes) {
    this.updateJob(job, { status: "downloading video", progress: 1 });
    const abortController = new AbortController();
    job.abortController = abortController;
    try {
      const { response, finalUrl } = await getDownloadResponse(job.sourceUrl, abortController.signal);
      this.throwIfCancelled(job);
      const contentLength = asNumber(response.headers.get("content-length"));
      if (contentLength && contentLength > maxBytes) {
        throw new Error(`The direct video file is larger than the currently available ${Math.floor(maxBytes / 1024 / 1024)} MB import limit`);
      }
      job.originalName = filenameFromRemoteUrl(finalUrl, response.headers.get("content-disposition"));
      let downloadedBytes = 0;
      const limiter = new Transform({
        transform: (chunk, _encoding, callback) => {
          downloadedBytes += chunk.length;
          if (downloadedBytes > maxBytes) {
            abortController.abort();
            callback(new Error(`The direct video exceeded the ${Math.floor(maxBytes / 1024 / 1024)} MB import limit`));
            return;
          }
          const downloadProgress = contentLength ? Math.round((downloadedBytes / contentLength) * 18) : Math.min(18, Math.round(downloadedBytes / maxBytes * 18));
          this.updateJob(job, { progress: clamp(downloadProgress, 1, 18) });
          callback(null, chunk);
        }
      });
      await pipeline(Readable.fromWeb(response.body), limiter, fs.createWriteStream(job.inputPath, { flags: "wx" }));
      if (!downloadedBytes) throw new Error("The direct video download was empty");
    } catch (error) {
      await fsp.unlink(job.inputPath).catch(() => {});
      throw error;
    } finally {
      job.abortController = null;
    }
    this.throwIfCancelled(job);
    await this.process(job);
  }

  serializeJob(job) {
    return {
      id: job.id,
      status: job.status,
      progress: job.progress,
      originalName: job.originalName,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      error: job.error,
      sourceType: job.sourceUrl ? "url" : "upload",
      media: job.media
    };
  }

  updateJob(job, values) {
    Object.assign(job, values, { updatedAt: new Date().toISOString() });
  }

  async cleanupJob(job) {
    await Promise.all([
      fsp.rm(job.outputDirectory, { recursive: true, force: true }),
      fsp.unlink(job.inputPath).catch(() => {})
    ]);
  }

  async runWithQuotaGuard(command) {
    let exceeded = false;
    let checking = false;
    const guard = setInterval(() => {
      if (checking) return;
      checking = true;
      this.getStorageStats()
        .then((stats) => {
          if (stats.usedBytes >= this.quotaBytes - QUOTA_GUARD_BYTES) {
            exceeded = true;
            command.kill("SIGKILL");
          }
        })
        .catch(() => {})
        .finally(() => { checking = false; });
    }, 250);

    try {
      await runFfmpeg(command);
    } catch (error) {
      if (exceeded) {
        throw new Error(`The ${Math.round(this.quotaBytes / 1024 / 1024 / 1024)} GB library storage limit was reached during transcoding`);
      }
      throw error;
    } finally {
      clearInterval(guard);
    }
    if (exceeded) throw new Error(`The ${Math.round(this.quotaBytes / 1024 / 1024 / 1024)} GB library storage limit was reached during transcoding`);
  }

  async process(job) {
    this.throwIfCancelled(job);
    const beforeProcess = await this.getStorageStats();
    if (beforeProcess.usedBytes > this.quotaBytes - QUOTA_GUARD_BYTES) {
      throw new Error(`The ${Math.round(this.quotaBytes / 1024 / 1024 / 1024)} GB library storage limit has been reached. Delete a library title before importing another.`);
    }
    this.updateJob(job, { status: "probing", progress: Math.max(job.progress, 4) });
    const metadata = await probe(job.inputPath);
    const videoStream = metadata.streams?.find((stream) => stream.codec_type === "video");
    if (!videoStream) throw new Error("The uploaded file does not contain a video stream");

    const duration = asNumber(metadata.format?.duration);
    const width = asNumber(videoStream.width);
    const height = asNumber(videoStream.height);
    const hasAudio = metadata.streams?.some((stream) => stream.codec_type === "audio") || false;
    const subtitleStreams = metadata.streams?.filter((stream) => stream.codec_type === "subtitle") || [];
    const audioStream = metadata.streams?.find((stream) => stream.codec_type === "audio");
    const tags = { ...(metadata.format?.tags || {}), ...(videoStream.tags || {}) };
    const title = metadataText(tags.title) || titleFromFilename(job.originalName);
    const description = metadataText(tags.description || tags.comment || tags.synopsis);
    const creator = metadataText(tags.artist || tags.author || tags.director);

    const qualities = getHlsQualityLadder(width, height);
    await ensureDirectory(job.outputDirectory);
    await Promise.all(qualities.map((_, index) => ensureDirectory(path.join(job.outputDirectory, `v${index}`))));
    await ensureDirectory(path.join(job.outputDirectory, "subtitles"));

    this.updateJob(job, { status: "creating preview", progress: Math.max(job.progress, 10) });
    await this.createPreview(job.inputPath, path.join(job.outputDirectory, "preview.mp4"));
    this.throwIfCancelled(job);

    this.updateJob(job, { status: "creating poster thumbnail", progress: Math.max(job.progress, 15) });
    const posterCreated = await this.createPoster(job.inputPath, path.join(job.outputDirectory, "poster.jpg"), duration);
    this.throwIfCancelled(job);

    this.updateJob(job, { status: "creating HLS variants", progress: Math.max(job.progress, 20) });
    await this.createHls(job, { hasAudio, qualities });
    this.throwIfCancelled(job);

    this.updateJob(job, { status: "creating seek previews", progress: Math.max(job.progress, 82) });
    const thumbnailVtt = await this.createThumbnailSprite(job, { duration, width, height });
    this.throwIfCancelled(job);

    this.updateJob(job, { status: "extracting subtitles and chapters", progress: Math.max(job.progress, 90) });
    const subtitleTracks = await this.extractSubtitles(job, subtitleStreams);
    const chaptersVtt = await this.writeChapters(job, metadata.chapters || []);
    this.throwIfCancelled(job);

    const baseUrl = `${this.publicBasePath}/${job.id}`;
    const media = {
      id: `local_${job.id}`,
      title,
      tagline: "Personal library · adaptive HLS",
      synopsis: description || "Your uploaded video, packaged for adaptive playback across phones, browsers, and TVs.",
      backdrop: posterCreated ? `${baseUrl}/poster.jpg` : `${baseUrl}/thumbnails.jpg`,
      poster: posterCreated ? `${baseUrl}/poster.jpg` : `${baseUrl}/thumbnails.jpg`,
      videoSource: `${baseUrl}/master.m3u8`,
      previewSource: `${baseUrl}/preview.mp4`,
      thumbnailVtt: thumbnailVtt ? `${baseUrl}/thumbnails.vtt` : null,
      chaptersVtt: chaptersVtt ? `${baseUrl}/chapters.vtt` : null,
      subtitleTracks,
      duration,
      durationFormatted: formatDuration(duration),
      year: metadataYear(tags),
      maturityRating: "Personal",
      resolution: width && height ? `${width}×${height} · ${height}p source` : "Adaptive HLS",
      availableResolutions: qualities.map((quality) => quality.id),
      audio: hasAudio ? `${String(audioStream?.codec_name || "AAC").toUpperCase()} adaptive audio` : "No audio track",
      matchScore: 100,
      genres: ["Personal Library"],
      cast: [],
      director: creator || "Your library",
      category: "My Library",
      mediaType: "movie",
      provider: "Personal library",
      availabilityLabel: "YOUR UPLOAD",
      ...(job.sourceFingerprint ? { sourceFingerprint: job.sourceFingerprint } : {}),
      playable: true,
      isFeatured: false
    };

    this.completedMedia.set(media.id, media);
    await this.saveManifest();
    this.updateJob(job, { status: "completed", progress: 100, media });

    // The original source is no longer needed after the HLS package is complete.
    await fsp.unlink(job.inputPath).catch(() => {});
  }

  async createPreview(inputPath, outputPath) {
    await this.runWithQuotaGuard(
      ffmpeg(inputPath)
        .setStartTime(0)
        .duration(10)
        .outputOptions(["-c:v libx264", "-c:a aac", "-movflags +faststart"])
        .output(outputPath)
    );
  }

  async createPoster(inputPath, outputPath, duration) {
    const frameAt = duration > 2 ? Math.min(Math.max(1, duration * 0.1), duration - 0.25) : 0;
    try {
      await this.runWithQuotaGuard(
        ffmpeg(inputPath)
          .setStartTime(frameAt)
          .outputOptions(["-frames:v 1", "-vf", "scale='min(1280,iw)':-2", "-q:v 3"])
          .output(outputPath)
      );
      return true;
    } catch (error) {
      console.warn("Unable to create library poster thumbnail:", error.message);
      await fsp.unlink(outputPath).catch(() => {});
      return false;
    }
  }

  async createHls(job, { hasAudio, qualities }) {
    const filterGraph = [
      `[0:v:0]split=${qualities.length}${qualities.map((_, index) => `[v${index}]`).join("")}`,
      ...qualities.map((quality, index) =>
        // Cap the scale expressions at the source dimensions. A smaller
        // upload can receive a compatible padded rendition, but it is never
        // enlarged and presented as higher-quality video.
        `[v${index}]scale=w='min(${quality.width},iw)':h='min(${quality.height},ih)':force_original_aspect_ratio=decrease,pad=${quality.width}:${quality.height}:(ow-iw)/2:(oh-ih)/2[v${index}out]`
      )
    ].join(";");
    const maps = [];
    const videoRates = [];
    qualities.forEach((quality, index) => {
      maps.push("-map", `[v${index}out]`);
      if (hasAudio) maps.push("-map", "0:a:0?");
      videoRates.push(
        `-b:v:${index}`, `${quality.bitrate}k`,
        `-maxrate:v:${index}`, `${quality.maxrate}k`,
        `-bufsize:v:${index}`, `${quality.buffer}k`
      );
    });
    const variantStreams = qualities.map((_, index) => hasAudio ? `v:${index},a:${index}` : `v:${index}`).join(" ");
    const playlistTemplate = path.join(job.outputDirectory, "variant_%v.m3u8");

    const command = ffmpeg(job.inputPath)
      .outputOptions([
        "-filter_complex", filterGraph,
        ...maps,
        "-c:v libx264",
        "-preset veryfast",
        "-profile:v high",
        "-pix_fmt yuv420p",
        "-g 48",
        "-keyint_min 48",
        "-sc_threshold 0",
        ...videoRates,
        ...(hasAudio ? ["-c:a aac", "-b:a 128k", "-ac 2", "-ar 48000"] : []),
        "-f hls",
        "-hls_time 4",
        "-hls_playlist_type vod",
        "-hls_flags independent_segments",
        "-hls_segment_type mpegts",
        "-master_pl_name master.m3u8",
        "-var_stream_map", variantStreams,
        "-hls_segment_filename", path.join(job.outputDirectory, "segment_%v_%05d.ts")
      ])
      .on("progress", (progress) => {
        const estimated = Number.isFinite(progress.percent) ? progress.percent : 0;
        this.updateJob(job, { progress: clamp(20 + Math.round(estimated * 0.6), 20, 80) });
      })
      .output(playlistTemplate);

    job.activeCommand = command;
    try {
      await this.runWithQuotaGuard(command);
    } finally {
      job.activeCommand = null;
    }
  }

  async createThumbnailSprite(job, { duration, width, height }) {
    if (!duration || !width || !height) return false;

    const columns = 5;
    const rows = 4;
    const maxFrames = columns * rows;
    const interval = Math.max(5, Math.ceil(duration / maxFrames));
    const thumbWidth = 160;
    const thumbHeight = Math.max(90, Math.round((height / width) * thumbWidth));
    const spritePath = path.join(job.outputDirectory, "thumbnails.jpg");
    const vttPath = path.join(job.outputDirectory, "thumbnails.vtt");

    await runFfmpeg(
      ffmpeg(job.inputPath)
        .duration(Math.min(duration, interval * maxFrames))
        .outputOptions([
          "-vf", `fps=1/${interval},scale=${thumbWidth}:${thumbHeight},tile=${columns}x${rows}:padding=2:margin=0`,
          "-frames:v 1",
          "-q:v 3"
        ])
        .output(spritePath)
    );

    const frames = Math.min(maxFrames, Math.max(1, Math.ceil(duration / interval)));
    const cues = Array.from({ length: frames }, (_, index) => {
      const start = index * interval;
      const end = Math.min(duration, (index + 1) * interval);
      const x = (index % columns) * (thumbWidth + 2);
      const y = Math.floor(index / columns) * (thumbHeight + 2);
      return `${formatVttTime(start)} --> ${formatVttTime(end)}\nthumbnails.jpg#xywh=${x},${y},${thumbWidth},${thumbHeight}`;
    });
    await fsp.writeFile(vttPath, `WEBVTT\n\n${cues.join("\n\n")}\n`, "utf8");
    return true;
  }

  async extractSubtitles(job, subtitleStreams) {
    const tracks = [];
    for (const stream of subtitleStreams) {
      const streamIndex = asNumber(stream.index);
      const language = stream.tags?.language || "und";
      const filename = `track-${streamIndex}.vtt`;
      const outputPath = path.join(job.outputDirectory, "subtitles", filename);
      try {
        await runFfmpeg(
          ffmpeg(job.inputPath)
            .outputOptions(["-map", `0:${streamIndex}`, "-c:s webvtt"])
            .output(outputPath)
        );
        tracks.push({
          id: `subtitle-${streamIndex}`,
          label: language.toUpperCase(),
          language,
          src: `${this.publicBasePath}/${job.id}/subtitles/${filename}`
        });
      } catch (error) {
        console.warn(`Skipping subtitle stream ${streamIndex}:`, error.message);
      }
    }
    return tracks;
  }

  async writeChapters(job, chapters) {
    if (!chapters.length) return false;
    const validChapters = chapters.filter((chapter) => asNumber(chapter.start_time) >= 0 && asNumber(chapter.end_time) > asNumber(chapter.start_time));
    if (!validChapters.length) return false;

    const contents = validChapters.map((chapter, index) => {
      const title = chapter.tags?.title || `Chapter ${index + 1}`;
      return `${formatVttTime(asNumber(chapter.start_time))} --> ${formatVttTime(asNumber(chapter.end_time))}\n${title}`;
    });
    await fsp.writeFile(path.join(job.outputDirectory, "chapters.vtt"), `WEBVTT\n\n${contents.join("\n\n")}\n`, "utf8");
    return true;
  }
}
