import type { Locale } from "@tworiver/shared";
import { Link, NavLink } from "react-router-dom";
import { LanguageToggle } from "./LanguageToggle";

interface ArticleNavProps {
  locale: Locale;
  theme: "dark" | "light";
  onLocaleChange: (locale: Locale) => void;
  onThemeChange: (theme: "dark" | "light") => void;
  onRouteIntent?: ((pathname: string) => void) | undefined;
}

function articleNavLabels(locale: Locale) {
  if (locale === "zh") {
    return {
      nav: "文章导航",
      back: "返回文章",
      about: "关于"
    };
  }

  return {
    nav: "Article navigation",
    back: "Back to posts",
    about: "about"
  };
}

export function ArticleNav({
  locale,
  theme,
  onLocaleChange,
  onThemeChange,
  onRouteIntent
}: ArticleNavProps) {
  const nextTheme = theme === "dark" ? "light" : "dark";
  const labels = articleNavLabels(locale);
  const themeLabel =
    locale === "zh"
      ? `切换到${nextTheme === "dark" ? "深色" : "浅色"}主题`
      : `Switch to ${nextTheme} theme`;
  const themeText = locale === "zh" ? (nextTheme === "dark" ? "深色" : "浅色") : nextTheme;
  const routeIntentProps = (pathname: string) => ({
    onFocus: () => onRouteIntent?.(pathname),
    onMouseEnter: () => onRouteIntent?.(pathname)
  });

  return (
    <nav className="article-nav" aria-label={labels.nav}>
      <Link className="article-nav__back" to="/" {...routeIntentProps("/")}>
        {labels.back}
      </Link>
      <div className="article-nav__links">
        <NavLink to="/about" {...routeIntentProps("/about")}>
          {labels.about}
        </NavLink>
        <button
          type="button"
          className="article-nav__control article-nav__theme"
          aria-label={themeLabel}
          onClick={() => onThemeChange(nextTheme)}
        >
          {themeText}
        </button>
        <LanguageToggle locale={locale} onLocaleChange={onLocaleChange} />
      </div>
    </nav>
  );
}
