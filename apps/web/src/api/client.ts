const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? "http://localhost:4000" : "");
const CSRF_COOKIE_NAME = "tworiver_csrf";

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

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
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

  return response.json() as Promise<T>;
}
