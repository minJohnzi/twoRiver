import type { Locale, PostTranslation, PublicPost } from "@tworiver/shared";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchPost } from "../api/posts";
import { MarkdownPreview } from "../components/MarkdownPreview";

interface PostPageProps {
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

function formatDate(value: string | null, locale: Locale): string | null {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-Hans" : "en", {
    dateStyle: "long"
  }).format(new Date(value));
}

export function PostPage({ locale }: PostPageProps) {
  const { slug } = useParams();
  const [post, setPost] = useState<PublicPost | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadPost() {
      if (!slug) {
        setError("Missing post slug");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const { post: nextPost } = await fetchPost(slug);
        if (isMounted) {
          setPost(nextPost);
        }
      } catch (caught) {
        if (isMounted) {
          setError(caught instanceof Error ? caught.message : "Failed to load post");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadPost();

    return () => {
      isMounted = false;
    };
  }, [slug]);

  const translation = post ? findTranslation(post.translations, locale) : undefined;

  if (isLoading) {
    return (
      <section className="page-section">
        <p className="muted">Loading...</p>
      </section>
    );
  }

  if (error || !post || !translation) {
    return (
      <section className="page-section">
        <p className="error-text">{error ?? "Post not found"}</p>
        <Link to="/">{locale === "zh" ? "返回首页" : "Back to blog"}</Link>
      </section>
    );
  }

  const publishedDate = formatDate(post.publishedAt, locale);

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <article className="article-shell">
      <Link className="back-link" to="/">
        {locale === "zh" ? "返回文章列表" : "Back to posts"}
      </Link>
      <header className="article-header">
        <div className="post-meta article-header__meta">
          {publishedDate ? <time dateTime={post.publishedAt ?? undefined}>{publishedDate}</time> : null}
          {post.category ? <span>{post.category.name}</span> : null}
          {post.tags.length > 0 ? (
            <span>{post.tags.map((tag) => tag.name).join(" / ")}</span>
          ) : null}
        </div>
        <h1>{translation.title}</h1>
        {translation.summary ? <p>{translation.summary}</p> : null}
      </header>
      <MarkdownPreview markdown={translation.contentMarkdown} locale={locale} />
      <button className="back-to-top" type="button" onClick={scrollToTop}>
        <span aria-hidden="true">↑</span>
        {locale === "zh" ? "回到开头" : "Back to top"}
      </button>
    </article>
  );
}
