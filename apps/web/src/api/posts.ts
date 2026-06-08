import type { AboutProfile, Category, PublicPost, PublicPostListItem, Tag } from "@tworiver/shared";
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

export function fetchTagDetail(slug: string) {
  return apiRequest<{ tag: Tag; posts: PublicPostListItem[] }>(`/api/tags/${slug}`);
}

export function fetchCategories() {
  return apiRequest<{ categories: Category[] }>("/api/categories");
}

export function fetchCategoryDetail(slug: string) {
  return apiRequest<{ category: Category; posts: PublicPostListItem[] }>(`/api/categories/${slug}`);
}

export function fetchAboutProfile() {
  return apiRequest<{ about: AboutProfile }>("/api/about");
}
