import type { AboutProfile, Category, PaginatedPostsResponse, PublicPost, PublicPostListItem, Tag } from "@tworiver/shared";
import { apiRequest } from "./client";

interface FetchPostsOptions {
  page?: number;
  limit?: number;
  init?: RequestInit;
}

export function fetchPosts(options: FetchPostsOptions = {}) {
  const params = new URLSearchParams();
  if (options.page !== undefined) {
    params.set("page", String(options.page));
  }
  if (options.limit !== undefined) {
    params.set("limit", String(options.limit));
  }

  const query = params.toString();
  return apiRequest<PaginatedPostsResponse>(`/api/posts${query ? `?${query}` : ""}`, options.init);
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
