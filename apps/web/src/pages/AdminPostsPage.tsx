import type { Locale, PostStatus, PublicPost } from "@tworiver/shared";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { bulkUpdateAdminPosts, deleteAdminPost, fetchAdminPosts, updateAdminPostLifecycle } from "../api/admin";
import { getTaxonomyDisplayName, getTaxonomySearchText } from "../utils/taxonomy";

interface AdminPostsPageProps {
  locale: Locale;
}

type StatusFilter = "all" | PostStatus;
type BulkAction = "archive" | "trash";

const PAGE_SIZE = 8;

function hasLocale(post: PublicPost, locale: Locale): boolean {
  return post.translations.some((translation) => translation.locale === locale);
}

function getPostTitle(post: PublicPost, locale: Locale): string {
  return (
    post.translations.find((translation) => translation.locale === locale)?.title ??
    post.translations.find((translation) => translation.locale === "zh")?.title ??
    post.translations[0]?.title ??
    post.slug
  );
}

function getPostSummary(post: PublicPost, locale: Locale): string {
  return (
    post.translations.find((translation) => translation.locale === locale)?.summary ??
    post.translations.find((translation) => translation.locale === "zh")?.summary ??
    post.translations[0]?.summary ??
    ""
  );
}

function getPostContent(post: PublicPost, locale: Locale): string {
  return (
    post.translations.find((translation) => translation.locale === locale)?.contentMarkdown ??
    post.translations.find((translation) => translation.locale === "zh")?.contentMarkdown ??
    post.translations[0]?.contentMarkdown ??
    ""
  );
}

function getStatusLabel(status: PostStatus, locale: Locale): string {
  const labels: Record<PostStatus, { zh: string; en: string }> = {
    archived: { zh: "已归档", en: "Archived" },
    draft: { zh: "草稿", en: "Draft" },
    hidden: { zh: "已隐藏", en: "Hidden" },
    published: { zh: "已发布", en: "Published" }
  };
  return labels[status][locale];
}

function formatDate(value: string | null, locale: Locale): string {
  if (!value) {
    return locale === "zh" ? "未发布" : "Unpublished";
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric"
  }).format(new Date(value));
}

