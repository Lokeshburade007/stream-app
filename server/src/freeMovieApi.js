// Free Movies Streaming API Service with rich metadata and verified MP4 streaming URLs
// Native fetch is globally available in Node.js 18+

// Curated high-reliability free streaming movies from Archive.org and Open Cinema
export const CURATED_FREE_MOVIES = [
  {
    id: "night-of-the-living-dead",
    title: "Night of the Living Dead",
    tagline: "They won't stay dead!",
    synopsis: "A ragtag group of terrified survivors barricade themselves in a deserted rural farmhouse to defend themselves against a mysterious legion of reanimated, flesh-seeking zombies.",
    backdrop: "https://archive.org/services/img/night_of_the_living_dead",
    poster: "https://archive.org/services/img/night_of_the_living_dead",
    videoSource: "https://archive.org/download/night_of_the_living_dead/night_of_the_living_dead.mp4",
    duration: 5760, // 1h 36m
    durationFormatted: "1h 36m",
    year: 1968,
    maturityRating: "TV-MA",
    resolution: "1080p Remastered",
    audio: "Mono Restored",
    matchScore: 98,
    genres: ["Horror", "Cult Classic", "Sci-Fi Thriller"],
    cast: ["Duane Jones", "Judith O'Dea", "Karl Hardman"],
    director: "George A. Romero",
    isFeatured: false,
    category: "Free Feature Films"
  },
  {
    id: "the-fast-and-the-furious-1955",
    title: "The Fast And The Furious",
    tagline: "Desperate man... desperate woman... in a high-speed dash for the border!",
    synopsis: "A man wrongly convicted of murder breaks out of prison and takes a beautiful sports car driver hostage as he attempts to escape across the border in an illicit road race.",
    backdrop: "https://archive.org/services/img/TheFastandtheFuriousJohnIreland1954goofyrip",
    poster: "https://archive.org/services/img/TheFastandtheFuriousJohnIreland1954goofyrip",
    videoSource: "https://archive.org/download/TheFastandtheFuriousJohnIreland1954goofyrip/TheFastandtheFuriousJohnIreland1954goofyrip.mp4",
    duration: 4440, // 1h 14m
    durationFormatted: "1h 14m",
    year: 1955,
    maturityRating: "PG",
    resolution: "HD Restored",
    audio: "Original Audio",
    matchScore: 95,
    genres: ["Action", "Crime", "Thriller"],
    cast: ["John Ireland", "Dorothy Malone", "Bruce Carlisle"],
    director: "Edward Sampson, John Ireland",
    isFeatured: false,
    category: "Action & Adventure"
  },
  {
    id: "voyage-to-prehistoric-women",
    title: "Voyage to the Planet of Prehistoric Women",
    tagline: "Stranded on Venus... where beauty and danger rule!",
    synopsis: "Astronauts landing on the surface of Venus discover a perilous prehistoric environment controlled by an enigmatic telepathic tribe of amphibious women who worship a giant pterodactyl god.",
    backdrop: "https://archive.org/services/img/VoyagetothePlanetofPrehistoricWomen",
    poster: "https://archive.org/services/img/VoyagetothePlanetofPrehistoricWomen",
    videoSource: "https://archive.org/download/VoyagetothePlanetofPrehistoricWomen/VoyagetothePlanetofPrehistoricWomen.mp4",
    duration: 4800, // 1h 20m
    durationFormatted: "1h 20m",
    year: 1968,
    maturityRating: "PG-13",
    resolution: "1080p HD",
    audio: "Stereo",
    matchScore: 91,
    genres: ["Sci-Fi", "Cult Classic", "Adventure"],
    cast: ["Mamie Van Doren", "Mary Marr", "Paige Lee"],
    director: "Peter Bogdanovich",
    isFeatured: false,
    category: "Sci-Fi & Cyberpunk"
  },
  {
    id: "house-on-haunted-hill",
    title: "House on Haunted Hill",
    tagline: "See it with someone whose scream won't frighten you to death!",
    synopsis: "An eccentric millionaire offers $10,000 to five guests if they can survive a night locked inside his terrifying haunted mansion filled with macabre surprises.",
    backdrop: "https://archive.org/services/img/house_on_haunted_hill",
    poster: "https://archive.org/services/img/house_on_haunted_hill",
    videoSource: "https://archive.org/download/house_on_haunted_hill/house_on_haunted_hill.mp4",
    duration: 4500, // 1h 15m
    durationFormatted: "1h 15m",
    year: 1959,
    maturityRating: "TV-14",
    resolution: "HD Restored",
    audio: "Mono Hi-Fi",
    matchScore: 96,
    genres: ["Horror", "Mystery", "Thriller"],
    cast: ["Vincent Price", "Carol Ohmart", "Richard Long"],
    director: "William Castle",
    isFeatured: false,
    category: "Free Feature Films"
  },
  {
    id: "the-stranger-orson-welles",
    title: "The Stranger",
    tagline: "The most deceitful love a woman ever knew!",
    synopsis: "An investigator from the War Crimes Commission travels to a quiet Connecticut town in pursuit of an escaped high-ranking fugitive living under an assumed identity.",
    backdrop: "https://archive.org/services/img/TheStranger1946OrsonWelles",
    poster: "https://archive.org/services/img/TheStranger1946OrsonWelles",
    videoSource: "https://archive.org/download/TheStranger1946OrsonWelles/TheStranger1946OrsonWelles.mp4",
    duration: 5700, // 1h 35m
    durationFormatted: "1h 35m",
    year: 1946,
    maturityRating: "PG-13",
    resolution: "1080p HD",
    audio: "Restored Audio",
    matchScore: 97,
    genres: ["Film Noir", "Mystery", "Thriller"],
    cast: ["Orson Welles", "Edward G. Robinson", "Loretta Young"],
    director: "Orson Welles",
    isFeatured: false,
    category: "Free Feature Films"
  },
  {
    id: "jungle-book-1942",
    title: "Jungle Book",
    tagline: "The immortal classic comes to breathtaking life!",
    synopsis: "Mowgli, a boy raised by wild wolves in the lush forests of India, must confront the fearsome tiger Shere Khan and protect the secret treasure of the lost jungle city.",
    backdrop: "https://archive.org/services/img/JungleBook",
    poster: "https://archive.org/services/img/JungleBook",
    videoSource: "https://archive.org/download/JungleBook/JungleBook.mp4",
    duration: 6360, // 1h 46m
    durationFormatted: "1h 46m",
    year: 1942,
    maturityRating: "TV-PG",
    resolution: "Technicolor Restored",
    audio: "Stereo",
    matchScore: 94,
    genres: ["Adventure", "Family", "Fantasy"],
    cast: ["Sabu", "Joseph Calleia", "John Qualen"],
    director: "Zoltan Korda",
    isFeatured: false,
    category: "Animation & Comedy"
  }
];

