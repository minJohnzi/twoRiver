import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { fetchAdminCategories, fetchAdminPosts, fetchAdminResources } from "./api/admin";
import { fetchCurrentUser, logout } from "./api/auth";
import {
  fetchCategories,
  fetchCategoryDetail,
  fetchPost,
  fetchPosts,
  fetchTagDetail,
  fetchTags
} from "./api/posts";

vi.mock("./api/admin", () => ({
  fetchAdminPosts: vi.fn(),
  fetchAdminPost: vi.fn(),
  createAdminPost: vi.fn(),
  updateAdminPost: vi.fn(),
  deleteAdminPost: vi.fn(),
  fetchAdminCategories: vi.fn(),
  fetchAdminTags: vi.fn(),
  fetchAdminAboutProfile: vi.fn(),
  fetchAdminResources: vi.fn(),
  uploadAdminResource: vi.fn(),
  moveAdminResource: vi.fn(),
  deleteAdminResource: vi.fn(),
  updateAdminAboutProfile: vi.fn(),
  createAdminCategory: vi.fn(),
  updateAdminCategory: vi.fn(),
  deleteAdminCategory: vi.fn(),
  createAdminTag: vi.fn(),
  updateAdminTag: vi.fn(),
  deleteAdminTag: vi.fn()
}));

