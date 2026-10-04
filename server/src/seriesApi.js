import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

const ARCHIVE_ORIGIN = "https://archive.org";
const TVMAZE_ORIGIN = "https://api.tvmaze.com";
const REQUEST_TIMEOUT_MS = 10_000;

// Curated iconic streamable TV series from Internet Archive with direct verified video episodes
export const STREAMABLE_CLASSIC_SERIES = [
  {
    id: "series_bonanza",
    title: "Bonanza",
    tagline: "The Legend of the Ponderosa Ranch",
    synopsis: "The Cartwright family defends their massive 600,000-acre Nevada ranch in the 1860s, navigating dangerous frontier outlaws, mining tycoons, and moral dilemmas.",
    backdrop: "https://archive.org/services/img/Bonanza_-_The_Trail_Gang",
    poster: "https://archive.org/services/img/Bonanza_-_The_Trail_Gang",
    year: 1959,
    maturityRating: "TV-PG",
    resolution: "1080p Restored",
    audio: "Mono / Restored",
    matchScore: 98,
    genres: ["Western", "Drama", "Action"],
    cast: ["Lorne Greene", "Michael Landon", "Dan Blocker", "Pernell Roberts"],
    director: "David Dortort",
    category: "Classic TV Series",
    mediaType: "series",
    provider: "Public Domain · Streamable Episodes",
    playable: true,
    episodes: [
      {
        id: "bonanza_ep1",
        season: 1,
        number: 1,
        title: "The Trail Gang",
        duration: "49m",
        synopsis: "Ben Cartwright hires an outlaw gunman for a cattle drive, unaware the man is targeted by vengeful bounty hunters.",
        image: "https://archive.org/services/img/Bonanza_-_The_Trail_Gang",
        archiveIdentifier: "Bonanza_-_The_Trail_Gang",
        videoSource: "/api/archive/stream/Bonanza_-_The_Trail_Gang"
      },
      {
        id: "bonanza_ep2",
        season: 1,
        number: 2,
        title: "Day of Reckoning",
        duration: "48m",
        synopsis: "An Indian chief saves Ben Cartwright's life, prompting Ben to offer him a parcel of the Ponderosa, causing fierce rancher unrest.",
        image: "https://archive.org/services/img/Bonanza_-_Day_Of_Reckoning",
        archiveIdentifier: "Bonanza_-_Day_Of_Reckoning",
        videoSource: "/api/archive/stream/Bonanza_-_Day_Of_Reckoning"
      },
      {
        id: "bonanza_ep3",
        season: 1,
        number: 3,
        title: "Bitter Water",
        duration: "49m",
        synopsis: "A ruthless neighboring rancher attempts to buy up precious water rights, triggering a tense standoff with Adam and Hoss.",
        image: "https://archive.org/services/img/Bonanza-BitterWater",
        archiveIdentifier: "Bonanza-BitterWater",
        videoSource: "/api/archive/stream/Bonanza-BitterWater"
      },
      {
        id: "bonanza_ep4",
        season: 1,
        number: 4,
        title: "The Fear Merchants",
        duration: "50m",
        synopsis: "Racial tensions flair in Virginia City when a mayoral candidate attempts to expel immigrant workers from the valley.",
        image: "https://archive.org/services/img/Bonanza-TheFearMerchants",
        archiveIdentifier: "Bonanza-TheFearMerchants",
        videoSource: "/api/archive/stream/Bonanza-TheFearMerchants"
      }
    ]
  },
  {
    id: "series_beverly_hillbillies",
    title: "The Beverly Hillbillies",
    tagline: "From Ozark Woods to Hollywood Hills",
    synopsis: "A poor mountaineer strikes oil on his swamp property and relocates his eccentric, down-to-earth family to a posh mansion in Beverly Hills, California.",
    backdrop: "https://archive.org/services/img/Beverly_Hillbillies_Ep01_The_Clampetts_Strike_Oil",
    poster: "https://archive.org/services/img/Beverly_Hillbillies_Ep01_The_Clampetts_Strike_Oil",
    year: 1962,
    maturityRating: "TV-G",
    resolution: "HD Remaster",
    audio: "English Stereo",
    matchScore: 96,
    genres: ["Comedy", "Sitcom", "Family"],
    cast: ["Buddy Ebsen", "Irene Ryan", "Donna Douglas", "Max Baer Jr."],
    director: "Paul Henning",
    category: "Classic TV Series",
    mediaType: "series",
    provider: "Public Domain · Streamable Episodes",
    playable: true,
    episodes: [
      {
        id: "bh_ep1",
        season: 1,
        number: 1,
        title: "The Clampetts Strike Oil",
        duration: "25m",
        synopsis: "Jed Clampett accidentally discovers crude oil while hunting, instantly earning $25 million from the OK Oil Company.",
        image: "https://archive.org/services/img/Beverly_Hillbillies_Ep01_The_Clampetts_Strike_Oil",
        archiveIdentifier: "Beverly_Hillbillies_Ep01_The_Clampetts_Strike_Oil",
        videoSource: "/api/archive/stream/Beverly_Hillbillies_Ep01_The_Clampetts_Strike_Oil"
      },
      {
        id: "bh_ep2",
        season: 1,
        number: 2,
        title: "Getting Settled in Beverly Hills",
        duration: "25m",
        synopsis: "The Clampetts arrive at their 36-room Beverly Hills mansion and mistake the swimming pool for a water hole and flamingos for chickens.",
        image: "https://archive.org/services/img/The_Beverly_Hillbillies",
        archiveIdentifier: "The_Beverly_Hillbillies",
        videoSource: "/api/archive/stream/The_Beverly_Hillbillies"
      }
    ]
  },
  {
    id: "series_sherlock_holmes_1954",
    title: "Sherlock Holmes",
    tagline: "The Original 1954 Masterpiece",
    synopsis: "Consulting detective Sherlock Holmes and Dr. John H. Watson unravel the most baffling criminal mysteries in Victorian London from 221B Baker Street.",
    backdrop: "https://archive.org/services/img/sherlock_holmes_cunningham_heritage",
    poster: "https://archive.org/services/img/sherlock_holmes_cunningham_heritage",
    year: 1954,
    maturityRating: "TV-PG",
    resolution: "Classic Black & White",
    audio: "Mono Restored",
    matchScore: 97,
    genres: ["Mystery", "Crime", "Detective"],
    cast: ["Ronald Howard", "Howard Marion-Crawford", "Archie Duncan"],
    director: "Sheldon Reynolds",
    category: "Classic TV Series",
    mediaType: "series",
    provider: "Public Domain · Streamable Episodes",
    playable: true,
    episodes: [
      {
        id: "sh_ep1",
        season: 1,
        number: 1,
        title: "The Case of the Cunningham Heritage",
        duration: "26m",
        synopsis: "Holmes and Watson meet for the very first time and collaborate to solve a series of mysterious threatening letters directed at a noble family.",
        image: "https://archive.org/services/img/sherlock_holmes_cunningham_heritage",
        archiveIdentifier: "sherlock_holmes_cunningham_heritage",
        videoSource: "/api/archive/stream/sherlock_holmes_cunningham_heritage"
      },
      {
        id: "sh_ep2",
        season: 1,
        number: 2,
        title: "The Case of Lady Beryl",
        duration: "26m",
        synopsis: "Lady Beryl confesses to an unsolved mansion robbery, but Holmes deduces she is sacrificing her innocence to protect someone she loves.",
        image: "https://archive.org/services/img/sherlock_holmes_lady_beryl",
        archiveIdentifier: "sherlock_holmes_lady_beryl",
        videoSource: "/api/archive/stream/sherlock_holmes_lady_beryl"
      }
    ]
  },
  {
    id: "series_flash_gordon_1954",
    title: "Flash Gordon",
    tagline: "Defenders of the Galaxy",
    synopsis: "Galactic agent Flash Gordon, Dr. Alexis Zarkov, and Dale Arden patrol the cosmos aboard the flagship Sky Marshal to maintain peace against intergalactic invaders.",
    backdrop: "https://archive.org/services/img/Flash_Gordon_Planet_of_Death",
    poster: "https://archive.org/services/img/Flash_Gordon_Planet_of_Death",
    year: 1954,
    maturityRating: "TV-Y7",
    resolution: "Sci-Fi Vintage",
    audio: "Original Broadcast Audio",
    matchScore: 93,
    genres: ["Sci-Fi", "Adventure", "Space Opera"],
    cast: ["Steve Holland", "Irene Champlin", "Joseph Nash"],
    director: "Wallace Worsley Jr.",
    category: "Classic TV Series",
    mediaType: "series",
    provider: "Public Domain · Streamable Episodes",
    playable: true,
    episodes: [
      {
        id: "fg_ep1",
        season: 1,
        number: 1,
        title: "Planet of Death",
        duration: "25m",
        synopsis: "Flash and his crew investigate a silent distress transmission from a barren asteroid outpost, discovering a deadly hypnotic radiation.",
        image: "https://archive.org/services/img/Flash_Gordon_Planet_of_Death",
        archiveIdentifier: "Flash_Gordon_Planet_of_Death",
        videoSource: "/api/archive/stream/Flash_Gordon_Planet_of_Death"
      }
    ]
  }
];

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "StreamHub/2.0 (TV Series Engine)",
        Accept: "application/json"
      }
    });
    if (!response.ok) throw new Error(`Upstream ${url} returned ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function cleanText(value, fallback = "") {
  if (Array.isArray(value)) value = value.join(", ");
  if (typeof value !== "string") return fallback;
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim() || fallback;
}

// Map TVMaze show to unified StreamHub Media Model
function toTvMazeShow(show) {
  if (!show?.id) return null;
  const image = show.image?.original || show.image?.medium || "/backdrops/cosmic_odyssey.jpg";
  const yearMatch = (show.premiered || "").match(/^\d{4}/);
  const year = yearMatch ? parseInt(yearMatch[0], 10) : 2024;
  const score = show.rating?.average ? Math.min(99, Math.round(show.rating.average * 10)) : 92;

  return {
    id: `tvmaze_${show.id}`,
    tvMazeId: show.id,
    title: cleanText(show.name, "Untitled Series"),
    tagline: show.type ? `${show.type} · ${show.status || "Ongoing"}` : "Popular Series",
    synopsis: cleanText(show.summary, "A top-rated series featured on TVMaze.").slice(0, 420),
    backdrop: image,
    poster: image,
    externalUrl: show.officialSite || show.url,
    duration: (show.averageRuntime || show.runtime || 45) * 60,
    durationFormatted: `${show.averageRuntime || show.runtime || 45}m / episode`,
    year,
    maturityRating: show.status === "Ended" ? "TV-MA" : "TV-14",
    resolution: "4K HDR Master",
    audio: show.network?.name || show.webChannel?.name || "Dolby 5.1",
    matchScore: score,
    genres: show.genres?.length ? show.genres : ["Drama", "Series"],
    cast: [],
    director: show.network?.name || show.webChannel?.name || "TVMaze Network",
    category: "Popular TV Shows",
    mediaType: "series",
    provider: "TVMaze Live Series Engine",
    availabilityLabel: "FULL EPISODE GUIDE",
    availabilityNote: "Browse all seasons and episodes with complete synopses, air dates, runtimes, and official stream links.",
    playable: false,
    hasEpisodes: true
  };
}

// Cache for top shows
let cachedTopSeries = null;
let topSeriesExpiresAt = 0;

export async function getTopTvSeries(limit = 24) {
  if (cachedTopSeries && topSeriesExpiresAt > Date.now()) {
    return cachedTopSeries;
  }

  try {
    const rawShows = await fetchJson(`${TVMAZE_ORIGIN}/shows?page=0`);
    const sorted = (Array.isArray(rawShows) ? rawShows : [])
      .sort((a, b) => (b.weight || 0) - (a.weight || 0))
      .slice(0, limit)
      .map(toTvMazeShow)
      .filter(Boolean);

    cachedTopSeries = sorted;
    topSeriesExpiresAt = Date.now() + 15 * 60 * 1000; // 15 mins cache
    return sorted;
  } catch (err) {
    console.warn("TVMaze top shows fetch error:", err.message);
    return [];
  }
}

// Fetch all episodes for a specific series
export async function getSeriesEpisodes(seriesId) {
  // Check streamable classic series first
  const classic = STREAMABLE_CLASSIC_SERIES.find((s) => s.id === seriesId);
  if (classic) {
    return {
      seriesId,
      title: classic.title,
      playable: true,
      totalEpisodes: classic.episodes.length,
      seasons: [
        {
          seasonNumber: 1,
          episodes: classic.episodes
        }
      ]
    };
  }

  // Handle tvmaze series
  let tvMazeId = seriesId;
  if (typeof seriesId === "string" && seriesId.startsWith("tvmaze_")) {
    tvMazeId = seriesId.replace("tvmaze_", "");
  }

  if (!/^\d+$/.test(String(tvMazeId))) {
    return { seriesId, error: "Invalid series ID", seasons: [] };
  }

  try {
    const rawEpisodes = await fetchJson(`${TVMAZE_ORIGIN}/shows/${tvMazeId}/episodes`);
    if (!Array.isArray(rawEpisodes)) {
      return { seriesId, seasons: [] };
    }

    const seasonsMap = new Map();
    rawEpisodes.forEach((ep) => {
      const sNum = ep.season || 1;
      if (!seasonsMap.has(sNum)) {
        seasonsMap.set(sNum, []);
      }
      seasonsMap.get(sNum).push({
        id: `tvmaze_ep_${ep.id}`,
        episodeId: ep.id,
        season: ep.season,
        number: ep.number,
        title: cleanText(ep.name, `Episode ${ep.number}`),
        duration: ep.runtime ? `${ep.runtime}m` : "45m",
        synopsis: cleanText(ep.summary, "No episode synopsis provided.").slice(0, 300),
        image: ep.image?.original || ep.image?.medium || "/backdrops/cosmic_odyssey.jpg",
        airdate: ep.airdate,
        rating: ep.rating?.average || null,
        url: ep.url
      });
    });

    const seasons = Array.from(seasonsMap.entries()).map(([seasonNumber, episodes]) => ({
      seasonNumber,
      episodes
    }));

    return {
      seriesId,
      playable: false,
      totalEpisodes: rawEpisodes.length,
      seasons
    };
  } catch (err) {
    console.warn(`Failed to fetch episodes for show ${tvMazeId}:`, err.message);
    return { seriesId, error: err.message, seasons: [] };
  }
}
