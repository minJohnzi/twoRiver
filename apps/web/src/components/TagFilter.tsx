import type { Tag } from "@tworiver/shared";

interface TagFilterProps {
  tags: Tag[];
  selectedTag: string | null;
  onSelectTag: (tagSlug: string | null) => void;
}

export function TagFilter({ tags, selectedTag, onSelectTag }: TagFilterProps) {
  if (tags.length === 0) {
    return null;
  }

  return (
    <div className="tag-filter" aria-label="Filter by tag">
      <button
        type="button"
        className={selectedTag === null ? "is-active" : undefined}
        aria-pressed={selectedTag === null}
        onClick={() => onSelectTag(null)}
      >
        All
      </button>
      {tags.map((tag) => (
        <button
          type="button"
          key={tag.slug}
          className={selectedTag === tag.slug ? "is-active" : undefined}
          aria-pressed={selectedTag === tag.slug}
          onClick={() => onSelectTag(tag.slug)}
        >
          {tag.name}
        </button>
      ))}
    </div>
  );
}
