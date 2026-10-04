import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");
import { MEDIA_CATALOG } from "./catalog.js";
import { STREAMABLE_CLASSIC_SERIES, getTopTvSeries } from "./seriesApi.js";

// Live, key-free catalogue providers.
//
// Internet Archive supplies the titles that can be played in StreamHub. TVMaze
// supplies current TV metadata and links to official show pages; it does not
// provide video rights, so those titles are deliberately never marked playable.

const ARCHIVE_ORIGIN = "https://archive.org";
const TVMAZE_ORIGIN = "https://api.tvmaze.com";
const TMDB_ORIGIN = "https://api.themoviedb.org/3";
const TMDB_IMAGE_ORIGIN = "https://image.tmdb.org/t/p";
const CATALOG_CACHE_MS = 10 * 60 * 1000;
const STREAM_URL_CACHE_MS = 6 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 9_000;

const catalogCache = {
  value: null,
  expiresAt: 0,
  pending: null
};

const streamUrlCache = new Map();

const INDIA_ARCHIVE_FILTER = "(subject:India OR subject:Hindi OR subject:Bollywood OR language:Hindi OR language:Telugu OR language:Tamil OR language:Malayalam)";
const TMDB_GENRES = {
  12: "Adventure", 16: "Animation", 18: "Drama", 27: "Horror", 28: "Action",
  35: "Comedy", 53: "Thriller", 80: "Crime", 99: "Documentary", 10749: "Romance",
  878: "Sci-Fi", 9648: "Mystery", 10751: "Family", 10759: "Action & Adventure",
  10765: "Sci-Fi & Fantasy", 10766: "Soap", 10768: "War & Politics"
};

const FALLBACK_OPEN_MOVIES = [
  ["night_of_the_living_dead", "Night of the Living Dead", 1968, ["Horror", "Classic"]],
  ["TheFastandtheFuriousJohnIreland1954goofyrip", "The Fast and the Furious", 1955, ["Action", "Crime"]],
  ["house_on_haunted_hill", "House on Haunted Hill", 1959, ["Horror", "Mystery"]],
  ["TheStranger1946OrsonWelles", "The Stranger", 1946, ["Film Noir", "Thriller"]]
].map(([identifier, title, year, genres]) =>
  toArchiveMedia({ identifier, title, year, genre: genres, downloads: 0 })
);

// Pinned official availability guides are useful even when TMDB is not
// configured. They never expose or imply an unlicensed stream.
const CURATED_NETFLIX_GUIDES = [
  {
    id: "netflix_lucifer_hindi",
    title: "Lucifer",
    tagline: "Hindi dubbed · Netflix India",
    synopsis: "Bored with being the Lord of Hell, Lucifer Morningstar moves to Los Angeles, opens a nightclub, and partners with a homicide detective.",
    backdrop: "/backdrops/cyber_amsterdam.jpg",
    poster: "/posters/neon_rebellion.jpg",
    externalUrl: "https://www.netflix.com/in/title/80057918",
    duration: 0,
    durationFormatted: "Series · Hindi audio",
    year: 2016,
    maturityRating: "U/A 16+",
    resolution: "Netflix India",
    audio: "Hindi, English",
    matchScore: 96,
    genres: ["Crime", "Fantasy", "Drama"],
    cast: ["Tom Ellis", "Lauren German", "Kevin Alejandro"],
    director: "Netflix official availability",
    category: "Hindi Dubbed on Netflix",
    mediaType: "series",
    provider: "Netflix India",
    availabilityLabel: "HINDI ON NETFLIX",
    availabilityNote: "Available with Hindi audio and Hindi subtitles on Netflix India. A Netflix membership is required to watch full episodes.",
    playable: false,
    isFeatured: false
  }
];

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

