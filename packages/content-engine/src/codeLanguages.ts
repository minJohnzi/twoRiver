const CODE_LANGUAGE_ALIASES = new Map<string, string>([
  ["c++", "cpp"],
  ["csharp", "cs"],
  ["golang", "go"],
  ["html", "html"],
  ["md", "markdown"],
  ["py", "python"],
  ["rs", "rust"],
  ["shell", "bash"],
  ["sh", "bash"],
  ["yml", "yaml"]
]);

const ALLOWED_CODE_LANGUAGES = new Set([
  "bash",
  "c",
  "cpp",
  "cs",
  "css",
  "diff",
  "dockerfile",
  "go",
  "graphql",
  "html",
  "ini",
  "java",
  "js",
  "javascript",
  "json",
  "jsx",
  "kotlin",
  "markdown",
  "mermaid",
  "php",
  "plaintext",
  "python",
  "ruby",
  "rust",
  "scss",
  "sql",
  "swift",
  "ts",
  "tsx",
  "typescript",
  "xml",
  "yaml"
]);

export function normalizeCodeBlockLanguage(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_+.-]{0,31}$/.test(normalized)) {
    return null;
  }

  const canonical = CODE_LANGUAGE_ALIASES.get(normalized) ?? normalized;
  return ALLOWED_CODE_LANGUAGES.has(canonical) ? canonical : null;
}

export function isAllowedCodeBlockLanguage(value: string): boolean {
  return ALLOWED_CODE_LANGUAGES.has(value);
}
