import type { AboutProfile, Locale } from "@tworiver/shared";
import { useEffect, useState } from "react";
import { fetchAboutProfile } from "../api/posts";

interface AboutPageProps {
  locale: Locale;
}

interface ContactLink {
  label: string;
  value: string;
  href: string;
  external: boolean;
}

const EMPTY_ABOUT: AboutProfile = {
  displayName: "",
  headline: "",
  bio: "",
  avatarUrl: "",
  githubUrl: "",
  email: "",
  socialLinks: [],
  updatedAt: null
};

function isEmptyProfile(about: AboutProfile): boolean {
  return (
    !about.displayName.trim() &&
    !about.headline.trim() &&
    !about.bio.trim() &&
    !about.avatarUrl.trim() &&
    !about.githubUrl.trim() &&
    !about.email.trim() &&
    about.socialLinks.length === 0
  );
}

function getLinkHref(url: string): string {
  if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url)) {
    return url;
  }

  return `https://${url}`;
}

function getHostLabel(url: string): string {
  try {
    return new URL(getLinkHref(url)).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function buildContactLinks(about: AboutProfile): ContactLink[] {
  const links: ContactLink[] = [];

  if (about.githubUrl.trim()) {
    links.push({
      label: "GitHub",
      value: getHostLabel(about.githubUrl),
      href: getLinkHref(about.githubUrl),
      external: true
    });
  }

  if (about.email.trim()) {
    links.push({
      label: "Email",
      value: about.email,
      href: `mailto:${about.email}`,
      external: false
    });
  }

  for (const link of about.socialLinks) {
    links.push({
      label: link.label,
      value: getHostLabel(link.url),
      href: getLinkHref(link.url),
      external: true
    });
  }

  return links;
}

export function AboutPage({ locale }: AboutPageProps) {
  const [about, setAbout] = useState<AboutProfile>(EMPTY_ABOUT);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadAbout() {
      setIsLoading(true);
      setError(null);

      try {
        const { about: nextAbout } = await fetchAboutProfile();
        if (isMounted) {
          setAbout(nextAbout);
        }
      } catch (caught) {
        if (isMounted) {
          setError(caught instanceof Error ? caught.message : "Failed to load about page");
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

  const hasContent = !isEmptyProfile(about);
  const contactLinks = buildContactLinks(about);
  const title = about.displayName.trim() || (locale === "zh" ? "关于 TwoRiver" : "About TwoRiver");
  const headline =
    about.headline.trim() ||
    (hasContent
      ? ""
      : locale === "zh"
        ? "这里会展示个人介绍、头像与联系方式。"
        : "Personal introduction, avatar, and contact links will appear here.");
  const bio =
    about.bio.trim() ||
    (locale === "zh"
      ? "个人介绍暂时为空。登录后台后可以补充介绍、头像、GitHub、邮箱和其它社交链接。"
      : "The personal introduction is empty for now. Sign in to add a bio, avatar, GitHub, email, and social links.");

  return (
    <section className="about-page">
      <header className="page-heading about-heading">
        <div>
          <h1>{title}</h1>
          {headline ? <p>{headline}</p> : null}
        </div>
        {about.avatarUrl.trim() ? (
          <img className="about-avatar" src={about.avatarUrl} alt={locale === "zh" ? `${title} 的头像` : `${title} avatar`} />
        ) : (
          <div className="about-avatar about-avatar--placeholder" aria-hidden="true">
            {title.slice(0, 1).toUpperCase()}
          </div>
        )}
      </header>

      {isLoading ? <p className="muted">Loading...</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      {!isLoading && !error ? (
        <div className="content-grid">
          <section className="section-block" aria-labelledby="about-intro">
            <div className="section-title-row">
              <h2 id="about-intro">{locale === "zh" ? "个人介绍" : "Introduction"}</h2>
              <span className="muted">{hasContent ? (locale === "zh" ? "已填写" : "Updated") : locale === "zh" ? "占位" : "Placeholder"}</span>
            </div>
            <p className={about.bio.trim() ? "about-copy" : "about-copy about-copy--empty"}>{bio}</p>
          </section>

          <section className="section-block" aria-labelledby="about-links">
            <div className="section-title-row">
              <h2 id="about-links">{locale === "zh" ? "链接" : "Links"}</h2>
              <span className="muted">{contactLinks.length}</span>
            </div>
            {contactLinks.length > 0 ? (
              <div className="about-link-list" aria-label={locale === "zh" ? "社交链接" : "Social links"}>
                {contactLinks.map((link) => (
                  <a key={`${link.label}-${link.href}`} href={link.href} target={link.external ? "_blank" : undefined} rel={link.external ? "noreferrer" : undefined}>
                    <span>{link.label}</span>
                    <strong>{link.value}</strong>
                  </a>
                ))}
              </div>
            ) : (
              <p className="muted">{locale === "zh" ? "暂无社交链接。" : "No social links yet."}</p>
            )}
          </section>
        </div>
      ) : null}
    </section>
  );
}
