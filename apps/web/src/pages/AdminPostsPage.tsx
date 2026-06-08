import type { Locale, PostStatus, PublicPost, Tag } from "@tworiver/shared";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchAdminPosts } from "../api/admin";

interface AdminPostsPageProps {
  locale: Locale;
}

type StatusFilter = "all" | PostStatus;
type DateFilter = "all" | "published" | "unpublished" | "recent" | "oldest";
type SortMode = "updated-desc" | "published-desc" | "published-asc" | "title-asc";

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

function getPostTime(post: PublicPost, mode: "published" | "updated"): number {
  const value = mode === "published" ? post.publishedAt : post.updatedAt;
  return value ? new Date(value).getTime() : 0;
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("updated-desc");

  useEffect(() => {
    let isMounted = true;

    async function loadPosts() {
      setIsLoading(true);
      setError(null);

      try {
        const { posts: nextPosts } = await fetchAdminPosts();
        if (isMounted) {
          setPosts(nextPosts);
        }
      } catch (caught) {
        if (isMounted) {
          setError(caught instanceof Error ? caught.message : "Failed to load admin posts");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadPosts();

    return () => {
      isMounted = false;
    };
  }, []);

  const tags = useMemo(() => collectTags(posts), [posts]);

  const filteredPosts = useMemo(() => {
    const now = Date.now();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;

    return posts
      .filter((post) => {
        if (statusFilter !== "all" && post.status !== statusFilter) {
          return false;
        }

        if (tagFilter !== "all" && !post.tags.some((tag) => tag.slug === tagFilter)) {
          return false;
        }

        if (dateFilter === "published" && !post.publishedAt) {
          return false;
        }
        if (dateFilter === "unpublished" && post.publishedAt) {
          return false;
        }
        if (dateFilter === "recent") {
          const time = getPostTime(post, "published") || getPostTime(post, "updated");
          if (!time || now - time > thirtyDays) {
            return false;
          }
        }

        return true;
      })
      .sort((left, right) => {
        if (sortMode === "published-desc") {
          return getPostTime(right, "published") - getPostTime(left, "published");
        }
        if (sortMode === "published-asc") {
          return getPostTime(left, "published") - getPostTime(right, "published");
        }
        if (sortMode === "title-asc") {
          return getPostTitle(left, locale).localeCompare(getPostTitle(right, locale));
        }

        return getPostTime(right, "updated") - getPostTime(left, "updated");
      });
  }, [dateFilter, locale, posts, sortMode, statusFilter, tagFilter]);

  const metrics = useMemo(() => {
    const published = posts.filter((post) => post.status === "published").length;
    const bilingual = posts.filter((post) => hasLocale(post, "zh") && hasLocale(post, "en")).length;

    return {
      total: posts.length,
      published,
      drafts: posts.length - published,
      bilingual,
      visible: filteredPosts.length
    };
  }, [filteredPosts.length, posts]);

  function clearFilters() {
    setStatusFilter("all");
    setDateFilter("all");
    setTagFilter("all");
    setSortMode("updated-desc");
  }

  return (
    <section className="admin-workspace">
      <div className="admin-hero">
        <div>
          <p className="admin-kicker">Private console</p>
          <h1>{locale === "zh" ? "发布控制台" : "Publishing console"}</h1>
          <p>
            {locale === "zh"
              ? "按状态、发布时间和分类标签筛选文章，快速定位需要编辑或发布的内容。"
              : "Filter by status, publish time, and tags to find the posts that need attention."}
          </p>
        </div>
        <div className="admin-hero__actions">
          <Link className="primary-button" to="/admin/posts/new">
            {locale === "zh" ? "新建文章" : "New post"}
          </Link>
          <Link className="secondary-button" to="/admin/about">
            {locale === "zh" ? "编辑关于页" : "Edit about"}
          </Link>
          <Link className="secondary-button" to="/">
            {locale === "zh" ? "查看网站" : "View site"}
          </Link>
        </div>
      </div>

      <div className="admin-metrics" aria-label="Post metrics">
        <div>
          <span>{locale === "zh" ? "总数" : "Total"}</span>
          <strong>{metrics.total}</strong>
        </div>
        <div>
          <span>{locale === "zh" ? "已发布" : "Published"}</span>
          <strong>{metrics.published}</strong>
        </div>
        <div>
          <span>{locale === "zh" ? "草稿" : "Drafts"}</span>
          <strong>{metrics.drafts}</strong>
        </div>
        <div>
          <span>{locale === "zh" ? "当前显示" : "Visible"}</span>
          <strong>{metrics.visible}</strong>
        </div>
      </div>

      <div className="admin-filters" aria-label={locale === "zh" ? "文章筛选" : "Post filters"}>
        <label>
          <span>{locale === "zh" ? "状态" : "Status"}</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
            <option value="all">{locale === "zh" ? "全部状态" : "All statuses"}</option>
            <option value="draft">{locale === "zh" ? "草稿" : "Draft"}</option>
            <option value="published">{locale === "zh" ? "已发布" : "Published"}</option>
          </select>
        </label>
        <label>
          <span>{locale === "zh" ? "发布时间" : "Publish time"}</span>
          <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value as DateFilter)}>
            <option value="all">{locale === "zh" ? "全部时间" : "All time"}</option>
            <option value="published">{locale === "zh" ? "已有发布时间" : "Has publish date"}</option>
            <option value="unpublished">{locale === "zh" ? "未设置发布时间" : "No publish date"}</option>
            <option value="recent">{locale === "zh" ? "最近 30 天" : "Last 30 days"}</option>
          </select>
        </label>
        <label>
          <span>{locale === "zh" ? "分类 / 标签" : "Category / tag"}</span>
          <select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}>
            <option value="all">{locale === "zh" ? "全部标签" : "All tags"}</option>
            {tags.map((tag) => (
              <option key={tag.slug} value={tag.slug}>
                {tag.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{locale === "zh" ? "排序" : "Sort"}</span>
          <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
            <option value="updated-desc">{locale === "zh" ? "最近更新" : "Recently updated"}</option>
            <option value="published-desc">{locale === "zh" ? "发布时间新到旧" : "Newest published"}</option>
            <option value="published-asc">{locale === "zh" ? "发布时间旧到新" : "Oldest published"}</option>
            <option value="title-asc">{locale === "zh" ? "标题 A-Z" : "Title A-Z"}</option>
          </select>
        </label>
        <button className="secondary-button" type="button" onClick={clearFilters}>
          {locale === "zh" ? "重置筛选" : "Reset filters"}
        </button>
      </div>

      {isLoading ? <p className="muted">Loading...</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
      {!isLoading && !error && posts.length === 0 ? <p className="muted">{locale === "zh" ? "暂无文章。" : "No posts yet."}</p> : null}

      <div className="admin-board">
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
            {!isLoading && !error && posts.length > 0 && filteredPosts.length === 0 ? (
              <p className="admin-table__empty">{locale === "zh" ? "没有符合当前筛选条件的文章。" : "No posts match the current filters."}</p>
            ) : null}
            {filteredPosts.map((post) => {
              const hasZh = hasLocale(post, "zh");
              const hasEn = hasLocale(post, "en");

              return (
                <Link className="admin-row" key={post.id} to={`/admin/posts/${post.id}`}>
                  <div className="admin-row__main">
                    <span className="admin-row__slug">{post.slug}</span>
                    <strong>{getPostTitle(post, locale)}</strong>
                    <span className="admin-row__date">{formatDate(post.publishedAt, locale)}</span>
                  </div>
                  <span className={`status-pill status-pill--${post.status}`}>{getStatusLabel(post.status, locale)}</span>
                  <span className="locale-coverage">
                    <span className={hasZh ? "is-ready" : undefined}>ZH</span>
                    <span className={hasEn ? "is-ready" : undefined}>EN</span>
                  </span>
                  <span className="admin-row__tags">{post.tags.map((tag) => tag.name).join(" / ") || (locale === "zh" ? "无标签" : "No tags")}</span>
                </Link>
              );
            })}
          </div>
        </div>

        <aside className="admin-side-panel">
          <h2>{locale === "zh" ? "筛选摘要" : "Filter summary"}</h2>
          <p>
            {locale === "zh"
              ? "当前项目没有独立分类字段，分类筛选暂时复用标签。后续如需分类，可在数据模型中单独扩展。"
              : "This project has no separate category field yet, so category filtering uses tags for now."}
          </p>
          <dl>
            <div>
              <dt>{locale === "zh" ? "待补双语" : "Needs bilingual"}</dt>
              <dd>{metrics.total - metrics.bilingual}</dd>
            </div>
            <div>
              <dt>{locale === "zh" ? "发布比例" : "Published ratio"}</dt>
              <dd>{metrics.total > 0 ? `${Math.round((metrics.published / metrics.total) * 100)}%` : "0%"}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </section>
  );
}
