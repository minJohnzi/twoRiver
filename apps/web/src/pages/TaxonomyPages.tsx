import type { Category, Locale, PublicPostListItem, Tag } from "@tworiver/shared";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchCategories, fetchCategoryDetail, fetchTagDetail, fetchTags } from "../api/posts";
import { PublicPostList } from "../components/PublicPostList";

interface LocaleProps {
  locale: Locale;
}

function PostLinks({ locale, posts }: { locale: Locale; posts: PublicPostListItem[] }) {
  return <PublicPostList locale={locale} posts={posts} emptyMessage={locale === "zh" ? "暂无已发布文章。" : "No published posts yet."} />;
}

function TaxonomyList<TItem extends Category | Tag>({
  title,
  items,
  basePath,
  isLoading,
  locale
}: {
  title: string;
  items: TItem[];
  basePath: string;
  isLoading: boolean;
  locale: Locale;
}) {
  const countLabel = locale === "zh" ? `${items.length} 个条目` : `${items.length} ${items.length === 1 ? "entry" : "entries"}`;

  return (
    <section className="page-section">
      <header className="page-heading">
        <h1>{title}</h1>
        <p aria-live="polite">{isLoading ? (locale === "zh" ? "正在读取..." : "Loading...") : countLabel}</p>
      </header>
      {isLoading ? <TaxonomySkeleton /> : null}
      {!isLoading && items.length === 0 ? (
        <div className="empty-state">
          <strong>{locale === "zh" ? "暂无条目。" : "No entries yet."}</strong>
          <p>{locale === "zh" ? "发布内容并添加分类或标签后会显示在这里。" : "Categories and tags appear here after posts use them."}</p>
        </div>
      ) : null}
      {!isLoading && items.length > 0 ? (
        <div className="taxonomy-grid">
          {items.map((item) => (
            <Link aria-label={item.name} className="taxonomy-card" key={item.id} to={`/${basePath}/${item.slug}`}>
              <strong>{item.name}</strong>
              <span>{item.slug}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function CategoryListPage({ locale }: LocaleProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);
    fetchCategories({ signal: controller.signal })
      .then(({ categories: nextCategories }) => {
        if (isMounted) {
          setCategories(nextCategories);
        }
      })
      .catch((caught: unknown) => {
        if (isMounted && !controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : "Failed to load categories");
        }
      })
      .finally(() => {
        if (isMounted && !controller.signal.aborted) {
          setIsLoading(false);
        }
      });
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, []);

  if (error) {
    return <p className="error-text">{error}</p>;
  }

  return <TaxonomyList title="Categories" items={categories} basePath="categories" isLoading={isLoading} locale={locale} />;
}

export function TagListPage({ locale }: LocaleProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);
    fetchTags({ signal: controller.signal })
      .then(({ tags: nextTags }) => {
        if (isMounted) {
          setTags(nextTags);
        }
      })
      .catch((caught: unknown) => {
        if (isMounted && !controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : "Failed to load tags");
        }
      })
      .finally(() => {
        if (isMounted && !controller.signal.aborted) {
          setIsLoading(false);
        }
      });
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, []);

  if (error) {
    return <p className="error-text">{error}</p>;
  }

  return <TaxonomyList title="Tags" items={tags} basePath="tags" isLoading={isLoading} locale={locale} />;
}

export function CategoryDetailPage({ locale }: LocaleProps) {
  const { slug = "" } = useParams();
  const [category, setCategory] = useState<Category | null>(null);
  const [posts, setPosts] = useState<PublicPostListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);
    fetchCategoryDetail(slug, { signal: controller.signal })
      .then((response) => {
        if (isMounted) {
          setCategory(response.category);
          setPosts(response.posts);
        }
      })
      .catch((caught: unknown) => {
        if (isMounted && !controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : "Failed to load category");
        }
      })
      .finally(() => {
        if (isMounted && !controller.signal.aborted) {
          setIsLoading(false);
        }
      });
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [slug]);

  if (error) {
    return <p className="error-text">{error}</p>;
  }

  return (
    <section className="page-section">
      <header className="page-heading">
        <Link className="back-link" to="/categories">
          {locale === "zh" ? "返回分类" : "Back to categories"}
        </Link>
        <h1>{category?.name ?? slug}</h1>
        <p aria-live="polite">{isLoading ? (locale === "zh" ? "正在读取..." : "Loading...") : locale === "zh" ? `${posts.length} 篇记录` : `${posts.length} ${posts.length === 1 ? "note" : "notes"}`}</p>
      </header>
      {isLoading ? <PostListSkeleton /> : <PostLinks locale={locale} posts={posts} />}
    </section>
  );
}

export function TagDetailPage({ locale }: LocaleProps) {
  const { slug = "" } = useParams();
  const [tag, setTag] = useState<Tag | null>(null);
  const [posts, setPosts] = useState<PublicPostListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);
    fetchTagDetail(slug, { signal: controller.signal })
      .then((response) => {
        if (isMounted) {
          setTag(response.tag);
          setPosts(response.posts);
        }
      })
      .catch((caught: unknown) => {
        if (isMounted && !controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : "Failed to load tag");
        }
      })
      .finally(() => {
        if (isMounted && !controller.signal.aborted) {
          setIsLoading(false);
        }
      });
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [slug]);

  if (error) {
    return <p className="error-text">{error}</p>;
  }

  return (
    <section className="page-section">
      <header className="page-heading">
        <Link className="back-link" to="/tags">
          {locale === "zh" ? "返回标签" : "Back to tags"}
        </Link>
        <h1>{tag?.name ?? slug}</h1>
        <p aria-live="polite">{isLoading ? (locale === "zh" ? "正在读取..." : "Loading...") : locale === "zh" ? `${posts.length} 篇记录` : `${posts.length} ${posts.length === 1 ? "note" : "notes"}`}</p>
      </header>
      {isLoading ? <PostListSkeleton /> : <PostLinks locale={locale} posts={posts} />}
    </section>
  );
}

function TaxonomySkeleton() {
  return (
    <div className="taxonomy-grid taxonomy-grid--loading" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
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
