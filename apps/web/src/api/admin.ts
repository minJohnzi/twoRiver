import type {
  AboutProfile,
  Category,
  Locale,
  PostTranslation,
  PublicPost,
  Tag,
  UpsertAboutProfileInput,
  UpsertPostInput
} from "@tworiver/shared";
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

export function deleteAdminPost(id: number) {
  return apiRequest<{ ok: true }>(`/api/admin/posts/${id}`, {
    method: "DELETE"
  });
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

export interface UploadedImage {
  url: string;
  markdown: string;
}

export function uploadAdminPostImage(input: { postUid: string; file: File }) {
  const body = new FormData();
  body.set("postUid", input.postUid);
  body.set("file", input.file);

  return apiRequest<UploadedImage>("/api/admin/uploads/images", {
    method: "POST",
    body
  });
}

export interface TranslatePostDraftInput {
  source: Pick<PostTranslation, "locale" | "title" | "summary" | "contentMarkdown">;
  targetLocale: Locale;
}

export interface TranslatePostDraftResponse {
  translation: PostTranslation;
  warnings: string[];
}

export function translateAdminPostDraft(input: TranslatePostDraftInput) {
  return apiRequest<TranslatePostDraftResponse>("/api/admin/posts/translate-draft", {
    method: "POST",
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

export function fetchAdminTags() {
  return apiRequest<{ tags: Tag[] }>("/api/admin/tags");
}

export function createAdminTag(input: { slug: string; name: string }) {
  return apiRequest<{ tag: Tag }>("/api/admin/tags", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateAdminTag(id: number, input: { slug: string; name: string }) {
  return apiRequest<{ tag: Tag }>(`/api/admin/tags/${id}`, {
    method: "PUT",
    body: JSON.stringify(input)
  });
}

export function deleteAdminTag(id: number) {
  return apiRequest<{ ok: true }>(`/api/admin/tags/${id}`, {
    method: "DELETE"
  });
}

export function fetchAdminCategories() {
  return apiRequest<{ categories: Category[] }>("/api/admin/categories");
}

export function createAdminCategory(input: { slug: string; name: string }) {
  return apiRequest<{ category: Category }>("/api/admin/categories", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateAdminCategory(id: number, input: { slug: string; name: string }) {
  return apiRequest<{ category: Category }>(`/api/admin/categories/${id}`, {
    method: "PUT",
    body: JSON.stringify(input)
  });
}

export function deleteAdminCategory(id: number) {
  return apiRequest<{ ok: true }>(`/api/admin/categories/${id}`, {
    method: "DELETE"
  });
}
