import type { AboutProfile, PublicPost, PublicPostListItem, Tag } from "@tworiver/shared";
import { apiRequest } from "./client";

export function fetchPosts() {
  return apiRequest<{ posts: PublicPostListItem[] }>("/api/posts");
}

export function fetchPost(slug: string) {
  return apiRequest<{ post: PublicPost }>(`/api/posts/${slug}`);
}

export function fetchTags() {
  return apiRequest<{ tags: Tag[] }>("/api/tags");
}

export function fetchAboutProfile() {
  return apiRequest<{ about: AboutProfile }>("/api/about");
}
