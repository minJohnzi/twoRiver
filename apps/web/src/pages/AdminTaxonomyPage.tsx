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
  const [error, setError] = useState<string | null>(null);
  const isCategory = kind === "categories";
  const title = isCategory ? (locale === "zh" ? "分类管理" : "Category management") : locale === "zh" ? "标签管理" : "Tag management";

  async function loadItems() {
    if (isCategory) {
      const response = await fetchAdminCategories();
      setItems(response.categories);
      return;
    }

    const response = await fetchAdminTags();
    setItems(response.tags);
  }

  useEffect(() => {
    setEditingId(null);
    setSlug("");
    setName("");
    setError(null);
    void loadItems().catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : "Failed to load taxonomy");
    });
  }, [kind]);

  function startEdit(item: TaxonomyItem) {
    setEditingId(item.id);
    setSlug(item.slug);
    setName(item.name);
  }

  function resetForm() {
    setEditingId(null);
    setSlug("");
    setName("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to save taxonomy");
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
      <div className="admin-hero">
        <div>
          <p className="admin-kicker">Private console</p>
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
      </div>

      <div className="admin-board">
        <div className="admin-board__main">
          <div className="admin-section-head">
            <h2>{locale === "zh" ? "列表" : "List"}</h2>
            <span>{items.length}</span>
          </div>
          <div className="admin-table">
            {items.map((item) => (
              <div className="admin-list__item" key={item.id}>
                <div className="admin-row__main">
                  <strong>{item.name}</strong>
                  <span className="admin-row__slug">{item.slug}</span>
                </div>
                <button className="secondary-button" type="button" onClick={() => startEdit(item)}>
                  {locale === "zh" ? "编辑" : "Edit"}
                </button>
                <button className="secondary-button" type="button" onClick={() => void handleDelete(item)}>
                  {locale === "zh" ? "删除" : "Delete"}
                </button>
              </div>
            ))}
          </div>
        </div>

        <aside className="admin-side-panel">
          <h2>{editingId ? (locale === "zh" ? "编辑" : "Edit") : locale === "zh" ? "新建" : "Create"}</h2>
          <form className="form-stack" onSubmit={handleSubmit}>
            <label>
              <span>Slug</span>
              <input value={slug} onChange={(event) => setSlug(event.target.value)} required />
            </label>
            <label>
              <span>{locale === "zh" ? "名称" : "Name"}</span>
              <input value={name} onChange={(event) => setName(event.target.value)} required />
            </label>
            {error ? <p className="error-text">{error}</p> : null}
            <button className="primary-button" type="submit">
              {locale === "zh" ? "保存" : "Save"}
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
