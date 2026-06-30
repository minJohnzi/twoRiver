import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Layout } from "./Layout";

describe("Layout article route", () => {
  afterEach(() => {
    cleanup();
  });

  it("uses compact article navigation instead of the global site header on article routes", () => {
    render(
      <MemoryRouter initialEntries={["/posts/reader"]}>
        <Layout locale="en" theme="dark" onLocaleChange={vi.fn()} onThemeChange={vi.fn()}>
          <article>Reader</article>
        </Layout>
      </MemoryRouter>
    );

    expect(screen.getByRole("navigation", { name: "Article navigation" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Primary navigation" })).not.toBeInTheDocument();
    expect(document.querySelector(".site-main--article")).toBeInTheDocument();
  });

  it("keeps the global site header on non-article public routes", () => {
    render(
      <MemoryRouter initialEntries={["/about"]}>
        <Layout locale="en" theme="dark" onLocaleChange={vi.fn()} onThemeChange={vi.fn()}>
          <article>About</article>
        </Layout>
      </MemoryRouter>
    );

    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Article navigation" })).not.toBeInTheDocument();
    expect(document.querySelector(".site-main--article")).not.toBeInTheDocument();
  });
});
