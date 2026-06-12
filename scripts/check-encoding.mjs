import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const modulePath = fileURLToPath(import.meta.url);

const SCAN_ROOTS = [".github", "apps", "docs", "packages", "scripts", "tests"];

const ROOT_FILE_NAMES = new Set([
  ".editorconfig",
  ".env.example",
  ".gitattributes",
  ".gitignore",
  "CONTRIBUTING.md",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "README.md",
]);

const ROOT_FILE_PATTERNS = [/^tsconfig(?:\.[^.]+)?\.json$/u];

const TEXT_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".env",
  ".example",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".sql",
  ".svg",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

const SKIP_DIRECTORIES = new Set([
  ".git",
  ".turbo",
  ".vite",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "playwright-report",
  "test-results",
  "uploads",
]);

const SKIP_EXTENSIONS = new Set([
  ".avif",
  ".bmp",
  ".db",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".png",
  ".sqlite",
  ".sqlite3",
  ".tsbuildinfo",
  ".webp",
]);

const CHECKS = [
  { label: "replacement character U+FFFD", pattern: "\uFFFD" },
  { label: "mojibake sequence U+95BA U+521E", pattern: "\u95BA\u521E" },
  { label: "mojibake sequence U+95B8 U+6A82", pattern: "\u95B8\u6A82" },
  { label: "mojibake sequence U+7F01 U+5A8A", pattern: "\u7F01\u5A8A" },
  { label: "mojibake sequence U+5A11 U+63F1", pattern: "\u5A11\u63F1" },
  { label: "mojibake sequence U+6D94 U+4FD9", pattern: "\u6D94\u4FD9" },
  { label: "mojibake sequence U+6D93 U+688E", pattern: "\u6D93\u688E" },
  { label: "mojibake sequence U+6D93 U+7CEE", pattern: "\u6D93\u7CEE" },
  { label: "mojibake sequence U+95B5 U+54F7", pattern: "\u95B5\u54F7" },
];

export function toDisplayPath(filePath, cwd = process.cwd()) {
  return path.relative(cwd, filePath).split(path.sep).join("/");
}

function shouldSkipDirectory(directoryPath) {
  return SKIP_DIRECTORIES.has(path.basename(directoryPath));
}

export function isTextFile(filePath) {
  const basename = path.basename(filePath);
  const extension = path.extname(basename).toLowerCase();

  if (ROOT_FILE_NAMES.has(basename)) {
    return true;
  }

  if (SKIP_EXTENSIONS.has(extension)) {
    return false;
  }

  if (basename.endsWith('.tsbuildinfo')) {
    return false;
  }

  return TEXT_EXTENSIONS.has(extension);
}

function* walkFiles(directoryPath) {
  let entries;

  try {
    entries = readdirSync(directoryPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      if (!shouldSkipDirectory(entryPath)) {
        yield* walkFiles(entryPath);
      }
      continue;
    }

    if (entry.isFile() && isTextFile(entryPath)) {
      yield entryPath;
    }
  }
}

function getRootFiles(cwd) {
  let entries;

  try {
    entries = readdirSync(cwd, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter(
      (fileName) =>
        ROOT_FILE_NAMES.has(fileName) ||
        ROOT_FILE_PATTERNS.some((pattern) => pattern.test(fileName)),
    )
    .map((fileName) => path.join(cwd, fileName))
    .filter(isTextFile);
}

export function getScanFiles(cwd = process.cwd()) {
  const files = [];

  for (const root of SCAN_ROOTS) {
    const rootPath = path.join(cwd, root);

    if (existsSync(rootPath) && statSync(rootPath).isDirectory()) {
      files.push(...walkFiles(rootPath));
    }
  }

  files.push(...getRootFiles(cwd));
  return [...new Set(files)].sort((a, b) => toDisplayPath(a, cwd).localeCompare(toDisplayPath(b, cwd)));
}

export function findEncodingIssues(filePath) {
  const contents = readFileSync(filePath, "utf8");

  return CHECKS.filter(({ pattern }) => contents.includes(pattern)).map(({ label }) => label);
}

export function runEncodingCheck(cwd = process.cwd()) {
  const findings = [];
  const files = getScanFiles(cwd);

  for (const filePath of files) {
    const issues = findEncodingIssues(filePath);

    if (issues.length > 0) {
      findings.push({ filePath, issues });
    }
  }

  return { files, findings };
}

if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  const result = runEncodingCheck();

  if (result.findings.length > 0) {
    console.error("Encoding check failed. Offending files:");

    for (const finding of result.findings) {
      console.error(`- ${toDisplayPath(finding.filePath)}: ${finding.issues.join(", ")}`);
    }

    process.exitCode = 1;
  } else {
    console.log(`Encoding check passed: scanned ${result.files.length} text files.`);
  }
}
