import type { Locale, UpsertAboutProfileInput } from "@tworiver/shared";
import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchAdminAboutProfile, updateAdminAboutProfile } from "../api/admin";

interface AdminAboutPageProps {
  locale: Locale;
}

interface SocialLinkDraft {
  label: string;
  url: string;
}

const EMPTY_FORM: UpsertAboutProfileInput = {
  displayName: "",
  headline: "",
  bio: "",
  avatarUrl: "",
  githubUrl: "",
  email: "",
  socialLinks: []
};

export function AdminAboutPage({ locale }: AdminAboutPageProps) {
  const [form, setForm] = useState<UpsertAboutProfileInput>(EMPTY_FORM);
  const [socialLinks, setSocialLinks] = useState<SocialLinkDraft[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadAbout() {
      setIsLoading(true);
      setError(null);

      try {
        const { about } = await fetchAdminAboutProfile();
        if (!isMounted) {
          return;
        }

        setForm({
          displayName: about.displayName,
          headline: about.headline,
          bio: about.bio,
          avatarUrl: about.avatarUrl,
          githubUrl: about.githubUrl,
          email: about.email,
          socialLinks: about.socialLinks
        });
        setSocialLinks(about.socialLinks);
      } catch (caught) {
        if (isMounted) {
          setError(caught instanceof Error ? caught.message : "Failed to load about profile");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadAbout();

    return () => {
      isMounted = false;
    };
  }, []);

  function updateField(field: keyof Omit<UpsertAboutProfileInput, "socialLinks">, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  function updateSocialLink(index: number, field: keyof SocialLinkDraft, value: string) {
    setSocialLinks((current) => current.map((link, linkIndex) => (linkIndex === index ? { ...link, [field]: value } : link)));
  }

  function addSocialLink() {
    setSocialLinks((current) => [...current, { label: "", url: "" }]);
  }

  function removeSocialLink(index: number) {
    setSocialLinks((current) => current.filter((_, linkIndex) => linkIndex !== index));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    const input: UpsertAboutProfileInput = {
      ...form,
      socialLinks: socialLinks.filter((link) => link.label.trim() && link.url.trim())
    };

    try {
      const { about } = await updateAdminAboutProfile(input);
      setForm({
        displayName: about.displayName,
        headline: about.headline,
        bio: about.bio,
        avatarUrl: about.avatarUrl,
        githubUrl: about.githubUrl,
        email: about.email,
        socialLinks: about.socialLinks
      });
      setSocialLinks(about.socialLinks);
      setSuccessMessage(locale === "zh" ? "关于页已保存。" : "About page saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to save about profile");
    } finally {
      setIsSaving(false);
    }
  }

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
            <p className="admin-kicker">Profile room</p>
            <Link className="back-link" to="/admin/posts">
              {locale === "zh" ? "返回后台" : "Back to admin"}
            </Link>
            <h1>{locale === "zh" ? "编辑关于页" : "Edit about page"}</h1>
            <p>{locale === "zh" ? "关于页是站点固定页面，只能编辑，不能删除。" : "The about page is permanent: editable, not deletable."}</p>
          </div>
          <div className="editor-actions">
            <Link className="secondary-button" to="/about">
              {locale === "zh" ? "查看页面" : "View page"}
            </Link>
            <button className="primary-button" type="submit" disabled={isSaving}>
              {isSaving ? (locale === "zh" ? "保存中..." : "Saving...") : locale === "zh" ? "保存关于页" : "Save about"}
            </button>
          </div>
        </div>

        <div className="editor-grid">
          <div className="editor-fields">
            <div className="editor-card">
              <div className="editor-card__heading">
                <h2>{locale === "zh" ? "个人信息" : "Personal info"}</h2>
                <span>{locale === "zh" ? "公开显示" : "Public"}</span>
              </div>
              <label>
                <span>{locale === "zh" ? "显示名称" : "Display name"}</span>
                <input value={form.displayName} onChange={(event) => updateField("displayName", event.target.value)} placeholder="TwoRiver" />
              </label>
              <label>
                <span>{locale === "zh" ? "一句话介绍" : "Headline"}</span>
                <input
                  value={form.headline}
                  onChange={(event) => updateField("headline", event.target.value)}
                  placeholder={locale === "zh" ? "软件工程师 / 技术写作者" : "Software engineer / technical writer"}
                />
              </label>
              <label>
                <span>{locale === "zh" ? "个人介绍" : "Bio"}</span>
                <textarea value={form.bio} onChange={(event) => updateField("bio", event.target.value)} rows={8} />
              </label>
              <label>
                <span>{locale === "zh" ? "头像 URL" : "Avatar URL"}</span>
                <input value={form.avatarUrl} onChange={(event) => updateField("avatarUrl", event.target.value)} placeholder="https://..." />
              </label>
            </div>

            <div className="editor-card">
              <div className="editor-card__heading">
                <h2>{locale === "zh" ? "联系方式" : "Contact links"}</h2>
                <button className="secondary-button" type="button" onClick={addSocialLink}>
                  {locale === "zh" ? "添加链接" : "Add link"}
                </button>
              </div>
              <label>
                <span>GitHub</span>
                <input value={form.githubUrl} onChange={(event) => updateField("githubUrl", event.target.value)} placeholder="https://github.com/..." />
              </label>
              <label>
                <span>{locale === "zh" ? "邮箱" : "Email"}</span>
                <input type="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} placeholder="hello@example.com" />
              </label>
              {socialLinks.map((link, index) => (
                <div className="social-link-fields" key={index}>
                  <label>
                    <span>{locale === "zh" ? "链接名称" : "Link label"}</span>
                    <input value={link.label} onChange={(event) => updateSocialLink(index, "label", event.target.value)} placeholder="X / LinkedIn / Website" />
                  </label>
                  <label>
                    <span>URL</span>
                    <input value={link.url} onChange={(event) => updateSocialLink(index, "url", event.target.value)} placeholder="https://..." />
                  </label>
                  <button className="secondary-button social-link-fields__remove" type="button" onClick={() => removeSocialLink(index)}>
                    {locale === "zh" ? "移除" : "Remove"}
                  </button>
                </div>
              ))}
              {socialLinks.length === 0 ? (
                <p className="muted">{locale === "zh" ? "暂无额外社交链接。" : "No extra social links yet."}</p>
              ) : null}
              {error ? <p className="error-text">{error}</p> : null}
              {successMessage ? <p className="success-text">{successMessage}</p> : null}
            </div>
          </div>

          <aside className="preview-pane about-preview">
            <div className="preview-pane__heading">
              <span>{locale === "zh" ? "预览" : "Preview"}</span>
              <strong>{locale === "zh" ? "关于页" : "About"}</strong>
            </div>
            {form.avatarUrl.trim() ? <img src={form.avatarUrl} alt="" /> : <div className="about-preview__avatar">{(form.displayName || "T").slice(0, 1).toUpperCase()}</div>}
            <h2>{form.displayName || (locale === "zh" ? "关于 TwoRiver" : "About TwoRiver")}</h2>
            <p>{form.headline || (locale === "zh" ? "一句话介绍会显示在这里。" : "Headline will appear here.")}</p>
            <p className="muted">{form.bio || (locale === "zh" ? "个人介绍为空时，前台会显示合理占位。" : "The public page shows a friendly placeholder when bio is empty.")}</p>
          </aside>
        </div>
      </form>
    </section>
  );
}
