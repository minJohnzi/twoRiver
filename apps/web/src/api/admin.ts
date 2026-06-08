import type { AboutProfile, PublicPost, UpsertAboutProfileInput, UpsertPostInput } from "@tworiver/shared";
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

export function fetchCurrentUser() {
  return apiRequest<{ user: CurrentUser }>("/api/auth/me");
}

export function fetchAdminPosts() {
  return apiRequest<{ posts: PublicPost[] }>("/api/admin/posts");
}

export function fetchAdminPost(id: number) {
  return apiRequest<{ post: PublicPost }>(`/api/admin/posts/${id}`);
}

export function createAdminPost(input: UpsertPostInput) {
  return apiRequest<{ post: PublicPost }>("/api/admin/posts", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateAdminPost(id: number, input: UpsertPostInput) {
  return apiRequest<{ post: PublicPost }>(`/api/admin/posts/${id}`, {
    method: "PUT",
    body: JSON.stringify(input)
  });
}

export function fetchAdminAboutProfile() {
  return apiRequest<{ about: AboutProfile }>("/api/admin/about");
}

export function updateAdminAboutProfile(input: UpsertAboutProfileInput) {
  return apiRequest<{ about: AboutProfile }>("/api/admin/about", {
    method: "PUT",
    body: JSON.stringify(input)
  });
}
