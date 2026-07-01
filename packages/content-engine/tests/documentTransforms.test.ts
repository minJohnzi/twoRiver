import { describe, expect, test } from "vitest";
import {
  applyArticleTranslationBlocks,
  ArticleTranslationTopologyError,
  collectArticleResourceReferences,
  extractArticleTranslationBlocks,
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

const documentWithTranslatableSegments = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2, id: "intro" }, content: [{ type: "text", text: "Intro" }] },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Visit " },
        {
          type: "text",
          text: "TwoRiver",
          marks: [{ type: "link", attrs: { href: "https://example.com/docs" } }]
        },
        { type: "text", text: " today." },
        {
          type: "text",
          text: "npm run build",
          marks: [{ type: "code" }]
        }
      ]
    },
    { type: "image", attrs: { src: "/uploads/a.png", alt: "Diagram", title: "Architecture" } },
    { type: "codeBlock", attrs: { language: "ts" }, content: [{ type: "text", text: "const answer = 42;" }] }
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

  test("extracts translatable TipTap blocks and applies translated text without changing links, code, or topology", () => {
    const normalized = normalizeArticleDocument(documentWithTranslatableSegments);
    const blocks = extractArticleTranslationBlocks(normalized);

    expect(blocks).toEqual([
      {
        blockId: "content[0]",
        nodeType: "heading",
        segments: [
          {
            segmentId: "content[0].content[0].text",
            text: "Intro",
            targetPath: ["content", 0, "content", 0, "text"]
          }
        ]
      },
      {
        blockId: "content[1]",
        nodeType: "paragraph",
        segments: [
          {
            segmentId: "content[1].content[0].text",
            text: "Visit ",
            targetPath: ["content", 1, "content", 0, "text"]
          },
          {
            segmentId: "content[1].content[1].text",
            text: "TwoRiver",
            targetPath: ["content", 1, "content", 1, "text"]
          },
          {
            segmentId: "content[1].content[2].text",
            text: " today.",
            targetPath: ["content", 1, "content", 2, "text"]
          }
        ]
      },
      {
        blockId: "content[2]",
        nodeType: "image",
        segments: [
          {
            segmentId: "content[2].attrs.alt",
            text: "Diagram",
            targetPath: ["content", 2, "attrs", "alt"]
          },
          {
            segmentId: "content[2].attrs.title",
            text: "Architecture",
            targetPath: ["content", 2, "attrs", "title"]
          }
        ]
      }
    ]);

    const translated = applyArticleTranslationBlocks(normalized, blocks, [
      {
        blockId: "content[0]",
        segments: [{ segmentId: "content[0].content[0].text", text: "引言" }]
      },
      {
        blockId: "content[1]",
        segments: [
          { segmentId: "content[1].content[0].text", text: "访问" },
          { segmentId: "content[1].content[1].text", text: "双河" },
          { segmentId: "content[1].content[2].text", text: "，就在今天。" }
        ]
      },
      {
        blockId: "content[2]",
        segments: [
          { segmentId: "content[2].attrs.alt", text: "示意图" },
          { segmentId: "content[2].attrs.title", text: "架构图" }
        ]
      }
    ]);

    expect(translated.content[0]?.content?.[0]?.text).toBe("引言");
    expect(translated.content[1]?.content?.[0]?.text).toBe("访问");
    expect(translated.content[1]?.content?.[1]?.text).toBe("双河");
    expect(translated.content[1]?.content?.[1]?.marks?.[0]?.attrs?.href).toBe("https://example.com/docs");
    expect(translated.content[1]?.content?.[3]?.text).toBe("npm run build");
    expect(translated.content[2]?.attrs?.alt).toBe("示意图");
    expect(translated.content[2]?.attrs?.title).toBe("架构图");
    expect(translated.content[3]?.content?.[0]?.text).toBe("const answer = 42;");
  });

  test("rejects translated TipTap blocks when the returned segment topology changes", () => {
    const normalized = normalizeArticleDocument(documentWithTranslatableSegments);
    const blocks = extractArticleTranslationBlocks(normalized);

    expect(() =>
      applyArticleTranslationBlocks(normalized, blocks, [
        {
          blockId: "content[0]",
          segments: [{ segmentId: "content[0].content[0].text", text: "引言" }]
        },
        {
          blockId: "content[1]",
          segments: [{ segmentId: "content[1].content[0].text", text: "访问双河，马上开始。" }]
        },
        {
          blockId: "content[2]",
          segments: [
            { segmentId: "content[2].attrs.alt", text: "示意图" },
            { segmentId: "content[2].attrs.title", text: "架构图" }
          ]
        }
      ])
    ).toThrow(ArticleTranslationTopologyError);
  });

  test("migrates only supported schema versions", () => {
    expect(migrateArticleDocument(1, duplicateHeadingIds).content[1]?.attrs?.id).toMatch(/^h_/);
    expect(() => migrateArticleDocument(0, duplicateHeadingIds)).toThrow(/unsupported-schema-version/);
    expect(() => migrateArticleDocument(99, duplicateHeadingIds)).toThrow(/unsupported-schema-version/);
  });
});
