import type { AboutProfile, Locale } from "@tworiver/shared";
import { Icon } from "@iconify/react";
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
  icon?: string | undefined;
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

const CONTACT_ICONS: Record<string, string> = {
  email: "ic:outline-email",
  github: "line-md:github",
  rss: "mdi:rss",
  x: "prime:twitter",
  linkedin: "line-md:linkedin",
  ins: "line-md:instagram"
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
  if (url.startsWith("/")) {
    return url;
  }

  if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url)) {
    return url;
  }

  return `https://${url}`;
}

function getContactIcon(label: string): string | undefined {
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
    const controller = new AbortController();

    async function loadAbout() {
      setIsLoading(true);
      setError(null);

      try {
        const { about: nextAbout } = await fetchAboutProfile({ signal: controller.signal });
        if (isMounted) {
          setAbout(nextAbout);
        }
      } catch (caught) {
        if (isMounted && !controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : "Failed to load about page");
        }
      } finally {
        if (isMounted && !controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadAbout();

    return () => {
      isMounted = false;
      controller.abort();
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
                        <span data-icon={link.icon} aria-hidden="true">
                          <Icon icon={link.icon} />
                        </span>
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
