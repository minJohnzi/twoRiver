import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const globalCss = readFileSync(resolve(process.cwd(), "src/styles/global.css"), "utf8");

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
