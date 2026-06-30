import { afterEach, describe, expect, it, vi } from "vitest";

describe("same-origin API client", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("uses relative API and upload URLs when the base URL is empty", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "");
    const { API_BASE_URL, apiRequest, resolveApiAssetUrl } = await import("./client");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ user: { id: 1, username: "admin" } }), {
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/api/auth/me");

    expect(API_BASE_URL).toBe("");
    expect(resolveApiAssetUrl("/uploads/images/avatar.png")).toBe("/uploads/images/avatar.png");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/me",
      expect.objectContaining({ credentials: "include" })
    );
  });
});
