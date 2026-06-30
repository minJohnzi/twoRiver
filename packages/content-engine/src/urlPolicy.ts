export function isAllowedLink(value: string): boolean {
  if (value.startsWith("/") || value.startsWith("#")) {
    return true;
  }

  try {
    const url = new URL(value);
    return ["http:", "https:", "mailto:"].includes(url.protocol);
  } catch {
    return false;
  }
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
