import type { Locale, PostTranslation, PublicPostListItem } from "@tworiver/shared";
import { Link } from "react-router-dom";
import { getTaxonomyDisplayName } from "../utils/taxonomy";

interface PublicPostListProps {
  posts: PublicPostListItem[];
  locale: Locale;
  emptyMessage: string;
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

export function PublicPostList({ posts, locale, emptyMessage }: PublicPostListProps) {
  if (posts.length === 0) {
    return (
      <div className="empty-state">
        <strong>{emptyMessage}</strong>
        <p>{locale === "zh" ? "内容发布后会显示在这里。" : "Published notes will appear here."}</p>
      </div>
    );
  }

  return (
    <div className="post-list">
      {posts.map((post) => {
        const translation = findTranslation(post.translations, locale);
        const title = translation?.title ?? post.slug;
        const summary = translation?.summary ?? "";

        return (
          <article className="post-list__item" key={post.id}>
            <div className="post-row-meta">
              <time dateTime={post.publishedAt ?? undefined}>{formatDate(post.publishedAt, locale)}</time>
              {post.category ? <span>{getTaxonomyDisplayName(post.category, locale)}</span> : null}
            </div>

            <div className="post-list__content">
              <h2>
                <Link to={`/posts/${post.slug}`}>{title}</Link>
              </h2>
              {summary ? <p>{summary}</p> : null}
            </div>

            {post.tags.length > 0 ? (
              <div className="post-list__tags" aria-label={locale === "zh" ? "文章标签" : "Post tags"}>
                {post.tags.map((tag) => (
                  <span className="post-chip" key={tag.slug}>
                    {getTaxonomyDisplayName(tag, locale)}
                  </span>
                ))}
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
