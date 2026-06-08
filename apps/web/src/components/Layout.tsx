import type { Locale } from "@tworiver/shared";
import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { LanguageToggle } from "./LanguageToggle";

interface LayoutProps {
  children: ReactNode;
  locale: Locale;
  theme: "dark" | "light";
  onLocaleChange: (locale: Locale) => void;
  onThemeChange: (theme: "dark" | "light") => void;
}

export function Layout({ children, locale, theme, onLocaleChange, onThemeChange }: LayoutProps) {
  const { pathname } = useLocation();
  const isAdminRoute = pathname.startsWith("/admin");
  const nextTheme = theme === "dark" ? "light" : "dark";

  return (
    <div className="app-shell" data-theme={theme}>
      <main className={isAdminRoute ? "site-main site-main--wide" : "site-main"}>
        <header className="site-header">
          <NavLink to="/" className="site-brand" aria-label="TwoRiver home">
            TwoRiver
          </NavLink>
          <nav className="site-nav" aria-label="Primary navigation">
            <NavLink to="/" end>
              writing
            </NavLink>
            <NavLink to="/about">about</NavLink>
            <button
              type="button"
              className="theme-toggle"
              aria-label={`Switch to ${nextTheme} theme`}
              onClick={() => onThemeChange(nextTheme)}
            >
              {theme === "dark" ? "light" : "dark"}
            </button>
            <LanguageToggle locale={locale} onLocaleChange={onLocaleChange} />
          </nav>
        </header>
        {children}
      </main>
    </div>
  );
}
