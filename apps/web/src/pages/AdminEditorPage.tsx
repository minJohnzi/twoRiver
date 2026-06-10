import type { Category, Locale, PostStatus, PostTranslation, UpsertPostInput } from "@tworiver/shared";
import { type ClipboardEvent, type DragEvent, type FormEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  createAdminPost,
  deleteAdminPost,
  fetchAdminCategories,
  fetchAdminPost,
  updateAdminPost,
  uploadAdminPostImage
} from "../api/admin";
import { MarkdownPreview } from "../components/MarkdownPreview";

interface AdminEditorPageProps {
  locale: Locale;
}

type TranslationDraft = Record<Locale, Pick<PostTranslation, "title" | "summary" | "contentMarkdown">>;

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
    publishedAt: status === "published" ? new Date().toISOString() : null,
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

export function AdminEditorPage({ locale }: AdminEditorPageProps) {
  const navigate = useNavigate();
  const { id } = useParams();
  const postId = id && id !== "new" ? Number(id) : undefined;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const markdownTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isUploadingImageRef = useRef(false);
  const [activeLocale, setActiveLocale] = useState<Locale>(locale);
  const [postUid, setPostUid] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState<PostStatus>("draft");
  const [categorySlug, setCategorySlug] = useState("");
  const [tagText, setTagText] = useState("");
  const [translations, setTranslations] = useState<TranslationDraft>(cloneTranslations);
  const [isLoading, setIsLoading] = useState(Boolean(postId));
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
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
    }
  }

  function getFirstTransferredFile(files: FileList | File[] | undefined) {
    return Array.from(files ?? [])[0];
  }

  function handleMarkdownDrop(event: DragEvent<HTMLTextAreaElement>) {
    const file = getFirstTransferredFile(event.dataTransfer.files);
    if (!file) {
      return;
    }

    event.preventDefault();
    setIsDraggingImage(false);
    void uploadImageFile(file);
  }

  function handleMarkdownPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const file = getFirstTransferredFile(event.clipboardData.files);
    if (!file) {
      return;
    }

    event.preventDefault();
    void uploadImageFile(file);
  }

  async function savePost(nextStatus: PostStatus) {
    setError(null);
    const input = buildInput(slug, nextStatus, categorySlug, tagText, translations);

    try {
      const { post } = postId ? await updateAdminPost(postId, input) : await createAdminPost(input);
      setPostUid(post.uid);
      navigate(`/admin/posts/${post.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to save post");
    }
  }

  async function handleDelete() {
    if (!postId) {
      return;
    }
    const confirmed = window.confirm(locale === "zh" ? "确定删除这篇文章？" : "Delete this post?");
    if (!confirmed) {
      return;
    }

    setError(null);
    try {
      await deleteAdminPost(postId);
      navigate("/admin/posts");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to delete post");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void savePost(status);
  }

  const currentTranslation = translations[activeLocale];

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
          <div className="editor-actions">
            <button className="secondary-button" type="button" onClick={() => void savePost("draft")}>
              {locale === "zh" ? "保存草稿" : "Save draft"}
            </button>
            <button className="primary-button" type="button" onClick={() => void savePost("published")}>
              {locale === "zh" ? "发布" : "Publish"}
            </button>
            {postId ? (
              <button className="secondary-button" type="button" onClick={() => void handleDelete()}>
                {locale === "zh" ? "删除" : "Delete"}
              </button>
            ) : null}
          </div>
        </div>

        <div className="editor-grid">
          <div className="editor-fields">
            <div className="editor-card">
              <div className="editor-card__heading">
                <h2>{locale === "zh" ? "文章设置" : "Post settings"}</h2>
                <span className={`status-pill status-pill--${status}`}>{status}</span>
              </div>
              <label>
                <span>Slug</span>
                <input value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="my-technical-note" />
              </label>
              <label>
                <span>{locale === "zh" ? "状态" : "Status"}</span>
                <select value={status} onChange={(event) => setStatus(event.target.value as PostStatus)}>
                  <option value="draft">{locale === "zh" ? "草稿" : "Draft"}</option>
                  <option value="published">{locale === "zh" ? "发布" : "Published"}</option>
                </select>
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
              <div className="editor-card__heading">
                <h2>{locale === "zh" ? "正文内容" : "Writing"}</h2>
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
              </div>

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
                    disabled={isUploadingImage}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {isUploadingImage ? (locale === "zh" ? "上传中..." : "Uploading...") : locale === "zh" ? "上传图片" : "Upload image"}
                  </button>
                </div>
                <textarea
                  ref={markdownTextareaRef}
                  aria-label="Markdown body"
                  className={isDraggingImage ? "markdown-drop-target is-dragging" : "markdown-drop-target"}
                  value={currentTranslation.contentMarkdown}
                  onChange={(event) => updateTranslation("contentMarkdown", event.target.value)}
                  onDragEnter={(event) => {
                    if (Array.from(event.dataTransfer.items).some((item) => item.kind === "file")) {
                      setIsDraggingImage(true);
                    }
                  }}
                  onDragOver={(event) => {
                    if (Array.from(event.dataTransfer.items).some((item) => item.kind === "file")) {
                      event.preventDefault();
                    }
                  }}
                  onDragLeave={() => setIsDraggingImage(false)}
                  onDrop={handleMarkdownDrop}
                  onPaste={handleMarkdownPaste}
                  rows={18}
                />
              </div>

              {error ? <p className="error-text">{error}</p> : null}
            </div>
          </div>

          <aside className="preview-pane">
            <div className="preview-pane__heading">
              <span>{locale === "zh" ? "预览" : "Preview"}</span>
              <strong>{activeLocale === "zh" ? "中文" : "EN"}</strong>
            </div>
            <MarkdownPreview markdown={currentTranslation.contentMarkdown} />
          </aside>
        </div>
      </form>
    </section>
  );
}
