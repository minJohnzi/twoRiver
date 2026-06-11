import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPost } from "./posts";

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
});
