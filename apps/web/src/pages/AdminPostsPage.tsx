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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");

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

  const categories = useMemo(() => collectCategories(posts), [posts]);
  const tags = useMemo(() => collectTags(posts), [posts]);

  const filteredPosts = useMemo(
    () =>
      posts.filter((post) => {
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
    [categoryFilter, posts, statusFilter, tagFilter]
  );

  const publishedCount = posts.filter((post) => post.status === "published").length;
  const draftCount = posts.filter((post) => post.status === "draft").length;
  const hiddenCount = posts.filter((post) => post.status === "hidden").length;

  return (
    <section className="admin-workspace">
      <div className="admin-hero">
        <div>
          <p className="admin-kicker">Private console</p>
          <h1>{locale === "zh" ? "发布控制台" : "Publishing console"}</h1>
          <p>
            {locale === "zh"
              ? "按状态、分类和标签筛选文章，快速定位需要编辑、发布、下架或检查的内容。"
              : "Filter by status, category, and tags to find the posts that need attention."}
          </p>
        </div>
        <div className="admin-hero__actions">
          <Link className="primary-button" to="/admin/posts/new">
            {locale === "zh" ? "新建文章" : "New post"}
          </Link>
          <Link className="secondary-button" to="/admin/categories">
            {locale === "zh" ? "分类管理" : "Categories"}
          </Link>
          <Link className="secondary-button" to="/admin/tags">
            {locale === "zh" ? "标签管理" : "Tags"}
          </Link>
          <Link className="secondary-button" to="/admin/about">
            {locale === "zh" ? "关于页" : "About"}
          </Link>
        </div>
      </div>

      <div className="admin-metrics" aria-label="Post metrics">
        <div>
          <span>{locale === "zh" ? "总数" : "Total"}</span>
          <strong>{posts.length}</strong>
        </div>
        <div>
          <span>{locale === "zh" ? "已发布" : "Published"}</span>
          <strong>{publishedCount}</strong>
        </div>
        <div>
          <span>{locale === "zh" ? "草稿" : "Drafts"}</span>
          <strong>{draftCount}</strong>
        </div>
        <div>
          <span>{locale === "zh" ? "隐藏/下架" : "Hidden"}</span>
          <strong>{hiddenCount}</strong>
        </div>
      </div>

      <div className="admin-filters" aria-label={locale === "zh" ? "文章筛选" : "Post filters"}>
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
      </div>

      {isLoading ? <p className="muted">Loading...</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
      {!isLoading && !error && posts.length === 0 ? <p className="muted">{locale === "zh" ? "暂无文章。" : "No posts yet."}</p> : null}

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
                <span className="admin-row__tags">
                  {[post.category?.name, ...post.tags.map((tag) => tag.name)].filter(Boolean).join(" / ") ||
                    (locale === "zh" ? "未分类" : "Uncategorized")}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
