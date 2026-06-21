import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPost, fetchPosts } from "./posts";

describe("public posts API", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes abort signals through public post requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ post: null }), {
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    await fetchPost("published-flow", { signal: controller.signal });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBe(controller.signal);
  });

  it("serializes optional public post pagination parameters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ posts: [], total: 0, page: 2, limit: 5 }), {
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchPosts({ page: 2, limit: 5 });

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(url).pathname).toBe("/api/posts");
    expect(new URL(url).search).toBe("?page=2&limit=5");
  });
});
