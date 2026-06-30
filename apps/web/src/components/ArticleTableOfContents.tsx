import type { Locale } from "@tworiver/shared";
import { useEffect, useMemo, useState, type RefObject } from "react";
import type { ArticleHeading } from "../utils/renderMarkdownDocument";

interface ArticleTableOfContentsProps {
  headings: ArticleHeading[];
  containerRef: RefObject<HTMLElement | null>;
  locale: Locale;
}

interface TocGroup {
  heading: ArticleHeading;
  children: ArticleHeading[];
}

function tocLabel(locale: Locale): string {
  return locale === "zh" ? "本文目录" : "On this page";
}

function findHeadingElement(container: HTMLElement, id: string): HTMLElement | null {
  return Array.from(container.querySelectorAll<HTMLElement>("h2,h3")).find((heading) => heading.id === id) ?? null;
}

function getHeadingActivationOffset() {
  return Math.max(96, window.innerHeight * 0.16);
}

function findActiveHeadingId(observedHeadings: HTMLElement[]): string {
  const activationOffset = getHeadingActivationOffset();
  let nextActiveId = "";

  for (const heading of observedHeadings) {
    if (heading.getBoundingClientRect().top <= activationOffset) {
      nextActiveId = heading.id;
    } else {
      break;
    }
  }

  return nextActiveId;
}

export function ArticleTableOfContents({ headings, containerRef, locale }: ArticleTableOfContentsProps) {
  const [activeId, setActiveId] = useState("");
  const label = tocLabel(locale);
  const supportsObserver = typeof window !== "undefined" && "IntersectionObserver" in window;
  const groups = useMemo(() => {
    const nextGroups: TocGroup[] = [];
    let currentGroup: TocGroup | undefined;

    for (const heading of headings) {
      if (heading.level === 2) {
        currentGroup = { heading, children: [] };
        nextGroups.push(currentGroup);
      } else if (heading.level === 3 && currentGroup) {
        currentGroup.children.push(heading);
      }
    }

    return nextGroups;
  }, [headings]);
  const tocHeadings = useMemo(
    () => groups.flatMap((group) => [group.heading, ...group.children]),
    [groups]
  );
  const visibleActiveId = useMemo(
    () => (tocHeadings.some((heading) => heading.id === activeId) ? activeId : ""),
    [activeId, tocHeadings]
  );
  const activeParentId = useMemo(() => {
    if (!visibleActiveId) {
      return "";
    }

    return (
      groups.find(
        (group) =>
          group.heading.id === visibleActiveId || group.children.some((heading) => heading.id === visibleActiveId)
      )?.heading.id ?? ""
    );
  }, [groups, visibleActiveId]);

  useEffect(() => {
    setActiveId("");
  }, [headings]);

  useEffect(() => {
    if (!supportsObserver || tocHeadings.length === 0) {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    const observedHeadings = tocHeadings
      .map((heading) => findHeadingElement(container, heading.id))
      .filter((heading): heading is HTMLElement => Boolean(heading));

    if (observedHeadings.length === 0) {
      return;
    }

    let animationFrame = 0;
    const updateActiveHeading = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        setActiveId(findActiveHeadingId(observedHeadings));
      });
    };

    const observer = new window.IntersectionObserver(
      () => {
        updateActiveHeading();
      },
      {
        root: null,
        rootMargin: "-18% 0px -68% 0px",
        threshold: [0, 1]
      }
    );

    for (const heading of observedHeadings) {
      observer.observe(heading);
    }

    updateActiveHeading();
    window.addEventListener("scroll", updateActiveHeading, { passive: true });
    window.addEventListener("resize", updateActiveHeading);
    window.addEventListener("hashchange", updateActiveHeading);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("scroll", updateActiveHeading);
      window.removeEventListener("resize", updateActiveHeading);
      window.removeEventListener("hashchange", updateActiveHeading);
      observer.disconnect();
    };
  }, [containerRef, supportsObserver, tocHeadings]);

  if (groups.length === 0 || !supportsObserver) {
    return null;
  }

  return (
    <aside className="article-toc">
      <nav className="article-toc__nav" aria-label={label}>
        <p className="article-toc__title">{label}</p>
        <ol className="article-toc__list">
          {groups.map((group) => {
            const isExpanded = activeParentId === group.heading.id;

            return (
              <li className="article-toc__group" key={group.heading.id}>
                <a
                  className={`article-toc__link article-toc__link--level-2${
                    isExpanded ? " article-toc__link--parent-active" : ""
                  }`}
                  href={`#${encodeURIComponent(group.heading.id)}`}
                  aria-current={visibleActiveId === group.heading.id ? "location" : undefined}
                  onClick={() => {
                    setActiveId(group.heading.id);
                  }}
                >
                  {group.heading.text}
                </a>
                {isExpanded && group.children.length > 0 ? (
                  <ol className="article-toc__children">
                    {group.children.map((heading) => (
                      <li className="article-toc__item" key={heading.id}>
                        <a
                          className="article-toc__link article-toc__link--level-3"
                          href={`#${encodeURIComponent(heading.id)}`}
                          aria-current={visibleActiveId === heading.id ? "location" : undefined}
                          onClick={() => {
                            setActiveId(heading.id);
                          }}
                        >
                          {heading.text}
                        </a>
                      </li>
                    ))}
                  </ol>
                ) : null}
              </li>
            );
          })}
        </ol>
      </nav>
    </aside>
  );
}
