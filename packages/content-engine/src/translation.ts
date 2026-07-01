import type { ArticleDocument, ArticleDocumentValidationPath, ArticleNode } from "./documentTypes.js";
import { validateArticleDocument } from "./validateDocument.js";

const TRANSLATABLE_BLOCK_TYPES = new Set(["paragraph", "heading"]);

export interface ArticleTranslationSegment {
  segmentId: string;
  text: string;
  targetPath: ArticleDocumentValidationPath;
}

export interface ArticleTranslationBlock {
  blockId: string;
  nodeType: string;
  segments: ArticleTranslationSegment[];
}

export interface ArticleTranslatedSegment {
  segmentId: string;
  text: string;
}

export interface ArticleTranslatedBlock {
  blockId: string;
  segments: ArticleTranslatedSegment[];
}

export class ArticleTranslationTopologyError extends Error {
  readonly code:
    | "block-count-mismatch"
    | "block-id-mismatch"
    | "segment-count-mismatch"
    | "segment-id-mismatch"
    | "target-path-missing";

  constructor(
    code:
      | "block-count-mismatch"
      | "block-id-mismatch"
      | "segment-count-mismatch"
      | "segment-id-mismatch"
      | "target-path-missing",
    message: string
  ) {
    super(message);
    this.name = "ArticleTranslationTopologyError";
    this.code = code;
  }
}

export function extractArticleTranslationBlocks(input: unknown): ArticleTranslationBlock[] {
  const document = validateArticleDocument(input);
  const blocks: ArticleTranslationBlock[] = [];
  collectTranslationBlocks(document, [], blocks);
  return blocks.filter((block) => block.segments.length > 0);
}

export function applyArticleTranslationBlocks(
  input: unknown,
  sourceBlocks: ArticleTranslationBlock[],
  translatedBlocks: ArticleTranslatedBlock[]
): ArticleDocument {
  const document = validateArticleDocument(input);
  assertMatchingTopology(sourceBlocks, translatedBlocks);

  const clone = structuredClone(document);
  sourceBlocks.forEach((block, blockIndex) => {
    const translatedBlock = translatedBlocks[blockIndex];
    if (!translatedBlock) {
      return;
    }

    block.segments.forEach((segment, segmentIndex) => {
      const translatedSegment = translatedBlock.segments[segmentIndex];
      if (!translatedSegment) {
        return;
      }
      setStringAtPath(clone, segment.targetPath, translatedSegment.text);
    });
  });

  return validateArticleDocument(clone);
}

function collectTranslationBlocks(
  node: ArticleNode,
  path: ArticleDocumentValidationPath,
  blocks: ArticleTranslationBlock[]
): void {
  if (node.type === "codeBlock") {
    return;
  }

  if (node.type === "image") {
    const segments = collectImageSegments(node, path);
    if (segments.length > 0) {
      blocks.push({
        blockId: formatTranslationId(path),
        nodeType: node.type,
        segments
      });
    }
    return;
  }

  if (TRANSLATABLE_BLOCK_TYPES.has(node.type)) {
    const segments: ArticleTranslationSegment[] = [];
    collectInlineSegments(node, path, segments);
    if (segments.length > 0) {
      blocks.push({
        blockId: formatTranslationId(path),
        nodeType: node.type,
        segments
      });
    }
    return;
  }

  (node.content ?? []).forEach((child, index) => {
    collectTranslationBlocks(child, path.concat("content", index), blocks);
  });
}

function collectInlineSegments(
  node: ArticleNode,
  path: ArticleDocumentValidationPath,
  segments: ArticleTranslationSegment[]
): void {
  if (node.type === "text") {
    const text = node.text ?? "";
    if (text.trim().length > 0 && !hasCodeMark(node)) {
      segments.push({
        segmentId: formatTranslationId(path.concat("text")),
        text,
        targetPath: path.concat("text")
      });
    }
    return;
  }

  if (node.type === "image") {
    segments.push(...collectImageSegments(node, path));
    return;
  }

  if (node.type === "codeBlock") {
    return;
  }

  (node.content ?? []).forEach((child, index) => {
    collectInlineSegments(child, path.concat("content", index), segments);
  });
}

