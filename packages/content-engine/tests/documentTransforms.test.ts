import { describe, expect, test } from "vitest";
import {
  collectArticleResourceReferences,
  extractArticleProse,
  extractArticleText,
  migrateArticleDocument,
  normalizeArticleDocument
} from "../src/index.js";

const documentWithCode = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2, id: "intro" }, content: [{ type: "text", text: "Intro" }] },
    { type: "paragraph", content: [{ type: "text", text: "Body" }] },
    { type: "image", attrs: { src: "/uploads/a.png", alt: "Diagram", title: "Architecture" } },
    { type: "codeBlock", attrs: { language: "ts" }, content: [{ type: "text", text: "const answer = 42;" }] },
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Cell text" }] }] }
          ]
        }
      ]
    }
  ]
};

const duplicateHeadingIds = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2, id: "intro" }, content: [{ type: "text", text: "Intro" }] },
    { type: "heading", attrs: { level: 2, id: "intro" }, content: [{ type: "text", text: "Intro again" }] }
  ]
};

const documentWithDuplicateImage = {
  type: "doc",
  content: [
    { type: "image", attrs: { src: "/uploads/b.png" } },
    { type: "paragraph", content: [{ type: "text", text: "Between" }] },
    { type: "image", attrs: { src: "/uploads/a.png" } },
    { type: "image", attrs: { src: "/uploads/a.png" } }
  ]
};

describe("article document transforms", () => {
  test("adds stable unique IDs only to headings without mutating the caller", () => {
    const input = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Intro" }] },
        { type: "paragraph", content: [{ type: "text", text: "Body" }] }
      ]
    };
    const before = structuredClone(input);

    const normalized = normalizeArticleDocument(input);

    expect(normalized.content[0]?.attrs?.id).toMatch(/^h_/);
    expect(normalized.content[1]?.attrs?.id).toBeUndefined();
    expect(input).toEqual(before);
  });

  test("preserves the first heading ID and repairs duplicates", () => {
    const normalized = normalizeArticleDocument(duplicateHeadingIds);
    expect(normalized.content.map((node) => node.attrs?.id)).toEqual(["intro", expect.stringMatching(/^h_/)]);
  });

  test("extracts search text and prose text with different code behavior", () => {
    expect(extractArticleText(normalizeArticleDocument(documentWithCode))).toContain("const answer = 42");
    expect(extractArticleText(normalizeArticleDocument(documentWithCode))).toContain("Diagram");
    expect(extractArticleText(normalizeArticleDocument(documentWithCode))).toContain("Cell text");
    expect(extractArticleProse(normalizeArticleDocument(documentWithCode))).not.toContain("const answer = 42");
  });

  test("collects unique image references", () => {
    expect(collectArticleResourceReferences(normalizeArticleDocument(documentWithDuplicateImage))).toEqual([
      "/uploads/a.png",
      "/uploads/b.png"
    ]);
  });

  test("migrates only supported schema versions", () => {
    expect(migrateArticleDocument(1, duplicateHeadingIds).content[1]?.attrs?.id).toMatch(/^h_/);
    expect(() => migrateArticleDocument(0, duplicateHeadingIds)).toThrow(/unsupported-schema-version/);
    expect(() => migrateArticleDocument(99, duplicateHeadingIds)).toThrow(/unsupported-schema-version/);
  });
});
