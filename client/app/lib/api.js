// When accessed through Cloudflare, custom domain (lokesh007.qzz.io), or VPS port 80/443,
// Nginx proxies /api, /auth, /media, and /socket.io directly from the same origin.
// In local development or LAN testing, it resolves to port 5001.
function resolveBaseUrl() {
  if (typeof window !== "undefined") {
    if (window.location.port === "" || window.location.port === "80" || window.location.port === "443") {
      return window.location.origin;
    }
    return process.env.NEXT_PUBLIC_API_URL || `${window.location.protocol}//${window.location.hostname}:5001`;
  }
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";
}

export const API_URL = resolveBaseUrl().replace(/\/$/, "");

export const APP_URL = (
  typeof window === "undefined"
    ? (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000")
    : window.location.origin
).replace(/\/$/, "");

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
