import { describe, expect, test } from "vitest";
import type { ArticleDocument } from "@tworiver/content-engine/schema";
import type { ArticleContent } from "@tworiver/shared";
import { prepareArticleContent } from "../src/services/articleContentService.js";

const headingWithoutId = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Intro" }]
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "Body" }]
    }
  ]
} satisfies ArticleDocument;

const unsafeDocumentContent = {
  format: "tiptap" as const,
  schemaVersion: 1,
  doc: {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Bad link",
            marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }]
          }
        ]
      }
    ]
  }
} satisfies ArticleContent;

describe("article content preparation", () => {
  test("prepares Markdown storage fields", () => {
    expect(
      prepareArticleContent({
        format: "markdown",
        markdown: "# Intro\n\nBody"
      })
    ).toEqual({
      contentFormat: "markdown",
      contentMarkdown: "# Intro\n\nBody",
      contentJson: null,
      contentSchemaVersion: null,
      contentText: "Intro\nBody"
    });
  });

  test("normalizes TipTap and derives compatibility fields", () => {
    const result = prepareArticleContent({
      format: "tiptap",
      schemaVersion: 1,
      doc: headingWithoutId
    });

    expect(result.contentFormat).toBe("tiptap");
    expect(result.contentJson).toContain('"type":"doc"');
    expect(result.contentMarkdown).toContain("## Intro");
    expect(result.contentText).toContain("Intro");
    expect(JSON.parse(result.contentJson ?? "").content[0].attrs.id).toMatch(/^h_/);
  });

  test("maps content validation failures to safe codes", () => {
    expect(() => prepareArticleContent(unsafeDocumentContent)).toThrow(
      expect.objectContaining({
        code: "unsafe-link",
        path: ["content", 0, "content", 0, "marks", 0, "attrs", "href"],
        publicMessage: "Article content is invalid"
      })
    );
  });
});