vi.mock("./api/auth", () => ({
  fetchCurrentUser: vi.fn(),
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
const mockedFetchAdminCategories = vi.mocked(fetchAdminCategories);
const mockedFetchAdminPosts = vi.mocked(fetchAdminPosts);
const mockedFetchAdminResources = vi.mocked(fetchAdminResources);
const mockedLogout = vi.mocked(logout);
const mockedFetchPosts = vi.mocked(fetchPosts);
const mockedFetchPost = vi.mocked(fetchPost);
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

  it("starts the admin login form with an empty username", async () => {
    window.localStorage.setItem("tworiver_admin_locale", "en");

    render(
      <MemoryRouter initialEntries={["/admin/login"]}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByLabelText("Username")).toHaveValue("");
  });

  it("reads public and admin language preferences independently", async () => {
    window.localStorage.setItem("tworiver_locale", "en");
    window.localStorage.setItem("tworiver_admin_locale", "zh");

    const { unmount } = render(
      <MemoryRouter initialEntries={["/admin/login"]}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByRole("button", { name: "Switch to English" })).toBeInTheDocument();

    unmount();

    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByRole("button", { name: "Switch to Chinese" })).toBeInTheDocument();
  });

  it("persists public and admin language changes independently", async () => {
    window.localStorage.setItem("tworiver_locale", "zh");
    window.localStorage.setItem("tworiver_admin_locale", "zh");

    const { unmount } = render(
      <MemoryRouter initialEntries={["/admin/login"]}>
        <App />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole("button", { name: "Switch to English" }));
    expect(window.localStorage.getItem("tworiver_admin_locale")).toBe("en");
    expect(window.localStorage.getItem("tworiver_locale")).toBe("zh");

    unmount();
    window.localStorage.setItem("tworiver_locale", "en");

    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole("button", { name: "Switch to Chinese" }));
    expect(window.localStorage.getItem("tworiver_locale")).toBe("zh");
    expect(window.localStorage.getItem("tworiver_admin_locale")).toBe("en");
  });

  it("reads public and admin theme preferences independently", async () => {
    window.localStorage.setItem("tworiver_theme", "light");
    window.localStorage.setItem("tworiver_admin_theme", "dark");

    const { container, unmount } = render(
      <MemoryRouter initialEntries={["/admin/login"]}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByRole("button", { name: "Switch to light theme" })).toBeInTheDocument();
    expect(container.querySelector(".app-shell")).toHaveAttribute("data-theme", "dark");

    unmount();
    mockedFetchPosts.mockResolvedValue({ posts: [], total: 0, page: 1, limit: 20 });
    mockedFetchTags.mockResolvedValue({ tags: [] });

    const publicRender = render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByRole("button", { name: "Switch to dark theme" })).toBeInTheDocument();
    expect(publicRender.container.querySelector(".app-shell")).toHaveAttribute("data-theme", "light");
  });

  it("persists public and admin theme changes independently", async () => {
    window.localStorage.setItem("tworiver_theme", "dark");
    window.localStorage.setItem("tworiver_admin_theme", "dark");

    const { container, unmount } = render(
      <MemoryRouter initialEntries={["/admin/login"]}>
        <App />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole("button", { name: "Switch to light theme" }));
    expect(window.localStorage.getItem("tworiver_admin_theme")).toBe("light");
    expect(window.localStorage.getItem("tworiver_theme")).toBe("dark");
    expect(container.querySelector(".app-shell")).toHaveAttribute("data-theme", "light");

    unmount();
    mockedFetchPosts.mockResolvedValue({ posts: [], total: 0, page: 1, limit: 20 });
    mockedFetchTags.mockResolvedValue({ tags: [] });

    const publicRender = render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole("button", { name: "Switch to light theme" }));
    expect(window.localStorage.getItem("tworiver_theme")).toBe("light");
    expect(window.localStorage.getItem("tworiver_admin_theme")).toBe("light");
    expect(publicRender.container.querySelector(".app-shell")).toHaveAttribute("data-theme", "light");
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
  it("reuses the verified admin session across protected admin pages", async () => {
    mockedFetchCurrentUser.mockResolvedValue({ user: { id: 1, username: "admin" } });
    mockedFetchAdminPosts.mockResolvedValue({ posts: [] });
    mockedFetchAdminCategories.mockResolvedValue({ categories: [] });

    render(
      <MemoryRouter initialEntries={["/admin/posts"]}>
        <App />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole("link", { name: "分类管理" }));

    await screen.findByRole("heading", { name: "分类管理" });
    expect(mockedFetchCurrentUser).toHaveBeenCalledTimes(1);
  });

  it("renders the admin resource manager from the sidebar route", async () => {
    mockedFetchCurrentUser.mockResolvedValue({ user: { id: 1, username: "admin" } });
    mockedFetchAdminResources.mockResolvedValue({
      resources: [
        {
          kind: "post-image",
          url: "/uploads/images/posts/p_11111111-1111-4111-8111-111111111111/photo.png",
          relativePath: "images/posts/p_11111111-1111-4111-8111-111111111111/photo.png",
          filename: "photo.png",
          directory: "images/posts/p_11111111-1111-4111-8111-111111111111",
          folder: "images/posts/p_11111111-1111-4111-8111-111111111111",
          sizeBytes: 2048,
          updatedAt: "2026-06-24T06:00:00.000Z",
          contentType: "image/png",
          postUid: "p_11111111-1111-4111-8111-111111111111"
        }
      ]
    });

    render(
      <MemoryRouter initialEntries={["/admin/resources"]}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "资源管理" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "资源管理" })).toHaveAttribute("href", "/admin/resources");
    expect(await screen.findAllByText("photo.png")).toHaveLength(2);
    expect(mockedFetchAdminResources).toHaveBeenCalledTimes(1);
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
    expect(await screen.findByRole("link", { name: "Engineering" })).toHaveAttribute("href", "/categories/engineering");

    cleanup();

    render(
      <MemoryRouter initialEntries={["/tags"]}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Tags" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Release" })).toHaveAttribute("href", "/tags/release");
  });

  it("renders taxonomy detail pages and filters posts from the API response", async () => {
    const post = {
      id: 1,
      uid: "p_22222222-2222-4222-8222-222222222222",
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

  it("renders a dedicated Chinese 404 page for unknown routes", async () => {
    mockedFetchPosts.mockResolvedValue({ posts: [], total: 0, page: 1, limit: 20 });
    mockedFetchTags.mockResolvedValue({ tags: [] });

    render(
      <MemoryRouter initialEntries={["/not-a-real-route"]}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "404" })).toBeInTheDocument();
    expect(screen.getByText("TWORIVER://404")).toBeInTheDocument();
    expect(screen.getByText("route.missing")).toBeInTheDocument();
    expect(screen.getByText("最后一次信号停在未发布的岸边。")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "回到首页" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "浏览标签" })).toHaveAttribute("href", "/tags");
    expect(screen.queryByText("The last signal stopped on an unpublished shore.")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Back home" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Browse tags" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Categories" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Primary navigation" })).not.toBeInTheDocument();
  });

  it("renders a dedicated English 404 page for unknown routes", async () => {
    window.localStorage.setItem("tworiver_locale", "en");
    mockedFetchPosts.mockResolvedValue({ posts: [], total: 0, page: 1, limit: 20 });
    mockedFetchTags.mockResolvedValue({ tags: [] });

    render(
      <MemoryRouter initialEntries={["/not-a-real-route"]}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "404" })).toBeInTheDocument();
    expect(screen.getByText("TWORIVER://404")).toBeInTheDocument();
    expect(screen.getByText("route.missing")).toBeInTheDocument();
    expect(screen.getByText("The last signal stopped on an unpublished shore.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Browse tags" })).toHaveAttribute("href", "/tags");
    expect(screen.queryByText("最后一次信号停在未发布的岸边。")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "回到首页" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "浏览标签" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Primary navigation" })).not.toBeInTheDocument();
  });

  it("scrolls article pages back to the top", async () => {
    const scrollTo = vi.fn();
    Object.defineProperty(window, "scrollTo", { value: scrollTo, configurable: true });
    mockedFetchPost.mockResolvedValue({
      post: {
        id: 1,
        uid: "p_22222222-2222-4222-8222-222222222222",
        slug: "published-flow",
        status: "published",
        publishedAt: "2026-02-03T04:05:06.000Z",
        createdAt: "2026-02-03T04:05:06.000Z",
        updatedAt: "2026-02-03T04:05:06.000Z",
        category: null,
        tags: [],
        translations: [
          {
            locale: "en",
            title: "Published flow",
            summary: "Visible",
            contentMarkdown: "# Section\n\nBody",
            seoTitle: null,
            seoDescription: null
          }
        ]
      }
    });

    render(
      <MemoryRouter initialEntries={["/posts/published-flow"]}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Published flow" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "回到开头" }));

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  });
});
