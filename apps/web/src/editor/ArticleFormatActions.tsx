import type { ArticleContent, Locale } from "@tworiver/shared";

export interface ArticleFormatActionsProps {
  locale: Locale;
  currentFormat: ArticleContent["format"];
  onChooseFormat: (format: ArticleContent["format"]) => void;
}

export function ArticleFormatActions({
  locale,
  currentFormat,
  onChooseFormat
}: ArticleFormatActionsProps) {
  const labels =
    locale === "zh"
      ? {
          title: "正文格式",
          description: "这篇新文章还没有正文，可以选择 Markdown 或富文本编辑器。选择后，开始输入正文会锁定当前格式。",
          markdown: "使用 Markdown",
          tiptap: "使用富文本",
          current: "当前格式"
        }
      : {
          title: "Body format",
          description:
            "This new post has no body yet. Choose Markdown or the rich text editor. The format locks after you start writing.",
          markdown: "Use Markdown",
          tiptap: "Use rich text",
          current: "Current format"
        };

  return (
    <div className="article-format-actions" aria-label={labels.title}>
      <div>
        <strong>{labels.title}</strong>
        <p>{labels.description}</p>
      </div>
      <div className="article-format-actions__buttons">
        <button
          className="secondary-button"
          type="button"
          aria-pressed={currentFormat === "markdown"}
          onClick={() => onChooseFormat("markdown")}
        >
          {labels.markdown}
          {currentFormat === "markdown" ? <span>{labels.current}</span> : null}
        </button>
        <button
          className="secondary-button"
          type="button"
          aria-pressed={currentFormat === "tiptap"}
          onClick={() => onChooseFormat("tiptap")}
        >
          {labels.tiptap}
          {currentFormat === "tiptap" ? <span>{labels.current}</span> : null}
        </button>
      </div>
    </div>
  );
}
