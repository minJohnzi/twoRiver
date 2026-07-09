export type ArticleLinkKind = "internal" | "external";

export function isAllowedLink(value: string): boolean {
  return classifyArticleLink(value) !== null;
}

export function classifyArticleLink(value: string): ArticleLinkKind | null {
  const href = value.trim();
  if (href.length === 0 || href !== value || /[\u0000-\u001f\u007f\\]/.test(href)) {
    return null;
  }

  if (href.startsWith("#")) {
    return "internal";
  }
  if (href.startsWith("//")) {
    return null;
  }
  if (href.startsWith("/") || href.startsWith("./") || href.startsWith("../")) {
    return "internal";
  }

  const schemeMatch = /^([a-z][a-z0-9+.-]*):/i.exec(href);
  if (schemeMatch?.[1] !== undefined) {
    const scheme = schemeMatch[1].toLowerCase();
    return ["http", "https", "mailto"].includes(scheme) ? "external" : null;
  }

  return "internal";
}

export function isAllowedImage(value: string): boolean {
  if (value.startsWith("/uploads/")) {
    return true;
  }

  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
