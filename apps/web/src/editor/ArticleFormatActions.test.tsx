import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ArticleFormatActions } from "./ArticleFormatActions";

describe("ArticleFormatActions", () => {
  it("renders the new article format choices and reports the selected format", () => {
    const onChooseFormat = vi.fn();
    render(<ArticleFormatActions locale="en" currentFormat="markdown" onChooseFormat={onChooseFormat} />);

    expect(screen.getByLabelText("Body format")).toHaveTextContent("Choose Markdown or the rich text editor");
    expect(screen.getByRole("button", { name: /Use Markdown/ })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Use rich text" }));

    expect(onChooseFormat).toHaveBeenCalledWith("tiptap");
  });
});
