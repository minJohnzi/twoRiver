import type { Category, Locale, PostStatus, PublicPost, Tag } from "@tworiver/shared";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchAdminPosts } from "../api/admin";

interface AdminPostsPageProps {
  locale: Locale;
}

type StatusFilter = "all" | PostStatus;

function hasLocale(post: PublicPost, locale: Locale): boolean {
  return post.translations.some((translation) => translation.locale === locale);
}

function getPostTitle(post: PublicPost, locale: Locale) {
  return (
    post.translations.find((translation) => translation.locale === locale)?.title ??
    post.translations.find((translation) => translation.locale === "zh")?.title ??
    post.translations[0]?.title ??
    post.slug
  );
}

function getStatusLabel(status: PostStatus, locale: Locale) {
  if (status === "published") {
    return locale === "zh" ? "已发布" : "Published";
  }
  if (status === "hidden") {
    return locale === "zh" ? "隐藏/下架" : "Hidden";
  }

  return locale === "zh" ? "草稿" : "Draft";
}

function formatDate(value: string | null, locale: Locale): string {
  if (!value) {
    return locale === "zh" ? "未发布" : "Unpublished";
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en", {
    month: "short",
    day: "2-digit",
    year: "numeric"
  }).format(new Date(value));
}

function collectCategories(posts: PublicPost[]): Category[] {
  const categoriesBySlug = new Map<string, Category>();
  for (const post of posts) {
    if (post.category) {
      categoriesBySlug.set(post.category.slug, post.category);
    }
  }

  return Array.from(categoriesBySlug.values()).sort((left, right) => left.name.localeCompare(right.name));
}

function collectTags(posts: PublicPost[]): Tag[] {
  const tagsBySlug = new Map<string, Tag>();
  for (const post of posts) {
    for (const tag of post.tags) {
      tagsBySlug.set(tag.slug, tag);
    }
  }

  return Array.from(tagsBySlug.values()).sort((left, right) => left.name.localeCompare(right.name));
}

