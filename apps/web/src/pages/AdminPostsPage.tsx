import type { Locale, PublicPost } from "@tworiver/shared";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchAdminPosts } from "../api/admin";

interface AdminPostsPageProps {
  locale: Locale;
}

function hasLocale(post: PublicPost, locale: Locale): boolean {
  return post.translations.some((translation) => translation.locale === locale);
}

export function AdminPostsPage({ locale }: AdminPostsPageProps) {
  const [posts, setPosts] = useState<PublicPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <section className="page-section admin-panel">
      <div className="admin-heading">
        <div>
          <h1>{locale === "zh" ? "文章管理" : "Posts"}</h1>
          <p className="muted">{locale === "zh" ? "管理草稿、发布状态和双语内容。" : "Manage drafts, publication, and bilingual content."}</p>
        </div>
        <Link className="primary-button" to="/admin/posts/new">
          {locale === "zh" ? "新建文章" : "New post"}
        </Link>
      </div>

      {isLoading ? <p className="muted">Loading...</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
      {!isLoading && !error && posts.length === 0 ? <p className="muted">{locale === "zh" ? "暂无文章。" : "No posts yet."}</p> : null}

      <div className="admin-list">
        {posts.map((post) => (
          <Link className="admin-list__item" key={post.id} to={`/admin/posts/${post.id}`}>
            <strong>{post.slug}</strong>
            <span>{post.status}</span>
            <span>
              zh {hasLocale(post, "zh") ? "✓" : "-"} / en {hasLocale(post, "en") ? "✓" : "-"}
            </span>
            <span>{post.tags.map((tag) => tag.name).join(" / ") || "No tags"}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
