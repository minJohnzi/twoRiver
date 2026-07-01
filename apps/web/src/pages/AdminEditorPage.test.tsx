import "@testing-library/jest-dom/vitest";
import type { ArticleDocument } from "@tworiver/content-engine/browser";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { PublicPost } from "@tworiver/shared";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAdminTag,
  createAdminPost,
  deleteAdminPost,
  fetchAdminCategories,
  fetchAdminTags,
  fetchAdminPosts,
  fetchAdminPost,
  translateAdminPostDraft,
  updateAdminPost,
  uploadAdminPostImage
} from "../api/admin";
import { MarkdownPreview } from "../components/MarkdownPreview";
import { AdminEditorPage } from "./AdminEditorPage";

vi.mock("../api/admin", () => ({
  createAdminTag: vi.fn(),
  createAdminPost: vi.fn(),
  deleteAdminPost: vi.fn(),
  fetchAdminCategories: vi.fn(),
  fetchAdminTags: vi.fn(),
  fetchAdminPosts: vi.fn(),
  fetchAdminPost: vi.fn(),
  translateAdminPostDraft: vi.fn(),
  updateAdminPost: vi.fn(),
  uploadAdminPostImage: vi.fn()
}));

const mockedCreateAdminTag = vi.mocked(createAdminTag);
const mockedCreateAdminPost = vi.mocked(createAdminPost);
const mockedDeleteAdminPost = vi.mocked(deleteAdminPost);
const mockedFetchAdminCategories = vi.mocked(fetchAdminCategories);
const mockedFetchAdminTags = vi.mocked(fetchAdminTags);
const mockedFetchAdminPosts = vi.mocked(fetchAdminPosts);
const mockedFetchAdminPost = vi.mocked(fetchAdminPost);
const mockedTranslateAdminPostDraft = vi.mocked(translateAdminPostDraft);
const mockedUpdateAdminPost = vi.mocked(updateAdminPost);
const mockedUploadAdminPostImage = vi.mocked(uploadAdminPostImage);

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

const tiptapDocument: ArticleDocument = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "TipTap body" }] }]
};

function makePost(overrides: Partial<PublicPost> = {}): PublicPost {
  return {
    id: 1,
    uid: "p_11111111-1111-4111-8111-111111111111",
    slug: "draft-post",
    status: "draft",
    publishedAt: null,
    createdAt: "2026-06-10T00:00:00.000Z",
    updatedAt: "2026-06-10T00:00:00.000Z",
    category: null,
    tags: [],
    translations: [
      {
        locale: "zh",
        title: "草稿",
        summary: "",
        contentMarkdown: "Hello world",
        seoTitle: null,
        seoDescription: null
      },
      {
        locale: "en",
        title: "Draft",
        summary: "",
        contentMarkdown: "Hello world",
        seoTitle: null,
        seoDescription: null
      }
    ],
    ...overrides
  };
}

function makeTiptapPost(overrides: Partial<PublicPost> = {}): PublicPost {
  return makePost({
    translations: [
      {
        locale: "zh",
        title: "中文草稿",
        summary: "",
        contentMarkdown: "中文 Markdown",
        content: { format: "markdown", markdown: "中文 Markdown" },
        seoTitle: null,
        seoDescription: null
      },
      {
        locale: "en",
        title: "TipTap Draft",
        summary: "",
        contentMarkdown: "TipTap body\n",
        content: {
          format: "tiptap",
          schemaVersion: 1,
          doc: tiptapDocument
        },
        seoTitle: null,
        seoDescription: null
      }
    ],
    ...overrides
  });
}

function renderEditor(route: string, locale: "zh" | "en" = "en") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/admin/posts/new" element={<AdminEditorPage locale={locale} />} />
        <Route path="/admin/posts/:id" element={<AdminEditorPage locale={locale} />} />
      </Routes>
    </MemoryRouter>
  );
}

function imageFile(name = "photo.png", type = "image/png") {
  return new File(["image-bytes"], name, { type });
}

async function loadedMarkdownTextarea() {
  return (await screen.findByLabelText("Markdown body")) as HTMLTextAreaElement;
}

