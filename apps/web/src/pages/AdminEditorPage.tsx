import type { Category, Locale, PostStatus, PostTranslation, UpsertPostInput } from "@tworiver/shared";
import { type ClipboardEvent, type DragEvent, type FormEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  createAdminPost,
  deleteAdminPost,
  fetchAdminCategories,
  fetchAdminPost,
  translateAdminPostDraft,
  updateAdminPost,
  uploadAdminPostImage
} from "../api/admin";
import { MarkdownPreview } from "../components/MarkdownPreview";

interface AdminEditorPageProps {
  locale: Locale;
}

type TranslationDraft = Record<Locale, Pick<PostTranslation, "title" | "summary" | "contentMarkdown">>;
type SaveAction = "draft" | "save" | "publish" | "hide" | "republish" | null;
type ActionNotice = { tone: "pending" | "success" | "error"; title: string; detail: string };

const EMPTY_TRANSLATIONS: TranslationDraft = {
  zh: { title: "", summary: "", contentMarkdown: "" },
  en: { title: "", summary: "", contentMarkdown: "" }
};

const DEFAULT_IMAGE_ALT = "图片";
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function cloneTranslations(): TranslationDraft {
  return {
    zh: { ...EMPTY_TRANSLATIONS.zh },
    en: { ...EMPTY_TRANSLATIONS.en }
  };
}

