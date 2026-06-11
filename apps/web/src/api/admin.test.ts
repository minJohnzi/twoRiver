import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "./client";
import { uploadAdminAboutAvatar, uploadAdminPostImage } from "./admin";

describe("admin upload API", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts image uploads as FormData without forcing a JSON content type", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          url: "/uploads/images/posts/p_11111111-1111-4111-8111-111111111111/photo.png",
          markdown: "![图片](/uploads/images/posts/p_11111111-1111-4111-8111-111111111111/photo.png)"
        }),
        { headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["image-bytes"], "photo.png", { type: "image/png" });
    await uploadAdminPostImage({ postUid: "p_11111111-1111-4111-8111-111111111111", file });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    const body = init.body as FormData;

    expect(init.method).toBe("POST");
    expect(body.get("postUid")).toBe("p_11111111-1111-4111-8111-111111111111");
    expect(body.get("file")).toBe(file);
    expect(headers.has("Content-Type")).toBe(false);
  });

  it("posts about avatar uploads as FormData without a post uid", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ url: "/uploads/images/about/avatar.png" }), {
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["image-bytes"], "avatar.png", { type: "image/png" });
    await uploadAdminAboutAvatar(file);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    const body = init.body as FormData;

    expect(init.method).toBe("POST");
    expect(body.get("file")).toBe(file);
    expect(body.has("postUid")).toBe(false);
    expect(headers.has("Content-Type")).toBe(false);
  });
});

describe("apiRequest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes abort signals through to fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    await apiRequest<{ ok: true }>("/api/example", { signal: controller.signal });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBe(controller.signal);
  });
});