function getCategoryOptions(posts: PublicPost[], locale: Locale): Array<{ slug: string; name: string }> {
  const categoriesBySlug = new Map<string, string>();
  for (const post of posts) {
    if (post.category) {
      categoriesBySlug.set(post.category.slug, getTaxonomyDisplayName(post.category, locale));
    }
  }

  return Array.from(categoriesBySlug.entries())
    .map(([slug, name]) => ({ slug, name }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function AdminPostsPage({ locale }: AdminPostsPageProps) {
  const [posts, setPosts] = useState<PublicPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [previewPost, setPreviewPost] = useState<PublicPost | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    async function loadPosts() {
      setIsLoading(true);
      setError(null);

      try {
        const { posts: nextPosts } = await fetchAdminPosts({ signal: controller.signal });
        if (isMounted) {
          setPosts(nextPosts);
        }
      } catch (caught) {
        if (isMounted && !controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : "Failed to load admin posts");
        }
      } finally {
        if (isMounted && !controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadPosts();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [reloadKey]);

  const categoryOptions = useMemo(() => getCategoryOptions(posts, locale), [locale, posts]);
  const statusCounts = useMemo(
    () =>
      posts.reduce(
        (counts, post) => {
          counts[post.status] += 1;
          return counts;
        },
        { archived: 0, draft: 0, hidden: 0, published: 0 }
      ),
    [posts]
  );

  const filteredPosts = useMemo(
    () =>
      posts.filter((post) => {
        const normalizedQuery = query.trim().toLocaleLowerCase();
        if (normalizedQuery) {
          const searchableText = [
            post.slug,
            ...post.translations.flatMap((translation) => [translation.title, translation.summary]),
            post.category ? getTaxonomySearchText(post.category, locale) : "",
            ...post.tags.map((tag) => getTaxonomySearchText(tag, locale))
          ]
            .filter(Boolean)
            .join(" ")
            .toLocaleLowerCase();
          if (!searchableText.includes(normalizedQuery)) {
            return false;
          }
        }
        if (statusFilter !== "all" && post.status !== statusFilter) {
          return false;
        }
        if (categoryFilter !== "all" && post.category?.slug !== categoryFilter) {
          return false;
        }
        return true;
      }),
    [categoryFilter, posts, query, statusFilter]
  );

  const totalPages = Math.max(1, Math.ceil(filteredPosts.length / PAGE_SIZE));
  const currentPosts = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredPosts.slice(start, start + PAGE_SIZE);
  }, [currentPage, filteredPosts]);
  const hasActiveFilters = query.trim() !== "" || statusFilter !== "all" || categoryFilter !== "all";

  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds([]);
  }, [categoryFilter, query, statusFilter]);

  function clearFilters() {
    setQuery("");
    setStatusFilter("all");
    setCategoryFilter("all");
  }

  function togglePostSelection(id: number, checked: boolean) {
    setSelectedIds((current) => (checked ? [...new Set([...current, id])] : current.filter((selectedId) => selectedId !== id)));
  }

  function toggleCurrentPageSelection(checked: boolean) {
    setSelectedIds((current) => {
      const currentIds = currentPosts.map((post) => post.id);
      if (checked) {
        return Array.from(new Set([...current, ...currentIds]));
      }
      return current.filter((id) => !currentIds.includes(id));
    });
  }

  async function runBulkAction(action: BulkAction) {
    if (selectedIds.length === 0) {
      return;
    }

    const confirmMessage =
      action === "archive"
        ? locale === "zh"
          ? `确定要批量归档这 ${selectedIds.length} 篇文章吗？`
          : `Archive ${selectedIds.length} selected posts?`
        : locale === "zh"
          ? `确定要将这 ${selectedIds.length} 篇文章移入回收站吗？`
          : `Move ${selectedIds.length} selected posts to trash?`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      const { updated } = await bulkUpdateAdminPosts({ ids: selectedIds, action });
      setActionMessage(locale === "zh" ? `已更新 ${updated} 篇文章。` : `${updated} posts updated.`);
      setSelectedIds([]);
      setReloadKey((current) => current + 1);
    } catch (caught) {
      setActionMessage(caught instanceof Error ? caught.message : "Bulk action failed");
    }
  }

  async function changePostStatus(post: PublicPost, status: PostStatus) {
    try {
      await updateAdminPostLifecycle(post.id, { status });
      setActionMessage(locale === "zh" ? "文章状态已更新。" : "Post status updated.");
      setReloadKey((current) => current + 1);
    } catch (caught) {
      setActionMessage(caught instanceof Error ? caught.message : "Status update failed");
    }
  }

  async function movePostToTrash(post: PublicPost) {
    const confirmed = window.confirm(
      locale === "zh" ? `确定要将《${getPostTitle(post, locale)}》移入回收站吗？` : `Move "${getPostTitle(post, locale)}" to trash?`
    );
    if (!confirmed) {
      return;
    }

    try {
      await deleteAdminPost(post.id);
      setActionMessage(locale === "zh" ? "文章已移入回收站。" : "Post moved to trash.");
      setSelectedIds((current) => current.filter((id) => id !== post.id));
      setReloadKey((current) => current + 1);
    } catch (caught) {
      setActionMessage(caught instanceof Error ? caught.message : "Delete failed");
    }
  }

  const allCurrentSelected = currentPosts.length > 0 && currentPosts.every((post) => selectedIds.includes(post.id));

  return (
    <section className="admin-workspace admin-posts-console">
      <header className="admin-page-header">
        <div className="admin-page-title">
          <h1>{locale === "zh" ? "文章列表" : "Post list"}</h1>
          <p>
            {locale === "zh"
              ? "检索、筛选、预览和批量管理公开站点中的文章。删除会先进入回收站，便于后续恢复。"
              : "Search, filter, preview, and bulk-manage public site posts. Deletes move posts to trash first."}
          </p>
        </div>
        <div className="admin-page-actions">
          <Link className="secondary-button" to="/admin/posts/drafts">{locale === "zh" ? "草稿箱" : "Drafts"}</Link>
          <Link className="primary-button" to="/admin/posts/new"><span aria-hidden="true">+</span>{locale === "zh" ? "新建文章" : "New post"}</Link>
        </div>
      </header>

      <div className="admin-metrics admin-post-metrics" aria-label={locale === "zh" ? "文章统计" : "Post metrics"}>
        <div className="admin-metric"><span>{locale === "zh" ? "总数" : "Total"}</span><strong>{posts.length}</strong></div>
        <div className="admin-metric admin-metric--published"><span>{locale === "zh" ? "已发布" : "Published"}</span><strong>{statusCounts.published}</strong></div>
        <div className="admin-metric admin-metric--draft"><span>{locale === "zh" ? "草稿" : "Drafts"}</span><strong>{statusCounts.draft}</strong></div>
        <div className="admin-metric admin-metric--hidden"><span>{locale === "zh" ? "归档/隐藏" : "Archived/Hidden"}</span><strong>{statusCounts.archived + statusCounts.hidden}</strong></div>
      </div>

      <div className="admin-post-toolbar">
        <label className="admin-search-field">
          <span>{locale === "zh" ? "搜索" : "Search"}</span>
          <input
            type="search"
            value={query}
            placeholder={locale === "zh" ? "搜索标题、摘要、slug、分类或标签" : "Search title, summary, slug, category, or tag"}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label>
          <span>{locale === "zh" ? "状态" : "Status"}</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
            <option value="all">{locale === "zh" ? "所有状态" : "All statuses"}</option>
            <option value="published">{locale === "zh" ? "已发布" : "Published"}</option>
            <option value="draft">{locale === "zh" ? "草稿" : "Draft"}</option>
            <option value="archived">{locale === "zh" ? "已归档" : "Archived"}</option>
            <option value="hidden">{locale === "zh" ? "已隐藏" : "Hidden"}</option>
          </select>
        </label>
        <label>
          <span>{locale === "zh" ? "分类" : "Category"}</span>
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="all">{locale === "zh" ? "所有分类" : "All categories"}</option>
            {categoryOptions.map((category) => <option key={category.slug} value={category.slug}>{category.name}</option>)}
          </select>
        </label>
        <button className="secondary-button admin-filter-clear" type="button" disabled={!hasActiveFilters} onClick={clearFilters}>
          {locale === "zh" ? "清除筛选" : "Clear"}
        </button>
      </div>

      {actionMessage ? <p className="admin-action-banner" role="status">{actionMessage}</p> : null}

      <div className="admin-board__main">
        <div className="admin-section-head">
          <h2>{locale === "zh" ? "文章库" : "Library"}</h2>
          <span>{locale === "zh" ? `显示 ${filteredPosts.length} / ${posts.length} 篇` : `Showing ${filteredPosts.length} of ${posts.length}`}</span>
        </div>

        {selectedIds.length > 0 ? (
          <div className="admin-bulk-bar">
            <span>{locale === "zh" ? `已选 ${selectedIds.length} 项` : `${selectedIds.length} selected`}</span>
            <button type="button" onClick={() => void runBulkAction("archive")}>{locale === "zh" ? "批量归档" : "Archive"}</button>
            <button type="button" onClick={() => void runBulkAction("trash")}>{locale === "zh" ? "批量移入回收站" : "Move to trash"}</button>
            <button type="button" onClick={() => setSelectedIds([])}>{locale === "zh" ? "取消选择" : "Clear selection"}</button>
          </div>
        ) : null}

        <div className="admin-table admin-post-table" aria-label={locale === "zh" ? "后台文章列表" : "Admin posts"}>
          <div className="admin-post-table__head">
            <span>
              <input
                type="checkbox"
                checked={allCurrentSelected}
                onChange={(event) => toggleCurrentPageSelection(event.target.checked)}
                aria-label={locale === "zh" ? "选择当前页文章" : "Select current page posts"}
              />
            </span>
            <span>{locale === "zh" ? "文章标题" : "Title"}</span>
            <span>{locale === "zh" ? "分类" : "Category"}</span>
            <span>{locale === "zh" ? "标签" : "Tags"}</span>
            <span>{locale === "zh" ? "状态" : "Status"}</span>
            <span>{locale === "zh" ? "语言" : "Locales"}</span>
            <span>{locale === "zh" ? "更新时间" : "Updated"}</span>
            <span>{locale === "zh" ? "操作管理" : "Actions"}</span>
          </div>

          {isLoading ? (
            <div className="admin-loading-list" role="status" aria-label={locale === "zh" ? "正在加载文章" : "Loading posts"}>
              <span /><span /><span /><span />
            </div>
          ) : null}

          {error ? (
            <div className="admin-table__message" role="alert">
              <strong>{locale === "zh" ? "文章加载失败" : "Could not load posts"}</strong>
              <span>{error}</span>
              <button className="secondary-button" type="button" onClick={() => setReloadKey((current) => current + 1)}>{locale === "zh" ? "重试" : "Retry"}</button>
            </div>
          ) : null}

          {!isLoading && !error && posts.length === 0 ? (
            <div className="admin-table__message admin-table__empty">
              <strong>{locale === "zh" ? "还没有文章" : "No posts yet"}</strong>
              <span>{locale === "zh" ? "从第一篇草稿开始建立内容库。" : "Start the library with your first draft."}</span>
              <Link className="primary-button" to="/admin/posts/new">{locale === "zh" ? "新建文章" : "New post"}</Link>
            </div>
          ) : null}

          {!isLoading && !error && posts.length > 0 && filteredPosts.length === 0 ? (
            <div className="admin-table__message admin-table__empty">
              <strong>{locale === "zh" ? "没有匹配的文章" : "No matching posts"}</strong>
              <span>{locale === "zh" ? "尝试调整搜索词或清除筛选条件。" : "Try another search or clear the current filters."}</span>
              <button className="secondary-button" type="button" onClick={clearFilters}>{locale === "zh" ? "清除筛选" : "Clear filters"}</button>
            </div>
          ) : null}

          {!isLoading && !error ? currentPosts.map((post) => {
            const hasZh = hasLocale(post, "zh");
            const hasEn = hasLocale(post, "en");

            return (
              <div className={`admin-post-table__row${selectedIds.includes(post.id) ? " is-selected" : ""}`} key={post.id}>
                <label className="admin-post-table__select" aria-label={locale === "zh" ? `选择 ${getPostTitle(post, locale)}` : `Select ${getPostTitle(post, locale)}`}>
                  <input type="checkbox" checked={selectedIds.includes(post.id)} onChange={(event) => togglePostSelection(post.id, event.target.checked)} />
                </label>
                <div className="admin-post-title-cell">
                  <span>
                    {post.isPinned ? <i>{locale === "zh" ? "置顶" : "Pinned"}</i> : null}
                    {post.isFeatured ? <i>{locale === "zh" ? "精选" : "Featured"}</i> : null}
                  </span>
                  <button type="button" onClick={() => setPreviewPost(post)}>{getPostTitle(post, locale)}</button>
                  <small>{getPostSummary(post, locale) || post.slug}</small>
                </div>
                <span className="admin-post-category">{post.category ? getTaxonomyDisplayName(post.category, locale) : locale === "zh" ? "无分类" : "Uncategorized"}</span>
                <span className="admin-row__tags">{post.tags.slice(0, 3).map((tag) => getTaxonomyDisplayName(tag, locale)).join(" / ") || (locale === "zh" ? "无标签" : "No tags")}</span>
                <span className={`status-pill status-pill--${post.status}`}>{getStatusLabel(post.status, locale)}</span>
                <span className="locale-coverage">
                  <span className={hasZh ? "is-ready" : undefined}><i aria-hidden="true" />ZH</span>
                  <span className={hasEn ? "is-ready" : undefined}><i aria-hidden="true" />EN</span>
                </span>
                <span className="admin-row__date">{formatDate(post.updatedAt, locale)}</span>
                <span className="admin-post-actions">
                  <button type="button" onClick={() => setPreviewPost(post)}>{locale === "zh" ? "预览" : "Preview"}</button>
                  <Link to={`/admin/posts/${post.id}`}>{locale === "zh" ? "编辑" : "Edit"}</Link>
                  {post.status === "published" ? (
                    <button type="button" onClick={() => void changePostStatus(post, "archived")}>{locale === "zh" ? "归档" : "Archive"}</button>
                  ) : (
                    <button type="button" onClick={() => void changePostStatus(post, "published")}>{locale === "zh" ? "发布" : "Publish"}</button>
                  )}
                  <button type="button" className="is-danger" onClick={() => void movePostToTrash(post)}>{locale === "zh" ? "删除" : "Delete"}</button>
                </span>
              </div>
            );
          }) : null}
        </div>

        {!isLoading && !error && filteredPosts.length > 0 ? (
          <div className="admin-pagination">
            <button type="button" disabled={currentPage === 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>{locale === "zh" ? "上一页" : "Previous"}</button>
            <span>{locale === "zh" ? `第 ${currentPage} / ${totalPages} 页` : `Page ${currentPage} of ${totalPages}`}</span>
            <button type="button" disabled={currentPage === totalPages} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}>{locale === "zh" ? "下一页" : "Next"}</button>
          </div>
        ) : null}
      </div>

      {previewPost ? (
        <div className="admin-modal-backdrop" role="presentation" onMouseDown={() => setPreviewPost(null)}>
          <section className="admin-preview-modal" role="dialog" aria-modal="true" aria-labelledby="admin-preview-title" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span className={`status-pill status-pill--${previewPost.status}`}>{getStatusLabel(previewPost.status, locale)}</span>
                <h2 id="admin-preview-title">{getPostTitle(previewPost, locale)}</h2>
              </div>
              <button type="button" onClick={() => setPreviewPost(null)} aria-label={locale === "zh" ? "关闭预览" : "Close preview"}>×</button>
            </header>
            <dl>
              <div><dt>{locale === "zh" ? "发布时间" : "Published"}</dt><dd>{formatDate(previewPost.publishedAt, locale)}</dd></div>
              <div><dt>{locale === "zh" ? "分类" : "Category"}</dt><dd>{previewPost.category ? getTaxonomyDisplayName(previewPost.category, locale) : locale === "zh" ? "无分类" : "Uncategorized"}</dd></div>
              <div><dt>{locale === "zh" ? "slug" : "Slug"}</dt><dd>{previewPost.slug}</dd></div>
            </dl>
            <div className="admin-preview-modal__summary">
              <strong>{locale === "zh" ? "摘要" : "Summary"}</strong>
              <p>{getPostSummary(previewPost, locale) || (locale === "zh" ? "暂无摘要" : "No summary")}</p>
            </div>
            <pre>{getPostContent(previewPost, locale) || (locale === "zh" ? "暂无正文内容" : "No body content")}</pre>
            <footer>
              <Link className="primary-button" to={`/admin/posts/${previewPost.id}`}>{locale === "zh" ? "编辑文章" : "Edit post"}</Link>
              <button className="secondary-button" type="button" onClick={() => setPreviewPost(null)}>{locale === "zh" ? "完成阅读" : "Close"}</button>
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}
