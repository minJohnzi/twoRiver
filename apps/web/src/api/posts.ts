import type { AboutProfile, Category, PublicPost, PublicPostListItem, Tag } from "@tworiver/shared";
import { apiRequest } from "./client";

export function fetchPosts(init?: RequestInit) {
  return apiRequest<{ posts: PublicPostListItem[] }>("/api/posts", init);
}

export function fetchPost(slug: string, init?: RequestInit) {
  return apiRequest<{ post: PublicPost }>(`/api/posts/${slug}`, init);
}

export function fetchTags(init?: RequestInit) {
  return apiRequest<{ tags: Tag[] }>("/api/tags", init);
}

export function fetchTagDetail(slug: string, init?: RequestInit) {
  return apiRequest<{ tag: Tag; posts: PublicPostListItem[] }>(`/api/tags/${slug}`, init);
}

export function fetchCategories(init?: RequestInit) {
  return apiRequest<{ categories: Category[] }>("/api/categories", init);
}

export function fetchCategoryDetail(slug: string, init?: RequestInit) {
  return apiRequest<{ category: Category; posts: PublicPostListItem[] }>(`/api/categories/${slug}`, init);
}

export function fetchAboutProfile(init?: RequestInit) {
  return apiRequest<{ about: AboutProfile }>("/api/about", init);
}
