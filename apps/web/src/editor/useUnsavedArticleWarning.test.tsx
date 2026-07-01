import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useUnsavedArticleWarning } from "./useUnsavedArticleWarning";

describe("useUnsavedArticleWarning", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers beforeunload only while dirty and cleans up", () => {
    const addEventListener = vi.spyOn(window, "addEventListener");
    const removeEventListener = vi.spyOn(window, "removeEventListener");

    const { rerender, unmount } = renderHook(({ dirty }) => useUnsavedArticleWarning(dirty, "Unsaved"), {
      initialProps: { dirty: false }
    });

    expect(addEventListener).not.toHaveBeenCalledWith("beforeunload", expect.any(Function));

    rerender({ dirty: true });
    expect(addEventListener).toHaveBeenCalledWith("beforeunload", expect.any(Function));
    const handler = addEventListener.mock.calls.find(([eventName]) => eventName === "beforeunload")?.[1] as
      | ((event: BeforeUnloadEvent) => string)
      | undefined;
    expect(handler).toBeDefined();

    const event = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    const preventDefault = vi.spyOn(event, "preventDefault");
    expect(handler?.(event)).toBe("Unsaved");
    expect(preventDefault).toHaveBeenCalled();

    rerender({ dirty: false });
    expect(removeEventListener).toHaveBeenCalledWith("beforeunload", handler);

    unmount();
  });
});
