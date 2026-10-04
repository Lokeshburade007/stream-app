const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";

export const API_URL = configuredApiUrl.replace(/\/$/, "");

export function apiUrl(path) {
  return `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
