import type { Category, Locale, PostStatus, PublicPost, Tag } from "@tworiver/shared";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchAdminCategories, fetchAdminPosts, fetchAdminResources, fetchAdminTags, type AdminResource } from "../api/admin";
import { getTaxonomyDisplayName } from "../utils/taxonomy";

interface AdminDashboardPageProps {
  locale: Locale;
}

interface DashboardData {
  categories: Category[];
  posts: PublicPost[];
  resources: AdminResource[];
  tags: Tag[];
}

interface TrendPoint {
  label: string;
  value: number;
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) {
    return `${kilobytes.toFixed(kilobytes >= 10 ? 0 : 1)} KB`;
  }

  const megabytes = kilobytes / 1024;
  return `${megabytes.toFixed(megabytes >= 10 ? 1 : 2)} MB`;
}

function countByStatus(posts: PublicPost[]) {
  return posts.reduce(
    (counts, post) => {
      counts[post.status] += 1;
      return counts;
    },
    { archived: 0, draft: 0, hidden: 0, published: 0 }
  );
}

function buildUpdateTrend(posts: PublicPost[], locale: Locale): TrendPoint[] {
  const formatter = new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en", { month: "2-digit", day: "2-digit" });
  const points = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    return {
      key: date.toISOString().slice(0, 10),
      label: formatter.format(date),
      value: 0
    };
  });
  const counts = new Map(points.map((point) => [point.key, point]));

  for (const post of posts) {
    const key = new Date(post.updatedAt).toISOString().slice(0, 10);
    const point = counts.get(key);
    if (point) {
      point.value += 1;
    }
  }

  return points;
}

function buildCategoryStats(posts: PublicPost[], locale: Locale) {
  const counts = new Map<string, number>();
  for (const post of posts) {
    const name = post.category ? getTaxonomyDisplayName(post.category, locale) : locale === "zh" ? "未分类" : "Uncategorized";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([name, value]) => ({
      name,
      value,
      percent: posts.length === 0 ? 0 : Math.round((value / posts.length) * 100)
    }));
}