describe("MarkdownPreview", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders headings and fenced code blocks", () => {
    const { container } = render(<MarkdownPreview markdown={"# Title\n\n```ts\nconst value = 1;\n```"} />);

    expect(screen.getByRole("heading", { name: "Title" })).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.tagName === "CODE")).toHaveTextContent("const value = 1;");
    expect(container.querySelector(".hljs-keyword")).toHaveTextContent("const");
    expect(container.querySelector(".code-window")).toBeInTheDocument();
    expect(container.querySelectorAll(".window-dots span")).toHaveLength(3);
    expect(screen.getByText("ts")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
  });

  it("copies fenced code blocks to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });

    const { container } = render(<MarkdownPreview markdown={"```ts\nconst value = 1;\n```"} />);
    fireEvent.click(within(container).getByRole("button", { name: "Copy" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("const value = 1;"));
    expect(within(container).getByRole("button", { name: "Copied" })).toHaveTextContent("Copied");
  });

  it("removes executable markdown HTML and unsafe links", () => {
    const { container } = render(
      <MarkdownPreview
        markdown={
          [
            "<script>window.__xss = true</script>",
            '<img src="x" onerror="window.__xss = true">',
            "[unsafe](javascript:alert(1))",
            "`<script>alert(1)</script>`"
          ].join("\n\n")
        }
      />
    );

    expect(container.querySelector("script")).not.toBeInTheDocument();
    expect(container.querySelector("img")?.getAttribute("onerror")).toBeNull();
    expect(container.querySelector("a")?.getAttribute("href") ?? "").not.toMatch(/^javascript:/i);
    expect(screen.getByText("<script>alert(1)</script>")).toBeInTheDocument();
  });

  it("resolves uploaded image URLs through the API base URL", () => {
    const { container } = render(<MarkdownPreview markdown="![图片](/uploads/images/posts/p_111/photo.png)" />);

    expect(container.querySelector("img")).toHaveAttribute("src", "/uploads/images/posts/p_111/photo.png");
  });

  it("opens markdown images in a dismissible preview", () => {
    render(<MarkdownPreview markdown="![Diagram](/uploads/images/posts/p_111/diagram.png)" />);

    const imageButton = screen.getByRole("button", { name: "Open image preview: Diagram" });
    expect(imageButton).toHaveClass("markdown-image-button");
    expect(within(imageButton).getByRole("img", { name: "Diagram" })).toHaveAttribute(
      "src",
      "/uploads/images/posts/p_111/diagram.png"
    );

    fireEvent.click(imageButton);

    const dialog = screen.getByRole("dialog", { name: "Image preview" });
    expect(within(dialog).getByRole("img", { name: "Diagram" })).toHaveAttribute(
      "src",
      "/uploads/images/posts/p_111/diagram.png"
    );

    fireEvent.click(within(dialog).getByRole("button", { name: "Close image preview" }));
    expect(screen.queryByRole("dialog", { name: "Image preview" })).not.toBeInTheDocument();
  });

  it("keeps linked markdown images as links instead of preview buttons", () => {
    render(<MarkdownPreview markdown="[![Linked image](/uploads/images/posts/p_111/link.png)](/posts/demo)" />);

    expect(screen.queryByRole("button", { name: /Open image preview/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Linked image" })).toHaveAttribute("href", "/posts/demo");
  });

  it("wraps tables for responsive markdown rendering", () => {
    const { container } = render(<MarkdownPreview markdown={"| Name | Value |\n| --- | --- |\n| River | Two |"} />);

    expect(container.querySelector(".markdown-table-wrap table")).toBeInTheDocument();
  });
});

describe("admin editor image uploads", () => {
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

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_TIPTAP_NEW_ARTICLE_ENABLED", "false");
    vi.stubEnv("VITE_TIPTAP_PUBLISH_ENABLED", "false");
    mockedFetchAdminCategories.mockResolvedValue({ categories: [] });
    mockedFetchAdminTags.mockResolvedValue({
      tags: [
        { id: 1, slug: "typescript", name: "TypeScript" },
        { id: 2, slug: "sqlite", name: "SQLite" }
      ]
    });
    mockedFetchAdminPosts.mockResolvedValue({ posts: [] });
    mockedFetchAdminPost.mockResolvedValue({ post: makePost() });
    mockedCreateAdminTag.mockResolvedValue({ tag: { id: 3, slug: "edge-runtime", name: "Edge Runtime" } });
    mockedCreateAdminPost.mockResolvedValue({ post: makePost() });
    mockedUpdateAdminPost.mockResolvedValue({ post: makePost() });
    mockedDeleteAdminPost.mockResolvedValue({ ok: true });
    mockedTranslateAdminPostDraft.mockResolvedValue({
      translation: {
        locale: "zh",
        title: "翻译标题",
        summary: "翻译摘要",
        contentMarkdown: "翻译正文",
        seoTitle: null,
        seoDescription: null
      },
      warnings: []
    });
    mockedUploadAdminPostImage.mockResolvedValue({
      url: "/uploads/images/posts/p_11111111-1111-4111-8111-111111111111/photo.png",
      markdown: "![图片](/uploads/images/posts/p_11111111-1111-4111-8111-111111111111/photo.png)"
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    cleanup();
  });

  it("blocks image upload until the post has been saved", async () => {
    renderEditor("/admin/posts/new", "zh");

    const input = screen.getByLabelText("Upload image file");
    fireEvent.change(input, { target: { files: [imageFile()] } });

    expect(await screen.findByText("请先保存草稿再上传图片。")).toBeInTheDocument();
    expect(mockedUploadAdminPostImage).not.toHaveBeenCalled();
  });

  it("uploads from the button and inserts markdown at the cursor", async () => {
    renderEditor("/admin/posts/1");
    const textarea = await loadedMarkdownTextarea();
    textarea.focus();
    textarea.setSelectionRange(5, 5);

    const input = screen.getByLabelText("Upload image file");
    fireEvent.change(input, { target: { files: [imageFile()] } });

    await waitFor(() =>
      expect(textarea).toHaveValue(
        "Hello![图片](/uploads/images/posts/p_11111111-1111-4111-8111-111111111111/photo.png) world"
      )
    );
    expect(mockedUploadAdminPostImage).toHaveBeenCalledWith({
      postUid: "p_11111111-1111-4111-8111-111111111111",
      file: expect.any(File)
    });
  });

  it("uses selected text as image alt text", async () => {
    renderEditor("/admin/posts/1");
    const textarea = await loadedMarkdownTextarea();
    textarea.focus();
    textarea.setSelectionRange(6, 11);

    fireEvent.change(screen.getByLabelText("Upload image file"), { target: { files: [imageFile()] } });

    await waitFor(() =>
      expect(textarea).toHaveValue(
        "Hello ![world](/uploads/images/posts/p_11111111-1111-4111-8111-111111111111/photo.png)"
      )
    );
  });

  it("uploads dropped images", async () => {
    renderEditor("/admin/posts/1");
    const textarea = await loadedMarkdownTextarea();
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    const file = imageFile("drop.webp", "image/webp");

    fireEvent.drop(textarea, {
      dataTransfer: {
        files: [file],
        items: [{ kind: "file", type: file.type }]
      }
    });

    await waitFor(() => expect(mockedUploadAdminPostImage).toHaveBeenCalledWith({ postUid: makePost().uid, file }));
    expect(textarea.value).toContain("![图片](/uploads/images/posts/");
  });

  it("uploads pasted images", async () => {
    renderEditor("/admin/posts/1");
    const textarea = await loadedMarkdownTextarea();
    const file = imageFile("paste.gif", "image/gif");

    fireEvent.paste(textarea, {
      clipboardData: {
        files: [file]
      }
    });

    await waitFor(() => expect(mockedUploadAdminPostImage).toHaveBeenCalledWith({ postUid: makePost().uid, file }));
    expect(textarea.value).toContain("![图片](/uploads/images/posts/");
  });

  it("uploads pasted screenshots from clipboard items", async () => {
    renderEditor("/admin/posts/1");
    const textarea = await loadedMarkdownTextarea();
    const file = imageFile("screenshot.png", "image/png");

    fireEvent.paste(textarea, {
      clipboardData: {
        files: [],
        items: [
          {
            kind: "file",
            type: file.type,
            getAsFile: () => file
          }
        ]
      }
    });

    await waitFor(() => expect(mockedUploadAdminPostImage).toHaveBeenCalledWith({ postUid: makePost().uid, file }));
  });

  it("ignores paste and drop uploads while an upload is pending", async () => {
    let resolveUpload: ((value: Awaited<ReturnType<typeof uploadAdminPostImage>>) => void) | undefined;
    mockedUploadAdminPostImage.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpload = resolve;
        })
    );
    renderEditor("/admin/posts/1");
    const textarea = await loadedMarkdownTextarea();

    const firstFile = imageFile("first.png", "image/png");
    const pastedFile = imageFile("second.png", "image/png");
    const droppedFile = imageFile("third.png", "image/png");

    fireEvent.change(screen.getByLabelText("Upload image file"), { target: { files: [firstFile] } });
    await waitFor(() => expect(mockedUploadAdminPostImage).toHaveBeenCalledTimes(1));

    fireEvent.paste(textarea, {
      clipboardData: {
        files: [pastedFile]
      }
    });
    fireEvent.drop(textarea, {
      dataTransfer: {
        files: [droppedFile],
        items: [{ kind: "file", type: droppedFile.type }]
      }
    });

    expect(mockedUploadAdminPostImage).toHaveBeenCalledTimes(1);

    resolveUpload?.({
      url: "/uploads/images/posts/p_11111111-1111-4111-8111-111111111111/first.png",
      markdown: "![图片](/uploads/images/posts/p_11111111-1111-4111-8111-111111111111/first.png)"
    });
  });

  it("leaves markdown unchanged on upload failure", async () => {
    mockedUploadAdminPostImage.mockRejectedValue(new Error("Upload failed"));
    renderEditor("/admin/posts/1");
    const textarea = await loadedMarkdownTextarea();
    textarea.focus();
    textarea.setSelectionRange(5, 5);

    fireEvent.change(screen.getByLabelText("Upload image file"), { target: { files: [imageFile()] } });

    expect(await screen.findByText("Upload failed")).toBeInTheDocument();
    expect(textarea).toHaveValue("Hello world");
  });

  it("opens existing TipTap translations with the article editor while keeping Markdown locales unchanged", async () => {
    mockedFetchAdminPost.mockResolvedValue({ post: makeTiptapPost() });

    renderEditor("/admin/posts/1");

    expect(await screen.findByRole("textbox", { name: "Article body" })).toHaveTextContent("TipTap body");
    expect(screen.queryByLabelText("Markdown body")).not.toBeInTheDocument();
    expect(screen.queryByRole("tablist", { name: "Markdown editor mode" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "中文" }));

    expect(await screen.findByLabelText("Markdown body")).toHaveValue("中文 Markdown");
  });

  it("preserves unsaved TipTap JSON across locale switches and saves canonical content with expectedUpdatedAt", async () => {
    const originalUpdatedAt = "2026-06-10T00:00:00.000Z";
    mockedFetchAdminPost.mockResolvedValue({ post: makeTiptapPost({ updatedAt: originalUpdatedAt }) });
    mockedUpdateAdminPost.mockResolvedValue({ post: makeTiptapPost({ updatedAt: "2026-06-11T00:00:00.000Z" }) });

    renderEditor("/admin/posts/1");

    expect(await screen.findByRole("textbox", { name: "Article body" })).toHaveTextContent("TipTap body");
    fireEvent.click(screen.getByRole("button", { name: "Horizontal rule" }));
    fireEvent.click(screen.getByRole("button", { name: "中文" }));
    expect(await screen.findByLabelText("Markdown body")).toHaveValue("中文 Markdown");
    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(await screen.findByRole("textbox", { name: "Article body" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() =>
      expect(mockedUpdateAdminPost).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          expectedUpdatedAt: originalUpdatedAt,
          translations: expect.arrayContaining([
            expect.objectContaining({
              locale: "en",
              content: expect.objectContaining({
                format: "tiptap",
                schemaVersion: 1,
                doc: expect.objectContaining({
                  type: "doc",
                  content: expect.arrayContaining([expect.objectContaining({ type: "horizontalRule" })])
                })
              }),
              contentMarkdown: ""
            }),
            expect.objectContaining({
              locale: "zh",
              content: { format: "markdown", markdown: "中文 Markdown" }
            })
          ])
        })
      )
    );
  });

  it("disables TipTap publishing while the publish feature flag is off", async () => {
    mockedFetchAdminPost.mockResolvedValue({ post: makeTiptapPost() });

    renderEditor("/admin/posts/1");

    expect(await screen.findByRole("textbox", { name: "Article body" })).toBeInTheDocument();
    const publishButton = screen.getByRole("button", { name: "Publish" });
    expect(publishButton).toBeDisabled();
    expect(publishButton).toHaveAttribute("title", "TipTap publishing is not enabled yet. Save a draft first.");

    fireEvent.click(publishButton);
    expect(mockedUpdateAdminPost).not.toHaveBeenCalled();
  });

  it("shows the new rich-text entry only when the new article flag is enabled", async () => {
    renderEditor("/admin/posts/new");

    expect(await screen.findByLabelText("Markdown body")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use rich text" })).not.toBeInTheDocument();
    cleanup();

    vi.stubEnv("VITE_TIPTAP_NEW_ARTICLE_ENABLED", "true");
    renderEditor("/admin/posts/new");

    expect(await screen.findByRole("button", { name: /Use Markdown/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Use rich text" }));

    expect(await screen.findByRole("textbox", { name: "Article body" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Markdown body")).not.toBeInTheDocument();
  });

  it("warns on unsaved TipTap changes and clears the warning after a successful save baseline", async () => {
    mockedFetchAdminPost.mockResolvedValue({ post: makeTiptapPost() });
    mockedUpdateAdminPost.mockResolvedValue({ post: makeTiptapPost({ updatedAt: "2026-06-11T00:00:00.000Z" }) });
    const addEventListener = vi.spyOn(window, "addEventListener");
    const removeEventListener = vi.spyOn(window, "removeEventListener");

    renderEditor("/admin/posts/1");

    expect(await screen.findByRole("textbox", { name: "Article body" })).toBeInTheDocument();
    const initialBeforeUnloadAdds = addEventListener.mock.calls.filter(([eventName]) => eventName === "beforeunload").length;
    const initialBeforeUnloadRemoves = removeEventListener.mock.calls.filter(([eventName]) => eventName === "beforeunload").length;

    fireEvent.click(screen.getByRole("button", { name: "Horizontal rule" }));
    await waitFor(() =>
      expect(addEventListener.mock.calls.filter(([eventName]) => eventName === "beforeunload").length).toBeGreaterThan(
        initialBeforeUnloadAdds
      )
    );

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(mockedUpdateAdminPost).toHaveBeenCalled());
    await waitFor(() =>
      expect(removeEventListener.mock.calls.filter(([eventName]) => eventName === "beforeunload").length).toBeGreaterThan(
        initialBeforeUnloadRemoves
      )
    );
    addEventListener.mockRestore();
    removeEventListener.mockRestore();
  });

  it("shows a markdown heading outline outside fenced code blocks", async () => {
    mockedFetchAdminPost.mockResolvedValue({
      post: makePost({
        translations: [
          {
            locale: "zh",
            title: "鑽夌",
            summary: "",
            contentMarkdown: "# 中文标题",
            seoTitle: null,
            seoDescription: null
          },
          {
            locale: "en",
            title: "Draft",
            summary: "",
            contentMarkdown: "# Intro\n\nSome text\n\n## Details\n\n```md\n# Ignored\n```",
            seoTitle: null,
            seoDescription: null
          }
        ]
      })
    });
    renderEditor("/admin/posts/1");

    await loadedMarkdownTextarea();
    const outline = screen.getByLabelText("Markdown outline");

    expect(within(outline).getByRole("button", { name: "Intro" })).toBeInTheDocument();
    expect(within(outline).getByRole("button", { name: "Details" })).toBeInTheDocument();
    expect(within(outline).queryByRole("button", { name: "Ignored" })).not.toBeInTheDocument();
  });

  it("switches between markdown source, split, and preview modes", async () => {
    mockedFetchAdminPost.mockResolvedValue({
      post: makePost({
        translations: [
          {
            locale: "zh",
            title: "鑽夌",
            summary: "",
            contentMarkdown: "# 预览标题",
            seoTitle: null,
            seoDescription: null
          },
          {
            locale: "en",
            title: "Draft",
            summary: "",
            contentMarkdown: "# Preview heading",
            seoTitle: null,
            seoDescription: null
          }
        ]
      })
    });
    renderEditor("/admin/posts/1");

    expect(await loadedMarkdownTextarea()).toBeInTheDocument();
    const modeTabs = screen.getByRole("tablist", { name: "Markdown editor mode" });

    fireEvent.click(within(modeTabs).getByRole("button", { name: "Preview" }));
    expect(screen.queryByLabelText("Markdown body")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Preview heading" })).toBeInTheDocument();

    fireEvent.click(within(modeTabs).getByRole("button", { name: "MD source" }));
    expect(await loadedMarkdownTextarea()).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Preview heading" })).not.toBeInTheDocument();

    fireEvent.click(within(modeTabs).getByRole("button", { name: "Source + preview" }));
    expect(await loadedMarkdownTextarea()).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Preview heading" })).toBeInTheDocument();
  });

  it("opens markdown body search with Ctrl+F and cycles matches", async () => {
    renderEditor("/admin/posts/1");
    const textarea = await loadedMarkdownTextarea();

    fireEvent.change(textarea, { target: { value: "Alpha target beta target" } });
    fireEvent.keyDown(textarea, { key: "f", code: "KeyF", ctrlKey: true });

    const searchInput = await screen.findByRole("searchbox", { name: "Search Markdown body" });
    fireEvent.change(searchInput, { target: { value: "target" } });

    expect(screen.getByText("1/2")).toBeInTheDocument();
    await waitFor(() => expect(textarea.selectionStart).toBe(6));

    fireEvent.keyDown(searchInput, { key: "Enter" });

    expect(screen.getByText("2/2")).toBeInTheDocument();
    await waitFor(() => expect(textarea.selectionStart).toBe(18));

    fireEvent.keyDown(searchInput, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("searchbox", { name: "Search Markdown body" })).not.toBeInTheDocument());
  });

  it("shows draft actions separately from published and hidden actions", async () => {
    mockedFetchAdminPost.mockResolvedValue({ post: makePost({ status: "draft", publishedAt: null }) });
    renderEditor("/admin/posts/1");

    await loadedMarkdownTextarea();

    expect(screen.getByRole("button", { name: "Save draft" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hide" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Preview" })).not.toBeInTheDocument();
  });

  it("shows clear pending and success feedback when saving a draft", async () => {
    let resolveSave: ((value: Awaited<ReturnType<typeof updateAdminPost>>) => void) | undefined;
    mockedUpdateAdminPost.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        })
    );
    renderEditor("/admin/posts/1");

    await loadedMarkdownTextarea();
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    expect(await screen.findByRole("status", { name: "Post action status" })).toHaveTextContent("Saving draft");
    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();

    resolveSave?.({ post: makePost({ status: "draft", publishedAt: null }) });

    expect(await screen.findByRole("status", { name: "Post action status" })).toHaveTextContent("Draft saved");
  });

  it("shows action-specific feedback when publishing fails", async () => {
    mockedUpdateAdminPost.mockRejectedValue(new Error("Slug is already in use"));
    renderEditor("/admin/posts/1");

    await loadedMarkdownTextarea();
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Publish failed");
    expect(screen.getByRole("alert")).toHaveTextContent("Slug is already in use");
  });

  it("generates a slug from the title before publishing a new post", async () => {
    renderEditor("/admin/posts/new");

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Short title" } });
    fireEvent.change(await loadedMarkdownTextarea(), { target: { value: "Short body" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() =>
      expect(mockedCreateAdminPost).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: "short-title"
        })
      )
    );
  });

  it("adds a numeric suffix when the generated slug already exists", async () => {
    mockedFetchAdminPosts.mockResolvedValue({
      posts: [makePost({ id: 2, slug: "short-title" }), makePost({ id: 3, slug: "short-title-2" })]
    });
    renderEditor("/admin/posts/new");

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Short title" } });
    fireEvent.change(await loadedMarkdownTextarea(), { target: { value: "Short body" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() =>
      expect(mockedCreateAdminPost).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: "short-title-3"
        })
      )
    );
  });

  it("blocks duplicate manually entered slugs before sending the request", async () => {
    mockedFetchAdminPosts.mockResolvedValue({ posts: [makePost({ id: 2, slug: "existing-post" })] });
    renderEditor("/admin/posts/new");

    fireEvent.change(screen.getByLabelText("Slug"), { target: { value: "existing-post" } });
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Short title" } });
    fireEvent.change(await loadedMarkdownTextarea(), { target: { value: "Short body" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    expect(await screen.findByRole("alert")).toHaveTextContent('Slug "existing-post" is already used by another post');
    expect(mockedCreateAdminPost).not.toHaveBeenCalled();
  });

  it("blocks malformed post slugs before sending the request", async () => {
    renderEditor("/admin/posts/new");

    fireEvent.change(screen.getByLabelText("Slug"), { target: { value: "Hello World" } });
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Short title" } });
    fireEvent.change(await loadedMarkdownTextarea(), { target: { value: "Short body" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Slug can use only lowercase letters");
    expect(mockedCreateAdminPost).not.toHaveBeenCalled();
  });

  it("selects existing tags with search and creates a controlled new tag before saving", async () => {
    renderEditor("/admin/posts/new");

    fireEvent.change(screen.getByLabelText("Slug"), { target: { value: "valid-post" } });
    fireEvent.change(await screen.findByRole("searchbox", { name: "Search tags" }), { target: { value: "type" } });
    fireEvent.click(screen.getByRole("button", { name: "Select TypeScript" }));
    fireEvent.change(screen.getByLabelText("New tag name"), { target: { value: "Edge Runtime" } });
    fireEvent.change(screen.getByLabelText("New tag slug"), { target: { value: "edge-runtime" } });
    fireEvent.click(screen.getByRole("button", { name: "Create and select tag" }));

    await waitFor(() =>
      expect(mockedCreateAdminTag).toHaveBeenCalledWith({
        name: "Edge Runtime",
        slug: "edge-runtime",
        translations: [{ locale: "en", name: "Edge Runtime" }]
      })
    );
    expect(screen.getByRole("button", { name: "Remove TypeScript" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Edge Runtime" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Short title" } });
    fireEvent.change(await loadedMarkdownTextarea(), { target: { value: "Short body" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() =>
      expect(mockedCreateAdminPost).toHaveBeenCalledWith(
        expect.objectContaining({
          tagSlugs: ["typescript", "edge-runtime"]
        })
      )
    );
  });

  it("hides a published post while preserving the original published time", async () => {
    mockedFetchAdminPost.mockResolvedValue({ post: makePost({ status: "published", publishedAt: "2026-05-01T00:00:00.000Z" }) });
    mockedUpdateAdminPost.mockResolvedValue({ post: makePost({ status: "hidden", publishedAt: "2026-05-01T00:00:00.000Z" }) });
    renderEditor("/admin/posts/1");

    await loadedMarkdownTextarea();
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));

    await waitFor(() =>
      expect(mockedUpdateAdminPost).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          status: "hidden",
          publishedAt: "2026-05-01T00:00:00.000Z"
        })
      )
    );
    expect(within(screen.getByLabelText("Post actions")).getByRole("button", { name: "Preview" })).toBeInTheDocument();
  });

  it("republishes a hidden post without replacing its published time", async () => {
    mockedFetchAdminPost.mockResolvedValue({ post: makePost({ status: "hidden", publishedAt: "2026-05-01T00:00:00.000Z" }) });
    mockedUpdateAdminPost.mockResolvedValue({ post: makePost({ status: "published", publishedAt: "2026-05-01T00:00:00.000Z" }) });
    renderEditor("/admin/posts/1");

    await loadedMarkdownTextarea();
    expect(within(screen.getByLabelText("Post actions")).getByRole("button", { name: "Preview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Republish" }));

    await waitFor(() =>
      expect(mockedUpdateAdminPost).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          status: "published",
          publishedAt: "2026-05-01T00:00:00.000Z"
        })
      )
    );
    expect(screen.getByRole("link", { name: "Preview" })).toHaveAttribute("href", "/posts/draft-post");
  });

  it("shows a custom delete confirmation dialog", async () => {
    renderEditor("/admin/posts/1");

    await loadedMarkdownTextarea();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    const dialog = screen.getByRole("dialog", { name: "Delete this post?" });
    expect(dialog).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(mockedDeleteAdminPost).toHaveBeenCalledWith(1));
  });

  it("translates the active draft into the other language", async () => {
    mockedTranslateAdminPostDraft.mockResolvedValue({
      translation: {
        locale: "zh",
        title: "中文标题",
        summary: "中文摘要",
        contentMarkdown: "中文正文",
        seoTitle: null,
        seoDescription: null
      },
      warnings: ["review markdown"]
    });
    renderEditor("/admin/posts/1");

    await loadedMarkdownTextarea();
    fireEvent.click(screen.getByRole("button", { name: "Translate to Chinese" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Replace existing translation?" })).getByRole("button", { name: "Continue" }));

    await waitFor(() =>
      expect(mockedTranslateAdminPostDraft).toHaveBeenCalledWith({
        source: {
          locale: "en",
          title: "Draft",
          summary: "",
          contentMarkdown: "Hello world"
        },
        targetLocale: "zh"
      })
    );
    expect(await screen.findByDisplayValue("中文标题")).toBeInTheDocument();
    expect(screen.getByText(/review markdown/)).toBeInTheDocument();
  });

  it("shows a visible translation progress state while the draft is being generated", async () => {
    let resolveTranslation: ((value: Awaited<ReturnType<typeof translateAdminPostDraft>>) => void) | undefined;
    mockedTranslateAdminPostDraft.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveTranslation = resolve;
        })
    );
    renderEditor("/admin/posts/1");

    await loadedMarkdownTextarea();
    fireEvent.click(screen.getByRole("button", { name: "Translate to Chinese" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Replace existing translation?" })).getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("status", { name: "Translation progress" })).toHaveTextContent(
      "Generating translation draft"
    );
    expect(screen.getByRole("button", { name: "Translating..." })).toBeDisabled();

    resolveTranslation?.({
      translation: {
        locale: "zh",
        title: "自动填入标题",
        summary: "自动填入摘要",
        contentMarkdown: "自动填入正文",
        seoTitle: null,
        seoDescription: null
      },
      warnings: []
    });

    expect(await screen.findByDisplayValue("自动填入标题")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("status", { name: "Translation progress" })).not.toBeInTheDocument());
  });

  it("shows translation errors and keeps the current draft unchanged", async () => {
    let rejectTranslation: ((reason: Error) => void) | undefined;
    mockedTranslateAdminPostDraft.mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectTranslation = reject;
        })
    );
    renderEditor("/admin/posts/1");

    const textarea = await loadedMarkdownTextarea();
    fireEvent.click(screen.getByRole("button", { name: "Translate to Chinese" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Replace existing translation?" })).getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("status", { name: "Translation progress" })).toBeInTheDocument();
    rejectTranslation?.(new Error("AI quota or rate limit reached. Check the API key balance or try again later."));

    expect(await screen.findByText("AI quota or rate limit reached. Check the API key balance or try again later.")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Translation progress" })).not.toBeInTheDocument();
    expect(textarea).toHaveValue("Hello world");
  });
});
