import type { Locale } from "@tworiver/shared";
import { lazy, Suspense, type ReactNode } from "react";
import { matchPath, NavLink, useLocation } from "react-router-dom";
import { LanguageToggle } from "./LanguageToggle";
import { TwoRiverMark } from "./TwoRiverMark";

interface LayoutProps {
  children: ReactNode;
  locale: Locale;
  theme: "dark" | "light";
  isAdminAuthenticated?: boolean;
  onLocaleChange: (locale: Locale) => void;
  onThemeChange: (theme: "dark" | "light") => void;
  onRouteIntent?: (pathname: string) => void;
  onLogout?: () => void;
}

const PUBLIC_ROUTE_PATTERNS = ["/", "/posts/:slug", "/categories", "/categories/:slug", "/tags", "/tags/:slug", "/about"];
const AdminShell = lazy(async () => ({ default: (await import("./AdminShell")).AdminShell }));

function isKnownPublicPath(pathname: string): boolean {
  return PUBLIC_ROUTE_PATTERNS.some((path) => matchPath({ path, end: true }, pathname));
}

function AdminShellFallback() {
  return (
    <main className="site-main site-main--wide">
      <section className="page-section admin-panel">
        <p className="muted">Loading...</p>
      </section>
    </main>
  );
}

export function Layout({
  children,
  locale,
  theme,
  isAdminAuthenticated = false,
  onLocaleChange,
  onThemeChange,
  onRouteIntent,
  onLogout
}: LayoutProps) {
  const { pathname } = useLocation();
  const isAdminRoute = pathname.startsWith("/admin");
  const isAdminWorkspace = isAdminRoute && pathname !== "/admin/login";
  const isPublicNotFoundRoute = !isAdminRoute && !isKnownPublicPath(pathname);
  const nextTheme = theme === "dark" ? "light" : "dark";
  const routeIntentProps = (nextPathname: string) => ({
    onFocus: () => onRouteIntent?.(nextPathname),
    onMouseEnter: () => onRouteIntent?.(nextPathname)
  });

  if (isAdminWorkspace) {
    return (
      <div className="app-shell" data-theme={theme}>
        <Suspense fallback={<AdminShellFallback />}>
          <AdminShell
            locale={locale}
            theme={theme}
            isAuthenticated={isAdminAuthenticated}
            onLocaleChange={onLocaleChange}
            onThemeChange={onThemeChange}
            onRouteIntent={onRouteIntent}
            onLogout={onLogout}
          >
            {children}
          </AdminShell>
        </Suspense>
      </div>
    );
  }

  return (
    <div className="app-shell" data-theme={theme}>
      <main className={isAdminRoute ? "site-main site-main--wide" : "site-main"}>
        {!isPublicNotFoundRoute ? (
          <header className="site-header">
            <NavLink to="/" className="site-brand" aria-label="TwoRiver home">
              <TwoRiverMark />
              <span>TwoRiver</span>
            </NavLink>
            <nav className="site-nav" aria-label="Primary navigation">
              <NavLink to="/" end {...routeIntentProps("/")}>
                writing
              </NavLink>
              <NavLink to="/about" {...routeIntentProps("/about")}>about</NavLink>
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
        ) : null}
        {children}
      </main>
    </div>
  );
}