export function AdminDashboardPage({ locale }: AdminDashboardPageProps) {
  const [data, setData] = useState<DashboardData>({ categories: [], posts: [], resources: [], tags: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadDashboard() {
      setIsLoading(true);
      setError(null);

      try {
        const [postsResponse, categoriesResponse, tagsResponse, resourcesResponse] = await Promise.all([
          fetchAdminPosts({ signal: controller.signal }),
          fetchAdminCategories({ signal: controller.signal }),
          fetchAdminTags({ signal: controller.signal }),
          fetchAdminResources({ signal: controller.signal })
        ]);

        if (!controller.signal.aborted) {
          setData({
            posts: postsResponse.posts,
            categories: categoriesResponse.categories,
            tags: tagsResponse.tags,
            resources: resourcesResponse.resources
          });
        }
      } catch (caught) {
        if (!controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : "Failed to load dashboard");
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => controller.abort();
  }, []);

  const statusCounts = useMemo(() => countByStatus(data.posts), [data.posts]);
  const recentPosts = useMemo(
    () =>
      [...data.posts]
        .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
        .slice(0, 4),
    [data.posts]
  );
  const resourceBytes = useMemo(() => data.resources.reduce((sum, resource) => sum + resource.sizeBytes, 0), [data.resources]);
  const trend = useMemo(() => buildUpdateTrend(data.posts, locale), [data.posts, locale]);
  const maxTrendValue = Math.max(1, ...trend.map((point) => point.value));
  const categoryStats = useMemo(() => buildCategoryStats(data.posts, locale), [data.posts, locale]);
  const completionScore =
    data.posts.length === 0
      ? 0
      : Math.round(((statusCounts.published + Math.min(statusCounts.draft, 3) * 0.35) / data.posts.length) * 100);

  return (
    <section className="admin-workspace admin-dashboard admin-dashboard--template">
      <header className="admin-page-header">
        <div className="admin-page-title">
          <h1>{locale === "zh" ? "仪表盘" : "Dashboard"}</h1>
          <p>
            {locale === "zh"
              ? "聚合真实后台数据，快速查看内容、草稿、资源和近期更新状态。"
              : "A real-data overview of content, drafts, resources, and recent editorial activity."}
          </p>
        </div>
        <div className="admin-page-actions">
          <Link className="primary-button" to="/admin/posts/new">
            <span aria-hidden="true">+</span>
            {locale === "zh" ? "新建文章" : "New post"}
          </Link>
          <Link className="secondary-button" to="/admin/posts/drafts">
            {locale === "zh" ? "查看草稿" : "Drafts"}
          </Link>
        </div>
      </header>

      {error ? (
        <div className="admin-table__message" role="alert">
          <strong>{locale === "zh" ? "仪表盘加载失败" : "Dashboard failed to load"}</strong>
          <span>{error}</span>
        </div>
      ) : null}

      <div className="admin-dashboard-metrics" aria-label={locale === "zh" ? "后台统计" : "Admin metrics"}>
        <div className="admin-dashboard-metric">
          <span>{locale === "zh" ? "发布文章" : "Published posts"}</span>
          <strong>{isLoading ? "--" : statusCounts.published}</strong>
          <small>{locale === "zh" ? `共 ${data.posts.length} 篇内容` : `${data.posts.length} total`}</small>
        </div>
        <div className="admin-dashboard-metric">
          <span>{locale === "zh" ? "草稿篇数" : "Drafts"}</span>
          <strong>{isLoading ? "--" : statusCounts.draft}</strong>
          <small>{locale === "zh" ? "待继续创作" : "Ready to continue"}</small>
        </div>
        <div className="admin-dashboard-metric">
          <span>{locale === "zh" ? "分类数量" : "Categories"}</span>
          <strong>{isLoading ? "--" : data.categories.length}</strong>
          <small>{locale === "zh" ? "内容组织结构" : "Content taxonomy"}</small>
        </div>
        <div className="admin-dashboard-metric">
          <span>{locale === "zh" ? "标签总数" : "Tags"}</span>
          <strong>{isLoading ? "--" : data.tags.length}</strong>
          <small>{locale === "zh" ? "检索与关联" : "Discovery labels"}</small>
        </div>
        <div className="admin-dashboard-metric">
          <span>{locale === "zh" ? "资源文件" : "Resources"}</span>
          <strong>{isLoading ? "--" : data.resources.length}</strong>
          <small>{isLoading ? "--" : formatBytes(resourceBytes)}</small>
        </div>
      </div>

      <div className="admin-dashboard-grid">
        <section className="admin-dashboard-panel admin-dashboard-panel--wide">
          <div className="admin-section-head">
            <div>
              <h2>{locale === "zh" ? "过去 7 天内容更新趋势" : "7-day content update trend"}</h2>
              <span>{locale === "zh" ? "按文章更新时间统计" : "Based on post updated time"}</span>
            </div>
          </div>
          <div className="admin-trend-chart" aria-label={locale === "zh" ? "过去 7 天内容更新趋势" : "7-day content update trend"}>
            {trend.map((point) => (
              <div className="admin-trend-chart__bar" key={point.label}>
                <span style={{ height: `${Math.max(8, (point.value / maxTrendValue) * 100)}%` }} title={`${point.label}: ${point.value}`} />
                <small>{point.label}</small>
                <strong>{point.value}</strong>
              </div>
            ))}
          </div>
        </section>

        <aside className="admin-dashboard-panel">
          <div className="admin-section-head">
            <div>
              <h2>{locale === "zh" ? "博文分类占比" : "Category distribution"}</h2>
              <span>{locale === "zh" ? "按当前文章归属统计" : "Based on current posts"}</span>
            </div>
          </div>
          <div className="admin-category-bars">
            {categoryStats.length > 0 ? (
              categoryStats.map((category) => (
                <div key={category.name}>
                  <span><strong>{category.name}</strong><small>{category.percent}%</small></span>
                  <i style={{ width: `${category.percent}%` }} />
                </div>
              ))
            ) : (
              <p className="admin-panel-empty">{locale === "zh" ? "暂无分类数据" : "No category data"}</p>
            )}
          </div>
        </aside>

        <section className="admin-dashboard-panel admin-dashboard-panel--wide">
          <div className="admin-section-head">
            <div>
              <h2>{locale === "zh" ? "最近编辑文章" : "Recent edits"}</h2>
              <span>{locale === "zh" ? "最新的创作与修改记录" : "Latest editorial activity"}</span>
            </div>
            <Link to="/admin/posts">{locale === "zh" ? "查看全部文章" : "View all posts"} <span aria-hidden="true">›</span></Link>
          </div>
          <div className="admin-dashboard-table">
            {isLoading ? (
              <div className="admin-loading-list" role="status" aria-label={locale === "zh" ? "正在加载" : "Loading"}>
                <span /><span /><span />
              </div>
            ) : null}
            {!isLoading && recentPosts.length === 0 ? (
              <div className="admin-table__message admin-table__empty">
                <strong>{locale === "zh" ? "还没有文章" : "No posts yet"}</strong>
                <span>{locale === "zh" ? "从第一篇草稿开始。" : "Start with the first draft."}</span>
              </div>
            ) : null}
            {!isLoading
              ? recentPosts.map((post) => (
                  <Link className="admin-dashboard-row" key={post.id} to={`/admin/posts/${post.id}`}>
                    <span>
                      <strong>{getPostTitle(post, locale)}</strong>
                      <small>{getPostSummary(post, locale) || post.slug}</small>
                    </span>
                    <span className={`status-pill status-pill--${post.status}`}>{getStatusLabel(post.status, locale)}</span>
                    <time>{formatDate(post.updatedAt, locale)}</time>
                  </Link>
                ))
              : null}
          </div>
        </section>

        <aside className="admin-dashboard-panel">
          <div className="admin-section-head">
            <div>
              <h2>{locale === "zh" ? "快捷控制中心" : "Quick actions"}</h2>
              <span>{locale === "zh" ? "常用后台入口" : "Common admin entries"}</span>
            </div>
          </div>
          <div className="admin-quick-actions admin-quick-actions--tiles">
            <Link to="/admin/posts/new">{locale === "zh" ? "写文章" : "Write"}</Link>
            <Link to="/admin/resources">{locale === "zh" ? "传资源" : "Upload"}</Link>
            <Link to="/admin/posts/drafts">{locale === "zh" ? "草稿箱" : "Drafts"}</Link>
            <Link to="/admin/categories">{locale === "zh" ? "分类" : "Categories"}</Link>
          </div>
          <div className="admin-health-meter" aria-label={locale === "zh" ? "发布健康度" : "Publishing health"}>
            <i style={{ width: `${completionScore}%` }} />
          </div>
          <dl className="admin-health-list">
            <div><dt>{locale === "zh" ? "已发布" : "Published"}</dt><dd>{statusCounts.published}</dd></div>
            <div><dt>{locale === "zh" ? "草稿" : "Draft"}</dt><dd>{statusCounts.draft}</dd></div>
            <div><dt>{locale === "zh" ? "归档/隐藏" : "Archived/Hidden"}</dt><dd>{statusCounts.archived + statusCounts.hidden}</dd></div>
          </dl>
        </aside>
      </div>
    </section>
  );
}
