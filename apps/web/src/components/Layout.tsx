import type { Locale } from "@tworiver/shared";
import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { AdminShell } from "./AdminShell";
import { LanguageToggle } from "./LanguageToggle";
import { TwoRiverMark } from "./TwoRiverMark";

interface LayoutProps {
  children: ReactNode;
  locale: Locale;
  theme: "dark" | "light";
  isAdminAuthenticated?: boolean;
  onLocaleChange: (locale: Locale) => void;
  onThemeChange: (theme: "dark" | "light") => void;
  onLogout?: () => void;
}

export function Layout({
  children,
  locale,
  theme,
  isAdminAuthenticated = false,
  onLocaleChange,
  onThemeChange,
  onLogout
}: LayoutProps) {
  const { pathname } = useLocation();
  const isAdminRoute = pathname.startsWith("/admin");
  const isAdminWorkspace = isAdminRoute && pathname !== "/admin/login";
  const nextTheme = theme === "dark" ? "light" : "dark";

  if (isAdminWorkspace) {
    return (
      <div className="app-shell" data-theme={theme}>
        <AdminShell
          locale={locale}
          theme={theme}
          isAuthenticated={isAdminAuthenticated}
          onLocaleChange={onLocaleChange}
          onThemeChange={onThemeChange}
          onLogout={onLogout}
        >
          {children}
        </AdminShell>
      </div>
    );
  }

  return (
    <div className="app-shell" data-theme={theme}>
      <main className={isAdminRoute ? "site-main site-main--wide" : "site-main"}>
        <header className="site-header">
          <NavLink to="/" className="site-brand" aria-label="TwoRiver home">
            <TwoRiverMark />
            <span>TwoRiver</span>
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
