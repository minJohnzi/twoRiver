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

    async function loadContent() {
      setIsLoading(true);
      setError(null);

      try {
        const [{ posts: nextPosts }, { tags: nextTags }] = await Promise.all([fetchPosts(), fetchTags()]);

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
    <section className="home-page">
      <header className="home-intro">
        <h1>{locale === "zh" ? "王维《竹里馆》" : "Bamboo Lodge, Wang Wei"}</h1>
        <p>
          {locale === "zh"
            ? "独坐幽篁里，弹琴复长啸。深林人不知，明月来相照。"
            : "Sitting alone among bamboo, playing qin and singing long; no one knows me in the deep grove, but the bright moon comes to shine."}
        </p>
      </header>

      <section className="section-block" aria-labelledby="latest-notes">
        <div className="section-title-row">
          <h2 id="latest-notes">{locale === "zh" ? "最新文章" : "Latest notes"}</h2>
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
