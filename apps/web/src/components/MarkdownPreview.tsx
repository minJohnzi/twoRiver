import "highlight.js/styles/github.css";
import { marked } from "marked";
import { useMemo } from "react";
import { hljs } from "../utils/highlight";
import { sanitizeMarkdownHtml } from "../utils/sanitizeMarkdown";

marked.use({
  renderer: {
    code(token) {
      const language = token.lang?.split(/\s+/)[0] ?? "";
      const highlighted =
        language && hljs.getLanguage(language)
          ? hljs.highlight(token.text, { language }).value
          : hljs.highlightAuto(token.text).value;
      const languageClass = language ? ` class="language-${language}"` : "";
      return `<pre><code${languageClass}>${highlighted}</code></pre>`;
    }
  }
});

interface MarkdownPreviewProps {
  markdown: string;
}

export function MarkdownPreview({ markdown }: MarkdownPreviewProps) {
  const renderedMarkdown = useMemo(() => {
    return sanitizeMarkdownHtml(marked.parse(markdown, { async: false }) as string);
  }, [markdown]);

  return <article className="markdown-body" dangerouslySetInnerHTML={{ __html: renderedMarkdown }} />;
}
