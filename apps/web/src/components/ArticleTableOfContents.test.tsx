import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArticleHeading } from "../utils/renderMarkdownDocument";
import { ArticleTableOfContents } from "./ArticleTableOfContents";

const headings: ArticleHeading[] = [
  { id: "page-title", level: 1, text: "Page title" },
  { id: "orphan-detail", level: 3, text: "Orphan detail" },
  { id: "overview", level: 2, text: "Overview" },
  { id: "setup", level: 3, text: "Setup" },
  { id: "细节", level: 3, text: "细节" },
  { id: "advanced", level: 2, text: "Advanced" },
  { id: "tuning", level: 3, text: "Tuning" }
];

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];

  readonly observe = vi.fn();
  readonly unobserve = vi.fn();
  readonly disconnect = vi.fn();

  constructor(
    private readonly callback: IntersectionObserverCallback
  ) {
    MockIntersectionObserver.instances.push(this);
  }

  trigger(target: Element, isIntersecting = true) {
    this.callback([{ target, isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}

function installIntersectionObserver() {
  MockIntersectionObserver.instances = [];
  Object.defineProperty(window, "IntersectionObserver", {
    configurable: true,
    writable: true,
    value: MockIntersectionObserver
  });
}

function holdAnimationFrames() {
  return vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
}

function rectAt(top: number): DOMRect {
  return {
    top,
    bottom: top + 24,
    left: 0,
    right: 0,
    width: 0,
    height: 24,
    x: 0,
    y: top,
    toJSON: () => ({})
  } as DOMRect;
}

function trackHeadingTops(initialTops: Record<string, number>) {
  const tops = { ...initialTops };

  for (const id of Object.keys(tops)) {
    vi.spyOn(document.getElementById(id) as HTMLElement, "getBoundingClientRect").mockImplementation(() =>
      rectAt(tops[id] ?? 0)
    );
  }

  return (nextTops: Record<string, number>) => {
    Object.assign(tops, nextTops);
  };
}

function TocHarness({ locale = "en" }: { locale?: "en" | "zh" }) {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <div ref={containerRef}>
        <h1 id="page-title">Page title</h1>
        <h3 id="orphan-detail">Orphan detail</h3>
        <h2 id="overview">Overview</h2>
        <h3 id="setup">Setup</h3>
        <h3 id="细节">细节</h3>
        <h2 id="advanced">Advanced</h2>
        <h3 id="tuning">Tuning</h3>
      </div>
      <ArticleTableOfContents headings={headings} containerRef={containerRef} locale={locale} />
    </>
  );
}

describe("ArticleTableOfContents", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, "IntersectionObserver");
    MockIntersectionObserver.instances = [];
  });

  it("does not render without a usable H2 or browser observation support", () => {
    const containerRef = { current: document.createElement("div") };

    const { rerender } = render(<ArticleTableOfContents headings={headings} containerRef={containerRef} locale="en" />);
    expect(screen.queryByRole("navigation", { name: "On this page" })).not.toBeInTheDocument();

    installIntersectionObserver();
    rerender(
      <ArticleTableOfContents
        headings={[{ id: "orphan-detail", level: 3, text: "Orphan detail" }]}
        containerRef={containerRef}
        locale="en"
      />
    );
    expect(screen.queryByRole("navigation", { name: "On this page" })).not.toBeInTheDocument();
  });

  it("renders every H2, ignores H1 and orphan H3, and expands an H2 when clicked", () => {
    installIntersectionObserver();
    holdAnimationFrames();
    render(<TocHarness locale="zh" />);

    expect(screen.getByRole("navigation", { name: "本文目录" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Page title" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Orphan detail" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("href", "#overview");
    expect(screen.getByRole("link", { name: "Advanced" })).toHaveClass("article-toc__link--level-2");
    expect(screen.queryByRole("link", { name: "Setup" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "细节" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Tuning" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link").every((link) => !link.hasAttribute("aria-current"))).toBe(true);

    fireEvent.click(screen.getByRole("link", { name: "Overview" }));

    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "location");
    expect(screen.getByRole("link", { name: "Setup" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "细节" })).toHaveAttribute("href", `#${encodeURIComponent("细节")}`);
    expect(screen.queryByRole("link", { name: "Tuning" })).not.toBeInTheDocument();
  });

  it("tracks the actual heading while keeping only its parent H2 group expanded", () => {
    installIntersectionObserver();
    const animationFrame = holdAnimationFrames();
    const { unmount } = render(<TocHarness />);
    const observer = MockIntersectionObserver.instances[0]!;

    expect(observer.observe).toHaveBeenCalledTimes(5);
    expect(observer.observe.mock.calls.flat().map((element) => (element as HTMLElement).id)).toEqual([
      "overview",
      "setup",
      "细节",
      "advanced",
      "tuning"
    ]);
    expect(screen.getAllByRole("link").every((link) => !link.hasAttribute("aria-current"))).toBe(true);

    const updateHeadingTops = trackHeadingTops({ overview: 220, setup: 280, 细节: 340, advanced: 400, tuning: 460 });
    animationFrame.mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    act(() => {
      observer.trigger(document.getElementById("overview") as Element);
    });
    expect(screen.getAllByRole("link").every((link) => !link.hasAttribute("aria-current"))).toBe(true);
    expect(screen.queryByRole("link", { name: "Setup" })).not.toBeInTheDocument();

    updateHeadingTops({ overview: -180, setup: 24, 细节: 180, advanced: 360, tuning: 440 });
    act(() => {
      observer.trigger(document.getElementById("setup") as Element);
    });

    const overviewLink = screen.getByRole("link", { name: "Overview" });
    expect(screen.getByRole("link", { name: "Setup" })).toHaveAttribute("aria-current", "location");
    expect(overviewLink).not.toHaveAttribute("aria-current");
    expect(overviewLink).toHaveClass("article-toc__link--parent-active");
    expect(screen.getByRole("link", { name: "细节" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Tuning" })).not.toBeInTheDocument();

    updateHeadingTops({ overview: -240, setup: -48, 细节: 24, advanced: 320, tuning: 400 });
    act(() => {
      observer.trigger(document.getElementById("细节") as Element);
    });
    expect(screen.getByRole("link", { name: "细节" })).toHaveAttribute("aria-current", "location");
    expect(screen.getByRole("link", { name: "Setup" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Overview" })).toHaveClass("article-toc__link--parent-active");

    updateHeadingTops({ overview: -360, setup: -280, 细节: -180, advanced: 24, tuning: 180 });
    act(() => {
      observer.trigger(document.getElementById("advanced") as Element);
    });
    expect(screen.getByRole("link", { name: "Advanced" })).toHaveAttribute("aria-current", "location");
    expect(screen.queryByRole("link", { name: "Setup" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "细节" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tuning" })).toBeInTheDocument();

    expect(animationFrame).toHaveBeenCalled();
    unmount();
    expect(observer.disconnect).toHaveBeenCalledTimes(1);
  });
});
