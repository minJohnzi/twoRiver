import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PublicPost, TranslationDraftResponse } from "@tworiver/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AdminEditorPage } from "./AdminEditorPage";
import * as adminApi from "../api/admin";

vi.mock("../api/admin", () => ({
  createAdminPost: vi.fn(),
  deleteAdminPost: vi.fn(),
  fetchAdminCategories: vi.fn(),
  fetchAdminPost: vi.fn(),
  translateAdminPostDraft: vi.fn(),
  updateAdminPost: vi.fn()
}));

const fetchAdminCategoriesMock = vi.mocked(adminApi.fetchAdminCategories);
const fetchAdminPostMock = vi.mocked(adminApi.fetchAdminPost);
const translateAdminPostDraftMock = vi.mocked(adminApi.translateAdminPostDraft);
const createAdminPostMock = vi.mocked(adminApi.createAdminPost);
const updateAdminPostMock = vi.mocked(adminApi.updateAdminPost);
const deleteAdminPostMock = vi.mocked(adminApi.deleteAdminPost);

const translatedResponse = {
  translation: {
    locale: "zh",
    title: "Translated title",
    summary: "Translated summary",
    contentMarkdown: "## Translated body",
    seoTitle: "Translated SEO title",
    seoDescription: "Translated SEO description"
  },
  warnings: [],
  chunks: []
} satisfies TranslationDraftResponse;

describe("AdminEditorPage translation workflow", () => {
  beforeEach(() => {
    fetchAdminCategoriesMock.mockResolvedValue({ categories: [] });
    fetchAdminPostMock.mockResolvedValue({ post: makePost() });
    translateAdminPostDraftMock.mockResolvedValue(translatedResponse);
    createAdminPostMock.mockResolvedValue({ post: makePost() });
    updateAdminPostMock.mockResolvedValue({ post: makePost() });
    deleteAdminPostMock.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("calls translateAdminPostDraft and fills target language fields", async () => {
    renderEditor();
    fillCurrentTranslation({
      title: "Source title",
      summary: "Source summary",
      body: "# Source body"
    });

    fireEvent.click(screen.getByRole("button", { name: "Translate to Chinese" }));

    await waitFor(() => {
      expect(translateAdminPostDraftMock).toHaveBeenCalledWith({
        source: {
          locale: "en",
          title: "Source title",
          summary: "Source summary",
          contentMarkdown: "# Source body",
          seoTitle: null,
          seoDescription: null
        },
        targetLocale: "zh"
      });
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Title")).toHaveValue("Translated title");
    });
    expect(screen.getByLabelText("Summary")).toHaveValue("Translated summary");
    expect(screen.getByLabelText("Markdown body")).toHaveValue("## Translated body");
  });

  it("asks for confirmation when the target language already has content", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderEditor();
    fillCurrentTranslation({ title: "Source title", body: "# Source body" });
    switchToChineseTab();
    fillCurrentTranslation({ title: "Existing target" });
    switchToEnglishTab();

    fireEvent.click(screen.getByRole("button", { name: "Translate to Chinese" }));

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledWith("Target translation already has content. Replace it?");
    });
    expect(translateAdminPostDraftMock).toHaveBeenCalledTimes(1);
  });

  it("does not call the API or change target content when confirmation is canceled", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderEditor();
    fillCurrentTranslation({ title: "Source title", body: "# Source body" });
    switchToChineseTab();
    fillCurrentTranslation({
      title: "Existing target",
      summary: "Existing summary",
      body: "Existing body"
    });
    switchToEnglishTab();

    fireEvent.click(screen.getByRole("button", { name: "Translate to Chinese" }));

    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalled();
    });
    expect(translateAdminPostDraftMock).not.toHaveBeenCalled();

    switchToChineseTab();
    expect(screen.getByLabelText("Title")).toHaveValue("Existing target");
    expect(screen.getByLabelText("Summary")).toHaveValue("Existing summary");
    expect(screen.getByLabelText("Markdown body")).toHaveValue("Existing body");
  });

  it("leaves fields unchanged and shows an error when translation fails", async () => {
    translateAdminPostDraftMock.mockRejectedValue(new Error("Translation service unavailable"));
    renderEditor();
    fillCurrentTranslation({ title: "Source title", body: "# Source body" });

    fireEvent.click(screen.getByRole("button", { name: "Translate to Chinese" }));

    await waitFor(() => {
      expect(screen.getByText("Translation service unavailable")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Title")).toHaveValue("Source title");
    expect(screen.getByLabelText("Markdown body")).toHaveValue("# Source body");
  });

  it("displays warnings after successful translation", async () => {
    translateAdminPostDraftMock.mockResolvedValue({
      ...translatedResponse,
      warnings: ["Heading level changed", "Link target needs review"]
    });
    renderEditor();
    fillCurrentTranslation({ title: "Source title", body: "# Source body" });

    fireEvent.click(screen.getByRole("button", { name: "Translate to Chinese" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Translation completed with 2 structure warning(s).");
    });
    expect(screen.getByText("Heading level changed")).toBeInTheDocument();
    expect(screen.getByText("Link target needs review")).toBeInTheDocument();
  });

  it("allows body-only source translation", async () => {
    renderEditor();
    fillCurrentTranslation({ body: "# Body without a title" });

    fireEvent.click(screen.getByRole("button", { name: "Translate to Chinese" }));

    await waitFor(() => {
      expect(translateAdminPostDraftMock).toHaveBeenCalledWith(
        expect.objectContaining({
          source: expect.objectContaining({
            title: "",
            contentMarkdown: "# Body without a title"
          }),
          targetLocale: "zh"
        })
      );
    });
  });
});

function renderEditor(route = "/admin/posts/new") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/admin/posts/new" element={<AdminEditorPage locale="en" />} />
        <Route path="/admin/posts/:id" element={<AdminEditorPage locale="en" />} />
      </Routes>
    </MemoryRouter>
  );
}

function fillCurrentTranslation({
  title,
  summary,
  body
}: {
  title?: string;
  summary?: string;
  body?: string;
}) {
  if (title !== undefined) {
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: title } });
  }
  if (summary !== undefined) {
    fireEvent.change(screen.getByLabelText("Summary"), { target: { value: summary } });
  }
  if (body !== undefined) {
    fireEvent.change(screen.getByLabelText("Markdown body"), { target: { value: body } });
  }
}

function switchToChineseTab() {
  fireEvent.click(screen.getByRole("button", { name: "Edit Chinese translation" }));
}

function switchToEnglishTab() {
  fireEvent.click(screen.getByRole("button", { name: "Edit English translation" }));
}

function makePost(): PublicPost {
  return {
    id: 1,
    slug: "source-post",
    status: "draft",
    publishedAt: null,
    category: null,
    tags: [],
    translations: [
      {
        locale: "en",
        title: "Existing English title",
        summary: "",
        contentMarkdown: "",
        seoTitle: null,
        seoDescription: null
      }
    ],
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z"
  };
}
