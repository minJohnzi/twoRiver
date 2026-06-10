import DOMPurify from "dompurify";
import { resolveApiAssetUrl } from "../api/client";

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
    const src = image.getAttribute("src");
    if (src) {
      image.setAttribute("src", resolveApiAssetUrl(src));
    }
  }

  return template.innerHTML;
}