function collectImageSegments(
  node: ArticleNode,
  path: ArticleDocumentValidationPath
): ArticleTranslationSegment[] {
  const segments: ArticleTranslationSegment[] = [];
  const alt = node.attrs?.alt;
  if (typeof alt === "string" && alt.trim().length > 0) {
    segments.push({
      segmentId: formatTranslationId(path.concat("attrs", "alt")),
      text: alt,
      targetPath: path.concat("attrs", "alt")
    });
  }

  const title = node.attrs?.title;
  if (typeof title === "string" && title.trim().length > 0) {
    segments.push({
      segmentId: formatTranslationId(path.concat("attrs", "title")),
      text: title,
      targetPath: path.concat("attrs", "title")
    });
  }

  return segments;
}

function hasCodeMark(node: ArticleNode): boolean {
  return (node.marks ?? []).some((mark) => mark.type === "code");
}

function assertMatchingTopology(
  sourceBlocks: ArticleTranslationBlock[],
  translatedBlocks: ArticleTranslatedBlock[]
): void {
  if (sourceBlocks.length !== translatedBlocks.length) {
    throw new ArticleTranslationTopologyError(
      "block-count-mismatch",
      `Expected ${sourceBlocks.length} translated blocks, received ${translatedBlocks.length}.`
    );
  }

  sourceBlocks.forEach((sourceBlock, blockIndex) => {
    const translatedBlock = translatedBlocks[blockIndex];
    if (!translatedBlock) {
      throw new ArticleTranslationTopologyError(
        "block-count-mismatch",
        `Missing translated block for "${sourceBlock.blockId}".`
      );
    }

    if (sourceBlock.blockId !== translatedBlock.blockId) {
      throw new ArticleTranslationTopologyError(
        "block-id-mismatch",
        `Expected block "${sourceBlock.blockId}", received "${translatedBlock.blockId}".`
      );
    }

    if (sourceBlock.segments.length !== translatedBlock.segments.length) {
      throw new ArticleTranslationTopologyError(
        "segment-count-mismatch",
        `Expected ${sourceBlock.segments.length} segments for "${sourceBlock.blockId}", received ${translatedBlock.segments.length}.`
      );
    }

    sourceBlock.segments.forEach((sourceSegment, segmentIndex) => {
      const translatedSegment = translatedBlock.segments[segmentIndex];
      if (!translatedSegment) {
        throw new ArticleTranslationTopologyError(
          "segment-count-mismatch",
          `Missing translated segment for "${sourceSegment.segmentId}".`
        );
      }

      if (sourceSegment.segmentId !== translatedSegment.segmentId) {
        throw new ArticleTranslationTopologyError(
          "segment-id-mismatch",
          `Expected segment "${sourceSegment.segmentId}", received "${translatedSegment.segmentId}".`
        );
      }
    });
  });
}

function setStringAtPath(root: ArticleDocument, path: ArticleDocumentValidationPath, value: string): void {
  const parentPath = path.slice(0, -1);
  const finalKey = path[path.length - 1];
  let cursor: unknown = root;

  if (finalKey === undefined) {
    throw new ArticleTranslationTopologyError(
      "target-path-missing",
      `Cannot resolve translated target path "${formatTranslationId(path)}".`
    );
  }

  for (const segment of parentPath) {
    if (typeof segment === "number") {
      if (!Array.isArray(cursor) || cursor[segment] === undefined) {
        throw new ArticleTranslationTopologyError(
          "target-path-missing",
          `Cannot resolve translated target path "${formatTranslationId(path)}".`
        );
      }
      cursor = cursor[segment];
      continue;
    }

    if (!isRecord(cursor) || !(segment in cursor)) {
      throw new ArticleTranslationTopologyError(
        "target-path-missing",
        `Cannot resolve translated target path "${formatTranslationId(path)}".`
      );
    }
    cursor = cursor[segment];
  }

  if (typeof finalKey === "number") {
    if (!Array.isArray(cursor) || cursor[finalKey] === undefined) {
      throw new ArticleTranslationTopologyError(
        "target-path-missing",
        `Cannot resolve translated target path "${formatTranslationId(path)}".`
      );
    }
    cursor[finalKey] = value;
    return;
  }

  if (!isRecord(cursor)) {
    throw new ArticleTranslationTopologyError(
      "target-path-missing",
      `Cannot resolve translated target path "${formatTranslationId(path)}".`
    );
  }

  cursor[finalKey] = value;
}

function formatTranslationId(path: ArticleDocumentValidationPath): string {
  if (path.length === 0) {
    return "root";
  }

  return path.reduce<string>((result, segment) => {
    if (typeof segment === "number") {
      return `${result}[${segment}]`;
    }

    return result ? `${result}.${segment}` : segment;
  }, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