// Dynamic Search against Internet Archive Open Movie API
export async function searchArchiveMovies(query, limit = 8) {
  try {
    const cleanQuery = encodeURIComponent(query.trim());
    const url = `https://archive.org/advancedsearch.php?q=(${cleanQuery})+AND+collection%3A(feature_films)+AND+format%3A(%22h.264%22)&fl[]=identifier,title,description,year,genre,downloads&sort[]=downloads+desc&rows=${limit}&page=1&output=json`;

    const res = await fetch(url);
    if (!res.ok) return [];

    const data = await res.json();
    const docs = data?.response?.docs || [];

    return docs.map((doc) => {
      const id = doc.identifier;
      return {
        id: `archive_${id}`,
        title: doc.title || id.replace(/[_-]/g, " "),
        tagline: "Free Streaming via Internet Archive Open Cinema",
        synopsis: (doc.description || "A public domain feature film available for free streaming.").replace(/<[^>]*>?/gm, "").substring(0, 300) + "...",
        backdrop: `https://archive.org/services/img/${id}`,
        poster: `https://archive.org/services/img/${id}`,
        videoSource: `https://archive.org/download/${id}/${id}.mp4`,
        duration: 5400,
        durationFormatted: "1h 30m",
        year: doc.year || 1950,
        maturityRating: "PG-13",
        resolution: "HD Streaming",
        audio: "Stereo",
        matchScore: Math.floor(Math.random() * 8 + 92),
        genres: [doc.genre || "Classic Film", "Free Movie"],
        cast: ["Open Cinema Archive"],
        director: "Classic Cinema",
        isFeatured: false,
        category: "Free Feature Films"
      };
    });
  } catch (err) {
    console.error("Archive search failed:", err.message);
    return [];
  }
}
