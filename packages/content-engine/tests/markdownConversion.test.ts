import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import {
  extractMarkdownProse,
  extractMarkdownText,
  previewMarkdownConversion,
  projectArticleToMarkdown
} from "../src/index.js";

const fixturesDir = resolve(process.cwd(), "tests/fixtures");

const fullSupportedDocument = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2, id: "heading" }, content: [{ type: "text", text: "Heading" }] },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Hello ", marks: [{ type: "bold" }] },
        { type: "text", text: "world", marks: [{ type: "italic" }] }
      ]
    },
    { type: "codeBlock", attrs: { language: "ts" }, content: [{ type: "text", text: "const answer = 42;" }] },
    { type: "image", attrs: { src: "/uploads/diagram.png", alt: "Diagram" } },
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Name" }] }] },
            { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Value" }] }] }
          ]
        },
        {
          type: "tableRow",
          content: [
            { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Answer" }] }] },
            { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "42" }] }] }
          ]
        }
      ]
    }
  ]
};

describe("markdown compatibility pipeline", () => {
  test("projects supported JSON to deterministic GFM", () => {
    const first = projectArticleToMarkdown(fullSupportedDocument);
    const second = projectArticleToMarkdown(fullSupportedDocument);
    expect(second).toBe(first);
    expect(first).toContain("## Heading");
    expect(first).toMatch(/\x60{3}ts/);
    expect(first).toContain("| Name | Value |");
    expect(first).toContain("![Diagram](/uploads/diagram.png)");
  });

  test("previews supported Markdown without writing state", () => {
    const markdown = readFileSync(resolve(fixturesDir, "basic.md"), "utf8");
    const result = previewMarkdownConversion(markdown);
    expect(result.canConvert).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.document?.type).toBe("doc");
    expect(result.document?.content[0]?.attrs?.id).toBe("intro");
    expect(result.projectedMarkdown).toContain("# Intro");
  });

  test("preserves the current public heading slug rules during conversion", () => {
    const result = previewMarkdownConversion("## 中文标题\n\n## 中文标题");
    expect(result.document?.content.map((node) => node.attrs?.id)).toEqual(["中文标题", "中文标题-2"]);
  });

  test.each([
    ["raw-html", "unsupported-html.md"],
    ["task-list", "unsupported-task-list.md"]
  ])("blocks %s in v1", (code, fixture) => {
    const result = previewMarkdownConversion(readFileSync(resolve(fixturesDir, fixture), "utf8"));
    expect(result.canConvert).toBe(false);
    expect(result.document).toBeNull();
    expect(result.projectedMarkdown).toBeNull();
    expect(result.blockers).toEqual(expect.arrayContaining([expect.objectContaining({ code })]));
  });

  test("extracts legacy Markdown text and prose with different code behavior", () => {
    const markdown = "# Intro\n\nText before.\n\n```ts\nconst answer = 42;\n```\n\n<section>drop me</section>";
    expect(extractMarkdownText(markdown)).toContain("const answer = 42");
    expect(extractMarkdownProse(markdown)).not.toContain("const answer = 42");
    expect(extractMarkdownText(markdown)).not.toContain("section");
  });
});
