import type { Locale, Tag } from "@tworiver/shared";
import { getTaxonomyDisplayName } from "../utils/taxonomy";

interface TagFilterProps {
  tags: Tag[];
  locale: Locale;
  selectedTag: string | null;
  onSelectTag: (tagSlug: string | null) => void;
}

export function TagFilter({ tags, locale, selectedTag, onSelectTag }: TagFilterProps) {
  if (tags.length === 0) {
    return null;
  }

  return (
    <div className="tag-filter" aria-label={locale === "zh" ? "按标签筛选" : "Filter by tag"}>
      <button
        type="button"
        className={selectedTag === null ? "is-active" : undefined}
        aria-pressed={selectedTag === null}
        onClick={() => onSelectTag(null)}
      >
        {locale === "zh" ? "全部" : "All"}
      </button>
      {tags.map((tag) => (
        <button
          type="button"
          key={tag.slug}
          className={selectedTag === tag.slug ? "is-active" : undefined}
          aria-pressed={selectedTag === tag.slug}
          onClick={() => onSelectTag(tag.slug)}
        >
          {getTaxonomyDisplayName(tag, locale)}
        </button>
      ))}
    </div>
  );
}
