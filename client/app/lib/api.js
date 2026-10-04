// `localhost` on a phone or TV points at that device, not the computer running
// StreamHub. When no deployment URL is configured, use the page's hostname so
// a LAN invite (for example http://192.168.x.x:3000) reaches its matching API.
const localNetworkApiUrl = typeof window === "undefined"
  ? "http://localhost:5001"
  : `${window.location.protocol}//${window.location.hostname}:5001`;
const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL || localNetworkApiUrl;

export const API_URL = configuredApiUrl.replace(/\/$/, "");

export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || (
  typeof window === "undefined" ? "" : window.location.origin
)).replace(/\/$/, "");

export function apiUrl(path) {
  return `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export function mediaUrl(path) {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("data:") || path.startsWith("blob:")) {
    return path;
  }
  return apiUrl(path);
}
