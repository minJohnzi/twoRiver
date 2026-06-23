import type { Locale, PublicPostListItem, Tag } from "@tworiver/shared";
import { useEffect, useMemo, useState } from "react";
import { fetchPosts, fetchTags } from "../api/posts";
import { PublicPostList } from "../components/PublicPostList";
import { TagFilter } from "../components/TagFilter";

interface HomePageProps {
  locale: Locale;
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
          fetchPosts({ init: { signal: controller.signal } }),
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
  const statusLabel = isLoading ? (locale === "zh" ? "正在整理记录..." : "Checking for updates...") : postCountLabel;

  return (
    <section className="home-page">
      <header className="home-hero">
        <div>
          <h1 id="latest-notes">Just Writing Something</h1>
          {!error ? <p aria-live="polite">{statusLabel}</p> : null}
        </div>
      </header>

      {tags.length > 0 ? (
        <div className="home-filter-bar">
          <TagFilter tags={tags} selectedTag={selectedTag} onSelectTag={setSelectedTag} />
        </div>
      ) : null}

      <section className="section-block home-feed" aria-labelledby="latest-notes">
        {isLoading ? <PostListSkeleton /> : null}
        {error ? <p className="error-text">{error}</p> : null}
        {!isLoading && !error ? (
          <PublicPostList
            posts={visiblePosts}
            locale={locale}
            emptyMessage={locale === "zh" ? "暂无文章。" : "No posts yet."}
          />
        ) : null}
      </section>
    </section>
  );
}

function PostListSkeleton() {
  return (
    <div className="post-list-skeleton" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}
