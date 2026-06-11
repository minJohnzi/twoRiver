import type { Category, Locale, PostTranslation, PublicPostListItem, Tag } from "@tworiver/shared";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchCategories, fetchCategoryDetail, fetchTagDetail, fetchTags } from "../api/posts";

interface LocaleProps {
  locale: Locale;
}

function findTranslation(translations: PostTranslation[], locale: Locale): PostTranslation | undefined {
  return (
    translations.find((translation) => translation.locale === locale) ??
    translations.find((translation) => translation.locale === "zh") ??
    translations[0]
  );
}

function PostLinks({ locale, posts }: { locale: Locale; posts: PublicPostListItem[] }) {
  if (posts.length === 0) {
    return <p className="muted">{locale === "zh" ? "暂无已发布文章。" : "No published posts yet."}</p>;
  }

  return (
    <div className="post-list">
      {posts.map((post) => {
        const translation = findTranslation(post.translations, locale);
        return (
          <article className="post-list__item" key={post.id}>
            <div className="post-row-meta">
              {post.category ? <span>{post.category.name}</span> : null}
              {post.tags.length > 0 ? <span>{post.tags.map((tag) => tag.name).join(", ")}</span> : null}
            </div>
            <h3>
              <Link to={`/posts/${post.slug}`}>{translation?.title ?? post.slug}</Link>
            </h3>
            {translation?.summary ? <p>{translation.summary}</p> : null}
          </article>
        );
      })}
    </div>
  );
}

function TaxonomyList<TItem extends Category | Tag>({
  title,
  items,
  basePath
}: {
  title: string;
  items: TItem[];
  basePath: string;
}) {
  return (
    <section className="page-section">
      <header className="page-heading">
        <h1>{title}</h1>
      </header>
      <div className="taxonomy-grid">
        {items.map((item) => (
          <Link aria-label={item.name} className="taxonomy-card" key={item.id} to={`/${basePath}/${item.slug}`}>
            <strong>{item.name}</strong>
            <span>{item.slug}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function CategoryListPage({ locale: _locale }: LocaleProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
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
      });
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, []);

  if (error) {
    return <p className="error-text">{error}</p>;
  }

  return <TaxonomyList title="Categories" items={categories} basePath="categories" />;
}

export function TagListPage({ locale: _locale }: LocaleProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
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
      });
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, []);

  if (error) {
    return <p className="error-text">{error}</p>;
  }

  return <TaxonomyList title="Tags" items={tags} basePath="tags" />;
}

export function CategoryDetailPage({ locale }: LocaleProps) {
  const { slug = "" } = useParams();
  const [category, setCategory] = useState<Category | null>(null);
  const [posts, setPosts] = useState<PublicPostListItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
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
      </header>
      <PostLinks locale={locale} posts={posts} />
    </section>
  );
}

export function TagDetailPage({ locale }: LocaleProps) {
  const { slug = "" } = useParams();
  const [tag, setTag] = useState<Tag | null>(null);
  const [posts, setPosts] = useState<PublicPostListItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
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
      </header>
      <PostLinks locale={locale} posts={posts} />
    </section>
  );
}
