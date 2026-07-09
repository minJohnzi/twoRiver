import "@testing-library/jest-dom/vitest";
import type { ArticleDocument } from "@tworiver/content-engine/browser";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ArticleEditor, ArticleEditorToolbarView, type ArticleEditorToolbarActions, type ArticleEditorToolbarState } from "./ArticleEditor";

const paragraphDocument: ArticleDocument = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Initial body" }] }]
};

function emptyClientRects(): DOMRectList {
  return {
    length: 0,
    item: () => null,
    [Symbol.iterator]: function* iterator() {
      // empty DOMRectList
    }
  } as DOMRectList;
}

function emptyBoundingRect(): DOMRect {
  return {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    toJSON: () => ({})
  } as DOMRect;
}

beforeAll(() => {
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = emptyClientRects;
  }
  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = emptyBoundingRect;
  }
  if (!("getClientRects" in Text.prototype)) {
    Object.defineProperty(Text.prototype, "getClientRects", {
      configurable: true,
      value: emptyClientRects
    });
  }
  if (!("getBoundingClientRect" in Text.prototype)) {
    Object.defineProperty(Text.prototype, "getBoundingClientRect", {
      configurable: true,
      value: emptyBoundingRect
    });
  }
});

function toolbarState(overrides: Partial<ArticleEditorToolbarState> = {}): ArticleEditorToolbarState {
  return {
    isEditable: true,
    isParagraph: true,
    isHeading2: false,
    isHeading3: false,
    isHeading4: false,
    isBold: false,
    isItalic: false,
    isStrike: false,
    isCode: false,
    isBulletList: false,
    isOrderedList: false,
    isBlockquote: false,
    isCodeBlock: false,
    isLink: false,
    isInTable: false,
    canUndo: true,
    canRedo: true,
    codeLanguage: "plaintext",
    linkHref: "",
    hasSelection: false,
    isFocused: false,
    isEmptyParagraph: false,
    ...overrides
  };
}

function toolbarActions(): ArticleEditorToolbarActions & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    setParagraph: () => calls.push("setParagraph"),
    setHeading: (level) => calls.push(`setHeading:${level}`),
    toggleBold: () => calls.push("toggleBold"),
    toggleItalic: () => calls.push("toggleItalic"),
    toggleStrike: () => calls.push("toggleStrike"),
    toggleCode: () => calls.push("toggleCode"),
    toggleCodeBlock: () => calls.push("toggleCodeBlock"),
    toggleBulletList: () => calls.push("toggleBulletList"),
    toggleOrderedList: () => calls.push("toggleOrderedList"),
    toggleBlockquote: () => calls.push("toggleBlockquote"),
    setLink: (href) => calls.push(`setLink:${href}`),
    unsetLink: () => calls.push("unsetLink"),
    setCodeBlockLanguage: (language) => calls.push(`setCodeBlockLanguage:${language}`),
    requestImage: () => calls.push("requestImage"),
    insertTable: () => calls.push("insertTable"),
    addTableRow: () => calls.push("addTableRow"),
    deleteTableRow: () => calls.push("deleteTableRow"),
    addTableColumn: () => calls.push("addTableColumn"),
    deleteTableColumn: () => calls.push("deleteTableColumn"),
    insertHorizontalRule: () => calls.push("insertHorizontalRule"),
    undo: () => calls.push("undo"),
    redo: () => calls.push("redo")
  };
}

