// Live, key-free catalogue providers.
//
// Internet Archive supplies the titles that can be played in StreamHub. TVMaze
// supplies current TV metadata and links to official show pages; it does not
// provide video rights, so those titles are deliberately never marked playable.

const ARCHIVE_ORIGIN = "https://archive.org";
const TVMAZE_ORIGIN = "https://api.tvmaze.com";
const CATALOG_CACHE_MS = 10 * 60 * 1000;
const STREAM_URL_CACHE_MS = 6 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 9_000;

const catalogCache = {
  value: null,
  expiresAt: 0,
  pending: null
};

const streamUrlCache = new Map();

const FALLBACK_OPEN_MOVIES = [
  ["night_of_the_living_dead", "Night of the Living Dead", 1968, ["Horror", "Classic"]],
  ["TheFastandtheFuriousJohnIreland1954goofyrip", "The Fast and the Furious", 1955, ["Action", "Crime"]],
  ["house_on_haunted_hill", "House on Haunted Hill", 1959, ["Horror", "Mystery"]],
  ["TheStranger1946OrsonWelles", "The Stranger", 1946, ["Film Noir", "Thriller"]]
].map(([identifier, title, year, genres]) =>
  toArchiveMedia({ identifier, title, year, genre: genres, downloads: 0 })
);

function cleanText(value, fallback = "") {
  if (Array.isArray(value)) value = value.join(", ");
  if (typeof value !== "string") return fallback;

  const text = value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function listFrom(value, fallback = []) {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,/|]/) : [];
  const cleaned = values.map((item) => cleanText(String(item))).filter(Boolean).slice(0, 4);
  return cleaned.length ? cleaned : fallback;
}

