import DOMPurify from "dompurify";

const ALLOWED_URI_REGEXP = /^(?:(?:(?:f|ht)tps?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i;

export function sanitizeMarkdownHtml(html: string): string {
  const sanitized = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ALLOWED_URI_REGEXP
  });
  const template = document.createElement("template");
  template.innerHTML = sanitized;

  for (const image of Array.from(template.content.querySelectorAll("img"))) {
    image.setAttribute("loading", "lazy");
  }

  return template.innerHTML;
}
