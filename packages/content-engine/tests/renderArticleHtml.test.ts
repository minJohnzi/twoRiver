import { describe, expect, it } from "vitest";
import type { ArticleDocument } from "../src/documentTypes.js";
import { renderArticleHtml } from "../src/renderArticleHtml.js";

describe("renderArticleHtml", () => {
  it("renders every persisted v1 node and mark with escaped text and attributes", () => {
    const document: ArticleDocument = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2, id: "intro" }, content: [{ type: "text", text: "Intro <safe>" }] },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Bold", marks: [{ type: "bold" }] },
            { type: "text", text: " italic", marks: [{ type: "italic" }] },
            { type: "text", text: " strike", marks: [{ type: "strike" }] },
            { type: "text", text: " code", marks: [{ type: "code" }] },
            {
              type: "text",
              text: " link & label",
              marks: [
                {
                  type: "link",
                  attrs: {
                    href: "https://example.com/?q=<x>&ok=1",
                    target: "_blank",
                    rel: "noreferrer",
                    class: "article-link"
                  }
                }
              ]
            },
            { type: "hardBreak" },
            { type: "text", text: "after break" }
          ]
        },
        { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "Quote" }] }] },
        {
          type: "bulletList",
          content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Bullet" }] }] }]
        },
        {
          type: "orderedList",
          attrs: { start: 3 },
          content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Numbered" }] }] }]
        },
        { type: "codeBlock", attrs: { language: "ts" }, content: [{ type: "text", text: "const tag = '<x>';" }] },
        { type: "horizontalRule" },
        { type: "image", attrs: { src: "/uploads/a.png?caption=\"x\"", alt: "A < B", title: "Image & title" } },
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                { type: "tableHeader", attrs: { colspan: 2 }, content: [{ type: "paragraph", content: [{ type: "text", text: "H" }] }] }
              ]
            },
            {
              type: "tableRow",
              content: [
                { type: "tableCell", attrs: { rowspan: 2 }, content: [{ type: "paragraph", content: [{ type: "text", text: "C" }] }] }
              ]
            }
          ]
        }
      ]
    };

    expect(renderArticleHtml(document)).toBe(
      [
        '<h2 id="intro">Intro &lt;safe&gt;</h2>',
        '<p><strong>Bold</strong><em> italic</em><s> strike</s><code> code</code>',
        '<a href="https://example.com/?q=&lt;x&gt;&amp;ok=1" class="article-link" target="_blank" rel="noopener noreferrer"> link &amp; label</a>',
        "<br>after break</p>",
        "<blockquote><p>Quote</p></blockquote>",
        "<ul><li><p>Bullet</p></li></ul>",
        '<ol start="3"><li><p>Numbered</p></li></ol>',
        '<pre><code class="hljs language-ts">const tag = \'&lt;x&gt;\';</code></pre>',
        "<hr>",
        '<img src="/uploads/a.png?caption=&quot;x&quot;" alt="A &lt; B" title="Image &amp; title">',
        '<table><tr><th colspan="2"><p>H</p></th></tr><tr><td rowspan="2"><p>C</p></td></tr></table>'
      ].join("")
    );
  });

  it("renders external links with safe defaults and preserves internal relative links", () => {
    expect(
      renderArticleHtml({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "External", marks: [{ type: "link", attrs: { href: "https://example.com", rel: "nofollow" } }] },
              { type: "text", text: " internal", marks: [{ type: "link", attrs: { href: "/blog/post", target: "_self" } }] }
            ]
          }
        ]
      })
    ).toBe(
      '<p><a href="https://example.com" target="_blank" rel="noopener noreferrer">External</a><a href="/blog/post" target="_self"> internal</a></p>'
    );
  });

  it("renders supported code languages as standard language classes", () => {
    const languages = ["tsx", "jsx", "yaml", "scss", "sql", "go", "rust", "java", "mermaid"];
    const document: ArticleDocument = {
      type: "doc",
      content: languages.map((language) => ({
        type: "codeBlock",
        attrs: { language },
        content: [{ type: "text", text: `${language} body` }]
      }))
    };

    const html = renderArticleHtml(document);

    for (const language of languages) {
      expect(html).toContain(`class="hljs language-${language}"`);
      expect(html).toContain(`${language} body`);
    }
  });

  it("throws stable errors for unsafe links and invalid code languages", () => {
    expect(
      renderFailureCode({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] }]
      })
    ).toBe("unsafe-link-href");
    expect(
      renderFailureCode({
        type: "doc",
        content: [{ type: "codeBlock", attrs: { language: "../ts" }, content: [{ type: "text", text: "x" }] }]
      })
    ).toBe("invalid-code-language");
  });

  it("throws stable errors for unsupported nodes and marks", () => {
    expect(renderFailureCode({ type: "doc", content: [{ type: "callout" }] })).toBe("unsupported-node");
    expect(
      renderFailureCode({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "underline" as never }] }] }]
      })
    ).toBe("unsupported-mark");
  });
});

function renderFailureCode(document: ArticleDocument): string | undefined {
  try {
    renderArticleHtml(document);
  } catch (error) {
    return typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : undefined;
  }
  return undefined;
}