describe("ArticleEditor", () => {
  afterEach(() => {
    cleanup();
  });

  it("loads JSON content and emits document updates from editor commands", async () => {
    const handleChange = vi.fn();
    render(<ArticleEditor value={paragraphDocument} locale="en" onChange={handleChange} />);

    expect(await screen.findByRole("textbox", { name: "Article body" })).toHaveTextContent("Initial body");
    fireEvent.click(screen.getByRole("button", { name: "Horizontal rule" }));

    await waitFor(() => expect(handleChange).toHaveBeenCalled());
    expect(handleChange.mock.calls.at(-1)?.[0]).toMatchObject({
      type: "doc",
      content: expect.arrayContaining([expect.objectContaining({ type: "horizontalRule" })])
    });
  });

  it("replaces server-normalized values without emitting a dirty update", async () => {
    const handleChange = vi.fn();
    const { rerender } = render(<ArticleEditor value={paragraphDocument} locale="en" onChange={handleChange} />);
    expect(await screen.findByText("Initial body")).toBeInTheDocument();

    handleChange.mockClear();
    rerender(
      <ArticleEditor
        value={{
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Server normalized" }] }]
        }}
        locale="en"
        onChange={handleChange}
      />
    );

    expect(await screen.findByText("Server normalized")).toBeInTheDocument();
    expect(handleChange).not.toHaveBeenCalled();
  });

  it("reports invalid content and does not render an empty editable document", () => {
    const handleInvalid = vi.fn();
    render(
      <ArticleEditor
        value={{ type: "doc", content: [{ type: "futureNode" }] } as ArticleDocument}
        locale="en"
        onChange={vi.fn()}
        onInvalidContent={handleInvalid}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Article content could not be loaded");
    expect(screen.queryByRole("textbox", { name: "Article body" })).not.toBeInTheDocument();
    expect(handleInvalid).toHaveBeenCalled();
  });

  it("routes toolbar image selections through the upload controller", async () => {
    const chooseFile = vi.fn().mockResolvedValue(undefined);
    const controller = {
      isUploading: false,
      chooseFile,
      onPasteFiles: vi.fn(),
      onDropFiles: vi.fn()
    };
    const { container } = render(
      <ArticleEditor
        value={paragraphDocument}
        locale="en"
        onChange={vi.fn()}
        imageUploadController={controller}
        imageUploadNotice="Uploading image..."
      />
    );

    expect(await screen.findByRole("textbox", { name: "Article body" })).toHaveTextContent("Initial body");
    expect(screen.getByRole("status")).toHaveTextContent("Uploading image...");

    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    const input = fileInput as HTMLInputElement;
    expect(input).toHaveAttribute("accept", "image/jpeg,image/png,image/webp,image/gif");

    const clickFileInput = vi.spyOn(input, "click");
    fireEvent.click(screen.getByRole("button", { name: "Insert image" }));
    expect(clickFileInput).toHaveBeenCalled();

    const file = new File(["image"], "diagram.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(chooseFile).toHaveBeenCalledWith(file, expect.objectContaining({ position: expect.any(Number) })));
    expect(chooseFile.mock.calls[0]?.[1].editor).toBeTruthy();
  });
});

describe("ArticleEditorToolbarView", () => {
  afterEach(() => {
    cleanup();
  });

  it("maps formatting, block, media, table, history, and language controls to commands", () => {
    const actions = toolbarActions();
    render(<ArticleEditorToolbarView locale="en" state={toolbarState({ isInTable: true })} actions={actions} />);

    for (const label of [
      "Paragraph",
      "Heading 2",
      "Heading 3",
      "Heading 4",
      "Bold",
      "Italic",
      "Strike",
      "Inline code",
      "Bullet list",
      "Ordered list",
      "Quote",
      "Horizontal rule",
      "Insert image",
      "Code block",
      "Insert table",
      "Add row",
      "Delete row",
      "Add column",
      "Delete column",
      "Undo",
      "Redo"
    ]) {
      fireEvent.click(screen.getByRole("button", { name: label }));
    }

    fireEvent.change(screen.getByLabelText("Code block language"), { target: { value: "tsx" } });
    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    fireEvent.change(screen.getByLabelText("Link URL"), { target: { value: "https://example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply link" }));

    expect(actions.calls).toEqual([
      "setParagraph",
      "setHeading:2",
      "setHeading:3",
      "setHeading:4",
      "toggleBold",
      "toggleItalic",
      "toggleStrike",
      "toggleCode",
      "toggleBulletList",
      "toggleOrderedList",
      "toggleBlockquote",
      "insertHorizontalRule",
      "requestImage",
      "toggleCodeBlock",
      "insertTable",
      "addTableRow",
      "deleteTableRow",
      "addTableColumn",
      "deleteTableColumn",
      "undo",
      "redo",
      "setCodeBlockLanguage:tsx",
      "setLink:https://example.com"
    ]);
  });

  it("marks active H4 and code-block controls as pressed", () => {
    const actions = toolbarActions();
    render(
      <ArticleEditorToolbarView
        locale="en"
        state={toolbarState({ isParagraph: false, isHeading4: true, isCodeBlock: true, codeLanguage: "mermaid" })}
        actions={actions}
      />
    );

    expect(screen.getByRole("button", { name: "Heading 4" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Code block" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Code block language")).toHaveValue("mermaid");
  });

  it("disables editing controls for read-only state and table controls outside tables", () => {
    const actions = toolbarActions();
    render(<ArticleEditorToolbarView locale="en" state={toolbarState({ isEditable: false, isInTable: false, canUndo: false, canRedo: false })} actions={actions} />);

    expect(screen.getByRole("button", { name: "Bold" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add row" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(screen.getByLabelText("Code block language")).toBeDisabled();
  });

  it("disables the image control while an upload is already running", () => {
    const actions = toolbarActions();
    render(<ArticleEditorToolbarView locale="en" state={toolbarState()} actions={actions} isImageUploading />);

    fireEvent.click(screen.getByRole("button", { name: "Insert image" }));

    expect(screen.getByRole("button", { name: "Insert image" })).toBeDisabled();
    expect(actions.calls).toEqual([]);
  });

  it("shows an accessible link popover with removal action", () => {
    const actions = toolbarActions();
    render(<ArticleEditorToolbarView locale="en" state={toolbarState({ isLink: true, linkHref: "https://old.example" })} actions={actions} />);

    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    const popover = screen.getByRole("form", { name: "Link" });
    expect(within(popover).getByLabelText("Link URL")).toHaveValue("https://old.example");
    fireEvent.click(within(popover).getByRole("button", { name: "Remove link" }));

    expect(actions.calls).toEqual(["unsetLink"]);
  });
});
