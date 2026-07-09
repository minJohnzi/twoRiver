import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import {
  ArticleDocumentSchema,
  MAX_ARTICLE_NODES,
  MAX_ARTICLE_URL_LENGTH,
  validateArticleDocument
} from "../src/index.js";

const paragraph = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }]
};

function expectValidationCode(input: unknown, code: string): void {
  expect(() => validateArticleDocument(input)).toThrow(code);
}

describe("article document schema", () => {
  test("accepts the minimal v1 document", () => {
    expect(validateArticleDocument(paragraph)).toEqual(paragraph);
  });

  test("keeps the shared JSON schema broad while runtime validation is narrow", () => {
    expect(ArticleDocumentSchema.parse({ type: "doc", content: [{ type: "futureNode" }] })).toEqual({
      type: "doc",
      content: [{ type: "futureNode" }]
    });
    expectValidationCode({ type: "doc", content: [{ type: "futureNode" }] }, "unknown-node");
  });

  test("accepts every persisted v1 node and mark shape", () => {
    const richDocument = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2, id: "intro" }, content: [{ type: "text", text: "Intro" }] },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Bold", marks: [{ type: "bold" }] },
            { type: "text", text: " italic", marks: [{ type: "italic" }] },
            { type: "text", text: " strike", marks: [{ type: "strike" }] },
            { type: "text", text: " code", marks: [{ type: "code" }] },
            { type: "text", text: " link", marks: [{ type: "link", attrs: { href: "https://example.com" } }] },
            { type: "hardBreak" },
            { type: "text", text: "after break" }
          ]
        },
        { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "Quote" }] }] },
        { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Bullet" }] }] }] },
        {
          type: "orderedList",
          attrs: { start: 2 },
          content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Numbered" }] }] }]
        },
        { type: "codeBlock", attrs: { language: "ts" }, content: [{ type: "text", text: "const ok = true;" }] },
        { type: "horizontalRule" },
        { type: "image", attrs: { src: "/uploads/posts/example.png", alt: "Example", title: "Example image" } },
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "H" }] }] },
                { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "H2" }] }] }
              ]
            },
            {
              type: "tableRow",
              content: [
                { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "C" }] }] },
                { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "C2" }] }] }
              ]
            }
          ]
        }
      ]
    };

    expect(validateArticleDocument(richDocument)).toEqual(richDocument);
  });

  test("rejects unknown nodes and persisted underline marks", () => {
    expectValidationCode({ type: "doc", content: [{ type: "callout" }] }, "unknown-node");
    expectValidationCode(
      {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "underline" }] }] }]
      },
      "unknown-mark"
    );
  });

  test("rejects unknown attrs", () => {
    expectValidationCode(
      { type: "doc", content: [{ type: "paragraph", attrs: { class: "bad" }, content: [{ type: "text", text: "x" }] }] },
      "unknown-attr"
    );
    expectValidationCode(
      {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "bold", attrs: { bad: true } }] }] }]
      },
      "unknown-attr"
    );
  });

  test("rejects unsafe URLs", () => {
    for (const href of ["javascript:alert(1)", "data:text/html,<p>x</p>", "//evil.example/path", " https://example.com"]) {
      expectValidationCode(
        {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "bad", marks: [{ type: "link", attrs: { href } }] }]
            }
          ]
        },
        "unsafe-link"
      );
    }
    expectValidationCode({ type: "doc", content: [{ type: "image", attrs: { src: "data:image/png;base64,AAAA" } }] }, "unsafe-image");
  });

  test("accepts external and site-relative links", () => {
    for (const href of ["https://example.com/docs", "http://example.com/docs", "mailto:team@example.com", "/docs", "./docs", "../docs", "docs/page", "#intro"]) {
      expect(
        validateArticleDocument({
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "ok", marks: [{ type: "link", attrs: { href } }] }]
            }
          ]
        })
      ).toMatchObject({ type: "doc" });
    }
  });

  test("rejects oversized URLs, excess depth, and excess node count", () => {
    expectValidationCode(
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: `https://example.com/${"a".repeat(MAX_ARTICLE_URL_LENGTH)}` } }] }]
          }
        ]
      },
      "url-too-long"
    );

    let deep: Record<string, unknown> = { type: "text", text: "x" };
    for (let index = 0; index < 52; index += 1) {
      deep = { type: "blockquote", content: [deep] };
    }
    expectValidationCode({ type: "doc", content: [deep] }, "max-depth");

    expectValidationCode(
      { type: "doc", content: Array.from({ length: MAX_ARTICLE_NODES + 1 }, () => ({ type: "paragraph" })) },
      "max-nodes"
    );
  });

  test("rejects invalid heading ids and code languages", () => {
    expectValidationCode({ type: "doc", content: [{ type: "heading", attrs: { level: 7 }, content: [{ type: "text", text: "Bad" }] }] }, "invalid-heading-level");
    expectValidationCode({ type: "doc", content: [{ type: "heading", attrs: { level: 2, id: "" }, content: [{ type: "text", text: "Bad" }] }] }, "invalid-heading-id");
    expectValidationCode({ type: "doc", content: [{ type: "codeBlock", attrs: { language: "../ts" }, content: [{ type: "text", text: "Bad" }] }] }, "invalid-code-language");
    expectValidationCode({ type: "doc", content: [{ type: "codeBlock", attrs: { language: "brainfuck" }, content: [{ type: "text", text: "Bad" }] }] }, "invalid-code-language");
  });

  test("normalizes supported code languages", () => {
    for (const language of ["tsx", "jsx", "yaml", "scss", "sql", "go", "rust", "java", "mermaid"]) {
      const document = validateArticleDocument({
        type: "doc",
        content: [{ type: "codeBlock", attrs: { language: language.toUpperCase() }, content: [{ type: "text", text: "ok" }] }]
      });
      expect(document.content[0]?.attrs?.language).toBe(language);
    }

    const aliasDocument = validateArticleDocument({
      type: "doc",
      content: [
        { type: "codeBlock", attrs: { language: "ts" }, content: [{ type: "text", text: "ok" }] },
        { type: "codeBlock", attrs: { language: "yml" }, content: [{ type: "text", text: "ok" }] }
      ]
    });
    expect(aliasDocument.content.map((node) => node.attrs?.language)).toEqual(["ts", "yaml"]);
  });

  test("normalizes missing image alt to an empty string and rejects non-string alt", () => {
    expect(
      validateArticleDocument({
        type: "doc",
        content: [
          { type: "image", attrs: { src: "/uploads/posts/example.png" } },
          { type: "image", attrs: { src: "/uploads/posts/decorative.png", alt: null } }
        ]
      }).content.map((node) => node.attrs?.alt)
    ).toEqual(["", ""]);

    expectValidationCode(
      { type: "doc", content: [{ type: "image", attrs: { src: "/uploads/posts/example.png", alt: 123 } }] },
      "invalid-attr"
    );
  });

  test("browser entry imports only browser-safe modules and exports validation helpers", async () => {
    const browserModule = await import("../src/browser.js");
    expect(browserModule.ARTICLE_DOCUMENT_SCHEMA_VERSION).toBe(1);
    expect("validateArticleDocument" in browserModule).toBe(true);

    const browserSource = readFileSync(resolve(process.cwd(), "src/browser.ts"), "utf8");
    expect(browserSource).not.toContain("./index.js");
    expect(browserSource).not.toContain("./articleExtensions.js");
    expect(browserSource).not.toContain("lowlight");
  });
});
