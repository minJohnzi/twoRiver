import type { Locale, PublicPost } from "@tworiver/shared";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { deleteAdminPost, fetchAdminPosts } from "../api/admin";

interface AdminDraftsPageProps {
  locale: Locale;
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

function formatDate(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function AdminDraftsPage({ locale }: AdminDraftsPageProps) {
  const [posts, setPosts] = useState<PublicPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadDrafts() {
      setIsLoading(true);
      setError(null);

      try {
        const { posts: nextPosts } = await fetchAdminPosts({ signal: controller.signal });
        if (!controller.signal.aborted) {
          setPosts(nextPosts);
        }
      } catch (caught) {
        if (!controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : "Failed to load drafts");
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadDrafts();

    return () => controller.abort();
  }, [reloadKey]);

  const drafts = useMemo(
    () =>
      posts
        .filter((post) => post.status === "draft")
        .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()),
    [posts]
  );

  async function moveDraftToTrash(post: PublicPost) {
    const confirmed = window.confirm(
      locale === "zh" ? `确定要废弃《${getPostTitle(post, locale)}》这篇草稿吗？` : `Discard draft "${getPostTitle(post, locale)}"?`
    );
    if (!confirmed) {
      return;
    }

    try {
      await deleteAdminPost(post.id);
      setActionMessage(locale === "zh" ? "草稿已移入回收站。" : "Draft moved to trash.");
      setReloadKey((current) => current + 1);
    } catch (caught) {
      setActionMessage(caught instanceof Error ? caught.message : "Failed to discard draft");
    }
  }

  return (
    <section className="admin-workspace admin-drafts-page">
      <header className="admin-page-header">
        <div className="admin-page-title">
          <h1>{locale === "zh" ? "草稿箱" : "Drafts"}</h1>
          <p>
            {locale === "zh"
              ? "集中管理尚未发布的文章草稿，继续撰写或废弃无效内容。"
              : "Manage unpublished drafts, continue writing, or discard stale content."}
          </p>
        </div>
        <div className="admin-page-actions">
          <Link className="secondary-button" to="/admin/posts">{locale === "zh" ? "文章列表" : "Post list"}</Link>
          <Link className="primary-button" to="/admin/posts/new">{locale === "zh" ? "立即写一篇" : "Write a new post"}</Link>
        </div>
      </header>

      <div className="admin-drafts-summary">
        <div>
          <span>{locale === "zh" ? "待整理创作" : "Draft queue"}</span>
          <strong>
            {locale === "zh" ? "当前草稿箱内共有 " : "There are "}
            <b>{drafts.length}</b>
            {locale === "zh" ? " 篇正在撰写的文章" : " active drafts"}
          </strong>
        </div>
        <Link to="/admin/posts/new">{locale === "zh" ? "开辟新灵感 ›" : "Start a new idea ›"}</Link>
      </div>

      {actionMessage ? <p className="admin-action-banner" role="status">{actionMessage}</p> : null}
      {error ? (
        <div className="admin-table__message" role="alert">
          <strong>{locale === "zh" ? "草稿加载失败" : "Could not load drafts"}</strong>
          <span>{error}</span>
          <button className="secondary-button" type="button" onClick={() => setReloadKey((current) => current + 1)}>{locale === "zh" ? "重试" : "Retry"}</button>
        </div>
      ) : null}

      {isLoading ? (
        <div className="admin-loading-list" role="status" aria-label={locale === "zh" ? "正在加载草稿" : "Loading drafts"}>
          <span /><span /><span />
        </div>
      ) : null}

      {!isLoading && !error && drafts.length === 0 ? (
        <div className="admin-table__message admin-table__empty">
          <strong>{locale === "zh" ? "草稿箱干净如新" : "No drafts"}</strong>
          <span>{locale === "zh" ? "目前没有未完成的草稿。" : "There are no unfinished drafts right now."}</span>
          <Link className="primary-button" to="/admin/posts/new">{locale === "zh" ? "立即写一篇" : "Write a post"}</Link>
        </div>
      ) : null}

      {!isLoading && !error && drafts.length > 0 ? (
        <div className="admin-draft-grid">
          {drafts.map((draft) => (
            <article className="admin-draft-card" key={draft.id}>
              <span>{locale === "zh" ? "最后编辑" : "Last edited"}: {formatDate(draft.updatedAt, locale)}</span>
              <h2>{getPostTitle(draft, locale) || (locale === "zh" ? "未命名草稿" : "Untitled draft")}</h2>
              <p>{getPostSummary(draft, locale) || (locale === "zh" ? "暂无摘要说明。点击继续撰写进入编辑器。" : "No summary yet. Continue writing in the editor.")}</p>
              <footer>
                <span>DRAFT</span>
                <Link to={`/admin/posts/${draft.id}`}>{locale === "zh" ? "继续撰写" : "Continue"}</Link>
                <button type="button" onClick={() => void moveDraftToTrash(draft)}>{locale === "zh" ? "废弃" : "Discard"}</button>
              </footer>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
