import {
  ARTICLE_DOCUMENT_SCHEMA_VERSION,
  extractArticleProse,
  projectArticleToMarkdown,
  validateArticleDocument,
  type ArticleDocument,
  type ArticleNode
} from "@tworiver/content-engine";
import type {
  ArticleContent,
  Category,
  Locale,
  MarkdownConversionPreview,
  PostStatus,
  PostTranslation,
  PublicPost,
  Tag,
  UpsertPostInput
} from "@tworiver/shared";
import {
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  createAdminTag,
  createAdminPost,
  convertAdminPostTranslationToTiptap,
  deleteAdminPost,
  fetchAdminCategories,
  fetchAdminTags,
  fetchAdminPosts,
  fetchAdminPost,
  previewAdminPostTiptapConversion,
  restoreAdminPostTranslationMarkdown,
  translateAdminPostDraft,
  updateAdminPost,
  uploadAdminPostImage
} from "../api/admin";
import { MarkdownPreview } from "../components/MarkdownPreview";
import { ArticleEditor } from "../editor/ArticleEditor";
import { ArticleFormatActions } from "../editor/ArticleFormatActions";
import { useArticleImageUpload } from "../editor/useArticleImageUpload";
import { useUnsavedArticleWarning } from "../editor/useUnsavedArticleWarning";
import { getTaxonomyDisplayName, getTaxonomySearchText } from "../utils/taxonomy";

interface AdminEditorPageProps {
  locale: Locale;
}

interface TranslationDraft {
  title: string;
  summary: string;
  content: ArticleContent;
  contentMarkdown: string;
  canRestoreMarkdown: boolean;
  restoreMarkdownSnapshotAt: string | null;
}

type TranslationDrafts = Record<Locale, TranslationDraft>;
type SaveAction = "draft" | "save" | "publish" | "hide" | "republish" | null;
type ActionNotice = { tone: "pending" | "success" | "error"; title: string; detail: string };
type MarkdownEditorMode = "source" | "split" | "preview";
type MarkdownSearchState = { isOpen: boolean; query: string; currentIndex: number };
type ConversionAction = "preview" | "convert" | "restore" | null;
type ConversionContext = { postId: number; expectedUpdatedAt: string; locale: Locale; editorBaseline: string };
type ConversionPreviewState = (ConversionContext & { preview: MarkdownConversionPreview }) | null;
type RestoreMarkdownState = (ConversionContext & { snapshotAt: string | null }) | null;

interface MarkdownHeading {
  id: string;
  level: number;
  text: string;
  lineStart: number;
}

interface SearchMatch {
  start: number;
  end: number;
}

const EMPTY_MARKDOWN_CONTENT: ArticleContent = { format: "markdown", markdown: "" };

const POST_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DEFAULT_IMAGE_ALT = "图片";
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const EMPTY_SEARCH_STATE: MarkdownSearchState = { isOpen: false, query: "", currentIndex: 0 };
const MARKDOWN_EDITOR_MODES: MarkdownEditorMode[] = ["source", "split", "preview"];

function isTiptapNewArticleEnabled(): boolean {
  return import.meta.env.VITE_TIPTAP_NEW_ARTICLE_ENABLED === "true";
}

function isTiptapPublishEnabled(): boolean {
  return import.meta.env.VITE_TIPTAP_PUBLISH_ENABLED === "true";
}

function emptyArticleDocument(): ArticleDocument {
  return {
    type: "doc",
    content: [{ type: "paragraph" }]
  };
}

function createMarkdownDraft(overrides: Partial<TranslationDraft> = {}): TranslationDraft {
  const contentMarkdown =
    overrides.content?.format === "markdown" ? overrides.content.markdown : (overrides.contentMarkdown ?? "");
  return {
    title: "",
    summary: "",
    content: { format: "markdown", markdown: contentMarkdown },
    contentMarkdown,
    canRestoreMarkdown: false,
    restoreMarkdownSnapshotAt: null,
    ...overrides
  };
}

function createTiptapDraft(overrides: Partial<TranslationDraft> = {}): TranslationDraft {
  const content =
    overrides.content?.format === "tiptap"
      ? overrides.content
      : {
          format: "tiptap" as const,
          schemaVersion: ARTICLE_DOCUMENT_SCHEMA_VERSION,
          doc: emptyArticleDocument()
        };
  return {
    title: "",
    summary: "",
    content,
    contentMarkdown: overrides.contentMarkdown ?? projectArticleToMarkdown(content.doc),
    canRestoreMarkdown: false,
    restoreMarkdownSnapshotAt: null,
    ...overrides
  };
}

function cloneTranslations(): TranslationDrafts {
  return {
    zh: createMarkdownDraft(),
    en: createMarkdownDraft()
  };
}

function buildInput(
  slug: string,
  status: PostStatus,
  publishedAt: string | null,
  categorySlug: string,
  tagSlugs: string[],
  translations: TranslationDrafts,
  expectedUpdatedAt: string | null
): UpsertPostInput {
  const nextTranslations = (["zh", "en"] as const)
    .map((translationLocale) => {
      const translation = translations[translationLocale];
      const content =
        translation.content.format === "markdown"
          ? { format: "markdown" as const, markdown: translation.contentMarkdown }
          : translation.content;
      return {
        locale: translationLocale,
        title: translation.title.trim(),
        summary: translation.summary.trim(),
        content,
        contentMarkdown: content.format === "markdown" ? content.markdown : "",
        seoTitle: null,
        seoDescription: null
      };
    })
    .filter((translation) => hasTranslationContent(translations[translation.locale]));

  const fallbackTranslation = translations.zh;
  const fallbackContent =
    fallbackTranslation.content.format === "markdown"
      ? { format: "markdown" as const, markdown: fallbackTranslation.contentMarkdown }
      : fallbackTranslation.content;

  const input: UpsertPostInput = {
    slug: slug.trim(),
    status,
    publishedAt: status === "draft" ? null : publishedAt ?? new Date().toISOString(),
    categorySlug: categorySlug.trim() || null,
    tagSlugs: Array.from(new Set(tagSlugs.map((tagSlug) => tagSlug.trim()).filter(Boolean))),
    translations:
      nextTranslations.length > 0
        ? nextTranslations
        : [
            {
              locale: "zh",
              title: fallbackTranslation.title.trim(),
              summary: fallbackTranslation.summary.trim(),
              content: fallbackContent,
              contentMarkdown: fallbackContent.format === "markdown" ? fallbackContent.markdown : "",
              seoTitle: null,
              seoDescription: null
            }
          ]
  };

  if (expectedUpdatedAt) {
    input.expectedUpdatedAt = expectedUpdatedAt;
  }

  return input;
}

function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sortTags(tags: Tag[]): Tag[] {
  return [...tags].sort((first, second) => first.name.localeCompare(second.name) || first.slug.localeCompare(second.slug));
}

function mergeTags(currentTags: Tag[], incomingTags: Tag[]): Tag[] {
  const tagBySlug = new Map<string, Tag>();
  for (const tag of currentTags) {
    tagBySlug.set(tag.slug, tag);
  }
  for (const tag of incomingTags) {
    tagBySlug.set(tag.slug, tag);
  }
  return sortTags(Array.from(tagBySlug.values()));
}

function otherLocale(source: Locale): Locale {
  return source === "zh" ? "en" : "zh";
}

function languageLabel(value: Locale, uiLocale: Locale): string {
  if (value === "zh") {
    return uiLocale === "zh" ? "中文" : "Chinese";
  }
  return uiLocale === "zh" ? "英文" : "English";
}

function statusLabel(status: PostStatus, uiLocale: Locale): string {
  if (status === "published") {
    return uiLocale === "zh" ? "已发布" : "Published";
  }
  if (status === "hidden") {
    return uiLocale === "zh" ? "隐藏/下架" : "Hidden";
  }
  return uiLocale === "zh" ? "草稿" : "Draft";
}

function statusDescription(status: PostStatus, uiLocale: Locale): string {
  if (status === "published") {
    return uiLocale === "zh" ? "前台可见。编辑会保留当前发布记录。" : "Visible on the public site. Edits keep the publish history.";
  }
  if (status === "hidden") {
    return uiLocale === "zh" ? "曾经发布过，当前不在前台展示，发布时间会保留。" : "Previously published, currently hidden from public pages, with publish time preserved.";
  }
  return uiLocale === "zh" ? "尚未发布，前台不可见。" : "Not published yet and hidden from public pages.";
}

function actionPendingTitle(action: NonNullable<SaveAction>, uiLocale: Locale): string {
  const labels: Record<NonNullable<SaveAction>, { zh: string; en: string }> = {
    draft: { zh: "正在保存草稿", en: "Saving draft" },
    save: { zh: "正在保存修改", en: "Saving changes" },
    publish: { zh: "正在发布", en: "Publishing post" },
    hide: { zh: "正在隐藏/下架", en: "Hiding post" },
    republish: { zh: "正在重新发布", en: "Republishing post" }
  };
  return labels[action][uiLocale];
}

function actionSuccessTitle(action: NonNullable<SaveAction>, uiLocale: Locale): string {
  const labels: Record<NonNullable<SaveAction>, { zh: string; en: string }> = {
    draft: { zh: "草稿已保存", en: "Draft saved" },
    save: { zh: "修改已保存", en: "Changes saved" },
    publish: { zh: "已发布", en: "Published" },
    hide: { zh: "已隐藏/下架", en: "Hidden" },
    republish: { zh: "已重新发布", en: "Republished" }
  };
  return labels[action][uiLocale];
}

function actionFailureTitle(action: NonNullable<SaveAction>, uiLocale: Locale): string {
  const labels: Record<NonNullable<SaveAction>, { zh: string; en: string }> = {
    draft: { zh: "保存草稿失败", en: "Save draft failed" },
    save: { zh: "保存修改失败", en: "Save changes failed" },
    publish: { zh: "发布失败", en: "Publish failed" },
    hide: { zh: "隐藏/下架失败", en: "Hide failed" },
    republish: { zh: "重新发布失败", en: "Republish failed" }
  };
  return labels[action][uiLocale];
}

