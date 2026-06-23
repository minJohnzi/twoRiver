import type { Locale } from "@tworiver/shared";
import { type ReactNode, useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { LanguageToggle } from "./LanguageToggle";
import { TwoRiverMark } from "./TwoRiverMark";

type AdminIconName =
  | "about"
  | "categories"
  | "external"
  | "logout"
  | "menu"
  | "moon"
  | "posts"
  | "sun"
  | "tags"
  | "x";

function AdminIcon({ name }: { name: AdminIconName }) {
  const paths: Record<AdminIconName, ReactNode> = {
    about: <><circle cx="12" cy="8" r="3" /><path d="M5 20c.6-4 3-6 7-6s6.4 2 7 6" /></>,
    categories: <><path d="M3 6.5h7l2 2h9v10H3z" /><path d="M3 6.5V5h7l2 2h9" /></>,
    external: <><path d="M14 4h6v6" /><path d="m20 4-9 9" /><path d="M18 13v7H4V6h7" /></>,
    logout: <><path d="M10 5H4v14h6" /><path d="M14 8l4 4-4 4" /><path d="M18 12H8" /></>,
    menu: <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>,
    moon: <path d="M19 15.5A8 8 0 0 1 8.5 5 8 8 0 1 0 19 15.5Z" />,
    posts: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    sun: <><circle cx="12" cy="12" r="3.5" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
    tags: <><path d="M3 11V4h7l10 10-7 7z" /><circle cx="7.5" cy="8.5" r="1" /></>,
    x: <><path d="m6 6 12 12" /><path d="M18 6 6 18" /></>
  };

  return (
    <svg className="admin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

interface AdminShellProps {
  children: ReactNode;
  locale: Locale;
  theme: "dark" | "light";
  isAuthenticated: boolean;
  onLocaleChange: (locale: Locale) => void;
  onThemeChange: (theme: "dark" | "light") => void;
  onLogout: (() => void) | undefined;
}

export function AdminShell({ children, locale, theme, isAuthenticated, onLocaleChange, onThemeChange, onLogout }: AdminShellProps) {
  const { pathname } = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const nextTheme = theme === "dark" ? "light" : "dark";
  const copy = {
    posts: locale === "zh" ? "文章" : "Posts",
    categories: locale === "zh" ? "分类管理" : "Categories",
    tags: locale === "zh" ? "标签管理" : "Tags",
    about: locale === "zh" ? "关于页" : "About",
    viewSite: locale === "zh" ? "查看站点" : "View site",
    logout: locale === "zh" ? "退出登录" : "Log out",
    navigation: locale === "zh" ? "后台导航" : "Admin navigation",
    openMenu: locale === "zh" ? "打开后台导航" : "Open admin navigation",
    closeMenu: locale === "zh" ? "关闭后台导航" : "Close admin navigation"
  };

  useEffect(() => setIsMenuOpen(false), [pathname]);
  const closeMenu = () => setIsMenuOpen(false);

  return (
    <div className="admin-app-shell">
      <aside id="admin-navigation" className={`admin-sidebar${isMenuOpen ? " is-open" : ""}`} aria-label={copy.navigation}>
        <div className="admin-sidebar__brand">
          <Link to="/admin/posts" className="admin-brand" onClick={closeMenu}>
            <TwoRiverMark />
            <span><strong>TwoRiver</strong><small>Studio</small></span>
          </Link>
          <button className="admin-mobile-close" type="button" aria-label={copy.closeMenu} onClick={closeMenu}><AdminIcon name="x" /></button>
        </div>
        <nav className="admin-nav">
          <NavLink to="/admin/posts" className={({ isActive }) => (isActive ? "is-active" : undefined)} onClick={closeMenu}><AdminIcon name="posts" /><span>{copy.posts}</span></NavLink>
          <NavLink to="/admin/categories" className={({ isActive }) => (isActive ? "is-active" : undefined)} onClick={closeMenu}><AdminIcon name="categories" /><span>{copy.categories}</span></NavLink>
          <NavLink to="/admin/tags" className={({ isActive }) => (isActive ? "is-active" : undefined)} onClick={closeMenu}><AdminIcon name="tags" /><span>{copy.tags}</span></NavLink>
          <NavLink to="/admin/about" className={({ isActive }) => (isActive ? "is-active" : undefined)} onClick={closeMenu}><AdminIcon name="about" /><span>{copy.about}</span></NavLink>
        </nav>
        <div className="admin-sidebar__footer">
          <Link to="/" onClick={closeMenu}><AdminIcon name="external" /><span>{copy.viewSite}</span></Link>
          {isAuthenticated ? <button type="button" aria-label={`${copy.logout} / Logout`} onClick={onLogout}><AdminIcon name="logout" /><span>{copy.logout}</span></button> : null}
        </div>
      </aside>
      {isMenuOpen ? <button className="admin-sidebar-scrim" type="button" aria-label={copy.closeMenu} onClick={closeMenu} /> : null}
      <div className="admin-app-main">
        <header className="admin-topbar">
          <button className="admin-menu-button" type="button" aria-label={isMenuOpen ? copy.closeMenu : copy.openMenu} aria-controls="admin-navigation" aria-expanded={isMenuOpen} onClick={() => setIsMenuOpen((current) => !current)}><AdminIcon name="menu" /></button>
          <Link className="admin-topbar__brand" to="/admin/posts"><TwoRiverMark /><span>TwoRiver Studio</span></Link>
          <div className="admin-topbar__actions">
            <button className="admin-icon-button" type="button" aria-label={`Switch to ${nextTheme} theme`} onClick={() => onThemeChange(nextTheme)}><AdminIcon name={theme === "dark" ? "sun" : "moon"} /></button>
            <LanguageToggle locale={locale} onLocaleChange={onLocaleChange} />
          </div>
        </header>
        <main className="admin-content" id="main-content">{children}</main>
      </div>
    </div>
  );
}
