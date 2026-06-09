import type { Category, Locale, PostStatus, PostTranslation, TranslationDraftInput, UpsertPostInput } from "@tworiver/shared";
import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  createAdminPost,
  deleteAdminPost,
  fetchAdminCategories,
  fetchAdminPost,
  translateAdminPostDraft,
  updateAdminPost
} from "../api/admin";
import { MarkdownPreview } from "../components/MarkdownPreview";

interface AdminEditorPageProps {
  locale: Locale;
}

type TranslationDraft = Record<Locale, Pick<PostTranslation, "title" | "summary" | "contentMarkdown" | "seoTitle" | "seoDescription">>;

const EMPTY_TRANSLATIONS: TranslationDraft = {
  zh: { title: "", summary: "", contentMarkdown: "", seoTitle: null, seoDescription: null },
  en: { title: "", summary: "", contentMarkdown: "", seoTitle: null, seoDescription: null }
};

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
      seoTitle: normalizeOptionalText(translations[translationLocale].seoTitle),
      seoDescription: normalizeOptionalText(translations[translationLocale].seoDescription)
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
        : [
            {
              ...translations.zh,
              locale: "zh",
              title: translations.zh.title.trim(),
              summary: translations.zh.summary.trim(),
              seoTitle: normalizeOptionalText(translations.zh.seoTitle),
              seoDescription: normalizeOptionalText(translations.zh.seoDescription)
            }
          ]
  };
}

function normalizeOptionalText(value: string | null): string | null {
  const nextValue = value?.trim() ?? "";
  return nextValue || null;
}

function getTargetLocale(sourceLocale: Locale): Locale {
  return sourceLocale === "zh" ? "en" : "zh";
}

function hasTranslationContent(translation: TranslationDraft[Locale]): boolean {
  return Boolean(
    translation.title.trim() ||
      translation.summary.trim() ||
      translation.contentMarkdown.trim() ||
      translation.seoTitle?.trim() ||
      translation.seoDescription?.trim()
  );
}

function buildTranslationInput(sourceLocale: Locale, translations: TranslationDraft): TranslationDraftInput {
  const source = translations[sourceLocale];
  return {
    source: {
      locale: sourceLocale,
      title: source.title,
      summary: source.summary,
      contentMarkdown: source.contentMarkdown,
      seoTitle: normalizeOptionalText(source.seoTitle),
      seoDescription: normalizeOptionalText(source.seoDescription)
    },
    targetLocale: getTargetLocale(sourceLocale)
  };
}

export function AdminEditorPage({ locale }: AdminEditorPageProps) {
  const navigate = useNavigate();
  const { id } = useParams();
  const postId = id && id !== "new" ? Number(id) : undefined;
  const [activeLocale, setActiveLocale] = useState<Locale>(locale);
  const [categories, setCategories] = useState<Category[]>([]);
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState<PostStatus>("draft");
  const [categorySlug, setCategorySlug] = useState("");
  const [tagText, setTagText] = useState("");
  const [translations, setTranslations] = useState<TranslationDraft>(cloneTranslations);
  const [isLoading, setIsLoading] = useState(Boolean(postId));
  const [isTranslating, setIsTranslating] = useState(false);
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
            contentMarkdown: translation.contentMarkdown,
            seoTitle: translation.seoTitle,
            seoDescription: translation.seoDescription
          };
        }

        setSlug(post.slug);
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

  async function savePost(nextStatus: PostStatus) {
    setError(null);
    const input = buildInput(slug, nextStatus, categorySlug, tagText, translations);

    try {
      const { post } = postId ? await updateAdminPost(postId, input) : await createAdminPost(input);
      navigate(`/admin/posts/${post.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to save post");
    }
  }

  async function handleTranslateDraft() {
    const targetLocale = getTargetLocale(activeLocale);
    const sourceTranslation = translations[activeLocale];

    if (!sourceTranslation.title.trim() && !sourceTranslation.contentMarkdown.trim()) {
      setError(locale === "zh" ? "Source title or body is required" : "Source title or body is required");
      return;
    }

    if (hasTranslationContent(translations[targetLocale])) {
      const confirmed = window.confirm(
        locale === "zh"
          ? "Target translation already has content. Replace it?"
          : "Target translation already has content. Replace it?"
      );
      if (!confirmed) {
        return;
      }
    }

    setIsTranslating(true);
    setError(null);
    setTranslationWarnings([]);

    try {
      const result = await translateAdminPostDraft(buildTranslationInput(activeLocale, translations));
      setTranslations((current) => ({
        ...current,
        [targetLocale]: {
          title: result.translation.title,
          summary: result.translation.summary,
          contentMarkdown: result.translation.contentMarkdown,
          seoTitle: result.translation.seoTitle,
          seoDescription: result.translation.seoDescription
        }
      }));
      setActiveLocale(targetLocale);
      setTranslationWarnings(result.warnings);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to translate draft");
    } finally {
      setIsTranslating(false);
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
  const translationButtonLabel = isTranslating
    ? locale === "zh"
      ? "翻译中..."
      : "Translating..."
    : activeLocale === "zh"
      ? "Translate to EN"
      : "Translate to Chinese";
  const warningSummary = `Translation completed with ${translationWarnings.length} structure warning(s).`;

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
                <div className="editor-language-actions">
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
                  <button className="secondary-button translate-draft-button" type="button" onClick={() => void handleTranslateDraft()} disabled={isTranslating}>
                    {translationButtonLabel}
                  </button>
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
              <label>
                <span>Markdown body</span>
                <textarea
                  aria-label="Markdown body"
                  value={currentTranslation.contentMarkdown}
                  onChange={(event) => updateTranslation("contentMarkdown", event.target.value)}
                  rows={18}
                />
              </label>

              {error ? <p className="error-text">{error}</p> : null}
              {translationWarnings.length > 0 ? (
                <div className="warning-text" role="status">
                  <p>{warningSummary}</p>
                  <ul>
                    {translationWarnings.map((warning, index) => (
                      <li key={`${index}-${warning}`}>{warning}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
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
