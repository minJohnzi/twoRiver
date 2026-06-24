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
export { fetchCurrentUser, login, logout, type CurrentUser } from "./auth";

export function fetchAdminPosts(init?: RequestInit) {
  return apiRequest<{ posts: PublicPost[] }>("/api/admin/posts", init);
}

export function fetchAdminPost(id: number, init?: RequestInit) {
  return apiRequest<{ post: PublicPost }>(`/api/admin/posts/${id}`, init);
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

export function uploadAdminAboutAvatar(file: File) {
  const body = new FormData();
  body.set("file", file);

  return apiRequest<Pick<UploadedImage, "url">>("/api/admin/uploads/about-avatar", {
    method: "POST",
    body
  });
}

export type AdminResourceKind = "post-image" | "about-image" | "asset";

export interface AdminResource {
  kind: AdminResourceKind;
  url: string;
  relativePath: string;
  filename: string;
  directory: string;
  folder: string;
  sizeBytes: number;
  updatedAt: string;
  contentType: string;
  postUid: string | null;
}

export function fetchAdminResources(init?: RequestInit) {
  return apiRequest<{ resources: AdminResource[] }>("/api/admin/resources", init);
}

export function uploadAdminResource(input: { file: File; folder: string }) {
  const body = new FormData();
  body.set("folder", input.folder);
  body.set("file", input.file);

  return apiRequest<{ resource: AdminResource }>("/api/admin/resources", {
    method: "POST",
    body
  });
}

export function moveAdminResource(input: { url: string; folder: string }) {
  return apiRequest<{ resource: AdminResource }>("/api/admin/resources", {
    method: "PUT",
    body: JSON.stringify(input)
  });
}

export function deleteAdminResource(url: string) {
  return apiRequest<{ ok: true }>("/api/admin/resources", {
    method: "DELETE",
    body: JSON.stringify({ url })
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

export function fetchAdminAboutProfile(init?: RequestInit) {
  return apiRequest<{ about: AboutProfile }>("/api/admin/about", init);
}

export function updateAdminAboutProfile(input: UpsertAboutProfileInput) {
  return apiRequest<{ about: AboutProfile }>("/api/admin/about", {
    method: "PUT",
    body: JSON.stringify(input)
  });
}

export function fetchAdminTags(init?: RequestInit) {
  return apiRequest<{ tags: Tag[] }>("/api/admin/tags", init);
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

export function fetchAdminCategories(init?: RequestInit) {
  return apiRequest<{ categories: Category[] }>("/api/admin/categories", init);
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