function actionNoticeDetail(action: NonNullable<SaveAction>, tone: ActionNotice["tone"], uiLocale: Locale): string {
  if (tone === "pending") {
    return uiLocale === "zh" ? "正在同步到后台，请不要重复点击。" : "Syncing with the server. Please wait.";
  }

  const details: Record<NonNullable<SaveAction>, { zh: string; en: string }> = {
    draft: { zh: "内容仍为草稿，前台不可见。", en: "The post remains a draft and is not public." },
    save: { zh: "内容与当前状态已更新。", en: "The content and current status are up to date." },
    publish: { zh: "文章现在会在前台展示。", en: "The post is now visible on the public site." },
    hide: { zh: "文章已从前台移除，发布时间已保留。", en: "The post is hidden from public pages and keeps its publish time." },
    republish: { zh: "文章已恢复到前台展示。", en: "The post is visible on the public site again." }
  };
  return details[action][uiLocale];
}

function translationBodyText(translation: TranslationDraft): string {
  if (translation.content.format === "tiptap") {
    return extractArticleProse(translation.content.doc);
  }
  return translation.contentMarkdown;
}

function isEmptyArticleParagraph(node: ArticleNode): boolean {
  return (
    node.type === "paragraph" &&
    (node.content ?? []).every(
      (child) => child.type === "hardBreak" || (child.type === "text" && !(child.text ?? "").trim())
    )
  );
}

function hasArticleDocumentBodyContent(document: ArticleDocument): boolean {
  return document.content.some((node) => !isEmptyArticleParagraph(node));
}

function hasTranslationBodyContent(translation: TranslationDraft): boolean {
  if (translation.content.format === "tiptap") {
    return hasArticleDocumentBodyContent(translation.content.doc);
  }
  return Boolean(translation.contentMarkdown.trim());
}

function hasTranslationContent(translation: TranslationDraft): boolean {
  return Boolean(translation.title.trim() || translation.summary.trim() || hasTranslationBodyContent(translation));
}

function validatePostInput(input: UpsertPostInput, uiLocale: Locale): string | null {
  if (!POST_SLUG_PATTERN.test(input.slug)) {
    return uiLocale === "zh"
      ? "Slug 只能使用小写英文字母、数字和连字符，例如 my-post-11。"
      : "Slug can use only lowercase letters, numbers, and hyphens, such as my-post-11.";
  }

  const translationWithoutTitle = input.translations.find((translation) => !translation.title.trim());
  if (translationWithoutTitle) {
    return uiLocale === "zh"
      ? "每个有内容的语言版本都需要标题。"
      : "Every language version with content needs a title.";
  }

  const invalidTag = input.tagSlugs.find((tagSlug) => !POST_SLUG_PATTERN.test(tagSlug));
  if (invalidTag) {
    return uiLocale === "zh"
      ? `标签 slug“${invalidTag}”只能使用小写英文字母、数字和连字符。`
      : `Tag slug "${invalidTag}" can use only lowercase letters, numbers, and hyphens.`;
  }

  return null;
}

function getAutoSlugSeed(translations: TranslationDrafts, activeLocale: Locale): string {
  const locales: Locale[] = [activeLocale, otherLocale(activeLocale)];

  for (const translationLocale of locales) {
    const translation = translations[translationLocale];
    for (const value of [translation.title, translation.summary, translationBodyText(translation)]) {
      const slug = normalizeSlug(value);
      if (slug) {
        return slug;
      }
    }
  }

  return "post";
}

function getNextAvailableSlug(baseSlug: string, usedSlugs: Set<string>): string {
  if (!usedSlugs.has(baseSlug)) {
    return baseSlug;
  }

  let suffix = 2;
  while (usedSlugs.has(`${baseSlug}-${suffix}`)) {
    suffix += 1;
  }

  return `${baseSlug}-${suffix}`;
}

function findDuplicateSlugPost(
  slug: string,
  posts: Array<{ id: number; slug: string }>,
  currentPostId: number | undefined
): { id: number; slug: string } | undefined {
  return posts.find((post) => post.slug === slug && post.id !== currentPostId);
}

function resolvePostSlug(
  input: UpsertPostInput,
  translations: TranslationDrafts,
  activeLocale: Locale,
  posts: Array<{ id: number; slug: string }>,
  currentPostId: number | undefined,
  uiLocale: Locale
): { input: UpsertPostInput; error: string | null; wasGenerated: boolean } {
  if (input.slug) {
    const duplicate = findDuplicateSlugPost(input.slug, posts, currentPostId);
    if (duplicate) {
      return {
        input,
        error:
          uiLocale === "zh"
            ? `Slug “${input.slug}” 已被其他文章使用。请换一个。`
            : `Slug "${input.slug}" is already used by another post.`,
        wasGenerated: false
      };
    }

    return { input, error: null, wasGenerated: false };
  }

  const usedSlugs = new Set(posts.filter((post) => post.id !== currentPostId).map((post) => post.slug));
  const slug = getNextAvailableSlug(getAutoSlugSeed(translations, activeLocale), usedSlugs);
  return {
    input: { ...input, slug },
    error: null,
    wasGenerated: true
  };
}

function localizeSaveError(message: string, uiLocale: Locale): string {
  if (message === "Post was updated elsewhere") {
    return uiLocale === "zh"
      ? "文章已被其他位置更新，请重新加载后再继续。"
      : "This post was updated elsewhere. Reload before continuing.";
  }

  if (message === "Post slug already exists") {
    return uiLocale === "zh" ? "Slug 已被其他文章使用。请换一个。" : "Slug is already used by another post.";
  }

  return message;
}

function translationDraftFromPost(translation: PostTranslation): TranslationDraft {
  const content = translation.content ?? { format: "markdown" as const, markdown: translation.contentMarkdown };
  if (content.format === "tiptap") {
    const doc = validateArticleDocument(content.doc);
    return createTiptapDraft({
      title: translation.title,
      summary: translation.summary,
      content: { ...content, doc },
      contentMarkdown: translation.contentMarkdown,
      canRestoreMarkdown: translation.canRestoreMarkdown === true,
      restoreMarkdownSnapshotAt: translation.restoreMarkdownSnapshotAt ?? null
    });
  }

  return createMarkdownDraft({
    title: translation.title,
    summary: translation.summary,
    content: { format: "markdown", markdown: translation.contentMarkdown },
    contentMarkdown: translation.contentMarkdown,
    canRestoreMarkdown: translation.canRestoreMarkdown === true,
    restoreMarkdownSnapshotAt: translation.restoreMarkdownSnapshotAt ?? null
  });
}

function draftStateFromPost(post: PublicPost): {
  translations: TranslationDrafts;
  editorErrors: Partial<Record<Locale, string>>;
} {
  const translations = cloneTranslations();
  const editorErrors: Partial<Record<Locale, string>> = {};

  for (const translation of post.translations) {
    try {
      translations[translation.locale] = translationDraftFromPost(translation);
    } catch {
      translations[translation.locale] = createTiptapDraft({
        title: translation.title,
        summary: translation.summary,
        contentMarkdown: translation.contentMarkdown,
        canRestoreMarkdown: translation.canRestoreMarkdown === true,
        restoreMarkdownSnapshotAt: translation.restoreMarkdownSnapshotAt ?? null
      });
      editorErrors[translation.locale] = "Stored article JSON could not be loaded.";
    }
  }

  return { translations, editorErrors };
}

function serializeEditorState(input: {
  slug: string;
  status: PostStatus;
  publishedAt: string | null;
  categorySlug: string;
  selectedTagSlugs: string[];
  translations: TranslationDrafts;
}): string {
  return JSON.stringify({
    slug: input.slug.trim(),
    status: input.status,
    publishedAt: input.publishedAt,
    categorySlug: input.categorySlug,
    selectedTagSlugs: [...input.selectedTagSlugs].sort(),
    translations: input.translations
  });
}

function draftHasTiptapContent(translations: TranslationDrafts): boolean {
  return Object.values(translations).some((translation) => translation.content.format === "tiptap" && hasTranslationContent(translation));
}

function conversionDirtyMessage(): string {
  return "Save or reload your current edits before changing the article format.";
}

function formatConversionIssue(issue: { line: number; message: string }): string {
  return `Line ${issue.line}: ${issue.message}`;
}

function conversionContextsMatch(first: ConversionContext, second: ConversionContext): boolean {
  return (
    first.postId === second.postId &&
    first.expectedUpdatedAt === second.expectedUpdatedAt &&
    first.locale === second.locale &&
    first.editorBaseline === second.editorBaseline
  );
}

function formatDependencyPendingMessage(): string {
  return "Wait for image uploads and tag creation to finish before changing the article format.";
}

function changedBaselineMessage(): string {
  return "Local edits changed while the format request was running. Your edits were kept; reload before retrying.";
}

function markdownModeLabel(mode: MarkdownEditorMode, uiLocale: Locale): string {
  const labels: Record<MarkdownEditorMode, { zh: string; en: string }> = {
    source: { zh: "MD源码", en: "MD source" },
    split: { zh: "源码-预览", en: "Source + preview" },
    preview: { zh: "预览", en: "Preview" }
  };
  return labels[mode][uiLocale];
}

