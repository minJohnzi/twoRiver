import type { Locale, PostStatus, PostTranslation, UpsertPostInput } from "@tworiver/shared";
import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { createAdminPost, fetchAdminPost, updateAdminPost } from "../api/admin";
import { MarkdownPreview } from "../components/MarkdownPreview";

interface AdminEditorPageProps {
  locale: Locale;
}

type TranslationDraft = Record<Locale, Pick<PostTranslation, "title" | "summary" | "contentMarkdown">>;

const EMPTY_TRANSLATIONS: TranslationDraft = {
  zh: { title: "", summary: "", contentMarkdown: "" },
  en: { title: "", summary: "", contentMarkdown: "" }
};

function cloneTranslations(): TranslationDraft {
  return {
    zh: { ...EMPTY_TRANSLATIONS.zh },
    en: { ...EMPTY_TRANSLATIONS.en }
  };
}

function buildInput(slug: string, status: PostStatus, tagText: string, translations: TranslationDraft): UpsertPostInput {
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
    tagSlugs: tagText
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    translations: nextTranslations.length > 0 ? nextTranslations : [{ ...translations.zh, locale: "zh", seoTitle: null, seoDescription: null }]
  };
}

export function AdminEditorPage({ locale }: AdminEditorPageProps) {
  const navigate = useNavigate();
  const { id } = useParams();
  const postId = id && id !== "new" ? Number(id) : undefined;
  const [activeLocale, setActiveLocale] = useState<Locale>(locale);
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState<PostStatus>("draft");
  const [tagText, setTagText] = useState("");
  const [translations, setTranslations] = useState<TranslationDraft>(cloneTranslations);
  const [isLoading, setIsLoading] = useState(Boolean(postId));
  const [error, setError] = useState<string | null>(null);

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
            contentMarkdown: translation.contentMarkdown
          };
        }

        setSlug(post.slug);
        setStatus(post.status);
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
    const input = buildInput(slug, nextStatus, tagText, translations);

    try {
      const { post } = postId ? await updateAdminPost(postId, input) : await createAdminPost(input);
      navigate(`/admin/posts/${post.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to save post");
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
            <p className="admin-kicker">{locale === "zh" ? "Writing room" : "Writing room"}</p>
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