async function fetchJson(url, extraHeaders = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "StreamHub/1.0 (live catalogue)",
        Accept: "application/json",
        ...extraHeaders
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

function tmdbCredentials() {
  return (process.env.TMDB_API_KEY || "").trim();
}

async function fetchTmdb(path, params = {}) {
  const credentials = tmdbCredentials();
  if (!credentials) return null;

  const url = new URL(`${TMDB_ORIGIN}${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));

  // TMDB supports both a v3 API key and a v4 read-access token. Keeping this
  // server-side prevents the credential from ever being exposed to the browser.
  if (credentials.startsWith("eyJ")) {
    return fetchJson(url, { Authorization: `Bearer ${credentials}` });
  }

  url.searchParams.set("api_key", credentials);
  return fetchJson(url);
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

function toTvMazeMedia(show, episode = null, options = {}) {
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
    category: options.category || "Airing Today",
    mediaType: "series",
    provider: options.provider || "TVMaze",
    availabilityLabel: options.availabilityLabel || "SERIES INFO",
    availabilityNote: options.availabilityNote || "TVMaze supplies current series metadata and the official show link. Streaming availability is controlled by the title’s rights holder.",
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

function tmdbImage(path, size = "original") {
  return path ? `${TMDB_IMAGE_ORIGIN}/${size}${path}` : "/backdrops/cosmic_odyssey.jpg";
}

function toTmdbMedia(item, mediaType, focus) {
  if (!item?.id) return null;

  const isMovie = mediaType === "movie";
  const title = cleanText(isMovie ? item.title : item.name, "Untitled title");
  const releaseDate = isMovie ? item.release_date : item.first_air_date;
  const genreIds = Array.isArray(item.genre_ids) ? item.genre_ids : [];
  const genres = genreIds.map((id) => TMDB_GENRES[id]).filter(Boolean).slice(0, 4);
  const score = Number(item.vote_average) > 0 ? Math.round(Math.min(99, Number(item.vote_average) * 10)) : 85;

  return {
    id: `tmdb_${mediaType}_${item.id}`,
    tmdbId: item.id,
    title,
    tagline: focus.tagline,
    synopsis: cleanText(item.overview, `${title} is listed in the ${focus.provider} guide.`).slice(0, 420),
    backdrop: tmdbImage(item.backdrop_path),
    poster: tmdbImage(item.poster_path, "w780"),
    externalUrl: `https://www.themoviedb.org/${isMovie ? "movie" : "tv"}/${item.id}/watch?locale=IN`,
    duration: 0,
    durationFormatted: isMovie ? "Movie" : "Series",
    year: numericYear(releaseDate),
    maturityRating: "Guide",
    resolution: focus.resolution,
    audio: "Metadata only",
    matchScore: score,
    genres: genres.length ? genres : [isMovie ? "Movie" : "Series"],
    cast: [],
    director: "TMDB",
    category: focus.category,
    mediaType,
    provider: focus.provider,
    availabilityLabel: focus.availabilityLabel,
    availabilityNote: focus.availabilityNote,
    attributionUrl: focus.attributionUrl || "https://www.themoviedb.org",
    playable: false,
    isFeatured: false
  };
}

function archiveSearchUrl(query, limit, sort = "downloads desc", catalogueFilter = "") {
  const params = new URLSearchParams();
  const safeTerms = cleanText(query).replace(/[^\p{L}\p{N}\s'-]/gu, " ").trim();
  const searchTerms = safeTerms ? `(${safeTerms}) AND ` : "";

  const filters = ["collection:feature_films", "format:\"h.264\"", catalogueFilter].filter(Boolean).join(" AND ");
  params.set("q", `${searchTerms}${filters}`);
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

async function discoverTrendingArchiveMovies() {
  try {
    const data = await fetchJson(archiveSearchUrl("", 24, "downloads desc"));
    const movies = (data?.response?.docs || []).map(toArchiveMedia).filter(Boolean);
    return movies.length ? movies : FALLBACK_OPEN_MOVIES;
  } catch (error) {
    console.warn("Global Internet Archive discovery unavailable:", error.message);
    return FALLBACK_OPEN_MOVIES;
  }
}

async function discoverIndianArchiveMovies() {
  try {
    const data = await fetchJson(archiveSearchUrl("", 18, "downloads desc", INDIA_ARCHIVE_FILTER));
    const movies = (data?.response?.docs || []).map(toArchiveMedia).filter(Boolean);
    return movies.length ? movies : FALLBACK_OPEN_MOVIES;
  } catch (error) {
    console.warn("Indian Internet Archive discovery unavailable:", error.message);
    return FALLBACK_OPEN_MOVIES;
  }
}

async function discoverAiringSeries() {
  try {
    const date = getDateInTimeZone();
    const country = (process.env.TVMAZE_COUNTRY || "IN").toUpperCase();
    const data = await fetchJson(`${TVMAZE_ORIGIN}/schedule?country=${encodeURIComponent(country)}&date=${date}`);
    const uniqueSeries = new Map();

    for (const episode of Array.isArray(data) ? data : []) {
      const media = toTvMazeMedia(episode.show, episode, {
        category: "Indian Series Airing Today",
        provider: "TVMaze · India schedule",
        availabilityLabel: "INDIAN SERIES",
        availabilityNote: "TVMaze supplies India’s current broadcast schedule and an official show link. Streaming availability is controlled by the title’s rights holder."
      });
      if (media && !uniqueSeries.has(media.id)) uniqueSeries.set(media.id, media);
      if (uniqueSeries.size >= 18) break;
    }

    return [...uniqueSeries.values()];
  } catch (error) {
    console.warn("TVMaze schedule unavailable:", error.message);
    return [];
  }
}

async function discoverTmdbCategory(path, params, mediaType, focus) {
  try {
    const data = await fetchTmdb(path, params);
    return (data?.results || []).map((item) => toTmdbMedia(item, mediaType, focus)).filter(Boolean).slice(0, 18);
  } catch (error) {
    console.warn(`TMDB ${focus.category} discovery unavailable:`, error.message);
    return [];
  }
}

async function discoverTmdbFocus() {
  if (!tmdbCredentials()) {
    return {
      configured: false,
      indianMovies: [],
      indianSeries: [],
      netflixMovies: [],
      netflixSeries: []
    };
  }

  const shared = {
    include_adult: "false",
    language: "en-US",
    page: 1,
    sort_by: "popularity.desc"
  };
  const indianMovieFocus = {
    category: "Popular Indian Movies",
    provider: "TMDB · India",
    tagline: "Popular Indian movie guide",
    resolution: "India guide",
    availabilityLabel: "INDIAN GUIDE",
    availabilityNote: "Movie information is provided by TMDB. Select the title to see its current India watch guide."
  };
  const indianSeriesFocus = {
    category: "Popular Indian Series",
    provider: "TMDB · India",
    tagline: "Popular Indian series guide",
    resolution: "India guide",
    availabilityLabel: "INDIAN GUIDE",
    availabilityNote: "Series information is provided by TMDB. Select the title to see its current India watch guide."
  };
  const netflixMovieFocus = {
    category: "Netflix Movies in India",
    provider: "Netflix availability · TMDB / JustWatch",
    tagline: "Netflix availability in India",
    resolution: "Netflix India guide",
    availabilityLabel: "NETFLIX GUIDE",
    availabilityNote: "Netflix availability is supplied by TMDB in partnership with JustWatch. Availability can change by region; select the title for the current watch guide.",
    attributionUrl: "https://www.justwatch.com/in"
  };
  const netflixSeriesFocus = {
    category: "Netflix Series in India",
    provider: "Netflix availability · TMDB / JustWatch",
    tagline: "Netflix availability in India",
    resolution: "Netflix India guide",
    availabilityLabel: "NETFLIX GUIDE",
    availabilityNote: "Netflix availability is supplied by TMDB in partnership with JustWatch. Availability can change by region; select the title for the current watch guide.",
    attributionUrl: "https://www.justwatch.com/in"
  };
  const netflixFilters = {
    ...shared,
    watch_region: "IN",
    with_watch_monetization_types: "flatrate",
    with_watch_providers: "8"
  };

  const [indianMovies, indianSeries, netflixMovies, netflixSeries] = await Promise.all([
    discoverTmdbCategory("/discover/movie", { ...shared, region: "IN", with_origin_country: "IN" }, "movie", indianMovieFocus),
    discoverTmdbCategory("/discover/tv", { ...shared, with_origin_country: "IN" }, "series", indianSeriesFocus),
    discoverTmdbCategory("/discover/movie", netflixFilters, "movie", netflixMovieFocus),
    discoverTmdbCategory("/discover/tv", netflixFilters, "series", netflixSeriesFocus)
  ]);

  return { configured: true, indianMovies, indianSeries, netflixMovies, netflixSeries };
}

async function buildLiveCatalog() {
  const [globalMovies, indianMovies, airingSeries, topSeries, tmdb] = await Promise.all([
    discoverTrendingArchiveMovies(),
    discoverIndianArchiveMovies(),
    discoverAiringSeries(),
    getTopTvSeries(24),
    discoverTmdbFocus()
  ]);

  const openMasters = (MEDIA_CATALOG || []).map((m) => ({
    ...m,
    playable: true
  }));
  const streamableMovies = [...openMasters, ...globalMovies];
  const allSeries = [...STREAMABLE_CLASSIC_SERIES, ...topSeries, ...airingSeries];
  const all = [
    ...streamableMovies,
    ...allSeries,
    ...indianMovies,
    ...CURATED_NETFLIX_GUIDES,
    ...tmdb.indianMovies,
    ...tmdb.indianSeries,
    ...tmdb.netflixMovies,
    ...tmdb.netflixSeries
  ];

  const featured = streamableMovies[0] || STREAMABLE_CLASSIC_SERIES[0] || null;

  const categories = [
    {
      id: "classic-series",
      title: "Classic TV Series (Watch Full Episodes)",
      subtitle: "Multi-episode streamable series · Bonanza, Sherlock Holmes, Beverly Hillbillies & more",
      items: STREAMABLE_CLASSIC_SERIES
    },
    {
      id: "popular-tv-shows",
      title: "Popular TV Shows & Series Guide",
      subtitle: "Top-rated series with complete season and episode breakdown from TVMaze",
      items: topSeries
    },
    {
      id: "trending-movies",
      title: "Trending Movies to Stream Now",
      subtitle: "Full-length free feature films & open cinema masterpieces",
      items: streamableMovies
    },
    {
      id: "sci-fi-action",
      title: "Sci-Fi & Cyberpunk Hits",
      subtitle: "Futuristic thrillers and intergalactic space epics",
      items: streamableMovies.filter((m) =>
        (m.genres || []).some((g) => /sci-fi|cyberpunk|action|space/i.test(g))
      ).slice(0, 15)
    },
    {
      id: "free-to-stream",
      title: "Indian Cinema Classics",
      subtitle: "Golden era Bollywood and regional cinema from Internet Archive",
      items: indianMovies
    },
    {
      id: "indian-series-today",
      title: "Series Airing Today",
      subtitle: "Live schedule data from TVMaze",
      items: airingSeries
    },
    ...(tmdb.configured ? [
      { id: "popular-indian-movies", title: "Popular Indian Movies", subtitle: "Live TMDB India guide", items: tmdb.indianMovies },
      { id: "popular-indian-series", title: "Popular Indian Series", subtitle: "Live TMDB India guide", items: tmdb.indianSeries },
      { id: "netflix-movies-india", title: "Netflix Movies in India", subtitle: "Availability via TMDB / JustWatch", items: tmdb.netflixMovies },
      { id: "netflix-series-india", title: "Netflix Series in India", subtitle: "Availability via TMDB / JustWatch", items: tmdb.netflixSeries }
    ] : []),
    { id: "hindi-dubbed-netflix", title: "Hindi Dubbed on Netflix", subtitle: "Official India availability", items: CURATED_NETFLIX_GUIDES }
  ].filter((category) => category.items && category.items.length);

  return {
    featured,
    categories,
    all,
    totalTitles: all.length,
    updatedAt: new Date().toISOString(),
    sources: ["Internet Archive", "TVMaze", "Open Cinema", ...(tmdb.configured ? ["TMDB / JustWatch"] : [])],
    tmdbConfigured: tmdb.configured
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

  // Match local catalog and classic series
  const lowerQ = trimmedQuery.toLowerCase();
  const matchedSeries = STREAMABLE_CLASSIC_SERIES.filter((s) =>
    s.title.toLowerCase().includes(lowerQ) ||
    (s.genres || []).some((g) => g.toLowerCase().includes(lowerQ))
  );

  const matchedOpen = (MEDIA_CATALOG || []).filter((m) =>
    m.title.toLowerCase().includes(lowerQ) ||
    (m.genres || []).some((g) => g.toLowerCase().includes(lowerQ))
  );

  const [movies, tvResults, tmdbResults] = await Promise.all([
    searchArchiveMovies(trimmedQuery, limit),
    fetchJson(`${TVMAZE_ORIGIN}/search/shows?q=${encodeURIComponent(trimmedQuery)}`)
      .then((results) => results.map((result) => toTvMazeMedia(result.show)).filter(Boolean).slice(0, limit))
      .catch((error) => {
        console.warn("TVMaze search unavailable:", error.message);
        return [];
      }),
    fetchTmdb("/search/multi", { query: trimmedQuery, include_adult: "false", language: "en-US", page: 1 })
      .then((data) => (data?.results || [])
        .filter((item) => item.media_type === "movie" || item.media_type === "tv")
        .map((item) => toTmdbMedia(item, item.media_type === "movie" ? "movie" : "series", {
          category: "Search results",
          provider: "TMDB guide",
          tagline: "Movie and series guide",
          resolution: "Guide",
          availabilityLabel: "TITLE GUIDE",
          availabilityNote: "Movie and series information is provided by TMDB. Select the title to see its watch guide."
        }))
        .filter(Boolean)
        .slice(0, limit))
      .catch((error) => {
        console.warn("TMDB search unavailable:", error.message);
        return [];
      })
  ]);

  const curatedResults = CURATED_NETFLIX_GUIDES.filter((item) => {
    const haystack = `${item.title} ${item.tagline} ${item.synopsis}`.toLowerCase();
    return haystack.includes(lowerQ);
  });

  return [...matchedSeries, ...matchedOpen, ...curatedResults, ...movies, ...tvResults, ...tmdbResults];
}

export async function findLiveMedia(id) {
  // Check open catalog
  const open = (MEDIA_CATALOG || []).find((item) => item.id === id);
  if (open) return { ...open, playable: true };

  // Check classic series and episodes
  for (const s of STREAMABLE_CLASSIC_SERIES) {
    if (s.id === id) return s;
    const ep = s.episodes?.find((e) => e.id === id || e.archiveIdentifier === id);
    if (ep) {
      return {
        id: ep.id,
        title: `${s.title}: ${ep.title}`,
        tagline: `Season ${ep.season} Episode ${ep.number}`,
        synopsis: ep.synopsis,
        backdrop: ep.image,
        poster: ep.image,
        videoSource: ep.videoSource,
        duration: 0,
        durationFormatted: ep.duration,
        year: s.year,
        maturityRating: s.maturityRating,
        resolution: s.resolution,
        audio: s.audio,
        matchScore: s.matchScore,
        genres: s.genres,
        cast: s.cast,
        director: s.director,
        category: s.category,
        mediaType: "series",
        provider: s.provider,
        playable: true,
        seriesId: s.id,
        seasonNumber: ep.season,
        episodeNumber: ep.number,
        hasEpisodes: true
      };
    }
  }

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
