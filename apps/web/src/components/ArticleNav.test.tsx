import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArticleNav } from "./ArticleNav";

describe("ArticleNav", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders English article links and triggers public preference changes", () => {
    const onLocaleChange = vi.fn();
    const onThemeChange = vi.fn();

    render(
      <MemoryRouter>
        <ArticleNav
          locale="en"
          theme="dark"
          onLocaleChange={onLocaleChange}
          onThemeChange={onThemeChange}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole("navigation", { name: "Article navigation" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to posts" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "about" })).toHaveAttribute("href", "/about");

    fireEvent.click(screen.getByRole("button", { name: "Switch to light theme" }));
    fireEvent.click(screen.getByRole("button", { name: "Switch to Chinese" }));

    expect(onThemeChange).toHaveBeenCalledWith("light");
    expect(onLocaleChange).toHaveBeenCalledWith("zh");
  });

  it("localizes article-only controls in Chinese", () => {
    render(
      <MemoryRouter>
        <ArticleNav locale="zh" theme="light" onLocaleChange={vi.fn()} onThemeChange={vi.fn()} />
      </MemoryRouter>
    );

    expect(screen.getByRole("navigation", { name: "文章导航" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回文章" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "切换到深色主题" })).toHaveTextContent("深色");
    expect(screen.getByRole("button", { name: "切换到英文" })).toHaveTextContent("EN");
  });

  it("announces route intent when article links are hovered or focused", () => {
    const onRouteIntent = vi.fn();

    render(
      <MemoryRouter>
        <ArticleNav
          locale="en"
          theme="light"
          onLocaleChange={vi.fn()}
          onThemeChange={vi.fn()}
          onRouteIntent={onRouteIntent}
        />
      </MemoryRouter>
    );

    fireEvent.mouseEnter(screen.getByRole("link", { name: "Back to posts" }));
    fireEvent.focus(screen.getByRole("link", { name: "about" }));

    expect(onRouteIntent).toHaveBeenCalledWith("/");
    expect(onRouteIntent).toHaveBeenCalledWith("/about");
  });
});
