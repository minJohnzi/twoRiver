import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const stylesDir = dirname(fileURLToPath(import.meta.url));
const globalCss = readFileSync(resolve(stylesDir, "global.scss"), "utf8");
const markdownCss = readFileSync(resolve(stylesDir, "markdown.scss"), "utf8");

function getCssBlock(selector: string): string {
  const start = globalCss.indexOf(`${selector} {`);
  if (start === -1) {
    return "";
  }

  const bodyStart = globalCss.indexOf("{", start);
  const bodyEnd = globalCss.indexOf("\n}", bodyStart);
  return globalCss.slice(bodyStart + 1, bodyEnd);
}

describe("about page theme styles", () => {
  it("uses the same page background treatment as the main content", () => {
    const shellStyles = getCssBlock(".about-file-shell");
    const ambientStyles = getCssBlock(".about-page--black-file::before");

    expect(ambientStyles).toBe("");
    expect(shellStyles).not.toContain("border:");
    expect(shellStyles).not.toContain("background:");
    expect(shellStyles).not.toContain("box-shadow");
    expect(shellStyles).not.toContain("#020202");
    expect(shellStyles).not.toContain("rgba(158, 230, 191");
  });
});

describe("monochrome theme", () => {
  it("does not reintroduce the mint accent palette", () => {
    expect(globalCss.toLowerCase()).not.toContain("#9ee6bf");
    expect(globalCss).not.toContain("158, 230, 191");
    expect(globalCss.toLowerCase()).not.toContain("#315f54");
  });

  it("uses black and white as the theme accents", () => {
    const darkTheme = getCssBlock(":root");
    const lightTheme = getCssBlock('.app-shell[data-theme="light"]');

    expect(darkTheme).toContain("--color-admin-accent: #fff;");
    expect(lightTheme).toContain("--color-admin-accent: #000;");
  });
});

describe("article reader layout", () => {
  it("defines the compact article canvas and desktop directory", () => {
    expect(globalCss).toContain(".site-main--article");
    expect(globalCss).toContain("grid-template-columns: minmax(0, 620px) minmax(180px, 220px)");
    expect(globalCss).toContain(".article-toc__nav");
    expect(globalCss).toContain("position: sticky");
  });

  it("hides the directory below the desktop breakpoint", () => {
    expect(globalCss).toMatch(/@media \(max-width: 1023px\)[\s\S]*?\.article-toc[\s\S]*?display: none/);
  });

  it("uses article-scoped minimal code chrome without removing editor dots", () => {
    expect(markdownCss).toContain(".article-shell .window-dots");
    expect(markdownCss).toContain("display: none");
    expect(markdownCss).toContain(".window-dots span:nth-child(1)");
  });
});
