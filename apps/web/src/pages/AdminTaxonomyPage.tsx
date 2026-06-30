import type { Category, Locale, Tag, TaxonomyReference } from "@tworiver/shared";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  createAdminCategory,
  createAdminTag,
  detachAdminCategoryReferences,
  detachAdminTagReferences,
  fetchAdminCategories,
  fetchAdminCategoryReferences,
  fetchAdminTags,
  fetchAdminTagReferences,
  updateAdminCategory,
  updateAdminTag
} from "../api/admin";
import {
  getCategoryDescription,
  getTaxonomyAlternateName,
  getTaxonomyDisplayName,
  getTaxonomyTranslationName
} from "../utils/taxonomy";

type TaxonomyKind = "categories" | "tags";
type TaxonomyItem = Category | Tag;

interface AdminTaxonomyPageProps {
  kind: TaxonomyKind;
  locale: Locale;
}

interface CategoryFormState {
  id: number | null;
  slug: string;
  nameZh: string;
  nameEn: string;
  sortOrder: string;
  descriptionZh: string;
  descriptionEn: string;
}

interface TaxonomyUsage {
  activePostCount: number;
  trashedPostCount: number;
  totalPostCount: number;
}

interface ReferencePanelState extends TaxonomyUsage {
  item: TaxonomyItem;
  references: TaxonomyReference[];
  selectedPostIds: number[];
  isLoading: boolean;
  isDetaching: boolean;
  error: string | null;
}

function createEmptyForm(nextSortOrder: number): CategoryFormState {
  return {
    id: null,
    slug: "",
    nameZh: "",
    nameEn: "",
    sortOrder: String(nextSortOrder),
    descriptionZh: "",
    descriptionEn: ""
  };
}

function createFormFromItem(item: TaxonomyItem): CategoryFormState {
  const category = item as Category;
  const nameZh = getTaxonomyTranslationName(item, "zh");
  const nameEn = getTaxonomyTranslationName(item, "en");

  return {
    id: item.id,
    slug: item.slug,
    nameZh: nameZh || (!nameEn ? item.name : ""),
    nameEn,
    sortOrder: String(category.sortOrder ?? 0),
    descriptionZh: category.translations?.find((translation) => translation.locale === "zh")?.description ?? "",
    descriptionEn: category.translations?.find((translation) => translation.locale === "en")?.description ?? ""
  };
}

function getTaxonomyUsage(item: TaxonomyItem): TaxonomyUsage {
  const activePostCount = item.activePostCount ?? item.postCount ?? 0;
  const trashedPostCount = item.trashedPostCount ?? 0;
  return {
    activePostCount,
    trashedPostCount,
    totalPostCount: item.totalPostCount ?? activePostCount + trashedPostCount
  };
}

function getReferenceTitle(reference: TaxonomyReference, uiLocale: Locale) {
  return reference.titles[uiLocale] ?? reference.titles[uiLocale === "zh" ? "en" : "zh"] ?? reference.slug;
}

function referenceStatusLabel(reference: TaxonomyReference, uiLocale: Locale) {
  if (reference.deletedAt) {
    return uiLocale === "zh" ? "回收站" : "trashed";
  }

  if (reference.status === "published") {
    return uiLocale === "zh" ? "已发布" : "published";
  }

  if (reference.status === "hidden") {
    return uiLocale === "zh" ? "已隐藏" : "hidden";
  }

  return uiLocale === "zh" ? "草稿" : "draft";
}