function stripMarkdownHeadingText(value: string): string {
  return value
    .replace(/\s+#+\s*$/g, "")
    .replace(/[`*_~[\]()]/g, "")
    .trim();
}

function collectMarkdownHeadings(markdown: string): MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];
  const lines = markdown.split(/\n/);
  let offset = 0;
  let isInFence = false;

  lines.forEach((line, index) => {
    const trimmed = line.trimStart();
    if (/^(```|~~~)/.test(trimmed)) {
      isInFence = !isInFence;
    }

    if (!isInFence) {
      const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
      if (match) {
        const marker = match[1];
        const rawText = match[2];
        const text = rawText ? stripMarkdownHeadingText(rawText) : "";
        if (marker && text) {
          headings.push({
            id: `${index}-${text.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
            level: marker.length,
            text,
            lineStart: offset
          });
        }
      }
    }

    offset += line.length + 1;
  });

  return headings;
}

function findSearchMatches(markdown: string, query: string): SearchMatch[] {
  const needle = query.trim();
  if (!needle) {
    return [];
  }

  const matches: SearchMatch[] = [];
  const haystack = markdown.toLocaleLowerCase();
  const normalizedNeedle = needle.toLocaleLowerCase();
  let index = haystack.indexOf(normalizedNeedle);

  while (index !== -1) {
    matches.push({ start: index, end: index + needle.length });
    index = haystack.indexOf(normalizedNeedle, index + Math.max(needle.length, 1));
  }

  return matches;
}

export function AdminEditorPage({ locale }: AdminEditorPageProps) {
  const navigate = useNavigate();
  const { id } = useParams();
  const postId = id && id !== "new" ? Number(id) : undefined;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const markdownTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const markdownSearchInputRef = useRef<HTMLInputElement | null>(null);
  const previewPaneRef = useRef<HTMLElement | null>(null);
  const isUploadingImageRef = useRef(false);
  const conversionRequestIdRef = useRef(0);
  const [activeLocale, setActiveLocale] = useState<Locale>(locale);
  const [postUid, setPostUid] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState<PostStatus>("draft");
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [categorySlug, setCategorySlug] = useState("");
  const [selectedTagSlugs, setSelectedTagSlugs] = useState<string[]>([]);
  const [tagSearch, setTagSearch] = useState("");
  const [quickTagName, setQuickTagName] = useState("");
  const [quickTagSlug, setQuickTagSlug] = useState("");
  const [quickTagSlugTouched, setQuickTagSlugTouched] = useState(false);
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const [tagSelectorError, setTagSelectorError] = useState<string | null>(null);
  const [translations, setTranslations] = useState<TranslationDrafts>(cloneTranslations);
  const [postUpdatedAt, setPostUpdatedAt] = useState<string | null>(null);
  const currentConversionContextRef = useRef<{
    postId: number | undefined;
    expectedUpdatedAt: string | null;
    locale: Locale;
    editorBaseline: string;
  }>({ postId, expectedUpdatedAt: null, locale, editorBaseline: "" });
  const [isDraftBaselineReady, setIsDraftBaselineReady] = useState(!postId);
  const [savedBaseline, setSavedBaseline] = useState(() =>
    serializeEditorState({
      slug: "",
      status: "draft",
      publishedAt: null,
      categorySlug: "",
      selectedTagSlugs: [],
      translations: cloneTranslations()
    })
  );
  const [editorMode, setEditorMode] = useState<MarkdownEditorMode>("split");
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [markdownSearch, setMarkdownSearch] = useState<MarkdownSearchState>(EMPTY_SEARCH_STATE);
  const [tiptapEditorErrors, setTiptapEditorErrors] = useState<Partial<Record<Locale, string>>>({});
  const [isLoading, setIsLoading] = useState(Boolean(postId));
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [articleImageNotice, setArticleImageNotice] = useState<string | null>(null);
  const [saveAction, setSaveAction] = useState<SaveAction>(null);
  const [actionNotice, setActionNotice] = useState<ActionNotice | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [pendingTranslationTarget, setPendingTranslationTarget] = useState<Locale | null>(null);
  const [translationWarnings, setTranslationWarnings] = useState<string[]>([]);
  const [conversionAction, setConversionAction] = useState<ConversionAction>(null);
  const [conversionPreview, setConversionPreview] = useState<ConversionPreviewState>(null);
  const [pendingRestoreMarkdown, setPendingRestoreMarkdown] = useState<RestoreMarkdownState>(null);
  const [error, setError] = useState<string | null>(null);
  const articleImageUploadController = useArticleImageUpload({
    postUid,
    upload: uploadAdminPostImage,
    onNotice: setArticleImageNotice
  });

  function applyPostState(post: PublicPost) {
    const { translations: nextTranslations, editorErrors } = draftStateFromPost(post);
    const nextCategorySlug = post.category?.slug ?? "";
    const nextSelectedTagSlugs = post.tags.map((tag) => tag.slug);

    setSlug(post.slug);
    setPostUid(post.uid);
    setPostUpdatedAt(post.updatedAt);
    setStatus(post.status);
    setPublishedAt(post.publishedAt);
    setCategorySlug(nextCategorySlug);
    setSelectedTagSlugs(nextSelectedTagSlugs);
    setTags((currentTags) => mergeTags(currentTags, post.tags));
    setTranslations(nextTranslations);
    setTiptapEditorErrors(editorErrors);
    setSavedBaseline(
      serializeEditorState({
        slug: post.slug,
        status: post.status,
        publishedAt: post.publishedAt,
        categorySlug: nextCategorySlug,
        selectedTagSlugs: nextSelectedTagSlugs,
        translations: nextTranslations
      })
    );
    setIsDraftBaselineReady(true);
  }

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    async function loadTaxonomyOptions() {
      const [categoryResponse, tagResponse] = await Promise.all([
        fetchAdminCategories({ signal: controller.signal }),
        fetchAdminTags({ signal: controller.signal })
      ]);

      if (isMounted) {
        setCategories(categoryResponse.categories);
        setTags(sortTags(tagResponse.tags));
      }
    }

    void loadTaxonomyOptions()
      .catch(() => {
        if (isMounted) {
          setTagSelectorError(locale === "zh" ? "标签列表加载失败，可刷新后重试。" : "Failed to load tags. Refresh and try again.");
        }
      });

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [locale]);

  useEffect(() => {
    conversionRequestIdRef.current += 1;
    setConversionAction(null);
    setConversionPreview(null);
    setPendingRestoreMarkdown(null);
    setActionNotice(null);
    setTranslationWarnings([]);

    if (!postId) {
      const nextTranslations = cloneTranslations();
      setIsDraftBaselineReady(false);
      setPostUid(null);
      setPostUpdatedAt(null);
      setTranslations(nextTranslations);
      setTiptapEditorErrors({});
      setSavedBaseline(
        serializeEditorState({
          slug: "",
          status: "draft",
          publishedAt: null,
          categorySlug: "",
          selectedTagSlugs: [],
          translations: nextTranslations
        })
      );
      setIsDraftBaselineReady(true);
      return;
    }

    let isMounted = true;
    const controller = new AbortController();
    const selectedPostId = postId;

    async function loadPost() {
      setIsLoading(true);
      setIsDraftBaselineReady(false);
      setError(null);

      try {
        const { post } = await fetchAdminPost(selectedPostId, { signal: controller.signal });
        if (!isMounted) {
          return;
        }

        applyPostState(post);
      } catch (caught) {
        if (isMounted && !controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : "Failed to load post");
        }
      } finally {
        if (isMounted && !controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadPost();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [postId]);

  function updateTranslation(field: "title" | "summary" | "contentMarkdown", value: string) {
    setTranslations((current) => {
      const currentTranslation = current[activeLocale];
      const nextTranslation =
        field === "contentMarkdown"
          ? createMarkdownDraft({
              ...currentTranslation,
              content: { format: "markdown", markdown: value },
              contentMarkdown: value
            })
          : {
              ...currentTranslation,
              [field]: value
            };

      return {
        ...current,
        [activeLocale]: nextTranslation
      };
    });
  }

  function updateActiveArticleDocument(doc: ArticleDocument) {
    setTranslations((current) => ({
      ...current,
      [activeLocale]: createTiptapDraft({
        ...current[activeLocale],
        content: {
          format: "tiptap",
          schemaVersion: ARTICLE_DOCUMENT_SCHEMA_VERSION,
          doc
        },
        contentMarkdown: projectArticleToMarkdown(doc)
      })
    }));
    setTiptapEditorErrors((current) => ({ ...current, [activeLocale]: undefined }));
  }

  function chooseActiveLocaleFormat(format: "markdown" | "tiptap") {
    setTranslations((current) => {
      const currentTranslation = current[activeLocale];
      if (currentTranslation.content.format === format || hasTranslationBodyContent(currentTranslation)) {
        return current;
      }

      const nextTranslation =
        format === "markdown"
          ? createMarkdownDraft({
              title: currentTranslation.title,
              summary: currentTranslation.summary,
              contentMarkdown: ""
            })
          : createTiptapDraft({
              title: currentTranslation.title,
              summary: currentTranslation.summary
            });

      return {
        ...current,
        [activeLocale]: nextTranslation
      };
    });
  }

  function addSelectedTagSlug(tagSlug: string) {
    setSelectedTagSlugs((current) => (current.includes(tagSlug) ? current : [...current, tagSlug]));
    setTagSelectorError(null);
  }

  function removeSelectedTagSlug(tagSlug: string) {
    setSelectedTagSlugs((current) => current.filter((selectedTagSlug) => selectedTagSlug !== tagSlug));
    setTagSelectorError(null);
  }

  function updateQuickTagName(value: string) {
    setQuickTagName(value);
    if (!quickTagSlugTouched) {
      setQuickTagSlug(normalizeSlug(value));
    }
    setTagSelectorError(null);
  }

  function updateQuickTagSlug(value: string) {
    setQuickTagSlug(normalizeSlug(value));
    setQuickTagSlugTouched(true);
    setTagSelectorError(null);
  }

  function resetQuickTagDraft() {
    setQuickTagName("");
    setQuickTagSlug("");
    setQuickTagSlugTouched(false);
  }

  async function createAndSelectTag() {
    const name = quickTagName.trim();
    const tagSlug = normalizeSlug(quickTagSlug || quickTagName);

    if (!name) {
      setTagSelectorError(locale === "zh" ? "请先填写标签名称。" : "Add a tag name first.");
      return;
    }

    if (!POST_SLUG_PATTERN.test(tagSlug)) {
      setTagSelectorError(
        locale === "zh"
          ? "标签 slug 只能使用小写英文字母、数字和连字符。"
          : "Tag slug can use only lowercase letters, numbers, and hyphens."
      );
      return;
    }

    const existingTag = tags.find((tag) => tag.slug === tagSlug);
    if (existingTag) {
      addSelectedTagSlug(existingTag.slug);
      resetQuickTagDraft();
      setTagSearch("");
      return;
    }

    setIsCreatingTag(true);
    setTagSelectorError(null);
    try {
      const { tag } = await createAdminTag({
        name,
        slug: tagSlug,
        translations: [{ locale, name }]
      });
      setTags((currentTags) => mergeTags(currentTags, [tag]));
      addSelectedTagSlug(tag.slug);
      resetQuickTagDraft();
      setTagSearch("");
    } catch (caught) {
      setTagSelectorError(caught instanceof Error ? caught.message : "Failed to create tag");
    } finally {
      setIsCreatingTag(false);
    }
  }

  function getSelectedMarkdownDetails() {
    const textarea = markdownTextareaRef.current;
    const current = translations[activeLocale].contentMarkdown;
    const start = textarea?.selectionStart ?? current.length;
    const end = textarea?.selectionEnd ?? current.length;
    const selectedText = current.slice(start, end).trim();
    return {
      start,
      end,
      selectedText
    };
  }

  function replaceDefaultImageAlt(markdown: string, alt: string) {
    const safeAlt = alt.replace(/[\]\r\n]/g, " ").trim() || DEFAULT_IMAGE_ALT;
    return markdown.replace(`![${DEFAULT_IMAGE_ALT}]`, `![${safeAlt}]`);
  }

  function insertMarkdownAtSelection(markdown: string, start: number, end: number) {
    setTranslations((current) => {
      const currentMarkdown = current[activeLocale].contentMarkdown;
      const boundedStart = Math.max(0, Math.min(start, currentMarkdown.length));
      const boundedEnd = Math.max(boundedStart, Math.min(end, currentMarkdown.length));
      const nextMarkdown = `${currentMarkdown.slice(0, boundedStart)}${markdown}${currentMarkdown.slice(boundedEnd)}`;

      return {
        ...current,
        [activeLocale]: {
          ...current[activeLocale],
          content: { format: "markdown", markdown: nextMarkdown },
          contentMarkdown: nextMarkdown
        }
      };
    });

    window.requestAnimationFrame(() => {
      const textarea = markdownTextareaRef.current;
      if (!textarea) {
        return;
      }
      const cursor = start + markdown.length;
      textarea.focus();
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  async function uploadImageFile(file: File) {
    if (isUploadingImageRef.current) {
      return;
    }

    if (!postUid) {
      setError(locale === "zh" ? "请先保存草稿再上传图片。" : "Save the draft before uploading images.");
      return;
    }

    if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
      setError(locale === "zh" ? "仅支持 jpg、png、webp 和 gif 图片。" : "Only jpg, png, webp, and gif images are supported.");
      return;
    }

    const { start, end, selectedText } = getSelectedMarkdownDetails();
    isUploadingImageRef.current = true;
    setIsUploadingImage(true);
    setError(null);

    try {
      const result = await uploadAdminPostImage({ postUid, file });
      insertMarkdownAtSelection(replaceDefaultImageAlt(result.markdown, selectedText || DEFAULT_IMAGE_ALT), start, end);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to upload image");
    } finally {
      isUploadingImageRef.current = false;
      setIsUploadingImage(false);
      setIsDraggingImage(false);
    }
  }

  function getFirstTransferredImageFile(files: FileList | File[] | undefined, items?: DataTransferItemList) {
    const fileFromList = Array.from(files ?? []).find((file) => SUPPORTED_IMAGE_TYPES.has(file.type));
    if (fileFromList) {
      return fileFromList;
    }

    for (const item of Array.from(items ?? [])) {
      if (item.kind === "file" && SUPPORTED_IMAGE_TYPES.has(item.type)) {
        const file = item.getAsFile();
        if (file) {
          return file;
        }
      }
    }

    return undefined;
  }

  function hasImageTransfer(items: DataTransferItemList) {
    return Array.from(items).some((item) => item.kind === "file" && SUPPORTED_IMAGE_TYPES.has(item.type));
  }

  function handleMarkdownDrop(event: DragEvent<HTMLTextAreaElement>) {
    const file = getFirstTransferredImageFile(event.dataTransfer.files, event.dataTransfer.items);
    if (!file) {
      setIsDraggingImage(false);
      return;
    }

    event.preventDefault();
    setIsDraggingImage(false);
    void uploadImageFile(file);
  }

  function handleMarkdownPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const file = getFirstTransferredImageFile(event.clipboardData.files, event.clipboardData.items);
    if (!file) {
      return;
    }

    event.preventDefault();
    void uploadImageFile(file);
  }

  function changeEditorMode(mode: MarkdownEditorMode) {
    setEditorMode(mode);
    if (mode === "preview") {
      setMarkdownSearch(EMPTY_SEARCH_STATE);
    }
  }

  function selectMarkdownRange(start: number, end: number) {
    window.setTimeout(() => {
      const textarea = markdownTextareaRef.current;
      if (!textarea) {
        return;
      }
      textarea.focus();
      textarea.setSelectionRange(start, end);
    }, 0);
  }

  function selectSearchMatch(matches: SearchMatch[], index: number) {
    if (matches.length === 0) {
      return;
    }

    const nextIndex = ((index % matches.length) + matches.length) % matches.length;
    const match = matches[nextIndex];
    if (!match) {
      return;
    }

    setMarkdownSearch((current) => ({ ...current, currentIndex: nextIndex }));
    selectMarkdownRange(match.start, match.end);
  }

  function openMarkdownSearch() {
    const { selectedText } = getSelectedMarkdownDetails();
    const nextQuery = selectedText && !selectedText.includes("\n") ? selectedText : markdownSearch.query;
    const nextMatches = findSearchMatches(translations[activeLocale].contentMarkdown, nextQuery);
    setMarkdownSearch({ isOpen: true, query: nextQuery, currentIndex: 0 });

    window.requestAnimationFrame(() => {
      markdownSearchInputRef.current?.focus();
      markdownSearchInputRef.current?.select();
    });

    if (nextMatches.length > 0) {
      selectSearchMatch(nextMatches, 0);
    }
  }

  function closeMarkdownSearch() {
    setMarkdownSearch(EMPTY_SEARCH_STATE);
    markdownTextareaRef.current?.focus();
  }

  function updateMarkdownSearchQuery(value: string) {
    const nextMatches = findSearchMatches(translations[activeLocale].contentMarkdown, value);
    setMarkdownSearch({ isOpen: true, query: value, currentIndex: 0 });
    if (nextMatches.length > 0) {
      selectSearchMatch(nextMatches, 0);
    }
  }

  function moveMarkdownSearchMatch(delta: number) {
    const matches = findSearchMatches(translations[activeLocale].contentMarkdown, markdownSearch.query);
    if (matches.length === 0) {
      return;
    }
    selectSearchMatch(matches, markdownSearch.currentIndex + delta);
  }

  function handleMarkdownSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      moveMarkdownSearchMatch(event.shiftKey ? -1 : 1);
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeMarkdownSearch();
    }
  }

  function handleMarkdownKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
      event.preventDefault();
      openMarkdownSearch();
    }
  }

  function jumpToMarkdownOffset(offset: number) {
    if (editorMode === "preview") {
      setEditorMode("split");
    }
    selectMarkdownRange(offset, offset);
  }

  async function savePost(nextStatus: PostStatus, action: NonNullable<SaveAction>) {
    setError(null);
    setTranslationWarnings([]);

    const invalidLocale = (["zh", "en"] as const).find((translationLocale) => tiptapEditorErrors[translationLocale]);
    if (invalidLocale) {
      const message =
        locale === "zh"
          ? "当前文章包含无法加载的富文本正文，请重新加载或恢复后再保存。"
          : "This post contains rich text content that could not be loaded. Reload or restore it before saving.";
      setActionNotice({
        tone: "error",
        title: actionFailureTitle(action, locale),
        detail: message
      });
      setError(message);
      return;
    }

    if (nextStatus === "published" && draftHasTiptapContent(translations) && !isTiptapPublishEnabled()) {
      const message =
        locale === "zh"
          ? "富文本文章发布开关尚未开启；可以先保存草稿。"
          : "TipTap publishing is not enabled yet. Save this as a draft for now.";
      setActionNotice({
        tone: "error",
        title: actionFailureTitle(action, locale),
        detail: message
      });
      setError(message);
      return;
    }

    setSaveAction(action);
    setActionNotice({
      tone: "pending",
      title: actionPendingTitle(action, locale),
      detail: actionNoticeDetail(action, "pending", locale)
    });

    try {
      const input = buildInput(slug, nextStatus, publishedAt, categorySlug, selectedTagSlugs, translations, postId ? postUpdatedAt : null);
      const { posts } = await fetchAdminPosts();
      const resolved = resolvePostSlug(input, translations, activeLocale, posts, postId, locale);
      const validationMessage = resolved.error ?? validatePostInput(resolved.input, locale);

      if (validationMessage) {
        setActionNotice({
          tone: "error",
          title: actionFailureTitle(action, locale),
          detail: validationMessage
        });
        setError(validationMessage);
        return;
      }

      if (resolved.wasGenerated) {
        setSlug(resolved.input.slug);
      }

      const { post } = postId ? await updateAdminPost(postId, resolved.input) : await createAdminPost(resolved.input);
      applyPostState(post);
      setActionNotice({
        tone: "success",
        title: actionSuccessTitle(action, locale),
        detail: actionNoticeDetail(action, "success", locale)
      });
      if (!postId) {
        navigate(`/admin/posts/${post.id}`);
      }
    } catch (caught) {
      const message = localizeSaveError(caught instanceof Error ? caught.message : "Failed to save post", locale);
      setActionNotice({
        tone: "error",
        title: actionFailureTitle(action, locale),
        detail: message
      });
      setError(message);
    } finally {
      setSaveAction(null);
    }
  }

  async function confirmDelete() {
    if (!postId || isDeleting) {
      return;
    }

    setError(null);
    setIsDeleting(true);
    try {
      await deleteAdminPost(postId);
      navigate("/admin/posts");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to delete post");
      setIsDeleteDialogOpen(false);
    } finally {
      setIsDeleting(false);
    }
  }

  async function runTranslation(targetLocale: Locale) {
    const sourceLocale = activeLocale;
    const source = translations[sourceLocale];

    setPendingTranslationTarget(null);
    setError(null);
    setTranslationWarnings([]);
    setIsTranslating(true);
    try {
      const { translation, warnings } = await translateAdminPostDraft({
        source: {
          locale: sourceLocale,
          title: source.title,
          summary: source.summary,
          contentMarkdown: source.contentMarkdown
        },
        targetLocale
      });

      setTranslations((current) => ({
        ...current,
        [targetLocale]: createMarkdownDraft({
          title: translation.title,
          summary: translation.summary,
          contentMarkdown: translation.contentMarkdown
        })
      }));
      setActiveLocale(targetLocale);
      setTranslationWarnings(warnings);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to translate draft");
    } finally {
      setIsTranslating(false);
    }
  }

  function requestTranslation() {
    const targetLocale = otherLocale(activeLocale);
    if (hasTranslationContent(translations[targetLocale])) {
      setPendingTranslationTarget(targetLocale);
      return;
    }

    void runTranslation(targetLocale);
  }

  function getStableConversionContext(translationLocale: Locale): ConversionContext | null {
    if (!postId || !postUpdatedAt) {
      const message = "Save this post before changing the article format.";
      setError(message);
      setActionNotice({
        tone: "error",
        title: "Format change unavailable",
        detail: message
      });
      return null;
    }

    if (
      isUploadingImageRef.current ||
      isUploadingImage ||
      articleImageUploadController.isUploading ||
      isCreatingTag
    ) {
      const message = formatDependencyPendingMessage();
      setError(message);
      setActionNotice({
        tone: "error",
        title: "Format change unavailable",
        detail: message
      });
      return null;
    }

    if (isDirty) {
      const message = conversionDirtyMessage();
      setError(message);
      setActionNotice({
        tone: "error",
        title: "Save current edits first",
        detail: message
      });
      return null;
    }

    return {
      postId,
      expectedUpdatedAt: postUpdatedAt,
      locale: translationLocale,
      editorBaseline: currentConversionContextRef.current.editorBaseline
    };
  }

  function isCurrentConversionContext(context: ConversionContext): boolean {
    const current = currentConversionContextRef.current;
    return (
      current.postId === context.postId &&
      current.expectedUpdatedAt === context.expectedUpdatedAt &&
      current.locale === context.locale &&
      current.editorBaseline === context.editorBaseline
    );
  }

  function beginConversionRequest(): number {
    conversionRequestIdRef.current += 1;
    return conversionRequestIdRef.current;
  }

  function canApplyConversionResponse(requestId: number, context: ConversionContext): boolean {
    if (conversionRequestIdRef.current !== requestId) {
      return false;
    }

    const current = currentConversionContextRef.current;
    if (
      current.postId !== context.postId ||
      current.expectedUpdatedAt !== context.expectedUpdatedAt ||
      current.locale !== context.locale
    ) {
      return false;
    }

    if (current.editorBaseline !== context.editorBaseline) {
      const message = changedBaselineMessage();
      setConversionPreview(null);
      setPendingRestoreMarkdown(null);
      setActionNotice({
        tone: "error",
        title: "Format response not applied",
        detail: message
      });
      setError(message);
      return false;
    }

    return true;
  }

  async function previewTiptapConversion(translationLocale: Locale) {
    const context = getStableConversionContext(translationLocale);
    if (!context) {
      return;
    }

    const requestId = beginConversionRequest();
    setConversionAction("preview");
    setConversionPreview(null);
    setError(null);
    setTranslationWarnings([]);
    setActionNotice({
      tone: "pending",
      title: "Previewing rich text conversion",
      detail: "Checking the saved Markdown body for unsupported structures."
    });

    try {
      const preview = await previewAdminPostTiptapConversion(context.postId, translationLocale);
      if (!canApplyConversionResponse(requestId, context)) {
        return;
      }

      setConversionPreview({ ...context, preview });
      setActionNotice({
        tone: preview.canConvert ? "success" : "error",
        title: preview.canConvert ? "Conversion preview ready" : "Conversion has blockers",
        detail: preview.canConvert
          ? "Review the projected Markdown before confirming the format change."
          : "Fix the blockers below before converting this locale."
      });
    } catch (caught) {
      if (!canApplyConversionResponse(requestId, context)) {
        return;
      }

      const message = localizeSaveError(caught instanceof Error ? caught.message : "Failed to preview conversion", locale);
      setActionNotice({
        tone: "error",
        title: "Conversion preview failed",
        detail: message
      });
      setError(message);
    } finally {
      if (conversionRequestIdRef.current === requestId) {
        setConversionAction(null);
      }
    }
  }

  async function confirmTiptapConversion() {
    if (!conversionPreview) {
      return;
    }

    const context = getStableConversionContext(conversionPreview.locale);
    if (
      !context ||
      !conversionContextsMatch(context, conversionPreview) ||
      !isCurrentConversionContext(conversionPreview)
    ) {
      setConversionPreview(null);
      return;
    }

    const conversionLocale = conversionPreview.locale;
    if (status === "published" && !isTiptapPublishEnabled()) {
      const message = "TipTap publishing is not enabled yet. Hide this post before converting a published locale.";
      setActionNotice({
        tone: "error",
        title: "Conversion blocked",
        detail: message
      });
      setError(message);
      return;
    }

    const requestId = beginConversionRequest();
    setConversionAction("convert");
    setError(null);
    setActionNotice({
      tone: "pending",
      title: "Converting to rich text",
      detail: "The server will recompute the conversion from the latest saved Markdown."
    });

    try {
      const { post } = await convertAdminPostTranslationToTiptap(context.postId, conversionLocale, {
        expectedUpdatedAt: context.expectedUpdatedAt
      });
      if (!canApplyConversionResponse(requestId, context) || post.id !== context.postId) {
        return;
      }

      applyPostState(post);
      setActiveLocale(conversionLocale);
      setConversionPreview(null);
      setActionNotice({
        tone: "success",
        title: "Converted to rich text",
        detail: "The locale now uses canonical TipTap JSON and keeps a Markdown restore snapshot."
      });
    } catch (caught) {
      if (!canApplyConversionResponse(requestId, context)) {
        return;
      }

      const message = localizeSaveError(caught instanceof Error ? caught.message : "Failed to convert to rich text", locale);
      setActionNotice({
        tone: "error",
        title: "Conversion failed",
        detail: message
      });
      setError(message);
    } finally {
      if (conversionRequestIdRef.current === requestId) {
        setConversionAction(null);
      }
    }
  }

  function requestRestoreMarkdown(translationLocale: Locale) {
    const context = getStableConversionContext(translationLocale);
    if (!context) {
      return;
    }

    const translation = translations[translationLocale];
    setPendingRestoreMarkdown({
      ...context,
      snapshotAt: translation.restoreMarkdownSnapshotAt
    });
  }

  async function confirmRestoreMarkdown() {
    if (!pendingRestoreMarkdown) {
      return;
    }

    const context = getStableConversionContext(pendingRestoreMarkdown.locale);
    if (
      !context ||
      !conversionContextsMatch(context, pendingRestoreMarkdown) ||
      !isCurrentConversionContext(pendingRestoreMarkdown)
    ) {
      setPendingRestoreMarkdown(null);
      return;
    }

    const restoreLocale = pendingRestoreMarkdown.locale;
    const requestId = beginConversionRequest();
    setConversionAction("restore");
    setError(null);
    setActionNotice({
      tone: "pending",
      title: "Restoring Markdown snapshot",
      detail: "The saved Markdown snapshot will replace the TipTap JSON for this locale."
    });

    try {
      const { post } = await restoreAdminPostTranslationMarkdown(context.postId, restoreLocale, {
        expectedUpdatedAt: context.expectedUpdatedAt
      });
      if (!canApplyConversionResponse(requestId, context) || post.id !== context.postId) {
        return;
      }

      applyPostState(post);
      setActiveLocale(restoreLocale);
      setPendingRestoreMarkdown(null);
      setActionNotice({
        tone: "success",
        title: "Markdown restored",
        detail: "The locale is back on the exact Markdown snapshot captured before conversion."
      });
    } catch (caught) {
      if (!canApplyConversionResponse(requestId, context)) {
        return;
      }

      const message = localizeSaveError(caught instanceof Error ? caught.message : "Failed to restore Markdown", locale);
      setActionNotice({
        tone: "error",
        title: "Restore failed",
        detail: message
      });
      setError(message);
    } finally {
      if (conversionRequestIdRef.current === requestId) {
        setConversionAction(null);
      }
    }
  }

  function focusPreview() {
    if (editorMode === "source") {
      setEditorMode("split");
    }
    window.requestAnimationFrame(() => {
      previewPaneRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      previewPaneRef.current?.focus();
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void savePost(status, "save");
  }

  const currentTranslation = translations[activeLocale];
  const isActiveTiptap = currentTranslation.content.format === "tiptap";
  const activeTiptapError = tiptapEditorErrors[activeLocale];
  const currentArticleDocument = currentTranslation.content.format === "tiptap" ? currentTranslation.content.doc : null;
  const canRestoreActiveMarkdown = isActiveTiptap && currentTranslation.canRestoreMarkdown;
  const deferredMarkdown = useDeferredValue(currentTranslation.contentMarkdown);
  const markdownHeadings = useMemo(() => collectMarkdownHeadings(currentTranslation.contentMarkdown), [currentTranslation.contentMarkdown]);
  const editorStats = useMemo(() => {
    const body = currentTranslation.contentMarkdown.trim();
    const words = body ? body.split(/\s+/).filter(Boolean).length : 0;
    const cjkCharacters = (body.match(/[\u4e00-\u9fff]/g) ?? []).length;
    const readableUnits = Math.max(words, cjkCharacters);
    const paragraphs = body ? body.split(/\n{2,}/).filter((paragraph) => paragraph.trim()).length : 0;
    const readingMinutes = Math.max(1, Math.ceil(readableUnits / (activeLocale === "zh" ? 450 : 220)));

    return {
      characters: currentTranslation.contentMarkdown.length,
      paragraphs,
      readingMinutes
    };
  }, [activeLocale, currentTranslation.contentMarkdown]);
  const markdownSearchMatches = useMemo(
    () => findSearchMatches(currentTranslation.contentMarkdown, markdownSearch.query),
    [currentTranslation.contentMarkdown, markdownSearch.query]
  );
  const activeSearchIndex = markdownSearchMatches.length > 0 ? Math.min(markdownSearch.currentIndex, markdownSearchMatches.length - 1) : -1;
  const targetLocale = otherLocale(activeLocale);
  const isBusy = Boolean(saveAction) || isDeleting || isTranslating || Boolean(conversionAction);
  const isFormatMutationPending = conversionAction === "convert" || conversionAction === "restore";
  const currentBaseline = useMemo(
    () =>
      serializeEditorState({
        slug,
        status,
        publishedAt,
        categorySlug,
        selectedTagSlugs,
        translations
      }),
    [categorySlug, publishedAt, selectedTagSlugs, slug, status, translations]
  );
  currentConversionContextRef.current = {
    postId,
    expectedUpdatedAt: postUpdatedAt,
    locale: activeLocale,
    editorBaseline: currentBaseline
  };
  const isDirty = isDraftBaselineReady && currentBaseline !== savedBaseline;
  const hasPendingFormatDependency =
    isUploadingImageRef.current ||
    isUploadingImage ||
    articleImageUploadController.isUploading ||
    isCreatingTag;
  const formatChangeDisabledTitle = isDirty
    ? conversionDirtyMessage()
    : hasPendingFormatDependency
      ? formatDependencyPendingMessage()
      : undefined;
  useUnsavedArticleWarning(isDirty);
  const isNewArticleTiptapEnabled = isTiptapNewArticleEnabled();
  const isTiptapPublishGateEnabled = isTiptapPublishEnabled();
  const hasTiptapDraft = draftHasTiptapContent(translations);
  const hasTiptapEditorError = (["zh", "en"] as const).some((translationLocale) => tiptapEditorErrors[translationLocale]);
  const canChooseNewArticleFormat =
    !postId &&
    isNewArticleTiptapEnabled &&
    !Object.values(translations).some(hasTranslationBodyContent);
  const tiptapPublishDisabled = hasTiptapDraft && !isTiptapPublishGateEnabled;
  const publishDisabledTitle = tiptapPublishDisabled
    ? locale === "zh"
      ? "富文本文章发布开关尚未开启；请先保存草稿。"
      : "TipTap publishing is not enabled yet. Save a draft first."
    : undefined;
  const translationDisabledTitle =
    isActiveTiptap
      ? locale === "zh"
        ? "富文本 AI 翻译将在结构保持管线完成后开放。"
        : "TipTap AI translation will be enabled after the structure-preserving pipeline ships."
      : undefined;
  const canPreview = Boolean(postId && slug.trim() && status !== "draft");
  const selectedTags = useMemo(
    () =>
      selectedTagSlugs.map((selectedTagSlug) => tags.find((tag) => tag.slug === selectedTagSlug) ?? { id: 0, slug: selectedTagSlug, name: selectedTagSlug }),
    [selectedTagSlugs, tags]
  );
  const filteredTags = useMemo(() => {
    const query = tagSearch.trim().toLocaleLowerCase();
    const sortedTags = [...tags].sort(
      (first, second) =>
        getTaxonomyDisplayName(first, locale).localeCompare(getTaxonomyDisplayName(second, locale)) ||
        first.slug.localeCompare(second.slug)
    );
    if (!query) {
      return sortedTags;
    }

    return sortedTags.filter((tag) => getTaxonomySearchText(tag, locale).toLocaleLowerCase().includes(query));
  }, [locale, tagSearch, tags]);

  if (isLoading) {
    return (
      <section className="page-section admin-panel">
        <p className="muted">Loading...</p>
      </section>
    );
  }

  return (
    <section className={`admin-editor${isFocusMode ? " is-focus-mode" : ""}`}>
      <form className="editor-shell" onSubmit={handleSubmit}>
        <fieldset className="editor-form-fields" disabled={isFormatMutationPending}>
        <div className="editor-toolbar">
          <div>
            <p className="admin-kicker">Writing room</p>
            <Link className="back-link" to="/admin/posts">
              {locale === "zh" ? "返回文章管理" : "Back to posts"}
            </Link>
            <h1>{postId ? (locale === "zh" ? "编辑文章" : "Edit post") : locale === "zh" ? "新建文章" : "New post"}</h1>
          </div>
          <div className="editor-actions" aria-label={locale === "zh" ? "文章操作" : "Post actions"}>
            {status === "draft" ? (
              <>
                <button className="secondary-button" type="button" disabled={isBusy || hasTiptapEditorError} onClick={() => void savePost("draft", "draft")}>
                  {saveAction === "draft" ? (locale === "zh" ? "保存中..." : "Saving...") : locale === "zh" ? "保存草稿" : "Save draft"}
                </button>
                <button
                  className="primary-button"
                  type="button"
                  disabled={isBusy || hasTiptapEditorError || tiptapPublishDisabled}
                  title={publishDisabledTitle}
                  onClick={() => void savePost("published", "publish")}
                >
                  {saveAction === "publish" ? (locale === "zh" ? "发布中..." : "Publishing...") : locale === "zh" ? "发布" : "Publish"}
                </button>
              </>
            ) : (
              <>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={isBusy || hasTiptapEditorError || (status === "published" && tiptapPublishDisabled)}
                  title={status === "published" ? publishDisabledTitle : undefined}
                  onClick={() => void savePost(status, "save")}
                >
                  {saveAction === "save" ? (locale === "zh" ? "保存中..." : "Saving...") : locale === "zh" ? "保存修改" : "Save changes"}
                </button>
                {status === "published" ? (
                  <button className="danger-button" type="button" disabled={isBusy || hasTiptapEditorError} onClick={() => void savePost("hidden", "hide")}>
                    {saveAction === "hide" ? (locale === "zh" ? "下架中..." : "Hiding...") : locale === "zh" ? "隐藏/下架" : "Hide"}
                  </button>
                ) : (
                  <button
                    className="primary-button"
                    type="button"
                    disabled={isBusy || hasTiptapEditorError || tiptapPublishDisabled}
                    title={publishDisabledTitle}
                    onClick={() => void savePost("published", "republish")}
                  >
                    {saveAction === "republish" ? (locale === "zh" ? "重新发布中..." : "Republishing...") : locale === "zh" ? "重新发布/显示" : "Republish"}
                  </button>
                )}
                {canPreview && status === "published" ? (
                  <Link className="secondary-button" to={`/posts/${slug.trim()}`} target="_blank" rel="noreferrer">
                    {locale === "zh" ? "预览" : "Preview"}
                  </Link>
                ) : null}
                {canPreview && status === "hidden" ? (
                  <button className="secondary-button" type="button" onClick={focusPreview}>
                    {locale === "zh" ? "预览" : "Preview"}
                  </button>
                ) : null}
              </>
            )}
            {postId ? (
              <button className="danger-button" type="button" disabled={isBusy} onClick={() => setIsDeleteDialogOpen(true)}>
                {locale === "zh" ? "删除" : "Delete"}
              </button>
            ) : null}
          </div>
        </div>

        {actionNotice ? (
          <div
            className={`action-notice action-notice--${actionNotice.tone}`}
            role={actionNotice.tone === "error" ? "alert" : "status"}
            aria-label={actionNotice.tone === "error" ? "Post action error" : "Post action status"}
            aria-live="polite"
          >
            <span className="action-notice__mark" aria-hidden="true" />
            <div>
              <strong>{actionNotice.title}</strong>
              <span>{actionNotice.detail}</span>
            </div>
          </div>
        ) : null}

        <div className={`editor-grid editor-grid--${isActiveTiptap ? "split" : editorMode}`}>
          <div className="editor-fields">
            <div className="editor-card">
              <div className="editor-card__heading">
                <h2>{locale === "zh" ? "文章设置" : "Post settings"}</h2>
                <span className={`status-pill status-pill--${status}`}>
                  {statusLabel(status, locale)}
                </span>
              </div>
              <p className="field-hint">{statusDescription(status, locale)}</p>
              <label>
                <span>Slug</span>
                <input value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="my-technical-note" />
              </label>
              <p className="field-hint">
                {locale === "zh"
                  ? "只能使用小写英文字母、数字和连字符；留空会按标题、摘要、正文自动生成，并追加 -2、-3 避免重复。"
                  : "Use lowercase letters, numbers, and hyphens only. Leave blank to generate one from the title, summary, or body, with -2/-3 added when needed."}
              </p>
              <label>
                <span>{locale === "zh" ? "分类" : "Category"}</span>
                <select value={categorySlug} onChange={(event) => setCategorySlug(event.target.value)}>
                  <option value="">{locale === "zh" ? "不设置分类" : "No category"}</option>
                  {categories.map((category) => (
                    <option key={category.slug} value={category.slug}>
                      {getTaxonomyDisplayName(category, locale)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="editor-tag-selector" aria-label={locale === "zh" ? "标签选择器" : "Tag selector"}>
                <div className="editor-tag-selector__heading">
                  <span>{locale === "zh" ? "标签" : "Tags"}</span>
                  <small>
                    {locale === "zh"
                      ? "搜索已有标签，多选后保存；新标签需要先创建。"
                      : "Search existing tags, select multiple, and create new tags deliberately."}
                  </small>
                </div>

                <div className="editor-selected-tags" aria-label={locale === "zh" ? "已选标签" : "Selected tags"}>
                  {selectedTags.length > 0 ? (
                    selectedTags.map((tag) => {
                      const displayName = getTaxonomyDisplayName(tag, locale);

                      return (
                        <button
                          className="editor-tag-chip"
                          type="button"
                          key={tag.slug}
                          aria-label={locale === "zh" ? `移除 ${displayName}` : `Remove ${displayName}`}
                          onClick={() => removeSelectedTagSlug(tag.slug)}
                        >
                          <span>{displayName}</span>
                          <code>/{tag.slug}</code>
                          <i aria-hidden="true">×</i>
                        </button>
                      );
                    })
                  ) : (
                    <span className="editor-selected-tags__empty">{locale === "zh" ? "尚未选择标签" : "No tags selected"}</span>
                  )}
                </div>

                <label>
                  <span>{locale === "zh" ? "搜索标签" : "Search tags"}</span>
                  <input
                    type="search"
                    value={tagSearch}
                    onChange={(event) => setTagSearch(event.target.value)}
                    placeholder={locale === "zh" ? "输入名称或 slug" : "Search by name or slug"}
                  />
                </label>

                <div className="editor-tag-options" aria-label={locale === "zh" ? "可选标签" : "Available tags"}>
                  {filteredTags.length > 0 ? (
                    filteredTags.map((tag) => {
                      const isSelected = selectedTagSlugs.includes(tag.slug);
                      const displayName = getTaxonomyDisplayName(tag, locale);

                      return (
                        <button
                          className={isSelected ? "editor-tag-option is-selected" : "editor-tag-option"}
                          type="button"
                          key={tag.slug}
                          aria-pressed={isSelected}
                          aria-label={locale === "zh" ? `${isSelected ? "已选" : "选择"} ${displayName}` : `${isSelected ? "Selected" : "Select"} ${displayName}`}
                          onClick={() => (isSelected ? removeSelectedTagSlug(tag.slug) : addSelectedTagSlug(tag.slug))}
                        >
                          <span>{displayName}</span>
                          <code>/{tag.slug}</code>
                        </button>
                      );
                    })
                  ) : (
                    <p className="field-hint">{locale === "zh" ? "没有匹配标签，可在下方创建。" : "No matching tags. Create one below."}</p>
                  )}
                </div>

                <div className="editor-tag-create" aria-label={locale === "zh" ? "快速创建标签" : "Quick create tag"}>
                  <label>
                    <span>{locale === "zh" ? "新标签名称" : "New tag name"}</span>
                    <input
                      value={quickTagName}
                      onChange={(event) => updateQuickTagName(event.target.value)}
                      placeholder={locale === "zh" ? "边缘运行时" : "Edge Runtime"}
                    />
                  </label>
                  <label>
                    <span>{locale === "zh" ? "新标签 slug" : "New tag slug"}</span>
                    <input
                      value={quickTagSlug}
                      onChange={(event) => updateQuickTagSlug(event.target.value)}
                      placeholder="edge-runtime"
                    />
                  </label>
                  <button className="secondary-button" type="button" disabled={isCreatingTag} onClick={() => void createAndSelectTag()}>
                    {isCreatingTag
                      ? locale === "zh"
                        ? "创建中..."
                        : "Creating..."
                      : locale === "zh"
                        ? "创建并选中标签"
                        : "Create and select tag"}
                  </button>
                </div>

                {tagSelectorError ? (
                  <p className="error-text" role="alert">
                    {tagSelectorError}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="editor-card editor-card--writing">
              <div className="editor-card__heading editor-card__heading--stacked">
                <div>
                  <p className="editor-terminal-kicker">{isFocusMode ? "Zen Mode: Writing Space" : "Markdown Writing Terminal"}</p>
                  <h2>{locale === "zh" ? "正文内容" : "Writing"}</h2>
                </div>
                <div className="editor-writing-tools">
                  <div className="language-tabs" role="tablist" aria-label="Editor language">
                    {(["zh", "en"] as const).map((translationLocale) => (
                      <button
                        type="button"
                        key={translationLocale}
                        className={activeLocale === translationLocale ? "is-active" : undefined}
                        onClick={() => setActiveLocale(translationLocale)}
                      >
                        {translationLocale === "zh" ? "中文" : "EN"}
                      </button>
                    ))}
                  </div>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={isBusy || isActiveTiptap}
                    title={translationDisabledTitle}
                    onClick={requestTranslation}
                  >
                    {isTranslating
                      ? locale === "zh"
                        ? "翻译中..."
                        : "Translating..."
                      : locale === "zh"
                        ? `翻译为${languageLabel(targetLocale, locale)}`
                        : `Translate to ${languageLabel(targetLocale, locale)}`}
                  </button>
                  <button className="secondary-button editor-focus-toggle" type="button" onClick={() => setIsFocusMode((current) => !current)}>
                    {isFocusMode ? (locale === "zh" ? "退出沉浸" : "Exit focus") : locale === "zh" ? "沉浸写作" : "Focus"}
                  </button>
                </div>
              </div>

              <div className="editor-writing-stats" aria-label={locale === "zh" ? "正文统计" : "Writing stats"}>
                <span><strong>{editorStats.characters}</strong>{locale === "zh" ? "字符" : "chars"}</span>
                <span><strong>{editorStats.paragraphs}</strong>{locale === "zh" ? "段落" : "paragraphs"}</span>
                <span><strong>{markdownHeadings.length}</strong>{locale === "zh" ? "标题" : "headings"}</span>
                <span><strong>{editorStats.readingMinutes}</strong>{locale === "zh" ? "分钟阅读" : "min read"}</span>
              </div>

              {isTranslating ? (
                <div className="translation-progress" role="status" aria-label="Translation progress" aria-live="polite">
                  <div>
                    <strong>{locale === "zh" ? "正在生成翻译草稿" : "Generating translation draft"}</strong>
                    <span>
                      {locale === "zh"
                        ? "完成后会自动填入目标语言，并切换到对应标签。"
                        : "When it finishes, the target language fields will be filled automatically."}
                    </span>
                  </div>
                  <div className="translation-progress__bar" aria-hidden="true">
                    <i />
                  </div>
                </div>
              ) : null}

              <label>
                <span>{locale === "zh" ? "标题" : "Title"}</span>
                <input value={currentTranslation.title} onChange={(event) => updateTranslation("title", event.target.value)} />
              </label>
              <label>
                <span>{locale === "zh" ? "摘要" : "Summary"}</span>
                <textarea value={currentTranslation.summary} onChange={(event) => updateTranslation("summary", event.target.value)} rows={3} />
              </label>
              {canChooseNewArticleFormat ? (
                <ArticleFormatActions
                  locale={locale}
                  currentFormat={currentTranslation.content.format}
                  onChooseFormat={chooseActiveLocaleFormat}
                />
              ) : null}
              {postId && !isActiveTiptap ? (
                <div className="article-conversion-panel" aria-label="Article format conversion">
                  <div>
                    <strong>Markdown storage</strong>
                    <p>Preview how the saved Markdown will become TipTap before changing this locale.</p>
                    {isDirty ? (
                      <span>{conversionDirtyMessage()}</span>
                    ) : hasPendingFormatDependency ? (
                      <span>{formatDependencyPendingMessage()}</span>
                    ) : null}
                  </div>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={isBusy || isDirty || hasPendingFormatDependency}
                    title={formatChangeDisabledTitle}
                    onClick={() => void previewTiptapConversion(activeLocale)}
                  >
                    {conversionAction === "preview" ? "Previewing..." : "Preview TipTap conversion"}
                  </button>
                </div>
              ) : null}
              {postId && canRestoreActiveMarkdown ? (
                <div className="article-conversion-panel article-conversion-panel--restore" aria-label="Article format conversion">
                  <div>
                    <strong>Markdown snapshot available</strong>
                    <p>
                      This locale can be restored to the exact Markdown captured before conversion
                      {currentTranslation.restoreMarkdownSnapshotAt ? ` at ${currentTranslation.restoreMarkdownSnapshotAt}` : ""}.
                    </p>
                    {isDirty ? (
                      <span>{conversionDirtyMessage()}</span>
                    ) : hasPendingFormatDependency ? (
                      <span>{formatDependencyPendingMessage()}</span>
                    ) : null}
                  </div>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={isBusy || isDirty || hasPendingFormatDependency}
                    title={formatChangeDisabledTitle}
                    onClick={() => requestRestoreMarkdown(activeLocale)}
                  >
                    Restore Markdown snapshot
                  </button>
                </div>
              ) : null}
              {!isActiveTiptap ? (
                <>
                  <div className="markdown-mode-row" role="tablist" aria-label="Markdown editor mode">
                    {MARKDOWN_EDITOR_MODES.map((mode) => (
                      <button
                        type="button"
                        key={mode}
                        className={editorMode === mode ? "is-active" : undefined}
                        aria-pressed={editorMode === mode}
                        onClick={() => changeEditorMode(mode)}
                      >
                        {markdownModeLabel(mode, locale)}
                      </button>
                    ))}
                  </div>
                  <div className="markdown-outline-panel" aria-label={locale === "zh" ? "Markdown 大纲" : "Markdown outline"}>
                    <div className="markdown-outline-panel__heading">
                      <span>{locale === "zh" ? "标题大纲" : "Outline"}</span>
                      <strong>{markdownHeadings.length}</strong>
                    </div>
                    {markdownHeadings.length > 0 ? (
                      <ol className="markdown-outline-list">
                        {markdownHeadings.map((heading) => (
                          <li key={heading.id} className={`heading-level-${heading.level}`}>
                            <button type="button" onClick={() => jumpToMarkdownOffset(heading.lineStart)}>
                              {heading.text}
                            </button>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="field-hint">
                        {locale === "zh" ? "添加 # 标题后会生成大纲。" : "Add # headings to build an outline."}
                      </p>
                    )}
                  </div>
                </>
              ) : null}
              {!isActiveTiptap && editorMode !== "preview" ? (
                <div className="editor-field editor-field--markdown-source">
                <div className="markdown-control-row">
                  <span>Markdown body</span>
                  <input
                    ref={fileInputRef}
                    aria-label="Upload image file"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="file-input-hidden"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      if (file && !isUploadingImageRef.current) {
                        void uploadImageFile(file);
                      }
                      event.currentTarget.value = "";
                    }}
                  />
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={isUploadingImage || isBusy}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {isUploadingImage ? (locale === "zh" ? "上传中..." : "Uploading...") : locale === "zh" ? "上传图片" : "Upload image"}
                  </button>
                </div>
                {isUploadingImage ? (
                  <div className="upload-progress" role="status" aria-live="polite">
                    <span>{locale === "zh" ? "正在上传并插入图片" : "Uploading and inserting image"}</span>
                    <div aria-hidden="true">
                      <i />
                    </div>
                  </div>
                ) : (
                  <p className="field-hint">
                    {locale === "zh"
                      ? "可选择文件、拖拽图片到正文，或直接粘贴本地截图。"
                      : "Choose a file, drop an image here, or paste a local screenshot directly."}
                  </p>
                )}
                  {markdownSearch.isOpen ? (
                    <div className="markdown-search-panel" role="search" aria-label={locale === "zh" ? "搜索 Markdown 正文" : "Search Markdown body"}>
                      <input
                        ref={markdownSearchInputRef}
                        type="search"
                        aria-label={locale === "zh" ? "搜索 Markdown 正文" : "Search Markdown body"}
                        value={markdownSearch.query}
                        onChange={(event) => updateMarkdownSearchQuery(event.target.value)}
                        onKeyDown={handleMarkdownSearchKeyDown}
                        placeholder={locale === "zh" ? "搜索正文" : "Search body"}
                      />
                      <span className="markdown-search-panel__count" aria-live="polite">
                        {markdownSearch.query
                          ? markdownSearchMatches.length > 0
                            ? `${activeSearchIndex + 1}/${markdownSearchMatches.length}`
                            : "0/0"
                          : "0"}
                      </span>
                      <button type="button" className="secondary-button" onClick={() => moveMarkdownSearchMatch(-1)}>
                        {locale === "zh" ? "上一个" : "Prev"}
                      </button>
                      <button type="button" className="secondary-button" onClick={() => moveMarkdownSearchMatch(1)}>
                        {locale === "zh" ? "下一个" : "Next"}
                      </button>
                      <button type="button" className="secondary-button" onClick={closeMarkdownSearch}>
                        {locale === "zh" ? "关闭" : "Close"}
                      </button>
                    </div>
                  ) : null}
                  <textarea
                  ref={markdownTextareaRef}
                  aria-label="Markdown body"
                  className={isDraggingImage ? "markdown-drop-target is-dragging" : "markdown-drop-target"}
                  value={currentTranslation.contentMarkdown}
                  onChange={(event) => updateTranslation("contentMarkdown", event.target.value)}
                  onKeyDown={handleMarkdownKeyDown}
                  onDragEnter={(event) => {
                    if (hasImageTransfer(event.dataTransfer.items)) {
                      setIsDraggingImage(true);
                    }
                  }}
                  onDragOver={(event) => {
                    if (hasImageTransfer(event.dataTransfer.items)) {
                      event.preventDefault();
                    }
                  }}
                  onDragLeave={() => setIsDraggingImage(false)}
                  onDrop={handleMarkdownDrop}
                  onPaste={handleMarkdownPaste}
                  rows={18}
                />
                </div>
              ) : null}
              {isActiveTiptap ? (
                activeTiptapError || !currentArticleDocument ? (
                  <div className="article-editor-recovery" role="alert">
                    <strong>{locale === "zh" ? "富文本正文无法加载" : "Rich text body could not be loaded"}</strong>
                    <p>
                      {locale === "zh"
                        ? "为避免覆盖原文，当前语言暂时只能查看兼容预览，请重新加载或恢复内容后再保存。"
                        : "To avoid overwriting the original article, this locale is read-only until you reload or restore the content."}
                    </p>
                    <MarkdownPreview markdown={currentTranslation.contentMarkdown} locale={locale} />
                  </div>
                ) : (
                  <ArticleEditor
                    key={activeLocale}
                    value={currentArticleDocument}
                    locale={activeLocale}
                    onChange={updateActiveArticleDocument}
                    onInvalidContent={(caught) =>
                      setTiptapEditorErrors((current) => ({
                        ...current,
                        [activeLocale]: caught instanceof Error ? caught.message : "Invalid article content"
                      }))
                    }
                    imageUploadController={articleImageUploadController}
                    imageUploadNotice={articleImageNotice}
                    readOnly={isBusy}
                  />
                )
              ) : null}

              {translationWarnings.length > 0 ? (
                <p className="warning-text">
                  {locale === "zh" ? "翻译已生成，请检查：" : "Translation generated. Review: "} {translationWarnings.join(" ")}
                </p>
              ) : null}
              {error ? <p className="error-text">{error}</p> : null}
            </div>
          </div>

          {isActiveTiptap || editorMode !== "source" ? (
            <aside ref={previewPaneRef} id="editor-preview" className={`preview-pane preview-pane--${isActiveTiptap ? "split" : editorMode}`} tabIndex={-1}>
            <div className="preview-pane__heading">
              <span>{locale === "zh" ? "预览" : "Preview"}</span>
              <strong>{languageLabel(activeLocale, locale)}</strong>
            </div>
            <MarkdownPreview
              translation={{
                locale: activeLocale,
                content: currentTranslation.content,
                contentMarkdown: isActiveTiptap ? currentTranslation.contentMarkdown : deferredMarkdown
              }}
              locale={locale}
            />
            </aside>
          ) : null}
        </div>
        </fieldset>
      </form>

      {isDeleteDialogOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-post-title">
            <h2 id="delete-post-title">{locale === "zh" ? "删除这篇文章？" : "Delete this post?"}</h2>
            <p>
              {locale === "zh"
                ? "删除后文章和关联上传图片会被移除，此操作无法撤销。"
                : "This removes the post and its uploaded images. This action cannot be undone."}
            </p>
            <div className="confirm-dialog__actions">
              <button className="secondary-button" type="button" disabled={isDeleting} onClick={() => setIsDeleteDialogOpen(false)}>
                {locale === "zh" ? "取消" : "Cancel"}
              </button>
              <button className="danger-button" type="button" disabled={isDeleting} onClick={() => void confirmDelete()}>
                {isDeleting ? (locale === "zh" ? "删除中..." : "Deleting...") : locale === "zh" ? "确认删除" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingTranslationTarget ? (
        <div className="modal-backdrop" role="presentation">
          <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="replace-translation-title">
            <h2 id="replace-translation-title">{locale === "zh" ? "覆盖已有翻译？" : "Replace existing translation?"}</h2>
            <p>
              {locale === "zh"
                ? `${languageLabel(pendingTranslationTarget, locale)}已有内容。继续翻译会替换目标语言的标题、摘要和正文。`
                : `${languageLabel(pendingTranslationTarget, locale)} already has content. Continuing will replace its title, summary, and body.`}
            </p>
            <div className="confirm-dialog__actions">
              <button className="secondary-button" type="button" disabled={isTranslating} onClick={() => setPendingTranslationTarget(null)}>
                {locale === "zh" ? "取消" : "Cancel"}
              </button>
              <button className="primary-button" type="button" disabled={isTranslating} onClick={() => void runTranslation(pendingTranslationTarget)}>
                {isTranslating ? (locale === "zh" ? "翻译中..." : "Translating...") : locale === "zh" ? "继续翻译" : "Continue"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {conversionPreview ? (
        <div className="modal-backdrop" role="presentation">
          <div className="confirm-dialog confirm-dialog--wide" role="dialog" aria-modal="true" aria-labelledby="conversion-preview-title">
            <h2 id="conversion-preview-title">Convert Markdown to rich text?</h2>
            <p>
              This preview is based on the saved {languageLabel(conversionPreview.locale, locale)} Markdown. The server recomputes
              the conversion when you confirm.
            </p>
            <div className="conversion-preview-summary">
              <div>
                <strong>Blockers</strong>
                {conversionPreview.preview.blockers.length > 0 ? (
                  <ul>
                    {conversionPreview.preview.blockers.map((issue) => (
                      <li key={`${issue.code}-${issue.line}-${issue.message}`}>{formatConversionIssue(issue)}</li>
                    ))}
                  </ul>
                ) : (
                  <span>No blockers found.</span>
                )}
              </div>
              <div>
                <strong>Warnings</strong>
                {conversionPreview.preview.warnings.length > 0 ? (
                  <ul>
                    {conversionPreview.preview.warnings.map((issue) => (
                      <li key={`${issue.code}-${issue.line}-${issue.message}`}>{formatConversionIssue(issue)}</li>
                    ))}
                  </ul>
                ) : (
                  <span>No warnings found.</span>
                )}
              </div>
            </div>
            {status === "published" && !isTiptapPublishGateEnabled ? (
              <p className="warning-text">
                TipTap publishing is not enabled yet. Hide this post before converting a published locale.
              </p>
            ) : null}
            {conversionPreview.preview.projectedMarkdown ? (
              <div className="conversion-preview-markdown">
                <strong>Projected Markdown after conversion</strong>
                <MarkdownPreview markdown={conversionPreview.preview.projectedMarkdown} locale={locale} />
              </div>
            ) : null}
            <div className="confirm-dialog__actions">
              <button
                className="secondary-button"
                type="button"
                disabled={Boolean(conversionAction)}
                onClick={() => setConversionPreview(null)}
              >
                Cancel
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={
                  Boolean(conversionAction) ||
                  hasPendingFormatDependency ||
                  !conversionPreview.preview.canConvert ||
                  conversionPreview.preview.blockers.length > 0 ||
                  (status === "published" && !isTiptapPublishGateEnabled)
                }
                onClick={() => void confirmTiptapConversion()}
              >
                {conversionAction === "convert" ? "Converting..." : "Convert to rich text"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingRestoreMarkdown ? (
        <div className="modal-backdrop" role="presentation">
          <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="restore-markdown-title">
            <h2 id="restore-markdown-title">Restore Markdown snapshot?</h2>
            <p>
              This replaces the {languageLabel(pendingRestoreMarkdown.locale, locale)} TipTap JSON with the exact Markdown snapshot
              captured before conversion
              {pendingRestoreMarkdown.snapshotAt ? ` at ${pendingRestoreMarkdown.snapshotAt}` : ""}.
            </p>
            <div className="confirm-dialog__actions">
              <button
                className="secondary-button"
                type="button"
                disabled={Boolean(conversionAction)}
                onClick={() => setPendingRestoreMarkdown(null)}
              >
                Cancel
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={Boolean(conversionAction) || hasPendingFormatDependency}
                onClick={() => void confirmRestoreMarkdown()}
              >
                {conversionAction === "restore" ? "Restoring..." : "Restore Markdown"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
