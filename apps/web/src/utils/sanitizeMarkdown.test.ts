import { describe, expect, it } from "vitest";
import { sanitizeMarkdownHtml } from "./sanitizeMarkdown";

function getSanitizedElement<T extends Element>(html: string, selector: string): T {
  const template = document.createElement("template");
  template.innerHTML = sanitizeMarkdownHtml(html);
  const element = template.content.querySelector<T>(selector);

  expect(element).not.toBeNull();

  return element as T;
}

describe("sanitizeMarkdownHtml", () => {
  it("removes dangerous event handler attributes from images and links", () => {
    const template = document.createElement("template");
    template.innerHTML = sanitizeMarkdownHtml(
      '<p><img src="/uploads/posts/hero.png" alt="Hero" onerror="alert(1)"><a href="/posts/demo" onclick="alert(2)">Read</a></p>'
    );

    const image = template.content.querySelector("img");
    const link = template.content.querySelector("a");

    expect(image).not.toBeNull();
    expect(link).not.toBeNull();
    expect(image?.hasAttribute("onerror")).toBe(false);
    expect(link?.hasAttribute("onclick")).toBe(false);
  });

  it("removes javascript links", () => {
    const link = getSanitizedElement<HTMLAnchorElement>('<a href="javascript:alert(1)">Bad link</a>', "a");

    expect(link.hasAttribute("href")).toBe(false);
    expect(link.textContent).toBe("Bad link");
  });

  it("preserves safe relative upload image URLs after API asset resolution", () => {
    const image = getSanitizedElement<HTMLImageElement>('<img src="/uploads/posts/hero.png" alt="Hero">', "img");

    expect(image.getAttribute("src")).toBe("http://localhost:4000/uploads/posts/hero.png");
    expect(image.getAttribute("alt")).toBe("Hero");
  });

  it('adds loading="lazy" to images', () => {
    const image = getSanitizedElement<HTMLImageElement>('<img src="/uploads/posts/hero.png" alt="Hero">', "img");

    expect(image.getAttribute("loading")).toBe("lazy");
  });
});