function buildInput(
  slug: string,
  status: PostStatus,
  publishedAt: string | null,
  categorySlug: string,
  tagText: string,
  translations: TranslationDraft
): UpsertPostInput {
  const nextTranslations = (["zh", "en"] as const)
    .map((translationLocale) => ({
      locale: translationLocale,
      title: translations[translationLocale].title.trim(),
      summary: translations[translationLocale].summary.trim(),
      contentMarkdown: translations[translationLocale].contentMarkdown,
      seoTitle: null,
      seoDescription: null
    }))
    .filter((translation) => translation.title || translation.contentMarkdown);

  return {
    slug: slug.trim(),
    status,
    publishedAt: status === "draft" ? null : publishedAt ?? new Date().toISOString(),
    categorySlug: categorySlug.trim() || null,
    tagSlugs: tagText
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    translations:
      nextTranslations.length > 0
        ? nextTranslations
        : [{ ...translations.zh, locale: "zh", seoTitle: null, seoDescription: null }]
  };
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

function hasTranslationContent(translation: TranslationDraft[Locale]): boolean {
  return Boolean(translation.title.trim() || translation.summary.trim() || translation.contentMarkdown.trim());
}

export function AdminEditorPage({ locale }: AdminEditorPageProps) {
  const navigate = useNavigate();
  const { id } = useParams();
  const postId = id && id !== "new" ? Number(id) : undefined;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const markdownTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const previewPaneRef = useRef<HTMLElement | null>(null);
  const isUploadingImageRef = useRef(false);
  const [activeLocale, setActiveLocale] = useState<Locale>(locale);
  const [postUid, setPostUid] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState<PostStatus>("draft");
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [categorySlug, setCategorySlug] = useState("");
  const [tagText, setTagText] = useState("");
  const [translations, setTranslations] = useState<TranslationDraft>(cloneTranslations);
  const [isLoading, setIsLoading] = useState(Boolean(postId));
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [saveAction, setSaveAction] = useState<SaveAction>(null);
  const [actionNotice, setActionNotice] = useState<ActionNotice | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [pendingTranslationTarget, setPendingTranslationTarget] = useState<Locale | null>(null);
  const [translationWarnings, setTranslationWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    fetchAdminCategories()
      .then(({ categories: nextCategories }) => {
        if (isMounted) {
          setCategories(nextCategories);
        }
      })
      .catch(() => undefined);
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!postId) {
      setPostUid(null);
      return;
    }

    let isMounted = true;
    const selectedPostId = postId;

    async function loadPost() {
      setIsLoading(true);
      setError(null);

      try {
        const { post } = await fetchAdminPost(selectedPostId);
        if (!isMounted) {
          return;
        }

        const nextTranslations = cloneTranslations();
        for (const translation of post.translations) {
          nextTranslations[translation.locale] = {
            title: translation.title,
            summary: translation.summary,
            contentMarkdown: translation.contentMarkdown
          };
        }

        setSlug(post.slug);
        setPostUid(post.uid);
        setStatus(post.status);
        setPublishedAt(post.publishedAt);
        setCategorySlug(post.category?.slug ?? "");
        setTagText(post.tags.map((tag) => tag.slug).join(", "));
        setTranslations(nextTranslations);
      } catch (caught) {
        if (isMounted) {
          setError(caught instanceof Error ? caught.message : "Failed to load post");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadPost();

    return () => {
      isMounted = false;
    };
  }, [postId]);

  function updateTranslation(field: keyof TranslationDraft[Locale], value: string) {
    setTranslations((current) => ({
      ...current,
      [activeLocale]: {
        ...current[activeLocale],
        [field]: value
      }
    }));
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

  async function savePost(nextStatus: PostStatus, action: NonNullable<SaveAction>) {
    setError(null);
    setTranslationWarnings([]);
    setSaveAction(action);
    setActionNotice({
      tone: "pending",
      title: actionPendingTitle(action, locale),
      detail: actionNoticeDetail(action, "pending", locale)
    });
    const input = buildInput(slug, nextStatus, publishedAt, categorySlug, tagText, translations);

    try {
      const { post } = postId ? await updateAdminPost(postId, input) : await createAdminPost(input);
      setPostUid(post.uid);
      setStatus(post.status);
      setPublishedAt(post.publishedAt);
      setActionNotice({
        tone: "success",
        title: actionSuccessTitle(action, locale),
        detail: actionNoticeDetail(action, "success", locale)
      });
      if (!postId) {
        navigate(`/admin/posts/${post.id}`);
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Failed to save post";
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
        [targetLocale]: {
          title: translation.title,
          summary: translation.summary,
          contentMarkdown: translation.contentMarkdown
        }
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

  function focusPreview() {
    previewPaneRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    previewPaneRef.current?.focus();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void savePost(status, "save");
  }

  const currentTranslation = translations[activeLocale];
  const targetLocale = otherLocale(activeLocale);
  const isBusy = Boolean(saveAction) || isDeleting || isTranslating;
  const canPreview = Boolean(postId && slug.trim() && status !== "draft");

  if (isLoading) {
    return (
      <section className="page-section admin-panel">
        <p className="muted">Loading...</p>
      </section>
    );
  }

  return (
    <section className="admin-editor">
      <form className="editor-shell" onSubmit={handleSubmit}>
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
                <button className="secondary-button" type="button" disabled={isBusy} onClick={() => void savePost("draft", "draft")}>
                  {saveAction === "draft" ? (locale === "zh" ? "保存中..." : "Saving...") : locale === "zh" ? "保存草稿" : "Save draft"}
                </button>
                <button className="primary-button" type="button" disabled={isBusy} onClick={() => void savePost("published", "publish")}>
                  {saveAction === "publish" ? (locale === "zh" ? "发布中..." : "Publishing...") : locale === "zh" ? "发布" : "Publish"}
                </button>
              </>
            ) : (
              <>
                <button className="secondary-button" type="button" disabled={isBusy} onClick={() => void savePost(status, "save")}>
                  {saveAction === "save" ? (locale === "zh" ? "保存中..." : "Saving...") : locale === "zh" ? "保存修改" : "Save changes"}
                </button>
                {status === "published" ? (
                  <button className="danger-button" type="button" disabled={isBusy} onClick={() => void savePost("hidden", "hide")}>
                    {saveAction === "hide" ? (locale === "zh" ? "下架中..." : "Hiding...") : locale === "zh" ? "隐藏/下架" : "Hide"}
                  </button>
                ) : (
                  <button className="primary-button" type="button" disabled={isBusy} onClick={() => void savePost("published", "republish")}>
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

        <div className="editor-grid">
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
              <label>
                <span>{locale === "zh" ? "分类" : "Category"}</span>
                <select value={categorySlug} onChange={(event) => setCategorySlug(event.target.value)}>
                  <option value="">{locale === "zh" ? "不设置分类" : "No category"}</option>
                  {categories.map((category) => (
                    <option key={category.slug} value={category.slug}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{locale === "zh" ? "标签（逗号分隔）" : "Tags (comma-separated)"}</span>
                <input value={tagText} onChange={(event) => setTagText(event.target.value)} placeholder="typescript, sqlite" />
              </label>
            </div>

            <div className="editor-card editor-card--writing">
              <div className="editor-card__heading editor-card__heading--stacked">
                <h2>{locale === "zh" ? "正文内容" : "Writing"}</h2>
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
                  <button className="secondary-button" type="button" disabled={isBusy} onClick={requestTranslation}>
                    {isTranslating
                      ? locale === "zh"
                        ? "翻译中..."
                        : "Translating..."
                      : locale === "zh"
                        ? `翻译为${languageLabel(targetLocale, locale)}`
                        : `Translate to ${languageLabel(targetLocale, locale)}`}
                  </button>
                </div>
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
              <div className="editor-field">
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
                <textarea
                  ref={markdownTextareaRef}
                  aria-label="Markdown body"
                  className={isDraggingImage ? "markdown-drop-target is-dragging" : "markdown-drop-target"}
                  value={currentTranslation.contentMarkdown}
                  onChange={(event) => updateTranslation("contentMarkdown", event.target.value)}
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

              {translationWarnings.length > 0 ? (
                <p className="warning-text">
                  {locale === "zh" ? "翻译已生成，请检查：" : "Translation generated. Review: "} {translationWarnings.join(" ")}
                </p>
              ) : null}
              {error ? <p className="error-text">{error}</p> : null}
            </div>
          </div>

          <aside ref={previewPaneRef} id="editor-preview" className="preview-pane" tabIndex={-1}>
            <div className="preview-pane__heading">
              <span>{locale === "zh" ? "预览" : "Preview"}</span>
              <strong>{languageLabel(activeLocale, locale)}</strong>
            </div>
            <MarkdownPreview markdown={currentTranslation.contentMarkdown} />
          </aside>
        </div>
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
    </section>
  );
}
