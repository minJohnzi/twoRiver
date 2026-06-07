import type { Locale, PublicPostListItem, PostTranslation, Tag } from "@tworiver/shared";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchPosts, fetchTags } from "../api/posts";
import { TagFilter } from "../components/TagFilter";

interface HomePageProps {
  locale: Locale;
}

function findTranslation(
  translations: PostTranslation[],
  locale: Locale
): PostTranslation | undefined {
  return (
    translations.find((translation) => translation.locale === locale) ??
    translations.find((translation) => translation.locale === "zh") ??
    translations[0]
  );
}

function formatDate(value: string | null, locale: Locale): string {
  if (!value) {
    return locale === "zh" ? "未发布" : "Unpublished";
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-Hans" : "en", {
    dateStyle: "medium"
  }).format(new Date(value));
}

export function HomePage({ locale }: HomePageProps) {
  const [posts, setPosts] = useState<PublicPostListItem[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadContent() {
      setIsLoading(true);
      setError(null);

      try {
        const [{ posts: nextPosts }, { tags: nextTags }] = await Promise.all([
          fetchPosts(),
          fetchTags()
        ]);

        if (isMounted) {
          setPosts(nextPosts);
          setTags(nextTags);
        }
      } catch (caught) {
        if (isMounted) {
          setError(caught instanceof Error ? caught.message : "Failed to load posts");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadContent();

    return () => {
      isMounted = false;
    };
  }, []);

  const visiblePosts = useMemo(() => {
    if (!selectedTag) {
      return posts;
    }

    return posts.filter((post) => post.tags.some((tag) => tag.slug === selectedTag));
  }, [posts, selectedTag]);

  return (
    <section className="page-section">
      <div className="page-heading">
        <h1>{locale === "zh" ? "技术笔记" : "Engineering Notes"}</h1>
        <p>
          {locale === "zh"
            ? "软件工程、系统设计与开发实践的个人记录。"
            : "Personal notes on software engineering, systems, and development practice."}
        </p>
      </div>

      <TagFilter tags={tags} selectedTag={selectedTag} onSelectTag={setSelectedTag} />

      {isLoading ? <p className="muted">Loading...</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
      {!isLoading && !error && visiblePosts.length === 0 ? (
        <p className="muted">{locale === "zh" ? "暂无文章。" : "No posts yet."}</p>
      ) : null}

      <div className="post-list">
        {visiblePosts.map((post) => {
          const translation = findTranslation(post.translations, locale);
          const title = translation?.title ?? post.slug;
          const summary = translation?.summary ?? "";

          return (
            <article className="post-list__item" key={post.id}>
              <div className="post-meta">
                <time dateTime={post.publishedAt ?? undefined}>
                  {formatDate(post.publishedAt, locale)}
                </time>
                {post.tags.length > 0 ? (
                  <span>{post.tags.map((tag) => tag.name).join(" / ")}</span>
                ) : null}
              </div>
              <h2>
                <Link to={`/posts/${post.slug}`}>{title}</Link>
              </h2>
              {summary ? <p>{summary}</p> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
