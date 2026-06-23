import type { Category, Locale, Tag } from "@tworiver/shared";
import { type FormEvent, useEffect, useState } from "react";
import {
  createAdminCategory,
  createAdminTag,
  deleteAdminCategory,
  deleteAdminTag,
  fetchAdminCategories,
  fetchAdminTags,
  updateAdminCategory,
  updateAdminTag
} from "../api/admin";

type TaxonomyKind = "categories" | "tags";
type TaxonomyItem = Category | Tag;

interface AdminTaxonomyPageProps {
  kind: TaxonomyKind;
  locale: Locale;
}

export function AdminTaxonomyPage({ kind, locale }: AdminTaxonomyPageProps) {
  const [items, setItems] = useState<TaxonomyItem[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const isCategory = kind === "categories";
  const title = isCategory ? (locale === "zh" ? "分类管理" : "Category management") : locale === "zh" ? "标签管理" : "Tag management";

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
    setEditingId(null);
    setSlug("");
    setName("");
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

  function startEdit(item: TaxonomyItem) {
    setEditingId(item.id);
    setSlug(item.slug);
    setName(item.name);
    setError(null);
    setSuccessMessage(null);
  }

  function resetForm() {
    setEditingId(null);
    setSlug("");
    setName("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      if (editingId) {
        if (isCategory) {
          await updateAdminCategory(editingId, { slug, name });
        } else {
          await updateAdminTag(editingId, { slug, name });
        }
      } else if (isCategory) {
        await createAdminCategory({ slug, name });
      } else {
        await createAdminTag({ slug, name });
      }
      resetForm();
      await loadItems();
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

  async function handleDelete(item: TaxonomyItem) {
    const confirmed = window.confirm(
      locale === "zh" ? `确定删除“${item.name}”？` : `Delete "${item.name}"?`
    );
    if (!confirmed) {
      return;
    }

    setError(null);
    try {
      if (isCategory) {
        await deleteAdminCategory(item.id);
      } else {
        await deleteAdminTag(item.id);
      }
      await loadItems();
      if (editingId === item.id) {
        resetForm();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to delete taxonomy");
    }
  }

  return (
    <section className="admin-workspace">
      <header className="admin-page-header">
        <div className="admin-page-title">
          <h1>{title}</h1>
          <p>
            {isCategory
              ? locale === "zh"
                ? "维护文章的独立分类，用于公开分类页和后台筛选。"
                : "Manage standalone post categories for public category pages and admin organization."
              : locale === "zh"
                ? "维护标签名称、slug 和删除入口。"
                : "Manage tag names, slugs, and deletion from a dedicated screen."}
          </p>
        </div>
      </header>

      <div className="admin-board">
        <div className="admin-board__main">
          <div className="admin-section-head">
            <h2>{isCategory ? (locale === "zh" ? "全部分类" : "All categories") : locale === "zh" ? "全部标签" : "All tags"}</h2>
            <span>{locale === "zh" ? `${items.length} 项` : `${items.length} items`}</span>
          </div>
          <div className="admin-table admin-taxonomy-list">
            {isLoading ? (
              <div className="admin-loading-list" role="status" aria-label={locale === "zh" ? "正在加载" : "Loading"}>
                <span /><span /><span />
              </div>
            ) : null}
            {!isLoading && items.length === 0 && !error ? (
              <div className="admin-table__message admin-table__empty">
                <strong>{locale === "zh" ? "这里还是空的" : "Nothing here yet"}</strong>
                <span>{locale === "zh" ? "使用右侧表单创建第一项。" : "Use the form to create the first item."}</span>
              </div>
            ) : null}
            {!isLoading ? items.map((item) => (
              <div className="admin-list__item" key={item.id}>
                <div className="admin-row__main">
                  <strong>{item.name}</strong>
                  <span className="admin-row__slug">{item.slug}</span>
                </div>
                <button className="secondary-button" type="button" aria-pressed={editingId === item.id} onClick={() => startEdit(item)}>
                  {locale === "zh" ? "编辑" : "Edit"}
                </button>
                <button className="danger-button" type="button" onClick={() => void handleDelete(item)}>
                  {locale === "zh" ? "删除" : "Delete"}
                </button>
              </div>
            )) : null}
          </div>
        </div>

        <aside className="admin-side-panel">
          <div className="admin-side-panel__heading">
            <h2>{editingId ? (locale === "zh" ? "编辑当前项目" : "Edit item") : locale === "zh" ? "新建项目" : "Create item"}</h2>
            <span>{editingId ? (locale === "zh" ? "编辑模式" : "Editing") : locale === "zh" ? "新增" : "New"}</span>
          </div>
          <form className="form-stack" onSubmit={handleSubmit}>
            <label>
              <span>Slug</span>
              <input value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="writing-notes" required />
              <small>{locale === "zh" ? "用于 URL，只使用小写字母、数字和连字符。" : "Used in URLs. Prefer lowercase letters, numbers, and hyphens."}</small>
            </label>
            <label>
              <span>{locale === "zh" ? "名称" : "Name"}</span>
              <input value={name} onChange={(event) => setName(event.target.value)} required />
            </label>
            {error ? <p className="error-text" role="alert">{error}</p> : null}
            {successMessage ? <p className="success-text" role="status">{successMessage}</p> : null}
            <button className="primary-button" type="submit" disabled={isSaving}>
              {isSaving ? (locale === "zh" ? "保存中..." : "Saving...") : locale === "zh" ? "保存" : "Save"}
            </button>
            {editingId ? (
              <button className="secondary-button" type="button" onClick={resetForm}>
                {locale === "zh" ? "取消" : "Cancel"}
              </button>
            ) : null}
          </form>
        </aside>
      </div>
    </section>
  );
}