export function AdminTaxonomyPage({ kind, locale }: AdminTaxonomyPageProps) {
  const [items, setItems] = useState<TaxonomyItem[]>([]);
  const [formState, setFormState] = useState<CategoryFormState>(() => createEmptyForm(1));
  const [referencePanel, setReferencePanel] = useState<ReferencePanelState | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const isCategory = kind === "categories";
  const title = isCategory ? (locale === "zh" ? "分类管理" : "Category management") : locale === "zh" ? "标签管理" : "Tag management";
  const sortedItems = useMemo(
    () =>
      [...items].sort((first, second) => {
        if (isCategory) {
          return (
            ((first as Category).sortOrder ?? 0) - ((second as Category).sortOrder ?? 0) ||
            getTaxonomyDisplayName(first, locale).localeCompare(getTaxonomyDisplayName(second, locale))
          );
        }

        return getTaxonomyDisplayName(first, locale).localeCompare(getTaxonomyDisplayName(second, locale));
      }),
    [isCategory, items, locale]
  );
  const totalPostCount = items.reduce((sum, item) => sum + getTaxonomyUsage(item).totalPostCount, 0);

  async function loadItems(init?: RequestInit) {
    if (isCategory) {
      const response = await fetchAdminCategories(init);
      setItems(response.categories);
      return;
    }

    const response = await fetchAdminTags(init);
    setItems(response.tags);
  }

  useEffect(() => {
    const controller = new AbortController();
    setIsModalOpen(false);
    setReferencePanel(null);
    setFormState(createEmptyForm(1));
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    void loadItems({ signal: controller.signal })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : "Failed to load taxonomy");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });
    return () => {
      controller.abort();
    };
  }, [kind]);

  useEffect(() => {
    if ((!isModalOpen && !referencePanel) || typeof document === "undefined") {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isModalOpen, referencePanel]);

  function openCreateModal() {
    const nextSortOrder = isCategory
      ? items.reduce((maximum, item) => Math.max(maximum, (item as Category).sortOrder ?? 0), 0) + 1
      : 1;
    setFormState(createEmptyForm(nextSortOrder));
    setError(null);
    setSuccessMessage(null);
    setIsModalOpen(true);
  }

  function openEditModal(item: TaxonomyItem) {
    setFormState(createFormFromItem(item));
    setError(null);
    setSuccessMessage(null);
    setIsModalOpen(true);
  }

  function closeModal() {
    if (!isSaving) {
      setIsModalOpen(false);
    }
  }

  async function openReferencePanel(item: TaxonomyItem) {
    const usage = getTaxonomyUsage(item);
    setReferencePanel({
      item,
      references: [],
      selectedPostIds: [],
      isLoading: true,
      isDetaching: false,
      error: null,
      ...usage
    });
    setError(null);
    setSuccessMessage(null);

    try {
      const response = isCategory ? await fetchAdminCategoryReferences(item.id) : await fetchAdminTagReferences(item.id);
      setReferencePanel((current) =>
        current?.item.id === item.id
          ? {
              ...current,
              references: response.references,
              selectedPostIds: [],
              activePostCount: response.activePostCount,
              trashedPostCount: response.trashedPostCount,
              totalPostCount: response.totalPostCount,
              isLoading: false,
              error: null
            }
          : current
      );
    } catch (caught) {
      setReferencePanel((current) =>
        current?.item.id === item.id
          ? {
              ...current,
              isLoading: false,
              error: caught instanceof Error ? caught.message : "Failed to load taxonomy references"
            }
          : current
      );
    }
  }

  function closeReferencePanel() {
    setReferencePanel(null);
  }

  function toggleReferenceSelection(postId: number) {
    setReferencePanel((current) => {
      if (!current) {
        return current;
      }

      const selectedPostIds = current.selectedPostIds.includes(postId)
        ? current.selectedPostIds.filter((selectedPostId) => selectedPostId !== postId)
        : [...current.selectedPostIds, postId];

      return {
        ...current,
        selectedPostIds
      };
    });
  }

  function selectAllReferences() {
    setReferencePanel((current) =>
      current
        ? {
            ...current,
            selectedPostIds: current.references.map((reference) => reference.id)
          }
        : current
    );
  }

  function clearReferenceSelection() {
    setReferencePanel((current) =>
      current
        ? {
            ...current,
            selectedPostIds: []
          }
        : current
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const slug = formState.slug.trim();
      const nameZh = formState.nameZh.trim();
      const nameEn = formState.nameEn.trim();
      if (!nameZh && !nameEn) {
        throw new Error(locale === "zh" ? "请至少填写一个中文或英文名称。" : "Add at least one Chinese or English name.");
      }
      const name = nameZh || nameEn || slug;

      if (formState.id) {
        if (isCategory) {
          await updateAdminCategory(formState.id, {
            slug,
            name,
            sortOrder: Number.parseInt(formState.sortOrder, 10) || 0,
            translations: [
              { locale: "zh", name: nameZh, description: formState.descriptionZh.trim() },
              { locale: "en", name: nameEn, description: formState.descriptionEn.trim() }
            ]
          });
        } else {
          await updateAdminTag(formState.id, {
            slug,
            name,
            translations: [
              { locale: "zh", name: nameZh },
              { locale: "en", name: nameEn }
            ]
          });
        }
      } else if (isCategory) {
        await createAdminCategory({
          slug,
          name,
          sortOrder: Number.parseInt(formState.sortOrder, 10) || 0,
          translations: [
            { locale: "zh", name: nameZh, description: formState.descriptionZh.trim() },
            { locale: "en", name: nameEn, description: formState.descriptionEn.trim() }
          ]
        });
      } else {
        await createAdminTag({
          slug,
          name,
          translations: [
            { locale: "zh", name: nameZh },
            { locale: "en", name: nameEn }
          ]
        });
      }
      await loadItems();
      setIsModalOpen(false);
      setSuccessMessage(
        locale === "zh"
          ? `${isCategory ? "分类" : "标签"}已保存。`
          : `${isCategory ? "Category" : "Tag"} saved.`
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to save taxonomy");
    } finally {
      setIsSaving(false);
    }
  }

  async function detachSelectedReferences() {
    const currentPanel = referencePanel;
    if (!currentPanel || currentPanel.selectedPostIds.length === 0) {
      return;
    }

    setReferencePanel({
      ...currentPanel,
      isDetaching: true,
      error: null
    });
    setSuccessMessage(null);

    try {
      const response = isCategory
        ? await detachAdminCategoryReferences(currentPanel.item.id, { postIds: currentPanel.selectedPostIds })
        : await detachAdminTagReferences(currentPanel.item.id, { postIds: currentPanel.selectedPostIds });
      await loadItems();
      setReferencePanel((latestPanel) =>
        latestPanel?.item.id === currentPanel.item.id
          ? {
              ...latestPanel,
              references: latestPanel.references.filter((reference) => !currentPanel.selectedPostIds.includes(reference.id)),
              selectedPostIds: [],
              activePostCount: response.activePostCount,
              trashedPostCount: response.trashedPostCount,
              totalPostCount: response.totalPostCount,
              isDetaching: false,
              error: null
            }
          : latestPanel
      );
      setSuccessMessage(
        locale === "zh"
          ? `已解除 ${response.detachedCount} 篇文章关联`
          : `Detached ${response.detachedCount} linked ${response.detachedCount === 1 ? "post" : "posts"}.`
      );
    } catch (caught) {
      setReferencePanel((latestPanel) =>
        latestPanel?.item.id === currentPanel.item.id
          ? {
              ...latestPanel,
              isDetaching: false,
              error: caught instanceof Error ? caught.message : "Failed to detach taxonomy references"
            }
          : latestPanel
      );
    }
  }

  const modalContainer =
    typeof document === "undefined" ? null : document.querySelector(".admin-app-shell") ?? document.body;

  return (
    <section className="admin-workspace admin-taxonomy-page">
      <header className="admin-page-header">
        <div className="admin-page-title">
          <h1>{title}</h1>
          <p>
            {isCategory
              ? locale === "zh"
                ? "建立文章归档与分类结构，控制公开分类页、编辑器分类选择和后台内容组织。"
                : "Build the content taxonomy used by public category pages, editor selection, and admin organization."
              : locale === "zh"
                ? "维护标签名称和路由标识，用于文章聚合与公开标签页。"
                : "Manage tag names and slugs used by post grouping and public tag pages."}
          </p>
        </div>
        <button className="primary-button taxonomy-create-button" type="button" onClick={openCreateModal}>
          <span aria-hidden="true">＋</span>
          {isCategory ? (locale === "zh" ? "新增大分类" : "New category") : locale === "zh" ? "新增标签" : "New tag"}
        </button>
      </header>

      <div className="taxonomy-summary-strip" aria-label={locale === "zh" ? "分类统计" : "Taxonomy stats"}>
        <div>
          <span>{isCategory ? (locale === "zh" ? "分类数量" : "Categories") : locale === "zh" ? "标签数量" : "Tags"}</span>
          <strong>{items.length}</strong>
        </div>
        <div>
          <span>{locale === "zh" ? "关联文章" : "Linked posts"}</span>
          <strong>{totalPostCount}</strong>
        </div>
        {isCategory ? (
          <div>
            <span>{locale === "zh" ? "已写介绍" : "With descriptions"}</span>
            <strong>{items.filter((item) => getCategoryDescription(item as Category, locale)).length}</strong>
          </div>
        ) : null}
      </div>

      <div className="taxonomy-admin-panel">
        <div className="taxonomy-panel-head">
          <div>
            <span>CONTENT TAXONOMY</span>
            <h2>{isCategory ? (locale === "zh" ? "全部分类" : "All categories") : locale === "zh" ? "全部标签" : "All tags"}</h2>
          </div>
          <p>
            {isCategory
              ? locale === "zh"
                ? "排序值越小越靠前，描述会用于后台识别和后续公开页扩展。"
                : "Lower sort values appear first. Descriptions support admin context and future public-page extensions."
              : locale === "zh"
                ? "标签按名称排序，用于补充文章主题维度。"
                : "Tags are sorted by name and provide an additional topic dimension."}
          </p>
        </div>

        {error && !isModalOpen ? (
          <p className="error-text" role="alert">
            {error}
          </p>
        ) : null}
        {successMessage ? (
          <p className="success-text" role="status">
            {successMessage}
          </p>
        ) : null}

        <div className="taxonomy-table-wrap">
          {isLoading ? (
            <div className="admin-loading-list" role="status" aria-label={locale === "zh" ? "正在加载" : "Loading"}>
              <span />
              <span />
              <span />
            </div>
          ) : null}

          {!isLoading && sortedItems.length === 0 ? (
            <div className="admin-table__message admin-table__empty taxonomy-empty-state">
              <strong>{isCategory ? (locale === "zh" ? "暂无任何分类" : "No categories yet") : locale === "zh" ? "暂无任何标签" : "No tags yet"}</strong>
              <span>
                {isCategory
                  ? locale === "zh"
                    ? "新建首个分类，为技术博客建立内容结构。"
                    : "Create the first category to give the blog a content structure."
                  : locale === "zh"
                    ? "新建首个标签，用于细分文章主题。"
                    : "Create the first tag to refine article topics."}
              </span>
              <button className="primary-button" type="button" onClick={openCreateModal}>
                {locale === "zh" ? "立即新建" : "Create now"}
              </button>
            </div>
          ) : null}

          {!isLoading && sortedItems.length > 0 ? (
            <table className={`taxonomy-admin-table${isCategory ? "" : " taxonomy-admin-table--tags"}`}>
              <thead>
                <tr>
                  {isCategory ? <th>{locale === "zh" ? "排序" : "Sort"}</th> : null}
                  <th>{isCategory ? (locale === "zh" ? "分类名称" : "Name") : locale === "zh" ? "标签名称" : "Name"}</th>
                  <th>Slug</th>
                  {isCategory ? <th>{locale === "zh" ? "分类介绍描述" : "Description"}</th> : null}
                  <th>{locale === "zh" ? "关联文章数" : "Posts"}</th>
                  <th>{locale === "zh" ? "操作管理" : "Actions"}</th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.map((item) => {
                  const category = item as Category;
                  const usage = getTaxonomyUsage(item);
                  const displayName = getTaxonomyDisplayName(item, locale);
                  const alternateName = getTaxonomyAlternateName(item, locale);

                  return (
                    <tr key={item.id}>
                      {isCategory ? (
                        <td>
                          <span className="taxonomy-sort-pill">#{category.sortOrder ?? 0}</span>
                        </td>
                      ) : null}
                      <td>
                        <div className="taxonomy-name-cell">
                          <span className="taxonomy-name-cell__icon" aria-hidden="true">{isCategory ? "▣" : "#"}</span>
                          <span className="taxonomy-name-cell__label">
                            <strong>{displayName}</strong>
                            {alternateName ? <small>{alternateName}</small> : null}
                          </span>
                        </div>
                      </td>
                      <td>
                        <code>/{item.slug}</code>
                      </td>
                      {isCategory ? (
                        <td>
                          <span className="taxonomy-description" title={getCategoryDescription(category, locale)}>
                            {getCategoryDescription(category, locale) || (locale === "zh" ? "暂无详细专栏说明" : "No description yet")}
                          </span>
                        </td>
                      ) : null}
                      <td>
                        <div className="taxonomy-usage-counts">
                          <span className="taxonomy-count-pill taxonomy-count-pill--total">
                            {usage.totalPostCount} {locale === "zh" ? "完整" : "total"}
                          </span>
                          <span className="taxonomy-count-pill">
                            {usage.activePostCount} {locale === "zh" ? "正常" : "active"}
                          </span>
                          <span className="taxonomy-count-pill taxonomy-count-pill--trashed">
                            {usage.trashedPostCount} {locale === "zh" ? "回收站" : "trashed"}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="taxonomy-actions">
                          <button className="secondary-button" type="button" onClick={() => openEditModal(item)}>
                            {locale === "zh" ? "编辑" : "Edit"}
                          </button>
                          <button className="secondary-button" type="button" onClick={() => void openReferencePanel(item)}>
                            {locale === "zh" ? "引用管理" : "References"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : null}
        </div>
      </div>

      {isModalOpen && modalContainer
        ? createPortal(
            <div className="admin-modal-backdrop" role="presentation" onMouseDown={closeModal}>
              <section
                className="taxonomy-edit-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="taxonomy-edit-title"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <header>
                  <div>
                    <span>{formState.id ? (locale === "zh" ? "编辑模式" : "Editing") : locale === "zh" ? "新增" : "New"}</span>
                    <h2 id="taxonomy-edit-title">
                      {formState.id
                        ? isCategory
                          ? locale === "zh"
                            ? "修改分类属性"
                            : "Edit category"
                          : locale === "zh"
                            ? "修改标签"
                            : "Edit tag"
                        : isCategory
                          ? locale === "zh"
                            ? "建立全新技术分类"
                            : "Create category"
                          : locale === "zh"
                            ? "建立新标签"
                            : "Create tag"}
                    </h2>
                  </div>
                  <button type="button" aria-label={locale === "zh" ? "关闭" : "Close"} onClick={closeModal}>
                    ×
                  </button>
                </header>

                <form className="taxonomy-edit-form" onSubmit={handleSubmit}>
                  <div className="taxonomy-edit-form__body">
                    <label>
                      <span>{isCategory ? (locale === "zh" ? "中文分类名称" : "Chinese category name") : locale === "zh" ? "中文标签名称" : "Chinese tag name"}</span>
                      <input
                        value={formState.nameZh}
                        onChange={(event) => setFormState((current) => ({ ...current, nameZh: event.target.value }))}
                        placeholder={isCategory ? "深度学习与大模型" : "算法与基础"}
                      />
                    </label>

                    <label>
                      <span>{isCategory ? (locale === "zh" ? "英文分类名称" : "English category name") : locale === "zh" ? "英文标签名称" : "English tag name"}</span>
                      <input
                        value={formState.nameEn}
                        onChange={(event) => setFormState((current) => ({ ...current, nameEn: event.target.value }))}
                        placeholder={isCategory ? "Machine Learning" : "React"}
                      />
                    </label>

                    <label>
                      <span>URL Slug *</span>
                      <input
                        value={formState.slug}
                        onChange={(event) => setFormState((current) => ({ ...current, slug: event.target.value }))}
                        placeholder={isCategory ? "machine-learning" : "react"}
                        required
                      />
                    </label>

                    {isCategory ? (
                      <>
                        <label>
                          <span>{locale === "zh" ? "排序索引" : "Sort order"}</span>
                          <input
                            aria-label={locale === "zh" ? "排序索引" : "Sort order"}
                            type="number"
                            value={formState.sortOrder}
                            onChange={(event) => setFormState((current) => ({ ...current, sortOrder: event.target.value }))}
                          />
                          <small>{locale === "zh" ? "数字越小越靠前。" : "Lower numbers appear first."}</small>
                        </label>

                        <label>
                          <span>{locale === "zh" ? "中文分类描述" : "Chinese description"}</span>
                          <textarea
                            value={formState.descriptionZh}
                            onChange={(event) => setFormState((current) => ({ ...current, descriptionZh: event.target.value }))}
                            placeholder="简要概括该分类的技术主线"
                            rows={3}
                          />
                        </label>

                        <label>
                          <span>{locale === "zh" ? "英文分类描述" : "English description"}</span>
                          <textarea
                            value={formState.descriptionEn}
                            onChange={(event) => setFormState((current) => ({ ...current, descriptionEn: event.target.value }))}
                            placeholder="Briefly describe this category"
                            rows={3}
                          />
                        </label>
                      </>
                    ) : null}

                    {error ? (
                      <p className="error-text" role="alert">
                        {error}
                      </p>
                    ) : null}
                  </div>

                  <footer>
                    <button className="secondary-button" type="button" onClick={closeModal}>
                      {locale === "zh" ? "取消" : "Cancel"}
                    </button>
                    <button className="primary-button" type="submit" disabled={isSaving}>
                      {isSaving ? (locale === "zh" ? "保存中..." : "Saving...") : locale === "zh" ? "确认保存" : "Save"}
                    </button>
                  </footer>
                </form>
              </section>
            </div>,
            modalContainer
          )
        : null}

      {referencePanel && modalContainer
        ? createPortal(
            <div className="admin-modal-backdrop" role="presentation" onMouseDown={closeReferencePanel}>
              <section
                className="taxonomy-reference-panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="taxonomy-reference-title"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <header>
                  <div>
                    <span>{locale === "zh" ? "关联治理" : "Reference control"}</span>
                    <h2 id="taxonomy-reference-title">
                      {locale === "zh"
                        ? `${getTaxonomyDisplayName(referencePanel.item, locale)} 的引用解除面板`
                        : `${getTaxonomyDisplayName(referencePanel.item, locale)} reference panel`}
                    </h2>
                  </div>
                  <button type="button" aria-label={locale === "zh" ? "关闭引用面板" : "Close reference panel"} onClick={closeReferencePanel}>
                    ×
                  </button>
                </header>

                <div className="taxonomy-reference-stats" aria-label={locale === "zh" ? "完整引用数" : "Reference totals"}>
                  <strong>
                    {locale === "zh" ? "完整引用" : "Total references"}：{referencePanel.totalPostCount}
                  </strong>
                  <span>
                    {referencePanel.activePostCount} {locale === "zh" ? "正常" : "active"}
                  </span>
                  <span>
                    {referencePanel.trashedPostCount} {locale === "zh" ? "回收站" : "trashed"}
                  </span>
                </div>

                <p className="field-hint">
                  {locale === "zh"
                    ? "生产规则禁止直接删除分类或标签。请在这里选择具体文章，只解除它们与当前分类/标签的关联。"
                    : "Production rules block deleting taxonomy records. Select specific posts here and detach only those references."}
                </p>

                {referencePanel.error ? (
                  <p className="error-text" role="alert">
                    {referencePanel.error}
                  </p>
                ) : null}

                {referencePanel.isLoading ? (
                  <div className="admin-loading-list" role="status" aria-label={locale === "zh" ? "正在加载引用" : "Loading references"}>
                    <span />
                    <span />
                    <span />
                  </div>
                ) : null}

                {!referencePanel.isLoading && referencePanel.references.length === 0 ? (
                  <div className="taxonomy-reference-empty">
                    <strong>{locale === "zh" ? "当前没有文章引用" : "No linked posts"}</strong>
                    <span>{locale === "zh" ? "可以继续保留该名称和 slug，等待后续内容使用。" : "Keep this name and slug ready for future content."}</span>
                  </div>
                ) : null}

                {!referencePanel.isLoading && referencePanel.references.length > 0 ? (
                  <>
                    <div className="taxonomy-reference-toolbar">
                      <button className="secondary-button" type="button" onClick={selectAllReferences}>
                        {locale === "zh" ? "全选" : "Select all"}
                      </button>
                      <button className="secondary-button" type="button" onClick={clearReferenceSelection}>
                        {locale === "zh" ? "清空选择" : "Clear"}
                      </button>
                    </div>

                    <div className="taxonomy-reference-list">
                      {referencePanel.references.map((reference) => {
                        const title = getReferenceTitle(reference, locale);
                        const isSelected = referencePanel.selectedPostIds.includes(reference.id);

                        return (
                          <label className="taxonomy-reference-row" key={reference.id}>
                            <input
                              type="checkbox"
                              aria-label={locale === "zh" ? `选择 ${title}` : `Select ${title}`}
                              checked={isSelected}
                              onChange={() => toggleReferenceSelection(reference.id)}
                            />
                            <span className="taxonomy-reference-row__main">
                              <strong>{title}</strong>
                              <code>/{reference.slug}</code>
                            </span>
                            <span className={reference.deletedAt ? "taxonomy-reference-status taxonomy-reference-status--trashed" : "taxonomy-reference-status"}>
                              {referenceStatusLabel(reference, locale)}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </>
                ) : null}

                <footer>
                  <button className="secondary-button" type="button" onClick={closeReferencePanel}>
                    {locale === "zh" ? "关闭" : "Close"}
                  </button>
                  <button
                    className="danger-button"
                    type="button"
                    disabled={referencePanel.selectedPostIds.length === 0 || referencePanel.isDetaching}
                    onClick={() => void detachSelectedReferences()}
                  >
                    {referencePanel.isDetaching
                      ? locale === "zh"
                        ? "解除中..."
                        : "Detaching..."
                      : locale === "zh"
                        ? `解除选中的 ${referencePanel.selectedPostIds.length} 篇文章`
                        : `Detach ${referencePanel.selectedPostIds.length} selected ${referencePanel.selectedPostIds.length === 1 ? "post" : "posts"}`}
                  </button>
                </footer>
              </section>
            </div>,
            modalContainer
          )
        : null}
    </section>
  );
}
