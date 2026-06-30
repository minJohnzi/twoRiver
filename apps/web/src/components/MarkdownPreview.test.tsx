import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MarkdownPreview } from "./MarkdownPreview";

describe("MarkdownPreview", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a supplied markdown document without nesting an article", () => {
    const { container } = render(
      <MarkdownPreview
        document={{
          html: '<h2 id="ready">Ready</h2><p>Body</p>',
          headings: [{ id: "ready", level: 2, text: "Ready" }]
        }}
        locale="en"
      />
    );

    expect(screen.getByRole("heading", { name: "Ready" })).toHaveAttribute("id", "ready");
    expect(screen.getByText("Body")).toBeInTheDocument();
    expect(container.querySelector(".markdown-body")?.tagName).toBe("DIV");
    expect(container.querySelector("article .markdown-body")).not.toBeInTheDocument();
  });

  it("uses real Chinese labels for markdown copy and image preview controls", () => {
    render(<MarkdownPreview markdown={"```ts\nconst value = 1;\n```\n\n![图片](/uploads/images/posts/p_111/photo.png)"} locale="zh" />);

    expect(screen.getByRole("button", { name: "复制" })).toBeInTheDocument();

    const imageButton = screen.getByRole("button", { name: "打开图片预览: 图片" });
    fireEvent.click(imageButton);

    const dialog = screen.getByRole("dialog", { name: "图片预览" });
    expect(within(dialog).getByRole("button", { name: "关闭图片预览" })).toBeInTheDocument();
  });

  it("renders a supplied article translation through the canonical document renderer", () => {
    render(
      <MarkdownPreview
        locale="en"
        translation={{
          locale: "en",
          contentMarkdown: "# Fallback",
          content: {
            format: "tiptap",
            schemaVersion: 1,
            doc: {
              type: "doc",
              content: [
                { type: "heading", attrs: { level: 2, id: "rich" }, content: [{ type: "text", text: "Rich heading" }] },
                { type: "paragraph", content: [{ type: "text", text: "Canonical body" }] }
              ]
            }
          }
        }}
      />
    );

    expect(screen.getByRole("heading", { name: "Rich heading" })).toHaveAttribute("id", "rich");
    expect(screen.getByText("Canonical body")).toBeInTheDocument();
    expect(screen.queryByText("Fallback")).not.toBeInTheDocument();
  });
});
