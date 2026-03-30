function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

export function getApiBaseUrl(): string | null {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (!configured) return null;
  return normalizeBaseUrl(configured);
}

export function buildApiUrl(path: string): string {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) return path;
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}
