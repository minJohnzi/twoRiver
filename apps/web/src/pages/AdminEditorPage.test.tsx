import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { PublicPost } from "@tworiver/shared";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAdminPost,
  deleteAdminPost,
  fetchAdminCategories,
  fetchAdminPost,
  translateAdminPostDraft,
  updateAdminPost,
  uploadAdminPostImage
} from "../api/admin";
import { MarkdownPreview } from "../components/MarkdownPreview";
import { AdminEditorPage } from "./AdminEditorPage";

vi.mock("../api/admin", () => ({
  createAdminPost: vi.fn(),
  deleteAdminPost: vi.fn(),
  fetchAdminCategories: vi.fn(),
  fetchAdminPost: vi.fn(),
  translateAdminPostDraft: vi.fn(),
  updateAdminPost: vi.fn(),
  uploadAdminPostImage: vi.fn()
}));

const mockedCreateAdminPost = vi.mocked(createAdminPost);
const mockedDeleteAdminPost = vi.mocked(deleteAdminPost);
const mockedFetchAdminCategories = vi.mocked(fetchAdminCategories);
const mockedFetchAdminPost = vi.mocked(fetchAdminPost);
const mockedTranslateAdminPostDraft = vi.mocked(translateAdminPostDraft);
const mockedUpdateAdminPost = vi.mocked(updateAdminPost);
const mockedUploadAdminPostImage = vi.mocked(uploadAdminPostImage);

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
  it("renders headings and fenced code blocks", () => {
    render(<MarkdownPreview markdown={"# Title\n\n```ts\nconst value = 1;\n```"} />);

    expect(screen.getByRole("heading", { name: "Title" })).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.tagName === "CODE")).toHaveTextContent("const value = 1;");
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

    expect(container.querySelector("img")).toHaveAttribute("src", "http://localhost:4000/uploads/images/posts/p_111/photo.png");
  });
});

describe("admin editor image uploads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFetchAdminCategories.mockResolvedValue({ categories: [] });
    mockedFetchAdminPost.mockResolvedValue({ post: makePost() });
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
    expect(screen.getByRole("button", { name: "Preview" })).toBeInTheDocument();
  });

  it("republishes a hidden post without replacing its published time", async () => {
    mockedFetchAdminPost.mockResolvedValue({ post: makePost({ status: "hidden", publishedAt: "2026-05-01T00:00:00.000Z" }) });
    mockedUpdateAdminPost.mockResolvedValue({ post: makePost({ status: "published", publishedAt: "2026-05-01T00:00:00.000Z" }) });
    renderEditor("/admin/posts/1");

    await loadedMarkdownTextarea();
    expect(screen.getByRole("button", { name: "Preview" })).toBeInTheDocument();
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
