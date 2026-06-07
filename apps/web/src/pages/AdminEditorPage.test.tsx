import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownPreview } from "../components/MarkdownPreview";

describe("MarkdownPreview", () => {
  it("renders headings and fenced code blocks", () => {
    render(<MarkdownPreview markdown={"# Title\n\n```ts\nconst value = 1;\n```"} />);

    expect(screen.getByRole("heading", { name: "Title" })).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.tagName === "CODE")).toHaveTextContent(
      "const value = 1;"
    );
  });
});

describe("admin editor behavior", () => {
  it("renders a markdown body textarea", () => {
    render(<textarea aria-label="Markdown body" defaultValue="# Draft" />);

    expect(screen.getByLabelText("Markdown body")).toHaveValue("# Draft");
  });
});
