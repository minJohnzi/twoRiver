import { afterEach, describe, expect, it, vi } from "vitest";
import { getMarkdownLabels } from "./renderMarkdownDocument";
import { renderArticleDocument } from "./renderArticleDocument";

describe("renderArticleDocument", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders canonical TipTap article JSON and preserves valid heading ids", () => {
    const result = renderArticleDocument(
      {
        locale: "en",
        contentMarkdown: "# Fallback",
        content: {
          format: "tiptap",
          schemaVersion: 1,
          doc: {
            type: "doc",
            content: [
              { type: "heading", attrs: { level: 2, id: "kept-id" }, content: [{ type: "text", text: "Canonical" }] },
              { type: "paragraph", content: [{ type: "text", text: "Rich body" }] }
            ]
          }
        }
      },
      getMarkdownLabels("en"),
      { postId: 7, slug: "canonical", locale: "en" }
    );

    expect(result.html).toContain('id="kept-id"');
    expect(result.html).toContain("Rich body");
    expect(result.html).not.toContain("Fallback");
    expect(result.headings).toEqual([{ id: "kept-id", level: 2, text: "Canonical" }]);
  });

  it("enhances rendered TipTap code blocks with copy controls and language labels", () => {
    const result = renderArticleDocument(
      {
        locale: "en",
        contentMarkdown: "```ts\nfallback()\n```",
        content: {
          format: "tiptap",
          schemaVersion: 1,
          doc: {
            type: "doc",
            content: [{ type: "codeBlock", attrs: { language: "tsx" }, content: [{ type: "text", text: "const view = <App />;" }] }]
          }
        }
      },
      getMarkdownLabels("en")
    );

    expect(result.html).toContain('class="code-window"');
    expect(result.html).toContain('class="markdown-code-language">tsx</span>');
    expect(result.html).toContain('data-copy-code="true"');
    expect(result.html).toContain('class="hljs language-tsx"');
    expect(result.html).not.toContain("fallback");
  });

  it("keeps external TipTap links safe after HTML rendering and sanitizing", () => {
    const result = renderArticleDocument(
      {
        locale: "en",
        contentMarkdown: "[Fallback](/fallback)",
        content: {
          format: "tiptap",
          schemaVersion: 1,
          doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  { type: "text", text: "External", marks: [{ type: "link", attrs: { href: "https://example.com", target: "_self", rel: "nofollow" } }] },
                  { type: "text", text: " internal", marks: [{ type: "link", attrs: { href: "/docs", target: "_self" } }] }
                ]
              }
            ]
          }
        }
      },
      getMarkdownLabels("en")
    );

    const template = document.createElement("template");
    template.innerHTML = result.html;
    const external = template.content.querySelector<HTMLAnchorElement>('a[href="https://example.com"]');
    const internal = template.content.querySelector<HTMLAnchorElement>('a[href="/docs"]');

    expect(external?.getAttribute("target")).toBe("_blank");
    expect(external?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(internal?.hasAttribute("target")).toBe(false);
  });

  it("falls back to compatibility Markdown and logs safe metadata when rendering fails", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const result = renderArticleDocument(
      {
        locale: "zh",
        contentMarkdown: "# Fallback secret body",
        content: {
          format: "tiptap",
          schemaVersion: 1,
          doc: { type: "doc", content: [{ type: "callout", attrs: { secret: "never-log" } }] } as never
        }
      },
      getMarkdownLabels("zh"),
      { postId: 42, slug: "safe-fallback", locale: "zh" }
    );

    expect(result.headings[0]).toEqual({ id: "fallback-secret-body", level: 1, text: "Fallback secret body" });
    expect(warn).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(warn.mock.calls[0]?.[0]));
    expect(payload).toEqual({
      event: "article_document_render_fallback",
      code: "unsupported-node",
      postId: 42,
      slug: "safe-fallback",
      locale: "zh",
      schemaVersion: 1
    });
    expect(String(warn.mock.calls[0]?.[0])).not.toContain("Fallback secret body");
    expect(String(warn.mock.calls[0]?.[0])).not.toContain("never-log");
  });
});
