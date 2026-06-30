import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArticleHeading } from "../utils/renderMarkdownDocument";
import { ArticleTableOfContents } from "./ArticleTableOfContents";

const headings: ArticleHeading[] = [
  { id: "start", level: 1, text: "Start" },
  { id: "deep-dive", level: 2, text: "Deep dive" },
  { id: "细节", level: 3, text: "细节" }
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

function TocHarness({ locale = "en" }: { locale?: "en" | "zh" }) {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <div ref={containerRef}>
        <h1 id="start">Start</h1>
        <h2 id="deep-dive">Deep dive</h2>
        <h3 id="细节">细节</h3>
      </div>
      <ArticleTableOfContents headings={headings} containerRef={containerRef} locale={locale} />
    </>
  );
}

describe("ArticleTableOfContents", () => {
  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, "IntersectionObserver");
    MockIntersectionObserver.instances = [];
  });

  it("does not render without headings or browser observation support", () => {
    const containerRef = { current: document.createElement("div") };

    const { rerender } = render(<ArticleTableOfContents headings={[]} containerRef={containerRef} locale="en" />);
    expect(screen.queryByRole("navigation", { name: "On this page" })).not.toBeInTheDocument();

    rerender(<ArticleTableOfContents headings={headings} containerRef={containerRef} locale="en" />);
    expect(screen.queryByRole("navigation", { name: "On this page" })).not.toBeInTheDocument();
  });

  it("renders localized hierarchical links with encoded hash targets", () => {
    installIntersectionObserver();
    render(<TocHarness locale="zh" />);

    expect(screen.getByRole("navigation", { name: "本文目录" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start" })).toHaveAttribute("href", "#start");
    expect(screen.getByRole("link", { name: "Deep dive" })).toHaveClass("article-toc__link--level-2");
    expect(screen.getByRole("link", { name: "细节" })).toHaveAttribute("href", `#${encodeURIComponent("细节")}`);
  });

  it("highlights the current section from observed headings and disconnects on cleanup", () => {
    installIntersectionObserver();
    const { unmount } = render(<TocHarness />);
    const observer = MockIntersectionObserver.instances[0];

    expect(observer.observe).toHaveBeenCalledTimes(3);
    expect(screen.getByRole("link", { name: "Start" })).toHaveAttribute("aria-current", "location");

    act(() => {
      observer.trigger(document.getElementById("deep-dive") as Element);
    });

    expect(screen.getByRole("link", { name: "Deep dive" })).toHaveAttribute("aria-current", "location");
    expect(screen.getByRole("link", { name: "Start" })).not.toHaveAttribute("aria-current");

    unmount();
    expect(observer.disconnect).toHaveBeenCalledTimes(1);
  });
});
