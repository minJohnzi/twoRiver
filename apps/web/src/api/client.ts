export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const CSRF_COOKIE_NAME = "tworiver_csrf";
const PUBLIC_GET_CACHE_TTL_MS = 30_000;
const MAX_PUBLIC_GET_CACHE_ENTRIES = 48;

interface CachedApiResponse {
  expiresAt: number;
  value: unknown;
}

const publicGetCache = new Map<string, CachedApiResponse>();
const inFlightPublicGetRequests = new Map<string, Promise<unknown>>();
let publicGetCacheVersion = 0;

interface ApiErrorResponse {
  message?: string;
}

function describeNonJsonResponse(path: string, response: Response, bodyPreview: string): string {
  if (bodyPreview.trimStart().startsWith("<!doctype") || bodyPreview.trimStart().startsWith("<html")) {
    return `API request ${path} returned HTML instead of JSON. Make sure the API server is running on port 4000 and the Vite dev proxy is active.`;
  }

  return `API request ${path} returned ${response.status} ${response.statusText || "non-JSON response"}.`;
}

function getCookie(name: string): string | undefined {
  const prefix = `${name}=`;
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
}

function isStateChangingMethod(method: string | undefined): boolean {
  const normalized = method?.toUpperCase() ?? "GET";
  return !["GET", "HEAD", "OPTIONS"].includes(normalized);
}

function normalizeMethod(method: string | undefined): string {
  return method?.toUpperCase() ?? "GET";
}

function clearPublicGetCache() {
  publicGetCacheVersion += 1;
  publicGetCache.clear();
  inFlightPublicGetRequests.clear();
}

function isPublicGetCacheable(path: string, init: RequestInit, headers: Headers): boolean {
  const method = normalizeMethod(init.method);
  return (
    method === "GET" &&
    init.body === undefined &&
    init.signal === undefined &&
    init.cache !== "no-store" &&
    !headers.has("Authorization") &&
    !headers.has("Cache-Control") &&
    !path.startsWith("/api/admin") &&
    !path.startsWith("/api/auth")
  );
}

function buildRequestHeaders(init: RequestInit): Headers {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (isStateChangingMethod(init.method) && !headers.has("X-CSRF-Token")) {
    const csrfToken = getCookie(CSRF_COOKIE_NAME);
    if (csrfToken) {
      headers.set("X-CSRF-Token", decodeURIComponent(csrfToken));
    }
  }

  return headers;
}

function getCachedPublicResponse<T>(cacheKey: string): T | undefined {
  const cached = publicGetCache.get(cacheKey);
  if (!cached) {
    return undefined;
  }

  if (cached.expiresAt <= Date.now()) {
    publicGetCache.delete(cacheKey);
    return undefined;
  }

  return cached.value as T;
}

function setCachedPublicResponse(cacheKey: string, value: unknown) {
  if (publicGetCache.size >= MAX_PUBLIC_GET_CACHE_ENTRIES) {
    const oldestKey = publicGetCache.keys().next().value;
    if (oldestKey) {
      publicGetCache.delete(oldestKey);
    }
  }

  publicGetCache.set(cacheKey, {
    expiresAt: Date.now() + PUBLIC_GET_CACHE_TTL_MS,
    value
  });
}

export function resolveApiAssetUrl(url: string): string {
  if (!url.startsWith("/uploads/") || !API_BASE_URL) {
    return url;
  }

  return new URL(url, API_BASE_URL).toString();
}

async function fetchJson<T>(path: string, init: RequestInit, headers: Headers): Promise<T> {
  const method = normalizeMethod(init.method);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers
  });

  const contentType = response.headers.get("Content-Type") ?? "";
  if (!contentType.includes("application/json")) {
    const bodyPreview = await response.text().catch(() => "");
    throw new Error(describeNonJsonResponse(path, response, bodyPreview));
  }

  if (!response.ok) {
    const error = (await response.json()) as ApiErrorResponse;
    throw new Error(error.message ?? response.statusText);
  }

  const data = (await response.json()) as T;
  if (isStateChangingMethod(method)) {
    clearPublicGetCache();
  }

  return data;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = buildRequestHeaders(init);
  const cacheKey = `${API_BASE_URL}${path}`;
  if (isPublicGetCacheable(path, init, headers)) {
    const cached = getCachedPublicResponse<T>(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const inFlightRequest = inFlightPublicGetRequests.get(cacheKey);
    if (inFlightRequest) {
      return inFlightRequest as Promise<T>;
    }

    const requestVersion = publicGetCacheVersion;
    const request = fetchJson<T>(path, init, headers)
      .then((data) => {
        if (requestVersion === publicGetCacheVersion) {
          setCachedPublicResponse(cacheKey, data);
        }
        return data;
      })
      .finally(() => {
        inFlightPublicGetRequests.delete(cacheKey);
      });

    inFlightPublicGetRequests.set(cacheKey, request);
    return request;
  }

  return fetchJson<T>(path, init, headers);
}
