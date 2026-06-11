import type { Locale, PostTranslation, PublicPostListItem, Tag } from "@tworiver/shared";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchPosts, fetchTags } from "../api/posts";
import { TagFilter } from "../components/TagFilter";

interface HomePageProps {
  locale: Locale;
}

function findTranslation(translations: PostTranslation[], locale: Locale): PostTranslation | undefined {
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
    month: "short",
    day: "2-digit",
    year: "numeric"
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
    const controller = new AbortController();

    async function loadContent() {
      setIsLoading(true);
      setError(null);

      try {
        const [{ posts: nextPosts }, { tags: nextTags }] = await Promise.all([
          fetchPosts({ signal: controller.signal }),
          fetchTags({ signal: controller.signal })
        ]);

        if (isMounted) {
          setPosts(nextPosts);
          setTags(nextTags);
        }
      } catch (caught) {
        if (isMounted && !controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : "Failed to load posts");
        }
      } finally {
        if (isMounted && !controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadContent();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, []);

  const visiblePosts = useMemo(() => {
    if (!selectedTag) {
      return posts;
    }

    return posts.filter((post) => post.tags.some((tag) => tag.slug === selectedTag));
  }, [posts, selectedTag]);
  const postCountLabel =
    locale === "zh" ? `${visiblePosts.length} 篇记录` : `${visiblePosts.length} ${visiblePosts.length === 1 ? "note" : "notes"}`;

  return (
    <section className="home-page">
      <section className="section-block home-feed" aria-labelledby="latest-notes">
        <div className="section-title-row">
          <div>
            <h1 id="latest-notes">Just Writing Something</h1>
            {!isLoading && !error ? <p>{postCountLabel}</p> : null}
          </div>
          <TagFilter tags={tags} selectedTag={selectedTag} onSelectTag={setSelectedTag} />
        </div>

        {isLoading ? <p className="muted">Loading...</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
        {!isLoading && !error && visiblePosts.length === 0 ? (
          <p className="muted">{locale === "zh" ? "暂无文章。" : "No posts yet."}</p>
        ) : null}

        {!isLoading && !error && visiblePosts.length > 0 ? (
          <div className="post-list">
            {visiblePosts.map((post) => {
              const translation = findTranslation(post.translations, locale);
              const title = translation?.title ?? post.slug;
              const summary = translation?.summary ?? "";

              return (
                <article className="post-list__item" key={post.id}>
                  <div className="post-row-meta">
                    <time dateTime={post.publishedAt ?? undefined}>{formatDate(post.publishedAt, locale)}</time>
                    {post.category ? <span>{post.category.name}</span> : null}
                    {post.tags.length > 0 ? <span>{post.tags.map((tag) => tag.name).join(", ")}</span> : null}
                  </div>
                  <h3>
                    <Link to={`/posts/${post.slug}`}>{title}</Link>
                  </h3>
                  {summary ? <p>{summary}</p> : null}
                </article>
              );
            })}
          </div>
        ) : null}
      </section>
    </section>
  );
}
