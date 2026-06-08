import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { fetchCurrentUser, fetchAdminPosts, logout } from "./api/admin";
import {
  fetchCategories,
  fetchCategoryDetail,
  fetchPosts,
  fetchTagDetail,
  fetchTags
} from "./api/posts";

vi.mock("./api/admin", () => ({
  fetchCurrentUser: vi.fn(),
  fetchAdminPosts: vi.fn(),
  fetchAdminPost: vi.fn(),
  createAdminPost: vi.fn(),
  updateAdminPost: vi.fn(),
  deleteAdminPost: vi.fn(),
  fetchAdminCategories: vi.fn(),
  fetchAdminTags: vi.fn(),
  fetchAdminAboutProfile: vi.fn(),
  updateAdminAboutProfile: vi.fn(),
  createAdminCategory: vi.fn(),
  updateAdminCategory: vi.fn(),
  deleteAdminCategory: vi.fn(),
  createAdminTag: vi.fn(),
  updateAdminTag: vi.fn(),
  deleteAdminTag: vi.fn(),
  logout: vi.fn()
}));

vi.mock("./api/posts", () => ({
  fetchPosts: vi.fn(),
  fetchPost: vi.fn(),
  fetchCategories: vi.fn(),
  fetchCategoryDetail: vi.fn(),
  fetchTags: vi.fn(),
  fetchTagDetail: vi.fn(),
  fetchAboutProfile: vi.fn()
}));

const mockedFetchCurrentUser = vi.mocked(fetchCurrentUser);
const mockedFetchAdminPosts = vi.mocked(fetchAdminPosts);
const mockedLogout = vi.mocked(logout);
const mockedFetchPosts = vi.mocked(fetchPosts);
const mockedFetchTags = vi.mocked(fetchTags);
const mockedFetchTagDetail = vi.mocked(fetchTagDetail);
const mockedFetchCategories = vi.mocked(fetchCategories);
const mockedFetchCategoryDetail = vi.mocked(fetchCategoryDetail);

describe("admin route protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("redirects unauthenticated admin visitors to login", async () => {
    mockedFetchCurrentUser.mockRejectedValue(new Error("Authentication required"));

    render(
      <MemoryRouter initialEntries={["/admin/posts"]}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "进入写作中控室" })).toBeInTheDocument();
    expect(mockedFetchAdminPosts).not.toHaveBeenCalled();
  });

  it("shows a logout entry for authenticated admins and clears the session", async () => {
    mockedFetchCurrentUser.mockResolvedValue({ user: { id: 1, username: "admin" } });
    mockedFetchAdminPosts.mockResolvedValue({ posts: [] });
    mockedLogout.mockResolvedValue({ ok: true });

    render(
      <MemoryRouter initialEntries={["/admin/posts"]}>
        <App />
      </MemoryRouter>
    );

    const logoutButton = await screen.findByRole("button", { name: /logout/i });
    fireEvent.click(logoutButton);

    await waitFor(() => expect(mockedLogout).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("heading", { name: "进入写作中控室" })).toBeInTheDocument();
  });
});

describe("public taxonomy routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders category and tag list pages from direct routes", async () => {
    mockedFetchCategories.mockResolvedValue({ categories: [{ id: 1, slug: "engineering", name: "Engineering" }] });
    mockedFetchTags.mockResolvedValue({ tags: [{ id: 1, slug: "release", name: "Release" }] });

    render(
      <MemoryRouter initialEntries={["/categories"]}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Categories" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Engineering" })).toHaveAttribute("href", "/categories/engineering");

    cleanup();

    render(
      <MemoryRouter initialEntries={["/tags"]}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Tags" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Release" })).toHaveAttribute("href", "/tags/release");
  });

  it("renders taxonomy detail pages and filters posts from the API response", async () => {
    const post = {
      id: 1,
      slug: "published-flow",
      status: "published" as const,
      publishedAt: "2026-02-03T04:05:06.000Z",
      createdAt: "2026-02-03T04:05:06.000Z",
      updatedAt: "2026-02-03T04:05:06.000Z",
      category: { id: 1, slug: "engineering", name: "Engineering" },
      tags: [{ id: 1, slug: "release", name: "Release" }],
      translations: [
        {
          locale: "en" as const,
          title: "Published flow",
          summary: "Visible",
          contentMarkdown: "",
          seoTitle: null,
          seoDescription: null
        }
      ]
    };
    mockedFetchCategoryDetail.mockResolvedValue({
      category: { id: 1, slug: "engineering", name: "Engineering" },
      posts: [post]
    });
    mockedFetchTagDetail.mockResolvedValue({
      tag: { id: 1, slug: "release", name: "Release" },
      posts: [post]
    });

    render(
      <MemoryRouter initialEntries={["/categories/engineering"]}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Engineering" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Published flow" })).toHaveAttribute("href", "/posts/published-flow");

    cleanup();

    render(
      <MemoryRouter initialEntries={["/tags/release"]}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Release" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Published flow" })).toHaveAttribute("href", "/posts/published-flow");
  });

  it("renders a dedicated 404 page for unknown routes", async () => {
    mockedFetchPosts.mockResolvedValue({ posts: [] });
    mockedFetchTags.mockResolvedValue({ tags: [] });

    render(
      <MemoryRouter initialEntries={["/not-a-real-route"]}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute("href", "/");
  });
});
