import type { Locale, PostTranslation, PublicPost } from "@tworiver/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { fetchPost } from "../api/posts";
import { ArticleTableOfContents } from "../components/ArticleTableOfContents";
import { MarkdownPreview } from "../components/MarkdownPreview";
import { getMarkdownLabels, renderMarkdownDocument } from "../utils/renderMarkdownDocument";
import { getTaxonomyDisplayName } from "../utils/taxonomy";

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

function pageLabels(locale: Locale) {
  if (locale === "zh") {
    return {
      loading: "正在加载文章…",
      notFound: "未找到文章",
      back: "返回文章",
      backToTop: "返回顶部"
    };
  }

  return {
    loading: "Loading article…",
    notFound: "Article not found",
    back: "Back to posts",
    backToTop: "Back to top"
  };
}

export function PostPage({ locale }: PostPageProps) {
  const { slug } = useParams();
  const location = useLocation();
  const [post, setPost] = useState<PublicPost | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const labels = pageLabels(locale);
  const markdownLabels = useMemo(() => getMarkdownLabels(locale), [locale]);
  const articleContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadPost() {
      if (!slug) {
        setHasError(true);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setHasError(false);

      try {
        const { post: nextPost } = await fetchPost(slug);
        if (isMounted) {
          setPost(nextPost);
        }
      } catch {
        if (isMounted) {
          setPost(null);
          setHasError(true);
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
  const renderedDocument = useMemo(
    () => (translation ? renderMarkdownDocument(translation.contentMarkdown, markdownLabels) : null),
    [markdownLabels, translation]
  );
  const publishedDate = post ? formatDate(post.publishedAt, locale) : null;

  useEffect(() => {
    if (!renderedDocument || !location.hash) {
      return;
    }

    let currentHash = location.hash.slice(1);
    try {
      currentHash = decodeURIComponent(currentHash);
    } catch {
      window.history.replaceState(null, "", `${location.pathname}${location.search}`);
      return;
    }

    if (!renderedDocument.headings.some((heading) => heading.id === currentHash)) {
      window.history.replaceState(null, "", `${location.pathname}${location.search}`);
    }
  }, [location.hash, location.pathname, location.search, renderedDocument]);

  function scrollToTop() {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  }

  if (isLoading) {
    return (
      <section className="article-state">
        <p className="muted">{labels.loading}</p>
      </section>
    );
  }

  if (hasError || !post || !translation || !renderedDocument) {
    return (
      <section className="article-state">
        <p className="error-text">{labels.notFound}</p>
        <Link to="/">{labels.back}</Link>
      </section>
    );
  }

  return (
    <article className="article-shell">
      <div className="article-layout">
        <div className="article-column">
          <header className="article-header">
            <div className="post-meta article-header__meta">
              {publishedDate ? <time dateTime={post.publishedAt ?? undefined}>{publishedDate}</time> : null}
              {post.category ? <span>{getTaxonomyDisplayName(post.category, locale)}</span> : null}
              {post.tags.length > 0 ? (
                <span>{post.tags.map((tag) => getTaxonomyDisplayName(tag, locale)).join(" / ")}</span>
              ) : null}
            </div>
            <h1>{translation.title}</h1>
            {translation.summary ? <p>{translation.summary}</p> : null}
          </header>
          <div ref={articleContentRef} className="article-content">
            <MarkdownPreview document={renderedDocument} locale={locale} />
          </div>
          <button className="back-to-top" type="button" onClick={scrollToTop}>
            <span aria-hidden="true">↑</span>
            {labels.backToTop}
          </button>
        </div>
        <ArticleTableOfContents
          headings={renderedDocument.headings}
          containerRef={articleContentRef}
          locale={locale}
        />
      </div>
    </article>
  );
}
