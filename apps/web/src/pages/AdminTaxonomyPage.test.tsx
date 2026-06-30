import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminTaxonomyPage } from "./AdminTaxonomyPage";

const apiMocks = vi.hoisted(() => ({
  createAdminCategory: vi.fn(),
  createAdminTag: vi.fn(),
  deleteAdminCategory: vi.fn(),
  deleteAdminTag: vi.fn(),
  detachAdminCategoryReferences: vi.fn(),
  detachAdminTagReferences: vi.fn(),
  fetchAdminCategories: vi.fn(),
  fetchAdminCategoryReferences: vi.fn(),
  fetchAdminTags: vi.fn(),
  fetchAdminTagReferences: vi.fn(),
  updateAdminCategory: vi.fn(),
  updateAdminTag: vi.fn()
}));

vi.mock("../api/admin", () => apiMocks);

describe("AdminTaxonomyPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.fetchAdminCategories.mockResolvedValue({
      categories: [
        {
          id: 2,
          slug: "later",
          name: "稍后阅读",
          sortOrder: 20,
          postCount: 2,
          activePostCount: 2,
          trashedPostCount: 1,
          totalPostCount: 3,
          translations: [{ locale: "zh", description: "等待整理的技术记录" }]
        },
        {
          id: 1,
          slug: "first",
          name: "优先主题",
          sortOrder: 4,
          postCount: 0,
          activePostCount: 0,
          trashedPostCount: 0,
          totalPostCount: 0,
          translations: []
        }
      ]
    });
    apiMocks.fetchAdminTags.mockResolvedValue({ tags: [] });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows active and trashed category references and defaults new sorting after the maximum", async () => {
    render(<AdminTaxonomyPage kind="categories" locale="zh" />);

    const laterRow = await screen.findByRole("row", { name: /稍后阅读/ });
    expect(within(laterRow).getByText("2 正常")).toBeInTheDocument();
    expect(within(laterRow).getByText("1 回收站")).toBeInTheDocument();
    expect(within(laterRow).queryByRole("button", { name: "删除" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "新增大分类" }));

    const dialog = screen.getByRole("dialog", { name: "建立全新技术分类" });
    expect(within(dialog).getByLabelText("排序索引")).toHaveValue(21);
  });

  it("opens a selectable reference panel and detaches only checked posts", async () => {
    apiMocks.fetchAdminCategories
      .mockResolvedValueOnce({
        categories: [
          {
            id: 2,
            slug: "later",
            name: "稍后阅读",
            sortOrder: 20,
            postCount: 2,
            activePostCount: 2,
            trashedPostCount: 1,
            totalPostCount: 3,
            translations: [{ locale: "zh", description: "等待整理的技术记录" }]
          }
        ]
      })
      .mockResolvedValueOnce({
        categories: [
          {
            id: 2,
            slug: "later",
            name: "稍后阅读",
            sortOrder: 20,
            postCount: 1,
            activePostCount: 1,
            trashedPostCount: 1,
            totalPostCount: 2,
            translations: [{ locale: "zh", description: "等待整理的技术记录" }]
          }
        ]
      });
    apiMocks.fetchAdminCategoryReferences.mockResolvedValueOnce({
      activePostCount: 2,
      trashedPostCount: 1,
      totalPostCount: 3,
      references: [
        {
          id: 11,
          slug: "live-note",
          status: "published",
          deletedAt: null,
          titles: { zh: "正常文章" }
        },
        {
          id: 12,
          slug: "trashed-note",
          status: "draft",
          deletedAt: "2026-06-01T00:00:00.000Z",
          titles: { zh: "回收站文章" }
        }
      ]
    });
    apiMocks.detachAdminCategoryReferences.mockResolvedValueOnce({
      detachedCount: 1,
      activePostCount: 1,
      trashedPostCount: 1,
      totalPostCount: 2
    });

    render(<AdminTaxonomyPage kind="categories" locale="zh" />);

    const laterRow = await screen.findByRole("row", { name: /稍后阅读/ });
    fireEvent.click(within(laterRow).getByRole("button", { name: "引用管理" }));

    const panel = await screen.findByRole("dialog", { name: /稍后阅读/ });
    expect(within(panel).getByText("完整引用：3")).toBeInTheDocument();
    expect(within(panel).getByText("正常文章")).toBeInTheDocument();
    expect(within(panel).getByText("回收站文章")).toBeInTheDocument();

    fireEvent.click(within(panel).getByLabelText("选择 正常文章"));
    fireEvent.click(within(panel).getByRole("button", { name: "解除选中的 1 篇文章" }));

    await waitFor(() => expect(apiMocks.detachAdminCategoryReferences).toHaveBeenCalledWith(2, { postIds: [11] }));
    expect(await screen.findByRole("status")).toHaveTextContent("已解除 1 篇文章关联");
    expect(await screen.findByText("完整引用：2")).toBeInTheDocument();
    const updatedRow = await screen.findByRole("row", { name: /稍后阅读/ });
    expect(within(updatedRow).getByText("1 正常")).toBeInTheDocument();
  });
});
