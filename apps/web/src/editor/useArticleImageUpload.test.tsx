import { act, renderHook, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/react";
import { describe, expect, it, vi } from "vitest";
import { sanitizeArticleImageAltText, useArticleImageUpload } from "./useArticleImageUpload";

function imageFile(name = "diagram.png", type = "image/png") {
  return new File(["image"], name, { type });
}

type EditorStub = {
  state: {
    selection: { from: number };
    doc: { content: { size: number } };
  };
  commands: {
    insertContentAt: ReturnType<typeof vi.fn>;
  };
};

function createEditorStub(selectionFrom = 2, docSize = 10): EditorStub {
  return {
    state: {
      selection: { from: selectionFrom },
      doc: { content: { size: docSize } }
    },
    commands: {
      insertContentAt: vi.fn()
    }
  };
}

describe("useArticleImageUpload", () => {
  it("uploads accepted images, sanitizes alt text, restores/clamps position, and inserts only after success", async () => {
    const upload = vi.fn().mockResolvedValue({ url: "/uploads/images/posts/p_1/diagram.png", markdown: "![x](/uploads/x.png)" });
    const notices: string[] = [];
    const editor = createEditorStub(99, 12);
    const { result } = renderHook(() => useArticleImageUpload({ postUid: "p_1", upload, onNotice: (message) => notices.push(message) }));

    const promise = act(async () => {
      await result.current.chooseFile(imageFile("line\nbreak].png"), {
        editor: editor as unknown as Editor,
        position: 99,
        altText: "line\nbreak]"
      });
    });
    expect(editor.commands.insertContentAt).not.toHaveBeenCalled();
    await promise;

    expect(upload).toHaveBeenCalledWith({ postUid: "p_1", file: expect.any(File) });
    expect(editor.commands.insertContentAt).toHaveBeenCalledWith(12, {
      type: "image",
      attrs: { src: "/uploads/images/posts/p_1/diagram.png", alt: "line break)", title: null }
    });
    expect(notices).toContain("Image inserted.");
  });

  it("requires a saved post uid and accepted MIME type", async () => {
    const upload = vi.fn();
    const notices: string[] = [];
    const editor = createEditorStub();
    const { result, rerender } = renderHook(({ postUid }) => useArticleImageUpload({ postUid, upload, onNotice: (message) => notices.push(message) }), {
      initialProps: { postUid: null as string | null }
    });

    await act(async () => {
      await result.current.chooseFile(imageFile(), { editor: editor as unknown as Editor });
    });
    rerender({ postUid: "p_1" });
    await act(async () => {
      await result.current.chooseFile(new File(["svg"], "icon.svg", { type: "image/svg+xml" }), {
        editor: editor as unknown as Editor
      });
    });

    expect(upload).not.toHaveBeenCalled();
    expect(notices).toEqual(["Save the post before inserting images.", "Unsupported image type."]);
    expect(editor.commands.insertContentAt).not.toHaveBeenCalled();
  });

  it("prevents duplicate uploads while one is in flight and reports failures", async () => {
    let rejectUpload: ((error: Error) => void) | undefined;
    const upload = vi.fn(
      () =>
        new Promise<never>((_resolve, reject) => {
          rejectUpload = reject;
        })
    );
    const notices: string[] = [];
    const editor = createEditorStub();
    const { result } = renderHook(() => useArticleImageUpload({ postUid: "p_1", upload, onNotice: (message) => notices.push(message) }));

    let firstUpload: Promise<void> | undefined;
    await act(async () => {
      firstUpload = result.current.chooseFile(imageFile("first.png"), { editor: editor as unknown as Editor });
    });
    await waitFor(() => expect(result.current.isUploading).toBe(true));

    await act(async () => {
      void result.current.chooseFile(imageFile("second.png"), { editor: editor as unknown as Editor });
    });

    await act(async () => {
      rejectUpload?.(new Error("network"));
      await firstUpload;
    });
    await waitFor(() => expect(result.current.isUploading).toBe(false));

    expect(upload).toHaveBeenCalledTimes(1);
    expect(notices).toContain("An image upload is already in progress.");
    expect(notices).toContain("Image upload failed.");
    expect(editor.commands.insertContentAt).not.toHaveBeenCalled();
  });

  it("uses paste selection and drop positions for image insertion", async () => {
    const upload = vi.fn().mockResolvedValue({ url: "/uploads/images/posts/p_1/photo.gif", markdown: "" });
    const editor = createEditorStub(4, 20);
    const { result } = renderHook(() => useArticleImageUpload({ postUid: "p_1", upload }));

    await act(async () => {
      result.current.onPasteFiles([imageFile("paste.gif", "image/gif")], editor as unknown as Editor);
    });
    await waitFor(() => expect(editor.commands.insertContentAt).toHaveBeenCalledWith(4, expect.any(Object)));

    editor.commands.insertContentAt.mockClear();
    await act(async () => {
      result.current.onDropFiles([imageFile("drop.webp", "image/webp")], 8, editor as unknown as Editor);
    });
    await waitFor(() => expect(editor.commands.insertContentAt).toHaveBeenCalledWith(8, expect.any(Object)));
  });

  it("sanitizes alt text for Markdown compatibility", () => {
    expect(sanitizeArticleImageAltText("a\nb] c\r\n d")).toBe("a b) c d");
  });
});
