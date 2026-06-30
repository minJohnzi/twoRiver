import "@testing-library/jest-dom/vitest";
import type { PublicPost } from "@tworiver/shared";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchPost } from "../api/posts";
import { PostPage } from "./PostPage";

vi.mock("../api/posts", () => ({ fetchPost: vi.fn() }));

const mockedFetchPost = vi.mocked(fetchPost);

class MockIntersectionObserver {
  readonly observe = vi.fn();
  readonly disconnect = vi.fn();

  constructor() {
    // The TOC component only needs browser support in these page tests.
  }
}

const postResponse: { post: PublicPost } = {
  post: {
    id: 1,
    uid: "p_22222222-2222-4222-8222-222222222222",
    slug: "reader",
    status: "published" as const,
    publishedAt: "2026-06-30T00:00:00.000Z",
    createdAt: "2026-06-30T00:00:00.000Z",
    updatedAt: "2026-06-30T00:00:00.000Z",
    category: null,
    tags: [],
    translations: [
      {
        locale: "en" as const,
        title: "English title",
        summary: "English summary",
        contentMarkdown: "# Start\n\n## Overview\n\nBody",
        seoTitle: null,
        seoDescription: null
      },
      {
        locale: "zh" as const,
        title: "中文标题",
        summary: "中文摘要",
        contentMarkdown: "# 开始\n\n## 概览\n\n正文",
        seoTitle: null,
        seoDescription: null
      }
    ]
  }
};

function installIntersectionObserver() {
  Object.defineProperty(window, "IntersectionObserver", {
    configurable: true,
    writable: true,
    value: MockIntersectionObserver
  });
}

function renderPost(locale: "en" | "zh", route = "/posts/reader") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/posts/:slug" element={<PostPage locale={locale} />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("PostPage", () => {
  beforeEach(() => {
    installIntersectionObserver();
  });

  afterEach(() => {
    cleanup();
    mockedFetchPost.mockReset();
    Reflect.deleteProperty(window, "IntersectionObserver");
    vi.restoreAllMocks();
  });

  it("shows the localized loading state on the article reading axis", () => {
    mockedFetchPost.mockReturnValue(new Promise(() => undefined));

    renderPost("en");

    expect(screen.getByText("Loading article…")).toBeInTheDocument();
    expect(document.querySelector(".article-state")).toBeInTheDocument();
  });

  it("renders the translated article and the matching structured directory", async () => {
    mockedFetchPost.mockResolvedValue(postResponse);

    const view = renderPost("en");

    expect(await screen.findByRole("heading", { name: "English title" })).toBeInTheDocument();
    expect(screen.getByText("English summary")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "On this page" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("href", "#overview");
    expect(screen.queryByRole("link", { name: "Start" })).not.toBeInTheDocument();

    view.rerender(
      <MemoryRouter initialEntries={["/posts/reader"]}>
        <Routes>
          <Route path="/posts/:slug" element={<PostPage locale="zh" />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "中文标题" })).toBeInTheDocument();
    expect(screen.getByText("中文摘要")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "本文目录" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "概览" })).toHaveAttribute("href", `#${encodeURIComponent("概览")}`);
    expect(screen.queryByRole("link", { name: "开始" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Overview" })).not.toBeInTheDocument();
  });

  it("shows a localized stable error instead of the raw request error", async () => {
    mockedFetchPost.mockRejectedValue(new Error("database host leaked"));

    renderPost("en");

    expect(await screen.findByText("Article not found")).toBeInTheDocument();
    expect(screen.queryByText("database host leaked")).not.toBeInTheDocument();
  });

  it("omits the summary and directory when the translation has neither", async () => {
    mockedFetchPost.mockResolvedValue({
      post: {
        ...postResponse.post,
        translations: [
          {
            ...postResponse.post.translations[0]!,
            summary: "",
            contentMarkdown: "Body without headings"
          }
        ]
      }
    });

    renderPost("en");

    expect(await screen.findByRole("heading", { name: "English title" })).toBeInTheDocument();
    expect(screen.queryByText("English summary")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "On this page" })).not.toBeInTheDocument();
  });

  it("renders canonical TipTap article content instead of compatibility Markdown", async () => {
    mockedFetchPost.mockResolvedValue({
      post: {
        ...postResponse.post,
        translations: [
          {
            ...postResponse.post.translations[0]!,
            contentMarkdown: "# Compatibility fallback",
            content: {
              format: "tiptap",
              schemaVersion: 1,
              doc: {
                type: "doc",
                content: [
                  {
                    type: "heading",
                    attrs: { level: 2, id: "canonical-overview" },
                    content: [{ type: "text", text: "Canonical overview" }]
                  },
                  { type: "paragraph", content: [{ type: "text", text: "Canonical body" }] }
                ]
              }
            }
          }
        ]
      }
    });

    renderPost("en");

    expect(await screen.findByRole("heading", { name: "English title" })).toBeInTheDocument();
    expect(screen.getByText("Canonical body")).toBeInTheDocument();
    expect(screen.queryByText("Compatibility fallback")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Canonical overview" })).toHaveAttribute("href", "#canonical-overview");
  });

  it("uses reduced-motion-safe back-to-top behavior", async () => {
    const scrollTo = vi.fn();
    mockedFetchPost.mockResolvedValue(postResponse);
    Object.defineProperty(window, "scrollTo", { configurable: true, value: scrollTo });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    });

    renderPost("en");

    await screen.findByRole("heading", { name: "English title" });
    fireEvent.click(screen.getByRole("button", { name: "Back to top" }));

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
  });

  it("removes a hash that does not exist in the active translation", async () => {
    mockedFetchPost.mockResolvedValue(postResponse);
    const replaceState = vi.spyOn(window.history, "replaceState");

    renderPost("zh", "/posts/reader#start");

    await screen.findByRole("heading", { name: "中文标题" });
    await waitFor(() => expect(replaceState).toHaveBeenCalledWith(null, "", "/posts/reader"));
  });
});
