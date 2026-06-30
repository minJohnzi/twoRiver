import { describe, expect, it } from "vitest";
import { getMarkdownLabels, renderHtmlDocument, renderMarkdownDocument } from "./renderMarkdownDocument";

describe("renderMarkdownDocument", () => {
  it("returns sanitized HTML and structured H1/H2/H3 headings in one pass", () => {
    const result = renderMarkdownDocument(
      [
        "# Hello, World!",
        "## 中文 标题",
        "### `inline` details",
        "#### Ignored",
        "# Hello, World!"
      ].join("\n\n"),
      getMarkdownLabels("en")
    );

    expect(result.headings).toEqual([
      { id: "hello-world", level: 1, text: "Hello, World!" },
      { id: "中文-标题", level: 2, text: "中文 标题" },
      { id: "inline-details", level: 3, text: "inline details" },
      { id: "hello-world-2", level: 1, text: "Hello, World!" }
    ]);
    expect(result.html).toContain('id="hello-world"');
    expect(result.html).toContain('id="中文-标题"');
    expect(result.html).not.toContain('id="ignored"');
  });

  it("uses deterministic fallbacks when a heading has no letters or numbers", () => {
    const result = renderMarkdownDocument("# !!!\n\n## ???", getMarkdownLabels("en"));

    expect(result.headings.map((heading) => heading.id)).toEqual(["section-1", "section-2"]);
  });

  it("preserves unique existing heading ids and regenerates missing or colliding ids", () => {
    const result = renderHtmlDocument(
      '<h2 id="kept">Kept</h2><h2 id="kept">Kept</h2><h2>Kept</h2>',
      getMarkdownLabels("en")
    );

    expect(result.headings).toEqual([
      { id: "kept", level: 2, text: "Kept" },
      { id: "kept-2", level: 2, text: "Kept" },
      { id: "kept-3", level: 2, text: "Kept" }
    ]);
    expect(result.html).toContain('id="kept"');
    expect(result.html).toContain('id="kept-2"');
    expect(result.html).toContain('id="kept-3"');
  });

  it("keeps sanitization and HTML enhancements in the returned document", () => {
    const result = renderMarkdownDocument(
      [
        "<script>window.__xss = true</script>",
        "```ts",
        "const value = 1;",
        "```",
        "| Name | Value |",
        "| --- | --- |",
        "| River | Two |",
        "![Diagram](/uploads/images/posts/p_111/diagram.png)"
      ].join("\n"),
      getMarkdownLabels("en")
    );

    expect(result.html).not.toContain("<script");
    expect(result.html).toContain('class="code-window"');
    expect(result.html).toContain('class="markdown-table-wrap"');
    expect(result.html).toContain('data-markdown-image="true"');
  });

  it("returns complete Chinese interaction labels", () => {
    expect(getMarkdownLabels("zh")).toEqual({
      copy: "复制",
      copied: "已复制",
      failed: "复制失败",
      openImage: "打开图片预览",
      imagePreview: "图片预览",
      closeImage: "关闭图片预览"
    });
  });
});