export function AdminPostsPage({ locale }: AdminPostsPageProps) {
  const [posts, setPosts] = useState<PublicPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
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

  const categories = useMemo(() => collectCategories(posts), [posts]);
  const tags = useMemo(() => collectTags(posts), [posts]);

  const filteredPosts = useMemo(
    () =>
      posts.filter((post) => {
        const normalizedQuery = query.trim().toLocaleLowerCase();
        if (normalizedQuery) {
          const searchableText = [
            post.slug,
            ...post.translations.map((translation) => translation.title),
            post.category?.name,
            ...post.tags.map((tag) => tag.name)
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
        if (tagFilter !== "all" && !post.tags.some((tag) => tag.slug === tagFilter)) {
          return false;
        }
        return true;
      }),
    [categoryFilter, posts, query, statusFilter, tagFilter]
  );

  const statusCounts = useMemo(
    () =>
      posts.reduce(
        (counts, post) => {
          counts[post.status] += 1;
          return counts;
        },
        { draft: 0, hidden: 0, published: 0 }
      ),
    [posts]
  );

  const hasActiveFilters = query.trim() !== "" || statusFilter !== "all" || categoryFilter !== "all" || tagFilter !== "all";

  function clearFilters() {
    setQuery("");
    setStatusFilter("all");
    setCategoryFilter("all");
    setTagFilter("all");
  }

  return (
    <section className="admin-workspace">
      <header className="admin-page-header">
        <div className="admin-page-title">
          <h1>{locale === "zh" ? "发布控制台" : "Publishing console"}</h1>
          <p>
            {locale === "zh"
              ? "按状态、分类和标签筛选文章，快速定位需要编辑、发布、下架或检查的内容。"
              : "Filter by status, category, and tags to find the posts that need attention."}
          </p>
        </div>
        <div className="admin-page-actions">
          <Link className="primary-button" to="/admin/posts/new">
            <span aria-hidden="true">+</span>
            {locale === "zh" ? "新建文章" : "New post"}
          </Link>
        </div>
      </header>

      <div className="admin-metrics" aria-label="Post metrics">
        <div className="admin-metric">
          <span>{locale === "zh" ? "总数" : "Total"}</span>
          <strong>{posts.length}</strong>
        </div>
        <div className="admin-metric admin-metric--published">
          <span>{locale === "zh" ? "已发布" : "Published"}</span>
          <strong>{statusCounts.published}</strong>
        </div>
        <div className="admin-metric admin-metric--draft">
          <span>{locale === "zh" ? "草稿" : "Drafts"}</span>
          <strong>{statusCounts.draft}</strong>
        </div>
        <div className="admin-metric admin-metric--hidden">
          <span>{locale === "zh" ? "隐藏/下架" : "Hidden"}</span>
          <strong>{statusCounts.hidden}</strong>
        </div>
      </div>

      <div className="admin-filters" aria-label={locale === "zh" ? "文章筛选" : "Post filters"}>
        <label className="admin-search-field">
          <span>{locale === "zh" ? "搜索" : "Search"}</span>
          <input
            type="search"
            value={query}
            placeholder={locale === "zh" ? "搜索标题、slug、分类或标签" : "Search title, slug, category, or tag"}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label>
          <span>{locale === "zh" ? "状态" : "Status"}</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
            <option value="all">{locale === "zh" ? "全部状态" : "All statuses"}</option>
            <option value="draft">{locale === "zh" ? "草稿" : "Draft"}</option>
            <option value="published">{locale === "zh" ? "已发布" : "Published"}</option>
            <option value="hidden">{locale === "zh" ? "隐藏/下架" : "Hidden"}</option>
          </select>
        </label>
        <label>
          <span>{locale === "zh" ? "分类" : "Category"}</span>
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="all">{locale === "zh" ? "全部分类" : "All categories"}</option>
            {categories.map((category) => (
              <option key={category.slug} value={category.slug}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{locale === "zh" ? "标签" : "Tag"}</span>
          <select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}>
            <option value="all">{locale === "zh" ? "全部标签" : "All tags"}</option>
            {tags.map((tag) => (
              <option key={tag.slug} value={tag.slug}>
                {tag.name}
              </option>
            ))}
          </select>
        </label>
        <button className="secondary-button admin-filter-clear" type="button" disabled={!hasActiveFilters} onClick={clearFilters}>
          {locale === "zh" ? "清除筛选" : "Clear"}
        </button>
      </div>

      <div className="admin-board__main">
        <div className="admin-section-head">
          <h2>{locale === "zh" ? "文章库" : "Library"}</h2>
          <span>
            {locale === "zh"
              ? `显示 ${filteredPosts.length} / ${posts.length} 篇`
              : `Showing ${filteredPosts.length} of ${posts.length}`}
          </span>
        </div>
        <div className="admin-table" aria-label="Admin posts">
          <div className="admin-table__head" aria-hidden="true">
            <span>{locale === "zh" ? "文章" : "Post"}</span>
            <span>{locale === "zh" ? "状态" : "Status"}</span>
            <span>{locale === "zh" ? "语言" : "Locales"}</span>
            <span>{locale === "zh" ? "分类 / 标签" : "Category / Tags"}</span>
            <span>{locale === "zh" ? "更新" : "Updated"}</span>
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
              <button className="secondary-button" type="button" onClick={() => setReloadKey((current) => current + 1)}>
                {locale === "zh" ? "重试" : "Retry"}
              </button>
            </div>
          ) : null}
          {!isLoading && !error && posts.length === 0 ? (
            <div className="admin-table__message admin-table__empty">
              <strong>{locale === "zh" ? "还没有文章" : "No posts yet"}</strong>
              <span>{locale === "zh" ? "从第一篇草稿开始建立你的内容库。" : "Start the library with your first draft."}</span>
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
          {!isLoading && !error ? filteredPosts.map((post) => {
            const hasZh = hasLocale(post, "zh");
            const hasEn = hasLocale(post, "en");

            return (
              <Link className="admin-row" key={post.id} to={`/admin/posts/${post.id}`}>
                <div className="admin-row__main">
                  <strong>{getPostTitle(post, locale)}</strong>
                  <span className="admin-row__slug">{post.slug}</span>
                </div>
                <span className={`status-pill status-pill--${post.status}`}>{getStatusLabel(post.status, locale)}</span>
                <span className="locale-coverage">
                  <span className={hasZh ? "is-ready" : undefined}><i aria-hidden="true" />ZH</span>
                  <span className={hasEn ? "is-ready" : undefined}><i aria-hidden="true" />EN</span>
                </span>
                <span className="admin-row__tags">
                  {[post.category?.name, ...post.tags.map((tag) => tag.name)].filter(Boolean).join(" / ") ||
                    (locale === "zh" ? "未分类" : "Uncategorized")}
                </span>
                <span className="admin-row__date">{formatDate(post.updatedAt, locale)}</span>
                <span className="admin-row__chevron" aria-hidden="true">›</span>
              </Link>
            );
          }) : null}
        </div>
      </div>
    </section>
  );
}
