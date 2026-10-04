// Family-safe catalogue policy. This is intentionally applied on the server so
// a client cannot recover restricted upstream titles by bypassing the UI.

const RESTRICTED_METADATA = /(?:\b(?:porn(?:ography|ographic)?|erotic(?:a|ism)?|sex(?:ual|ually)?|nud(?:e|ity)|striptease|fetish|escort|prostitut(?:e|ion)|cam(?:girl|site)|onlyfans)\b|(?:^|[^a-z0-9])xxx(?:[^a-z0-9]|$))/i;
const RESTRICTED_RATINGS = /(?:\b(?:nc[- ]?17|x[- ]?rated|adults?\s*only|18\+)\b|\bxxx\b)/i;

function asText(value) {
  if (Array.isArray(value)) return value.join(" ");
  return typeof value === "string" ? value : "";
}

/**
 * Reject upstream metadata that is explicitly marked adult or whose public
 * title, genres, tag line, synopsis, or rating identifies sexual content.
 * This is a conservative metadata filter, not a claim about the content of
 * every unclassified film.
 */
export function isFamilySafeMedia(media) {
  if (!media || media.adult === true || media.isAdult === true) return false;

  const metadata = [
    media.title,
    media.tagline,
    media.synopsis,
    media.description,
    media.overview,
    media.genres,
    media.genre,
    media.keywords,
    media.subject,
    media.category
  ].map(asText).join(" ");

  return !RESTRICTED_METADATA.test(metadata)
    && !RESTRICTED_RATINGS.test(asText(media.maturityRating || media.rating));
}

export function filterFamilySafeMedia(items) {
  return (Array.isArray(items) ? items : []).filter(isFamilySafeMedia);
}
