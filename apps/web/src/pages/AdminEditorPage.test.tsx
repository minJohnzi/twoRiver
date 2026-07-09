import "@testing-library/jest-dom/vitest";
import type { ArticleDocument } from "@tworiver/content-engine/browser";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { PublicPost } from "@tworiver/shared";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAdminTag,
  createAdminPost,
  convertAdminPostTranslationToTiptap,
  deleteAdminPost,
  fetchAdminCategories,
  fetchAdminTags,
  fetchAdminPosts,
  fetchAdminPost,
  previewAdminPostTiptapConversion,
  restoreAdminPostTranslationMarkdown,
  translateAdminPostDraft,
  updateAdminPost,
  uploadAdminPostImage
} from "../api/admin";
import { MarkdownPreview } from "../components/MarkdownPreview";
import { AdminEditorPage } from "./AdminEditorPage";

vi.mock("../api/admin", () => ({
  createAdminTag: vi.fn(),
  createAdminPost: vi.fn(),
  convertAdminPostTranslationToTiptap: vi.fn(),
  deleteAdminPost: vi.fn(),
  fetchAdminCategories: vi.fn(),
  fetchAdminTags: vi.fn(),
  fetchAdminPosts: vi.fn(),
  fetchAdminPost: vi.fn(),
  previewAdminPostTiptapConversion: vi.fn(),
  restoreAdminPostTranslationMarkdown: vi.fn(),
  translateAdminPostDraft: vi.fn(),
  updateAdminPost: vi.fn(),
  uploadAdminPostImage: vi.fn()
}));

const mockedCreateAdminTag = vi.mocked(createAdminTag);
const mockedCreateAdminPost = vi.mocked(createAdminPost);
const mockedConvertAdminPostTranslationToTiptap = vi.mocked(convertAdminPostTranslationToTiptap);
const mockedDeleteAdminPost = vi.mocked(deleteAdminPost);
const mockedFetchAdminCategories = vi.mocked(fetchAdminCategories);
const mockedFetchAdminTags = vi.mocked(fetchAdminTags);
const mockedFetchAdminPosts = vi.mocked(fetchAdminPosts);
const mockedFetchAdminPost = vi.mocked(fetchAdminPost);
const mockedPreviewAdminPostTiptapConversion = vi.mocked(previewAdminPostTiptapConversion);
const mockedRestoreAdminPostTranslationMarkdown = vi.mocked(restoreAdminPostTranslationMarkdown);
const mockedTranslateAdminPostDraft = vi.mocked(translateAdminPostDraft);
const mockedUpdateAdminPost = vi.mocked(updateAdminPost);
const mockedUploadAdminPostImage = vi.mocked(uploadAdminPostImage);

function resetAdminEditorApiMocks() {
  [
    mockedCreateAdminTag,
    mockedCreateAdminPost,
    mockedConvertAdminPostTranslationToTiptap,
    mockedDeleteAdminPost,
    mockedFetchAdminCategories,
    mockedFetchAdminTags,
    mockedFetchAdminPosts,
    mockedFetchAdminPost,
    mockedPreviewAdminPostTiptapConversion,
    mockedRestoreAdminPostTranslationMarkdown,
    mockedTranslateAdminPostDraft,
    mockedUpdateAdminPost,
    mockedUploadAdminPostImage
  ].forEach((mock) => mock.mockClear());
}

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

