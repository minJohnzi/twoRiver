import { apiRequest } from "./client";

export interface CurrentUser {
  id: number;
  username: string;
}

export function login(username: string, password: string) {
  return apiRequest<{ user: CurrentUser }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
}

export function logout() {
  return apiRequest<{ ok: true }>("/api/auth/logout", {
    method: "POST"
  });
}

export function fetchCurrentUser(init?: RequestInit) {
  return apiRequest<{ user: CurrentUser }>("/api/auth/me", init);
}
