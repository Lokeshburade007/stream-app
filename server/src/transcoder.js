import crypto from "crypto";
import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";

const fsp = fs.promises;

const QUALITY_LADDER = [
  { id: "360p", width: 640, height: 360, bitrate: 800, maxrate: 856, buffer: 1200 },
  { id: "720p", width: 1280, height: 720, bitrate: 2500, maxrate: 2675, buffer: 3750 },
  { id: "1080p", width: 1920, height: 1080, bitrate: 5000, maxrate: 5350, buffer: 7500 }
];

const VIDEO_EXTENSIONS = new Set([".mp4", ".mkv", ".mov", ".webm", ".m4v"]);
const QUOTA_GUARD_BYTES = 32 * 1024 * 1024;

if (ffmpegInstaller?.path) {
  ffmpeg.setFfmpegPath(ffmpegInstaller.path);
}

if (ffprobeInstaller?.path) {
  ffmpeg.setFfprobePath(ffprobeInstaller.path);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return hours ? `${hours}h${minutes ? ` ${minutes}m` : ""}` : `${minutes}m`;
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
  constructor({ mediaRoot, publicBasePath = "/media/hls", quotaBytes = 10 * 1024 * 1024 * 1024 }) {
    this.mediaRoot = mediaRoot;
    this.uploadRoot = path.join(mediaRoot, "uploads");
    this.hlsRoot = path.join(mediaRoot, "hls");
    this.publicBasePath = publicBasePath.replace(/\/$/, "");
    this.quotaBytes = quotaBytes;
    this.manifestPath = path.join(mediaRoot, "library.json");
    this.jobs = new Map();
    this.completedMedia = new Map();
  }

  async initialize() {
    await Promise.all([ensureDirectory(this.uploadRoot), ensureDirectory(this.hlsRoot)]);
    try {
      const saved = JSON.parse(await fsp.readFile(this.manifestPath, "utf8"));
      for (const media of Array.isArray(saved) ? saved : []) {
        const jobId = String(media.id || "").replace(/^local_/, "");
        if (!/^[a-f0-9-]{36}$/i.test(jobId)) continue;
        try {
          await fsp.access(path.join(this.hlsRoot, jobId, "master.m3u8"));
          this.completedMedia.set(media.id, media);
        } catch {}
      }
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

  getCompletedMedia() {
    return [...this.completedMedia.values()];
  }

  getMediaById(mediaId) {
    return this.completedMedia.get(mediaId) || null;
  }

  hasActiveJob() {
    return [...this.jobs.values()].some((job) => !["completed", "failed"].includes(job.status));
  }

  async getStorageStats() {
    const usedBytes = await directoryBytes(this.uploadRoot) + await directoryBytes(this.hlsRoot);
    return {
      quotaBytes: this.quotaBytes,
      usedBytes,
      availableBytes: Math.max(0, this.quotaBytes - usedBytes),
      mediaCount: this.completedMedia.size,
      activeJob: this.hasActiveJob()
    };
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
    if (!/^[a-f0-9-]{36}$/i.test(jobId)) throw new Error("Invalid library media identifier");
    await fsp.rm(path.join(this.hlsRoot, jobId), { recursive: true, force: true });
    this.completedMedia.delete(mediaId);
    await this.saveManifest();
    return true;
  }

  start(file) {
    const jobId = crypto.randomUUID();
    const outputDirectory = path.join(this.hlsRoot, jobId);
    const job = {
      id: jobId,
      status: "queued",
      progress: 0,
      originalName: file.originalname,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: null,
      outputDirectory,
      inputPath: file.path,
      media: null
    };

    this.jobs.set(jobId, job);
    void this.process(job).catch((error) => {
      job.status = "failed";
      job.error = error.message || "Transcoding failed";
      job.updatedAt = new Date().toISOString();
      void this.cleanupJob(job);
      console.error(`HLS transcode ${job.id} failed:`, error);
    });

    return this.serializeJob(job);
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
        throw new Error("The 10 GB library storage limit was reached during transcoding");
      }
      throw error;
    } finally {
      clearInterval(guard);
    }
    if (exceeded) throw new Error("The 10 GB library storage limit was reached during transcoding");
  }

  async process(job) {
    const beforeProcess = await this.getStorageStats();
    if (beforeProcess.usedBytes > this.quotaBytes - QUOTA_GUARD_BYTES) {
      throw new Error("The 10 GB library storage limit has been reached. Delete the current movie before uploading another.");
    }
    this.updateJob(job, { status: "probing", progress: 4 });
    const metadata = await probe(job.inputPath);
    const videoStream = metadata.streams?.find((stream) => stream.codec_type === "video");
    if (!videoStream) throw new Error("The uploaded file does not contain a video stream");

    const duration = asNumber(metadata.format?.duration);
    const width = asNumber(videoStream.width);
    const height = asNumber(videoStream.height);
    const hasAudio = metadata.streams?.some((stream) => stream.codec_type === "audio") || false;
    const subtitleStreams = metadata.streams?.filter((stream) => stream.codec_type === "subtitle") || [];

    await ensureDirectory(job.outputDirectory);
    await Promise.all(QUALITY_LADDER.map((_, index) => ensureDirectory(path.join(job.outputDirectory, `v${index}`))));
    await ensureDirectory(path.join(job.outputDirectory, "subtitles"));

    this.updateJob(job, { status: "creating preview", progress: 10 });
    await this.createPreview(job.inputPath, path.join(job.outputDirectory, "preview.mp4"));

    this.updateJob(job, { status: "creating HLS variants", progress: 20 });
    await this.createHls(job, { hasAudio });

    this.updateJob(job, { status: "creating seek previews", progress: 82 });
    const thumbnailVtt = await this.createThumbnailSprite(job, { duration, width, height });

    this.updateJob(job, { status: "extracting subtitles and chapters", progress: 90 });
    const subtitleTracks = await this.extractSubtitles(job, subtitleStreams);
    const chaptersVtt = await this.writeChapters(job, metadata.chapters || []);

    const baseUrl = `${this.publicBasePath}/${job.id}`;
    const media = {
      id: `local_${job.id}`,
      title: titleFromFilename(job.originalName),
      tagline: "Personal library · adaptive HLS",
      synopsis: "Your uploaded video, packaged for adaptive playback across phones, browsers, and TVs.",
      backdrop: `${baseUrl}/thumbnails.jpg`,
      poster: `${baseUrl}/thumbnails.jpg`,
      videoSource: `${baseUrl}/master.m3u8`,
      previewSource: `${baseUrl}/preview.mp4`,
      thumbnailVtt: thumbnailVtt ? `${baseUrl}/thumbnails.vtt` : null,
      chaptersVtt: chaptersVtt ? `${baseUrl}/chapters.vtt` : null,
      subtitleTracks,
      duration,
      durationFormatted: formatDuration(duration),
      year: new Date().getFullYear(),
      maturityRating: "Personal",
      resolution: height ? `${height}p source` : "Adaptive HLS",
      audio: hasAudio ? "Adaptive audio" : "No audio track",
      matchScore: 100,
      genres: ["Personal Library"],
      cast: [],
      director: "Your library",
      category: "My Library",
      mediaType: "movie",
      provider: "Personal library",
      availabilityLabel: "YOUR UPLOAD",
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

  async createHls(job, { hasAudio }) {
    const filterGraph = [
      "[0:v:0]split=3[v0][v1][v2]",
      ...QUALITY_LADDER.map((quality, index) =>
        `[v${index}]scale=w=${quality.width}:h=${quality.height}:force_original_aspect_ratio=decrease,pad=${quality.width}:${quality.height}:(ow-iw)/2:(oh-ih)/2[v${index}out]`
      )
    ].join(";");
    const maps = [];
    const videoRates = [];
    QUALITY_LADDER.forEach((quality, index) => {
      maps.push("-map", `[v${index}out]`);
      if (hasAudio) maps.push("-map", "0:a:0?");
      videoRates.push(
        `-b:v:${index}`, `${quality.bitrate}k`,
        `-maxrate:v:${index}`, `${quality.maxrate}k`,
        `-bufsize:v:${index}`, `${quality.buffer}k`
      );
    });
    const variantStreams = QUALITY_LADDER.map((_, index) => hasAudio ? `v:${index},a:${index}` : `v:${index}`).join(" ");
    const playlistTemplate = path.join(job.outputDirectory, "variant_%v.m3u8");

    const command = ffmpeg(job.inputPath)
      .outputOptions([
        "-filter_complex", filterGraph,
        ...maps,
        "-c:v libx264",
        "-preset veryfast",
        "-profile:v main",
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
        "-hls_segment_filename", path.join(job.outputDirectory, "v%v", "segment_%05d.ts")
      ])
      .on("progress", (progress) => {
        const estimated = Number.isFinite(progress.percent) ? progress.percent : 0;
        this.updateJob(job, { progress: clamp(20 + Math.round(estimated * 0.6), 20, 80) });
      })
      .output(playlistTemplate);

    await this.runWithQuotaGuard(command);
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