function makeSecondMarkdownPost(): PublicPost {
  return makePost({
    id: 2,
    uid: "p_22222222-2222-4222-8222-222222222222",
    slug: "second-post",
    updatedAt: "2026-06-20T00:00:00.000Z",
    translations: [
      {
        locale: "en",
        title: "Second post",
        summary: "",
        contentMarkdown: "Second article body",
        content: { format: "markdown", markdown: "Second article body" },
        seoTitle: null,
        seoDescription: null
      }
    ]
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

function renderEditorWithArticleSwitch(route: string, targetPostId: number, locale: "zh" | "en" = "en") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Link to={`/admin/posts/${targetPostId}`}>Open article {targetPostId}</Link>
      <Routes>
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

async function loadedArticleTextbox() {
  return (await screen.findByRole("textbox", { name: /Article body|文章正文/ }, { timeout: 4000 })) as HTMLElement;
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
    resetAdminEditorApiMocks();
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
    mockedPreviewAdminPostTiptapConversion.mockResolvedValue({
      originalMarkdown: "Hello world",
      document: tiptapDocument,
      projectedMarkdown: "TipTap body\n",
      canConvert: true,
      blockers: [],
      warnings: []
    });
    mockedConvertAdminPostTranslationToTiptap.mockResolvedValue({ post: makeTiptapPost() });
    mockedRestoreAdminPostTranslationMarkdown.mockResolvedValue({ post: makePost() });
    mockedTranslateAdminPostDraft.mockResolvedValue({
      translation: {
        locale: "zh",
        title: "翻译标题",
        summary: "翻译摘要",
        contentMarkdown: "翻译正文",
        seoTitle: null,
        seoDescription: null
      },
      warnings: [],
      chunks: []
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

    expect(await loadedArticleTextbox()).toHaveTextContent("TipTap body");
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

    expect(await loadedArticleTextbox()).toHaveTextContent("TipTap body");
    fireEvent.click(screen.getByRole("button", { name: "Horizontal rule" }));
    fireEvent.click(screen.getByRole("button", { name: "中文" }));
    expect(await screen.findByLabelText("Markdown body")).toHaveValue("中文 Markdown");
    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(await loadedArticleTextbox()).toBeInTheDocument();
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

    expect(await loadedArticleTextbox()).toBeInTheDocument();
    const publishButton = screen.getByRole("button", { name: "Publish" });
    expect(publishButton).toBeDisabled();
    expect(publishButton).toHaveAttribute("title", "TipTap publishing is not enabled yet. Save a draft first.");

    fireEvent.click(publishButton);
    expect(mockedUpdateAdminPost).not.toHaveBeenCalled();
  });

  it("shows the new rich-text entry only when the new article flag is enabled", async () => {
    renderEditor("/admin/posts/new");

    expect(await screen.findByLabelText("Markdown body")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Switch body format" })).not.toBeInTheDocument();
    cleanup();

    vi.stubEnv("VITE_TIPTAP_NEW_ARTICLE_ENABLED", "true");
    renderEditor("/admin/posts/new");

    expect(await loadedArticleTextbox()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Switch body format" })).toHaveTextContent("Rich text");
    expect(screen.getByRole("button", { name: "Switch body format" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByLabelText("Markdown body")).not.toBeInTheDocument();
  });

  it("keeps the new article format chooser after title-only edits and allows switching back before body text", async () => {
    vi.stubEnv("VITE_TIPTAP_NEW_ARTICLE_ENABLED", "true");
    renderEditor("/admin/posts/new");

    expect(await loadedArticleTextbox()).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Title first" } });

    expect(screen.getByRole("button", { name: "Switch body format" })).toHaveTextContent("Rich text");
    fireEvent.click(screen.getByRole("button", { name: "Switch body format" }));

    expect(await screen.findByLabelText("Markdown body")).toHaveValue("");
    expect(screen.getByDisplayValue("Title first")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Switch body format" })).toHaveTextContent("Markdown");
    fireEvent.click(screen.getByRole("button", { name: "Switch body format" }));

    expect(await loadedArticleTextbox()).toBeInTheDocument();
    expect(screen.queryByLabelText("Markdown body")).not.toBeInTheDocument();
  });

  it.each([
    {
      structure: "an empty code block",
      insert: () => fireEvent.change(screen.getByLabelText("Code block language"), { target: { value: "ts" } })
    },
    {
      structure: "a horizontal rule",
      insert: () => fireEvent.click(screen.getByRole("button", { name: "Horizontal rule" }))
    }
  ])("locks the new article format after adding $structure", async ({ insert }) => {
    vi.stubEnv("VITE_TIPTAP_NEW_ARTICLE_ENABLED", "true");
    renderEditor("/admin/posts/new");

    expect(await loadedArticleTextbox()).toBeInTheDocument();

    insert();

    await waitFor(() => expect(screen.queryByRole("button", { name: "Switch body format" })).not.toBeInTheDocument());
  });

  it("treats a TipTap image without alt text as body content when validating translations", async () => {
    const imageOnlyDocument: ArticleDocument = {
      type: "doc",
      content: [
        {
          type: "image",
          attrs: {
            src: "/uploads/images/posts/p_11111111-1111-4111-8111-111111111111/diagram.png",
            alt: null,
            title: null
          }
        }
      ]
    };
    mockedFetchAdminPost.mockResolvedValue({
      post: makePost({
        translations: [
          {
            locale: "en",
            title: "Fallback",
            summary: "",
            contentMarkdown: "Fallback body",
            content: { format: "markdown", markdown: "Fallback body" },
            seoTitle: null,
            seoDescription: null
          },
          {
            locale: "zh",
            title: "",
            summary: "",
            contentMarkdown: "",
            content: {
              format: "tiptap",
              schemaVersion: 1,
              doc: imageOnlyDocument
            },
            seoTitle: null,
            seoDescription: null
          }
        ]
      })
    });

    renderEditor("/admin/posts/1");

    expect(await screen.findByLabelText("Markdown body")).toHaveValue("Fallback body");
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    expect(await screen.findByRole("alert", { name: "Post action error" })).toHaveTextContent(
      "Every language version with content needs a title."
    );
    expect(mockedUpdateAdminPost).not.toHaveBeenCalled();
  });

  it("previews and converts saved Markdown through the dedicated TipTap conversion route", async () => {
    const originalUpdatedAt = "2026-06-10T00:00:00.000Z";
    const convertedPost = makeTiptapPost({ updatedAt: "2026-06-12T00:00:00.000Z" });
    mockedFetchAdminPost.mockResolvedValue({ post: makePost({ updatedAt: originalUpdatedAt }) });
    mockedPreviewAdminPostTiptapConversion.mockResolvedValue({
      originalMarkdown: "Hello world",
      document: tiptapDocument,
      projectedMarkdown: "# Preview heading\n\nTipTap body\n",
      canConvert: true,
      blockers: [],
      warnings: [{ code: "normalized-markdown", line: 1, message: "Markdown spacing will be normalized." }]
    });
    mockedConvertAdminPostTranslationToTiptap.mockResolvedValue({ post: convertedPost });

    renderEditor("/admin/posts/1");

    expect(await loadedMarkdownTextarea()).toHaveValue("Hello world");
    fireEvent.click(screen.getByRole("button", { name: "Preview TipTap conversion" }));

    const dialog = await screen.findByRole("dialog", { name: "Convert Markdown to rich text?" });
    expect(mockedPreviewAdminPostTiptapConversion).toHaveBeenCalledWith(1, "en");
    expect(within(dialog).getByText("Line 1: Markdown spacing will be normalized.")).toBeInTheDocument();
    expect(await within(dialog).findByRole("heading", { name: "Preview heading" })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Convert to rich text" }));

    await waitFor(() =>
      expect(mockedConvertAdminPostTranslationToTiptap).toHaveBeenCalledWith(1, "en", {
        expectedUpdatedAt: originalUpdatedAt
      })
    );
    expect(await loadedArticleTextbox()).toHaveTextContent("TipTap body");
    expect(screen.queryByLabelText("Markdown body")).not.toBeInTheDocument();
  });

  it("localizes the conversion preview dialog and restores focus after keyboard dismissal", async () => {
    mockedPreviewAdminPostTiptapConversion.mockResolvedValue({
      originalMarkdown: "你好，世界",
      document: tiptapDocument,
      projectedMarkdown: "# 预览标题\n\nTipTap body\n",
      canConvert: true,
      blockers: [],
      warnings: []
    });

    renderEditor("/admin/posts/1", "zh");

    await loadedMarkdownTextarea();
    const previewButton = screen.getByRole("button", { name: "预检 TipTap 转换" });
    previewButton.focus();
    fireEvent.click(previewButton);

    const dialog = await screen.findByRole("dialog", { name: "将 Markdown 转换为富文本？" });
    const cancelButton = within(dialog).getByRole("button", { name: "取消" });
    expect(within(dialog).getByText("未发现阻断项。")).toBeInTheDocument();
    expect(within(dialog).getByText("未发现注意项。")).toBeInTheDocument();
    await waitFor(() => expect(cancelButton).toHaveFocus());

    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "将 Markdown 转换为富文本？" })).not.toBeInTheDocument());
    await waitFor(() => expect(previewButton).toHaveFocus());
  });

  it("ignores a conversion preview response after navigating to another article", async () => {
    const secondPost = makeSecondMarkdownPost();
    let resolvePreview: ((value: Awaited<ReturnType<typeof previewAdminPostTiptapConversion>>) => void) | undefined;
    mockedFetchAdminPost.mockImplementation(async (postId) => ({ post: postId === 1 ? makePost() : secondPost }));
    mockedPreviewAdminPostTiptapConversion.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePreview = resolve;
        })
    );

    renderEditorWithArticleSwitch("/admin/posts/1", 2);

    expect(await loadedMarkdownTextarea()).toHaveValue("Hello world");
    fireEvent.click(screen.getByRole("button", { name: "Preview TipTap conversion" }));
    await waitFor(() => expect(mockedPreviewAdminPostTiptapConversion).toHaveBeenCalledWith(1, "en"));
    fireEvent.click(screen.getByRole("link", { name: "Open article 2" }));

    expect(await loadedMarkdownTextarea()).toHaveValue("Second article body");
    await act(async () => {
      resolvePreview?.({
        originalMarkdown: "Hello world",
        document: tiptapDocument,
        projectedMarkdown: "TipTap body\n",
        canConvert: true,
        blockers: [],
        warnings: []
      });
    });

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Convert Markdown to rich text?" })).not.toBeInTheDocument());
    expect(screen.getByLabelText("Slug")).toHaveValue("second-post");
    expect(screen.queryByText("Previewing rich text conversion")).not.toBeInTheDocument();
    expect(screen.queryByText("Conversion preview ready")).not.toBeInTheDocument();
  });

  it("does not confirm a conversion after the active locale changes behind the preview", async () => {
    renderEditor("/admin/posts/1");

    await loadedMarkdownTextarea();
    fireEvent.click(screen.getByRole("button", { name: "Preview TipTap conversion" }));
    const dialog = await screen.findByRole("dialog", { name: "Convert Markdown to rich text?" });
    const languageButtons = within(screen.getByRole("tablist", { name: "Editor language" })).getAllByRole("button");
    fireEvent.click(languageButtons[0]!);
    fireEvent.click(within(dialog).getByRole("button", { name: "Convert to rich text" }));

    expect(mockedConvertAdminPostTranslationToTiptap).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Convert Markdown to rich text?" })).not.toBeInTheDocument();
  });

  it("blocks format operations while a Markdown image upload is pending", async () => {
    mockedUploadAdminPostImage.mockImplementation(() => new Promise(() => undefined));
    renderEditor("/admin/posts/1");

    await loadedMarkdownTextarea();
    fireEvent.change(screen.getByLabelText("Upload image file"), { target: { files: [imageFile()] } });
    await waitFor(() => expect(mockedUploadAdminPostImage).toHaveBeenCalled());

    const previewButton = screen.getByRole("button", { name: "Preview TipTap conversion" });
    expect(previewButton).toBeDisabled();
    fireEvent.click(previewButton);
    expect(mockedPreviewAdminPostTiptapConversion).not.toHaveBeenCalled();
  });

  it("blocks format operations while a quick tag is being created", async () => {
    mockedCreateAdminTag.mockImplementation(() => new Promise(() => undefined));
    renderEditor("/admin/posts/1");

    await loadedMarkdownTextarea();
    fireEvent.change(screen.getByLabelText("New tag name"), { target: { value: "Pending Tag" } });
    fireEvent.click(screen.getByRole("button", { name: "Create and select tag" }));
    await waitFor(() => expect(mockedCreateAdminTag).toHaveBeenCalled());

    const previewButton = screen.getByRole("button", { name: "Preview TipTap conversion" });
    expect(previewButton).toBeDisabled();
    fireEvent.click(previewButton);
    expect(mockedPreviewAdminPostTiptapConversion).not.toHaveBeenCalled();
  });

  it("keeps local edits and rejects a preview response when the editor baseline changes", async () => {
    let resolvePreview: ((value: Awaited<ReturnType<typeof previewAdminPostTiptapConversion>>) => void) | undefined;
    mockedPreviewAdminPostTiptapConversion.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePreview = resolve;
        })
    );
    renderEditor("/admin/posts/1");

    await loadedMarkdownTextarea();
    fireEvent.click(screen.getByRole("button", { name: "Preview TipTap conversion" }));
    await waitFor(() => expect(mockedPreviewAdminPostTiptapConversion).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Unsaved local title" } });
    await act(async () => {
      resolvePreview?.({
        originalMarkdown: "Hello world",
        document: tiptapDocument,
        projectedMarkdown: "TipTap body\n",
        canConvert: true,
        blockers: [],
        warnings: []
      });
    });

    expect(screen.queryByRole("dialog", { name: "Convert Markdown to rich text?" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Unsaved local title");
    expect(screen.getByRole("alert", { name: "Post action error" })).toHaveTextContent(
      "Local edits changed while the format request was running. Your edits were kept; reload before retrying."
    );
  });

  it("locks every mutable form control during conversion and ignores the old response after navigation", async () => {
    const originalPost = makePost();
    const secondPost = makeSecondMarkdownPost();
    let resolveConversion: ((value: Awaited<ReturnType<typeof convertAdminPostTranslationToTiptap>>) => void) | undefined;
    mockedFetchAdminPost.mockImplementation(async (postId) => ({ post: postId === 1 ? originalPost : secondPost }));
    mockedConvertAdminPostTranslationToTiptap.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveConversion = resolve;
        })
    );

    renderEditorWithArticleSwitch("/admin/posts/1", 2);

    expect(await loadedMarkdownTextarea()).toHaveValue("Hello world");
    fireEvent.click(screen.getByRole("button", { name: "Preview TipTap conversion" }));
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: "Convert Markdown to rich text?" })).getByRole("button", {
        name: "Convert to rich text"
      })
    );
    await waitFor(() => expect(mockedConvertAdminPostTranslationToTiptap).toHaveBeenCalled());

    for (const control of ["Slug", "Category", "Search tags", "Title", "Summary", "Markdown body", "Upload image file"]) {
      expect(screen.getByLabelText(control)).toBeDisabled();
    }
    for (const languageButton of within(screen.getByRole("tablist", { name: "Editor language" })).getAllByRole("button")) {
      expect(languageButton).toBeDisabled();
    }

    fireEvent.click(screen.getByRole("link", { name: "Open article 2" }));
    expect(await loadedMarkdownTextarea()).toHaveValue("Second article body");
    await act(async () => {
      resolveConversion?.({ post: makeTiptapPost({ updatedAt: "2026-06-21T00:00:00.000Z" }) });
    });

    await waitFor(() => expect(screen.getByLabelText("Slug")).toHaveValue("second-post"));
    expect(screen.getByLabelText("Markdown body")).toHaveValue("Second article body");
    expect(screen.queryByRole("textbox", { name: "Article body" })).not.toBeInTheDocument();
  });

  it("shows conversion blockers and disables confirmation when Markdown cannot be converted", async () => {
    mockedPreviewAdminPostTiptapConversion.mockResolvedValue({
      originalMarkdown: "# Tasks\n\n- [ ] unsafe task",
      document: null,
      projectedMarkdown: null,
      canConvert: false,
      blockers: [{ code: "task-list", line: 3, message: "Task lists are not supported in article v1." }],
      warnings: []
    });

    renderEditor("/admin/posts/1");

    await loadedMarkdownTextarea();
    fireEvent.click(screen.getByRole("button", { name: "Preview TipTap conversion" }));

    const dialog = await screen.findByRole("dialog", { name: "Convert Markdown to rich text?" });
    expect(within(dialog).getByText("Line 3: Task lists are not supported in article v1.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Convert to rich text" })).toBeDisabled();
    expect(mockedConvertAdminPostTranslationToTiptap).not.toHaveBeenCalled();
  });

  it("requires saving local Markdown edits before previewing a conversion", async () => {
    renderEditor("/admin/posts/1");

    await loadedMarkdownTextarea();
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Unsaved title" } });

    expect(screen.getByRole("button", { name: "Preview TipTap conversion" })).toBeDisabled();
    expect(screen.getByText("Save or reload your current edits before changing the article format.")).toBeInTheDocument();
    expect(mockedPreviewAdminPostTiptapConversion).not.toHaveBeenCalled();
  });

  it("does not allow converting a published Markdown post while TipTap publishing is disabled", async () => {
    mockedFetchAdminPost.mockResolvedValue({
      post: makePost({ status: "published", publishedAt: "2026-06-10T00:00:00.000Z" })
    });
    mockedPreviewAdminPostTiptapConversion.mockResolvedValue({
      originalMarkdown: "Hello world",
      document: tiptapDocument,
      projectedMarkdown: "TipTap body\n",
      canConvert: true,
      blockers: [],
      warnings: []
    });

    renderEditor("/admin/posts/1");

    await loadedMarkdownTextarea();
    fireEvent.click(screen.getByRole("button", { name: "Preview TipTap conversion" }));

    const dialog = await screen.findByRole("dialog", { name: "Convert Markdown to rich text?" });
    expect(within(dialog).getByText("TipTap publishing is not enabled yet. Hide this post before converting a published locale.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Convert to rich text" })).toBeDisabled();
    expect(mockedConvertAdminPostTranslationToTiptap).not.toHaveBeenCalled();
  });

  it("restores a converted TipTap locale from its Markdown snapshot", async () => {
    const originalUpdatedAt = "2026-06-10T00:00:00.000Z";
    const snapshotAt = "2026-06-11T00:00:00.000Z";
    const markdownSnapshot = "# Original Markdown\n\nBody";
    mockedFetchAdminPost.mockResolvedValue({
      post: makeTiptapPost({
        updatedAt: originalUpdatedAt,
        translations: [
          {
            locale: "zh",
            title: "涓枃鑽夌",
            summary: "",
            contentMarkdown: "涓枃 Markdown",
            content: { format: "markdown", markdown: "涓枃 Markdown" },
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
            canRestoreMarkdown: true,
            restoreMarkdownSnapshotAt: snapshotAt,
            seoTitle: null,
            seoDescription: null
          }
        ]
      })
    });
    mockedRestoreAdminPostTranslationMarkdown.mockResolvedValue({
      post: makePost({
        updatedAt: "2026-06-12T00:00:00.000Z",
        translations: [
          {
            locale: "zh",
            title: "涓枃鑽夌",
            summary: "",
            contentMarkdown: "涓枃 Markdown",
            content: { format: "markdown", markdown: "涓枃 Markdown" },
            seoTitle: null,
            seoDescription: null
          },
          {
            locale: "en",
            title: "TipTap Draft",
            summary: "",
            contentMarkdown: markdownSnapshot,
            content: { format: "markdown", markdown: markdownSnapshot },
            canRestoreMarkdown: false,
            restoreMarkdownSnapshotAt: null,
            seoTitle: null,
            seoDescription: null
          }
        ]
      })
    });

    renderEditor("/admin/posts/1");

    expect(await loadedArticleTextbox()).toHaveTextContent("TipTap body");
    fireEvent.click(screen.getByRole("button", { name: "Restore Markdown snapshot" }));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Restore Markdown snapshot?" })).getByRole("button", { name: "Restore Markdown" }));

    await waitFor(() =>
      expect(mockedRestoreAdminPostTranslationMarkdown).toHaveBeenCalledWith(1, "en", {
        expectedUpdatedAt: originalUpdatedAt
      })
    );
    expect(await screen.findByLabelText("Markdown body")).toHaveValue(markdownSnapshot);
    expect(screen.queryByRole("textbox", { name: "Article body" })).not.toBeInTheDocument();
  });

  it("restores a Markdown snapshot even when the stored TipTap JSON is invalid", async () => {
    const originalUpdatedAt = "2026-06-10T00:00:00.000Z";
    const markdownSnapshot = "# Recovered Markdown\n\nBody";
    mockedFetchAdminPost.mockResolvedValue({
      post: makeTiptapPost({
        updatedAt: originalUpdatedAt,
        translations: [
          {
            locale: "en",
            title: "Broken rich text",
            summary: "",
            contentMarkdown: markdownSnapshot,
            content: {
              format: "tiptap",
              schemaVersion: 1,
              doc: { type: "doc", content: [{ type: "unsupportedNode" }] }
            },
            canRestoreMarkdown: true,
            restoreMarkdownSnapshotAt: "2026-06-09T00:00:00.000Z",
            seoTitle: null,
            seoDescription: null
          }
        ]
      })
    });
    mockedRestoreAdminPostTranslationMarkdown.mockResolvedValue({
      post: makePost({
        updatedAt: "2026-06-11T00:00:00.000Z",
        translations: [
          {
            locale: "en",
            title: "Recovered article",
            summary: "",
            contentMarkdown: markdownSnapshot,
            content: { format: "markdown", markdown: markdownSnapshot },
            canRestoreMarkdown: false,
            restoreMarkdownSnapshotAt: null,
            seoTitle: null,
            seoDescription: null
          }
        ]
      })
    });

    renderEditor("/admin/posts/1");

    expect(await screen.findByRole("alert")).toHaveTextContent("Rich text body could not be loaded");
    fireEvent.click(screen.getByRole("button", { name: "Restore Markdown snapshot" }));
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: "Restore Markdown snapshot?" })).getByRole("button", {
        name: "Restore Markdown"
      })
    );

    await waitFor(() =>
      expect(mockedRestoreAdminPostTranslationMarkdown).toHaveBeenCalledWith(1, "en", {
        expectedUpdatedAt: originalUpdatedAt
      })
    );
    expect(await screen.findByLabelText("Markdown body")).toHaveValue(markdownSnapshot);
  });

  it("disables Markdown snapshot restore while TipTap changes are unsaved", async () => {
    mockedFetchAdminPost.mockResolvedValue({
      post: makeTiptapPost({
        translations: [
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
            canRestoreMarkdown: true,
            restoreMarkdownSnapshotAt: "2026-06-09T00:00:00.000Z",
            seoTitle: null,
            seoDescription: null
          }
        ]
      })
    });

    renderEditor("/admin/posts/1");

    expect(await loadedArticleTextbox()).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Horizontal rule" }));

    const restoreButton = screen.getByRole("button", { name: "Restore Markdown snapshot" });
    await waitFor(() => expect(restoreButton).toBeDisabled());
    fireEvent.click(restoreButton);
    expect(mockedRestoreAdminPostTranslationMarkdown).not.toHaveBeenCalled();
  });

  it("traps focus inside the restore dialog and returns focus to the trigger", async () => {
    mockedFetchAdminPost.mockResolvedValue({
      post: makeTiptapPost({
        translations: [
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
            canRestoreMarkdown: true,
            restoreMarkdownSnapshotAt: "2026-06-09T00:00:00.000Z",
            seoTitle: null,
            seoDescription: null
          }
        ]
      })
    });

    renderEditor("/admin/posts/1");

    expect(await loadedArticleTextbox()).toBeInTheDocument();
    const restoreButton = screen.getByRole("button", { name: "Restore Markdown snapshot" });
    restoreButton.focus();
    fireEvent.click(restoreButton);

    const dialog = await screen.findByRole("dialog", { name: "Restore Markdown snapshot?" });
    const cancelButton = within(dialog).getByRole("button", { name: "Cancel" });
    const confirmButton = within(dialog).getByRole("button", { name: "Restore Markdown" });
    await waitFor(() => expect(cancelButton).toHaveFocus());

    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(confirmButton).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(cancelButton).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Restore Markdown snapshot?" })).not.toBeInTheDocument());
    await waitFor(() => expect(restoreButton).toHaveFocus());
  });

  it("locks the form during restore and ignores the old restore response after navigation", async () => {
    const originalPost = makeTiptapPost({
      translations: [
        {
          locale: "en",
          title: "TipTap Draft",
          summary: "",
          contentMarkdown: "TipTap body\n",
          content: { format: "tiptap", schemaVersion: 1, doc: tiptapDocument },
          canRestoreMarkdown: true,
          restoreMarkdownSnapshotAt: "2026-06-09T00:00:00.000Z",
          seoTitle: null,
          seoDescription: null
        }
      ]
    });
    const secondPost = makeSecondMarkdownPost();
    let resolveRestore: ((value: Awaited<ReturnType<typeof restoreAdminPostTranslationMarkdown>>) => void) | undefined;
    mockedFetchAdminPost.mockImplementation(async (postId) => ({ post: postId === 1 ? originalPost : secondPost }));
    mockedRestoreAdminPostTranslationMarkdown.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRestore = resolve;
        })
    );

    renderEditorWithArticleSwitch("/admin/posts/1", 2);

    const articleBody = await loadedArticleTextbox();
    fireEvent.click(screen.getByRole("button", { name: "Restore Markdown snapshot" }));
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: "Restore Markdown snapshot?" })).getByRole("button", {
        name: "Restore Markdown"
      })
    );
    await waitFor(() => expect(mockedRestoreAdminPostTranslationMarkdown).toHaveBeenCalled());

    expect(screen.getByLabelText("Slug")).toBeDisabled();
    expect(screen.getByLabelText("Title")).toBeDisabled();
    expect(screen.getByLabelText("Category")).toBeDisabled();
    expect(articleBody).toHaveAttribute("contenteditable", "false");
    for (const languageButton of within(screen.getByRole("tablist", { name: "Editor language" })).getAllByRole("button")) {
      expect(languageButton).toBeDisabled();
    }

    fireEvent.click(screen.getByRole("link", { name: "Open article 2" }));
    expect(await loadedMarkdownTextarea()).toHaveValue("Second article body");
    await act(async () => {
      resolveRestore?.({
        post: makePost({
          updatedAt: "2026-06-21T00:00:00.000Z",
          translations: [
            {
              locale: "en",
              title: "Restored first post",
              summary: "",
              contentMarkdown: "First article snapshot",
              content: { format: "markdown", markdown: "First article snapshot" },
              seoTitle: null,
              seoDescription: null
            }
          ]
        })
      });
    });

    await waitFor(() => expect(screen.getByLabelText("Slug")).toHaveValue("second-post"));
    expect(screen.getByLabelText("Markdown body")).toHaveValue("Second article body");
  });

  it("warns on unsaved TipTap changes and clears the warning after a successful save baseline", async () => {
    mockedFetchAdminPost.mockResolvedValue({ post: makeTiptapPost() });
    mockedUpdateAdminPost.mockResolvedValue({ post: makeTiptapPost({ updatedAt: "2026-06-11T00:00:00.000Z" }) });
    const addEventListener = vi.spyOn(window, "addEventListener");
    const removeEventListener = vi.spyOn(window, "removeEventListener");

    renderEditor("/admin/posts/1");

    expect(await loadedArticleTextbox()).toBeInTheDocument();
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

  it("keeps markdown source editable when switching modes without rendering the preview pane", async () => {
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
    expect(await loadedMarkdownTextarea()).toBeInTheDocument();
    expect(document.querySelector("#editor-preview")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Preview heading" })).not.toBeInTheDocument();

    fireEvent.click(within(modeTabs).getByRole("button", { name: "MD source" }));
    expect(await loadedMarkdownTextarea()).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Preview heading" })).not.toBeInTheDocument();

    fireEvent.click(within(modeTabs).getByRole("button", { name: "Source + preview" }));
    expect(await loadedMarkdownTextarea()).toBeInTheDocument();
    expect(document.querySelector("#editor-preview")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Preview heading" })).not.toBeInTheDocument();
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
      warnings: ["review markdown"],
      chunks: []
    });
    renderEditor("/admin/posts/1");

    await loadedMarkdownTextarea();
    fireEvent.click(screen.getByRole("button", { name: "Sync translation" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Replace existing translation?" })).getByRole("button", { name: "Continue" }));

    await waitFor(() =>
      expect(mockedTranslateAdminPostDraft).toHaveBeenCalledWith({
        source: {
          locale: "en",
          title: "Draft",
          summary: "",
          content: { format: "markdown", markdown: "Hello world" },
          contentMarkdown: "Hello world",
          seoTitle: null,
          seoDescription: null
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
    fireEvent.click(screen.getByRole("button", { name: "Sync translation" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Replace existing translation?" })).getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("status", { name: "Translation progress" })).toHaveTextContent(
      "Generating translation draft"
    );
    expect(screen.getByRole("button", { name: "Syncing..." })).toBeDisabled();

    resolveTranslation?.({
      translation: {
        locale: "zh",
        title: "自动填入标题",
        summary: "自动填入摘要",
        contentMarkdown: "自动填入正文",
        seoTitle: null,
        seoDescription: null
      },
      warnings: [],
      chunks: []
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
    fireEvent.click(screen.getByRole("button", { name: "Sync translation" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Replace existing translation?" })).getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("status", { name: "Translation progress" })).toBeInTheDocument();
    rejectTranslation?.(new Error("AI quota or rate limit reached. Check the API key balance or try again later."));

    expect(await screen.findByText("AI quota or rate limit reached. Check the API key balance or try again later.")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Translation progress" })).not.toBeInTheDocument();
    expect(textarea).toHaveValue("Hello world");
  });

  it("translates an active TipTap draft through the structure-preserving pipeline", async () => {
    const translatedZhDocument: ArticleDocument = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "中文 TipTap 正文" }] }]
    };
    mockedFetchAdminPost.mockResolvedValue({
      post: makePost({
        translations: [
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
        ]
      })
    });
    mockedTranslateAdminPostDraft.mockResolvedValue({
      translation: {
        locale: "zh",
        title: "中文 TipTap 草稿",
        summary: "结构保持翻译",
        content: {
          format: "tiptap" as const,
          schemaVersion: 1,
          doc: translatedZhDocument
        },
        contentMarkdown: "中文 TipTap 正文\n",
        seoTitle: null,
        seoDescription: null
      },
      warnings: [],
      chunks: []
    });

    renderEditor("/admin/posts/1");

    expect(await loadedArticleTextbox()).toHaveTextContent("TipTap body");
    const translateButton = screen.getByRole("button", { name: "Sync translation" });
    expect(translateButton).toBeEnabled();
    fireEvent.click(translateButton);

    await waitFor(() =>
      expect(mockedTranslateAdminPostDraft).toHaveBeenCalledWith({
        source: {
          locale: "en",
          title: "TipTap Draft",
          summary: "",
          content: {
            format: "tiptap",
            schemaVersion: 1,
            doc: tiptapDocument
          },
          contentMarkdown: "TipTap body\n",
          seoTitle: null,
          seoDescription: null
        },
        targetLocale: "zh"
      })
    );
    expect(await screen.findByDisplayValue("中文 TipTap 草稿")).toBeInTheDocument();
    expect(await loadedArticleTextbox()).toHaveTextContent("中文 TipTap 正文");
    expect(screen.queryByLabelText("Markdown body")).not.toBeInTheDocument();
  });
});