function numericYear(value) {
  const match = String(value || "").match(/\b(18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function formatDuration(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return "Feature film";
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return hours ? `${hours}h${mins ? ` ${mins}m` : ""}` : `${mins}m`;
}

function safeArchiveIdentifier(identifier) {
  return /^[A-Za-z0-9._-]{1,120}$/.test(identifier || "") ? identifier : null;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "StreamHub/1.0 (live catalogue)",
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Upstream request failed (${response.status})`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function getDateInTimeZone(timeZone = process.env.CATALOG_TIME_ZONE || "Asia/Kolkata") {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const fields = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}

function archiveImage(identifier) {
  return `${ARCHIVE_ORIGIN}/services/img/${encodeURIComponent(identifier)}`;
}

function archiveScore(downloads) {
  const downloadCount = Number(downloads) || 0;
  return Math.min(99, Math.max(84, 84 + Math.round(Math.log10(downloadCount + 1) * 2)));
}

function toArchiveMedia(doc) {
  const identifier = safeArchiveIdentifier(doc.identifier);
  if (!identifier) return null;

  const title = cleanText(doc.title, identifier.replace(/[_-]/g, " "));
  const synopsis = cleanText(doc.description, "A feature film from the Internet Archive catalogue.").slice(0, 420);
  const genres = listFrom(doc.genre, ["Feature Film"]);
  const minutes = Number(doc.runtime || doc.duration) || 0;

  return {
    id: `archive_${identifier}`,
    archiveIdentifier: identifier,
    title,
    tagline: "Free to stream from Internet Archive",
    synopsis,
    backdrop: archiveImage(identifier),
    poster: archiveImage(identifier),
    videoSource: `/api/archive/stream/${encodeURIComponent(identifier)}`,
    externalUrl: `${ARCHIVE_ORIGIN}/details/${encodeURIComponent(identifier)}`,
    duration: minutes ? Math.round(minutes * 60) : 0,
    durationFormatted: formatDuration(minutes),
    year: numericYear(doc.year),
    maturityRating: "Archive",
    resolution: "Archive stream",
    audio: "Source audio",
    matchScore: archiveScore(doc.downloads),
    genres,
    cast: [],
    director: "Internet Archive catalogue",
    category: "Free to Stream",
    mediaType: "movie",
    provider: "Internet Archive",
    playable: true,
    isFeatured: false
  };
}

function toTvMazeMedia(show, episode = null) {
  if (!show?.id) return null;

  const season = episode?.season ? `S${episode.season}` : null;
  const episodeNumber = episode?.number ? `E${episode.number}` : null;
  const episodeLabel = [season, episodeNumber].filter(Boolean).join("");
  const episodeName = cleanText(episode?.name);
  const year = numericYear(show.premiered);
  const runtime = Number(episode?.runtime || show.averageRuntime || show.runtime) || 0;
  const genres = listFrom(show.genres, [show.type || "Series"]);
  const image = episode?.image?.original || episode?.image?.medium || show.image?.original || show.image?.medium || "/backdrops/cosmic_odyssey.jpg";
  const network = show.webChannel?.name || show.network?.name || "TVMaze";

  return {
    id: `tvmaze_${show.id}`,
    tvMazeId: show.id,
    title: cleanText(show.name, "Untitled series"),
    tagline: episodeName
      ? `${episodeLabel ? `${episodeLabel} · ` : ""}${episodeName}`
      : "Series information from TVMaze",
    synopsis: cleanText(episode?.summary || show.summary, "Series information from the TVMaze catalogue.").slice(0, 420),
    backdrop: image,
    poster: image,
    externalUrl: show.officialSite || show.url,
    duration: runtime * 60,
    durationFormatted: runtime ? `${runtime}m episode` : "Series",
    year,
    maturityRating: show.status || "Series",
    resolution: episode?.airdate ? `Airs ${episode.airdate}` : "Series info",
    audio: network,
    matchScore: Math.round(show.rating?.average ? Math.min(99, show.rating.average * 10) : 88),
    genres,
    cast: [],
    director: network,
    category: "Airing Today",
    mediaType: "series",
    provider: "TVMaze",
    playable: false,
    isFeatured: false,
    episode: episode
      ? {
          name: episodeName,
          season: episode.season,
          number: episode.number,
          airdate: episode.airdate,
          airstamp: episode.airstamp
        }
      : null
  };
}

function archiveSearchUrl(query, limit, sort = "downloads desc") {
  const params = new URLSearchParams();
  const safeTerms = cleanText(query).replace(/[^\p{L}\p{N}\s'-]/gu, " ").trim();
  const searchTerms = safeTerms ? `(${safeTerms}) AND ` : "";

  params.set("q", `${searchTerms}collection:feature_films AND format:"h.264"`);
  ["identifier", "title", "description", "year", "genre", "downloads", "runtime"].forEach((field) => params.append("fl[]", field));
  params.append("sort[]", sort);
  params.set("rows", String(limit));
  params.set("page", "1");
  params.set("output", "json");
  return `${ARCHIVE_ORIGIN}/advancedsearch.php?${params.toString()}`;
}

export async function searchArchiveMovies(query, limit = 12) {
  try {
    const data = await fetchJson(archiveSearchUrl(query, limit));
    return (data?.response?.docs || []).map(toArchiveMedia).filter(Boolean);
  } catch (error) {
    console.warn("Internet Archive search unavailable:", error.message);
    return [];
  }
}

async function discoverArchiveMovies() {
  try {
    const data = await fetchJson(archiveSearchUrl("", 18, "publicdate desc"));
    const movies = (data?.response?.docs || []).map(toArchiveMedia).filter(Boolean);
    return movies.length ? movies : FALLBACK_OPEN_MOVIES;
  } catch (error) {
    console.warn("Internet Archive discovery unavailable:", error.message);
    return FALLBACK_OPEN_MOVIES;
  }
}

async function discoverAiringSeries() {
  try {
    const date = getDateInTimeZone();
    const data = await fetchJson(`${TVMAZE_ORIGIN}/schedule?country=US&date=${date}`);
    const uniqueSeries = new Map();

    for (const episode of Array.isArray(data) ? data : []) {
      const media = toTvMazeMedia(episode.show, episode);
      if (media && !uniqueSeries.has(media.id)) uniqueSeries.set(media.id, media);
      if (uniqueSeries.size >= 18) break;
    }

    return [...uniqueSeries.values()];
  } catch (error) {
    console.warn("TVMaze schedule unavailable:", error.message);
    return [];
  }
}

async function buildLiveCatalog() {
  const [movies, series] = await Promise.all([discoverArchiveMovies(), discoverAiringSeries()]);
  const freeMovies = movies.length ? movies : FALLBACK_OPEN_MOVIES;
  const all = [...freeMovies, ...series];

  return {
    featured: freeMovies[0] || series[0] || null,
    categories: [
      {
        id: "free-to-stream",
        title: "Free Movies to Stream Now",
        subtitle: "Live Internet Archive catalogue",
        items: freeMovies
      },
      {
        id: "airing-today",
        title: "Series Airing Today",
        subtitle: "Live schedule data from TVMaze",
        items: series
      },
      {
        id: "classics",
        title: "Classic Free Cinema",
        subtitle: "Popular on Internet Archive",
        items: [...freeMovies].sort((a, b) => b.matchScore - a.matchScore).slice(0, 12)
      }
    ].filter((category) => category.items.length),
    all,
    totalTitles: all.length,
    updatedAt: new Date().toISOString(),
    sources: ["Internet Archive", "TVMaze"]
  };
}

export async function getLiveCatalog({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (!forceRefresh && catalogCache.value && catalogCache.expiresAt > now) {
    return catalogCache.value;
  }

  if (!forceRefresh && catalogCache.pending) return catalogCache.pending;

  const pending = buildLiveCatalog()
    .then((catalog) => {
      catalogCache.value = catalog;
      catalogCache.expiresAt = Date.now() + CATALOG_CACHE_MS;
      return catalog;
    })
    .finally(() => {
      catalogCache.pending = null;
    });

  catalogCache.pending = pending;
  return pending;
}

export async function searchLiveMedia(query, limit = 10) {
  const trimmedQuery = cleanText(query);
  if (!trimmedQuery) return [];

  const [movies, tvResults] = await Promise.all([
    searchArchiveMovies(trimmedQuery, limit),
    fetchJson(`${TVMAZE_ORIGIN}/search/shows?q=${encodeURIComponent(trimmedQuery)}`)
      .then((results) => results.map((result) => toTvMazeMedia(result.show)).filter(Boolean).slice(0, limit))
      .catch((error) => {
        console.warn("TVMaze search unavailable:", error.message);
        return [];
      })
  ]);

  return [...movies, ...tvResults];
}

export async function findLiveMedia(id) {
  const catalog = await getLiveCatalog();
  const cached = catalog.all.find((item) => item.id === id);
  if (cached) return cached;

  if (id?.startsWith("tvmaze_")) {
    const tvMazeId = id.slice("tvmaze_".length);
    if (!/^\d+$/.test(tvMazeId)) return null;
    try {
      const show = await fetchJson(`${TVMAZE_ORIGIN}/shows/${tvMazeId}`);
      return toTvMazeMedia(show);
    } catch {
      return null;
    }
  }

  if (id?.startsWith("archive_")) {
    const identifier = safeArchiveIdentifier(id.slice("archive_".length));
    if (!identifier) return null;
    try {
      const metadata = await fetchJson(`${ARCHIVE_ORIGIN}/metadata/${encodeURIComponent(identifier)}`);
      return toArchiveMedia({
        identifier,
        title: metadata?.metadata?.title,
        description: metadata?.metadata?.description,
        year: metadata?.metadata?.year,
        genre: metadata?.metadata?.subject,
        runtime: metadata?.metadata?.runtime
      });
    } catch {
      return null;
    }
  }

  return null;
}

function rankVideoFile(file) {
  const format = String(file.format || "").toLowerCase();
  const mimeType = String(file.mime_type || "").toLowerCase();
  const name = String(file.name || "").toLowerCase();
  let score = 0;
  if (mimeType === "video/mp4" || name.endsWith(".mp4")) score += 100;
  if (format.includes("h.264")) score += 50;
  if (format.includes("mpeg4")) score += 35;
  if (name.endsWith(".webm")) score += 10;
  score += Math.min(20, Math.log10(Number(file.size) || 1));
  return score;
}

export async function resolveArchiveStreamUrl(identifier) {
  const safeIdentifier = safeArchiveIdentifier(identifier);
  if (!safeIdentifier) return null;

  const cached = streamUrlCache.get(safeIdentifier);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const metadata = await fetchJson(`${ARCHIVE_ORIGIN}/metadata/${encodeURIComponent(safeIdentifier)}`);
  const file = (metadata?.files || [])
    .filter((candidate) => {
      const name = String(candidate.name || "");
      const isVideo = /\.(mp4|m4v|webm)$/i.test(name);
      return isVideo && String(candidate.private || "").toLowerCase() !== "true";
    })
    .sort((a, b) => rankVideoFile(b) - rankVideoFile(a))[0];

  if (!file?.name) return null;

  const url = `${ARCHIVE_ORIGIN}/download/${encodeURIComponent(safeIdentifier)}/${encodeURIComponent(file.name)}`;
  streamUrlCache.set(safeIdentifier, { url, expiresAt: Date.now() + STREAM_URL_CACHE_MS });
  return url;
}
