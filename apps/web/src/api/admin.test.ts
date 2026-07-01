import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "./client";
import {
  convertAdminPostTranslationToTiptap,
  detachAdminCategoryReferences,
  detachAdminTagReferences,
  deleteAdminResource,
  fetchAdminCategoryReferences,
  fetchAdminTagReferences,
  moveAdminResource,
  previewAdminPostTiptapConversion,
  restoreAdminPostTranslationMarkdown,
  uploadAdminAboutAvatar,
  uploadAdminPostImage,
  uploadAdminResource
} from "./admin";

describe("admin taxonomy API", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads and selectively detaches category and tag references", async () => {
    const referencesResponse = {
      references: [
        {
          id: 3,
          slug: "linked-post",
          status: "draft",
          deletedAt: null,
          titles: { en: "Linked post" }
        }
      ],
      activePostCount: 1,
      trashedPostCount: 0,
      totalPostCount: 1
    };
    const detachResponse = {
      detachedCount: 1,
      activePostCount: 0,
      trashedPostCount: 0,
      totalPostCount: 0
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(referencesResponse), { headers: { "Content-Type": "application/json" } })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(detachResponse), { headers: { "Content-Type": "application/json" } })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(referencesResponse), { headers: { "Content-Type": "application/json" } })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(detachResponse), { headers: { "Content-Type": "application/json" } })
      );
    vi.stubGlobal("fetch", fetchMock);

    await fetchAdminCategoryReferences(8);
    await detachAdminCategoryReferences(8, { postIds: [3] });
    await fetchAdminTagReferences(9);
    await detachAdminTagReferences(9, { postIds: [3] });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/admin/categories/8/references",
      "/api/admin/categories/8/detach",
      "/api/admin/tags/9/references",
      "/api/admin/tags/9/detach"
    ]);
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).body).toBe(JSON.stringify({ postIds: [3] }));
    expect((fetchMock.mock.calls[3]?.[1] as RequestInit).body).toBe(JSON.stringify({ postIds: [3] }));
  });
});

describe("admin article conversion API", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls the dedicated TipTap preview, conversion, and restore endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            originalMarkdown: "# Title",
            document: { type: "doc", content: [{ type: "paragraph" }] },
            projectedMarkdown: "# Title\n",
            canConvert: true,
            blockers: [],
            warnings: []
          }),
          { headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ post: { id: 7, translations: [] } }), {
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ post: { id: 7, translations: [] } }), {
          headers: { "Content-Type": "application/json" }
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    await previewAdminPostTiptapConversion(7, "en");
    await convertAdminPostTranslationToTiptap(7, "en", { expectedUpdatedAt: "2026-06-10T00:00:00.000Z" });
    await restoreAdminPostTranslationMarkdown(7, "en", { expectedUpdatedAt: "2026-06-11T00:00:00.000Z" });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/admin/posts/7/translations/en/tiptap-preview",
      "/api/admin/posts/7/translations/en/convert-to-tiptap",
      "/api/admin/posts/7/translations/en/restore-markdown"
    ]);
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBe("POST");
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).body).toBe(
      JSON.stringify({ expectedUpdatedAt: "2026-06-10T00:00:00.000Z" })
    );
    expect((fetchMock.mock.calls[2]?.[1] as RequestInit).body).toBe(
      JSON.stringify({ expectedUpdatedAt: "2026-06-11T00:00:00.000Z" })
    );
  });
});

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

  it("posts managed resource uploads as FormData with a target folder", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          resource: {
            kind: "asset",
            url: "/uploads/resources/general/asset.png",
            relativePath: "resources/general/asset.png",
            filename: "asset.png",
            directory: "resources/general",
            folder: "general",
            sizeBytes: 11,
            updatedAt: "2026-06-24T00:00:00.000Z",
            contentType: "image/png",
            postUid: null
          }
        }),
        { headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["image-bytes"], "asset.png", { type: "image/png" });
    await uploadAdminResource({ file, folder: "general" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    const body = init.body as FormData;

    expect(init.method).toBe("POST");
    expect(body.get("folder")).toBe("general");
    expect(body.get("file")).toBe(file);
    expect(headers.has("Content-Type")).toBe(false);
  });

  it("moves and deletes managed resources with JSON bodies", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            resource: {
              kind: "asset",
              url: "/uploads/resources/archive/asset.png",
              relativePath: "resources/archive/asset.png",
              filename: "asset.png",
              directory: "resources/archive",
              folder: "archive",
              sizeBytes: 11,
              updatedAt: "2026-06-24T00:00:00.000Z",
              contentType: "image/png",
              postUid: null
            }
          }),
          { headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" }
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    await moveAdminResource({ url: "/uploads/resources/general/asset.png", folder: "archive" });
    await deleteAdminResource("/uploads/resources/archive/asset.png");

    const [, moveInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const [, deleteInit] = fetchMock.mock.calls[1] as [string, RequestInit];

    expect(moveInit.method).toBe("PUT");
    expect(moveInit.body).toBe(JSON.stringify({ url: "/uploads/resources/general/asset.png", folder: "archive" }));
    expect(deleteInit.method).toBe("DELETE");
    expect(deleteInit.body).toBe(JSON.stringify({ url: "/uploads/resources/archive/asset.png" }));
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

  it("deduplicates simultaneous cacheable public GET requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ value: "shared" }), {
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const [first, second] = await Promise.all([
      apiRequest<{ value: string }>("/api/cache-dedupe"),
      apiRequest<{ value: string }>("/api/cache-dedupe")
    ]);

    expect(first).toEqual({ value: "shared" });
    expect(second).toEqual({ value: "shared" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("clears cached public GET responses after state-changing requests", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ value: "before" }), {
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ value: "after" }), {
          headers: { "Content-Type": "application/json" }
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiRequest<{ value: string }>("/api/cache-invalidation")).resolves.toEqual({ value: "before" });
    await expect(apiRequest<{ value: string }>("/api/cache-invalidation")).resolves.toEqual({ value: "before" });
    await apiRequest<{ ok: true }>("/api/admin/posts", { method: "POST", body: JSON.stringify({}) });
    await expect(apiRequest<{ value: string }>("/api/cache-invalidation")).resolves.toEqual({ value: "after" });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
