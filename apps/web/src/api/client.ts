const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

interface ApiErrorResponse {
  message?: string;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({
      message: response.statusText
    }))) as ApiErrorResponse;
    throw new Error(error.message ?? response.statusText);
  }

  return response.json() as Promise<T>;
}
