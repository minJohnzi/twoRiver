import type { AboutProfile, Locale } from "@tworiver/shared";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { resolveApiAssetUrl } from "../api/client";
import { fetchAboutProfile } from "../api/posts";

interface AboutPageProps {
  locale: Locale;
}

interface ContactLink {
  label: string;
  href: string;
  external: boolean;
  icon?: ContactIconName | undefined;
}

type ContactIconName = "email" | "github" | "instagram" | "linkedin" | "rss" | "x";

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

const CONTACT_ICONS: Record<string, ContactIconName> = {
  email: "email",
  github: "github",
  ins: "instagram",
  instagram: "instagram",
  linkedin: "linkedin",
  rss: "rss",
  x: "x"
};

function ContactIcon({ name }: { name: ContactIconName }) {
  const paths: Record<ContactIconName, ReactNode> = {
    email: <><rect x="3.5" y="5.5" width="17" height="13" rx="2" /><path d="m4.5 7 7.5 6 7.5-6" /></>,
    github: <><path d="M12 2.8a9.2 9.2 0 0 0-2.9 17.9c.46.08.62-.2.62-.44v-1.56c-2.55.56-3.08-1.1-3.08-1.1-.42-1.06-1.02-1.34-1.02-1.34-.83-.57.06-.56.06-.56.92.06 1.4.94 1.4.94.82 1.39 2.14.99 2.66.76.08-.59.32-.99.58-1.22-2.03-.23-4.17-1.02-4.17-4.52 0-1 .36-1.82.94-2.46-.1-.23-.41-1.17.09-2.43 0 0 .77-.25 2.52.94a8.68 8.68 0 0 1 4.58 0c1.75-1.19 2.52-.94 2.52-.94.5 1.26.19 2.2.09 2.43.58.64.94 1.46.94 2.46 0 3.52-2.14 4.29-4.18 4.52.33.28.62.83.62 1.68v2.49c0 .24.16.52.63.43A9.2 9.2 0 0 0 12 2.8Z" /></>,
    instagram: <><rect x="4" y="4" width="16" height="16" rx="4" /><circle cx="12" cy="12" r="3.4" /><circle cx="16.6" cy="7.4" r="0.8" /></>,
    linkedin: <><path d="M6.8 10v8" /><path d="M6.8 6.4v.1" /><path d="M11 18v-8" /><path d="M11 13.7c0-2.4 4.8-3.1 4.8.1V18" /></>,
    rss: <><path d="M5 5c7.7 0 14 6.3 14 14" /><path d="M5 10.5c4.7 0 8.5 3.8 8.5 8.5" /><circle cx="6.3" cy="17.7" r="1.3" /></>,
    x: <><path d="M5 5l14 14" /><path d="M19 5 5 19" /></>
  };

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

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
  if (url.startsWith("/")) {
    return url;
  }

  if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url)) {
    return url;
  }

  return `https://${url}`;
}

function getContactIcon(label: string): ContactIconName | undefined {
  return CONTACT_ICONS[label.trim().toLowerCase()];
}

function buildContactLinks(about: AboutProfile): ContactLink[] {
  const links: ContactLink[] = [];

  if (about.email.trim()) {
    links.push({
      label: "Email",
      href: `mailto:${about.email}`,
      external: false,
      icon: CONTACT_ICONS.email
    });
  }

  if (about.githubUrl.trim()) {
    links.push({
      label: "GitHub",
      href: getLinkHref(about.githubUrl),
      external: true,
      icon: CONTACT_ICONS.github
    });
  }

  for (const link of about.socialLinks) {
    const href = getLinkHref(link.url);
    links.push({
      label: link.label,
      href,
      external: !href.startsWith("/"),
      icon: getContactIcon(link.label)
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

  const hasContent = useMemo(() => !isEmptyProfile(about), [about]);
  const contactLinks = useMemo(() => buildContactLinks(about), [about]);
  const hasAvatar = Boolean(about.avatarUrl.trim());
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
  const initial = title.slice(0, 1).toUpperCase();
  const fileStatus = hasContent ? "profile.loaded" : "profile.placeholder";

  return (
    <section className="about-page about-page--black-file">
      <div className="about-file-shell">
        <div className="about-file-topline" aria-label={locale === "zh" ? "关于页文件状态" : "About file status"}>
          <span>TWORIVER://ABOUT</span>
          <span>{fileStatus}</span>
        </div>

        <header className="about-file-hero">
          <div className="about-file-title">
            <p className="about-file-kicker">black file / identity record</p>
            <h1>{title}</h1>
            {headline ? <p className="about-file-headline">{headline}</p> : null}
          </div>

          <div className={`about-file-portrait${hasAvatar ? " about-file-portrait--round" : ""}`}>
            {hasAvatar ? (
              <img src={resolveApiAssetUrl(about.avatarUrl)} alt={locale === "zh" ? `${title} 的头像` : `${title} avatar`} />
            ) : (
              <div aria-hidden="true">{initial}</div>
            )}
          </div>
        </header>

        {isLoading ? <p className="about-file-notice">Loading profile...</p> : null}
        {error ? <p className="about-file-notice about-file-notice--error">{error}</p> : null}

        {!isLoading && !error ? (
          <div className="about-file-grid">
            <section className="about-file-copy" aria-labelledby="about-intro">
              <div className="about-file-section-head">
                <span>01</span>
                <h2 id="about-intro">Profile</h2>
              </div>
              <p className={about.bio.trim() ? "" : "is-empty"}>{bio}</p>
            </section>

            <section className="about-file-links" aria-labelledby="about-links">
              <div className="about-file-section-head">
                <span>02</span>
                <h2 id="about-links">Contact</h2>
              </div>

              {contactLinks.length > 0 ? (
                <div className="about-contact-icons" aria-label={locale === "zh" ? "社交链接" : "Social links"}>
                  {contactLinks.map((link) => (
                    <a
                      key={`${link.label}-${link.href}`}
                      className="about-contact-icon"
                      href={link.href}
                      target={link.external ? "_blank" : undefined}
                      rel={link.external ? "noreferrer" : undefined}
                      aria-label={link.label}
                      title={link.label}
                    >
                      {link.icon ? (
                        <ContactIcon name={link.icon} />
                      ) : (
                        <span aria-hidden="true">{link.label.slice(0, 2).toUpperCase()}</span>
                      )}
                    </a>
                  ))}
                </div>
              ) : (
                <p className="about-file-empty">{locale === "zh" ? "暂无社交链接。" : "No social links yet."}</p>
              )}
            </section>
          </div>
        ) : null}
      </div>
    </section>
  );
}
