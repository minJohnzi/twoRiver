import type { Locale } from "@tworiver/shared";
import { type ReactNode, useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { LanguageToggle } from "./LanguageToggle";
import { TwoRiverMark } from "./TwoRiverMark";

type AdminIconName =
  | "about"
  | "categories"
  | "chevronDown"
  | "chevronRight"
  | "dashboard"
  | "external"
  | "inbox"
  | "list"
  | "logout"
  | "menu"
  | "moon"
  | "panelLeftClose"
  | "panelLeftOpen"
  | "plusCircle"
  | "posts"
  | "resources"
  | "sun"
  | "tags"
  | "x";

function AdminIcon({ name }: { name: AdminIconName }) {
  const paths: Record<AdminIconName, ReactNode> = {
    about: <><circle cx="12" cy="8" r="3" /><path d="M5 20c.6-4 3-6 7-6s6.4 2 7 6" /></>,
    categories: <><path d="M3 6.5h7l2 2h9v10H3z" /><path d="M3 6.5V5h7l2 2h9" /></>,
    chevronDown: <path d="m6 9 6 6 6-6" />,
    chevronRight: <path d="m9 6 6 6-6 6" />,
    dashboard: <><rect x="3.5" y="3.5" width="7" height="7" /><rect x="13.5" y="3.5" width="7" height="7" /><rect x="3.5" y="13.5" width="7" height="7" /><rect x="13.5" y="13.5" width="7" height="7" /></>,
    external: <><path d="M14 4h6v6" /><path d="m20 4-9 9" /><path d="M18 13v7H4V6h7" /></>,
    inbox: <><path d="M4 13h5l2 3h2l2-3h5" /><path d="m5.5 5-1.5 8v5h16v-5l-1.5-8z" /></>,
    list: <><path d="M9 6h12" /><path d="M9 12h12" /><path d="M9 18h12" /><path d="M4 6h.01" /><path d="M4 12h.01" /><path d="M4 18h.01" /></>,
    logout: <><path d="M10 5H4v14h6" /><path d="M14 8l4 4-4 4" /><path d="M18 12H8" /></>,
    menu: <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>,
    moon: <path d="M19 15.5A8 8 0 0 1 8.5 5 8 8 0 1 0 19 15.5Z" />,
    panelLeftClose: <><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 3v18" /><path d="m16 15-3-3 3-3" /></>,
    panelLeftOpen: <><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 3v18" /><path d="m14 9 3 3-3 3" /></>,
    plusCircle: <><circle cx="12" cy="12" r="8" /><path d="M12 8v8M8 12h8" /></>,
    posts: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    resources: <><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M8 13l2.2-2.2 2.8 3.1 1.5-1.5L18 16" /><circle cx="8.5" cy="8.5" r="1.2" /></>,
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
  onRouteIntent?: ((pathname: string) => void) | undefined;
  onLogout: (() => void) | undefined;
}

export function AdminShell({
  children,
  locale,
  theme,
  isAuthenticated,
  onLocaleChange,
  onThemeChange,
  onRouteIntent,
  onLogout
}: AdminShellProps) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isPostsOpen, setIsPostsOpen] = useState(true);
  const nextTheme = theme === "dark" ? "light" : "dark";
  const pageTitle = getAdminPageTitle(pathname, locale);
  const dashboardActive = pathname === "/admin" || pathname === "/admin/dashboard";
  const postsGroupActive = pathname === "/admin/posts" || pathname === "/admin/posts/new" || pathname === "/admin/posts/drafts" || /^\/admin\/posts\/\d+/.test(pathname);
  const copy = {
    collapseSidebar: locale === "zh" ? "收起侧边栏" : "Collapse sidebar",
    expandSidebar: locale === "zh" ? "展开侧边栏" : "Expand sidebar",
    dashboard: locale === "zh" ? "仪表盘 Dashboard" : "Dashboard",
    posts: locale === "zh" ? "文章管理" : "Posts",
    postList: locale === "zh" ? "文章列表" : "Post list",
    newPost: locale === "zh" ? "新建文章" : "New post",
    drafts: locale === "zh" ? "草稿箱" : "Drafts",
    resources: locale === "zh" ? "资源管理" : "Resources",
    categories: locale === "zh" ? "分类管理" : "Categories",
    tags: locale === "zh" ? "标签管理" : "Tags",
    about: locale === "zh" ? "关于页面" : "About",
    viewSite: locale === "zh" ? "查看站点" : "View site",
    logout: locale === "zh" ? "退出登录" : "Log out",
    navigation: locale === "zh" ? "后台导航" : "Admin navigation",
    openMenu: locale === "zh" ? "打开后台导航" : "Open admin navigation",
    closeMenu: locale === "zh" ? "关闭后台导航" : "Close admin navigation"
  };

  useEffect(() => setIsMenuOpen(false), [pathname]);
  useEffect(() => {
    if (postsGroupActive) {
      setIsPostsOpen(true);
    }
  }, [postsGroupActive]);

  const closeMenu = () => setIsMenuOpen(false);
  const routeIntentProps = (nextPathname: string) => ({
    onFocus: () => onRouteIntent?.(nextPathname),
    onMouseEnter: () => onRouteIntent?.(nextPathname)
  });

  return (
    <div className={`admin-app-shell${isSidebarCollapsed ? " is-sidebar-collapsed" : ""}`}>
      <aside id="admin-navigation" className={`admin-sidebar${isMenuOpen ? " is-open" : ""}`} aria-label={copy.navigation}>
        <div className="admin-sidebar__brand">
          <Link to="/admin" className="admin-brand" onClick={closeMenu} {...routeIntentProps("/admin")}>
            <TwoRiverMark />
            <span><strong>TwoRiver</strong><small>ADMIN CONSOLE</small></span>
          </Link>
          <button
            className="admin-sidebar-toggle"
            type="button"
            aria-label={isSidebarCollapsed ? copy.expandSidebar : copy.collapseSidebar}
            aria-controls="admin-navigation"
            aria-expanded={!isSidebarCollapsed}
            title={isSidebarCollapsed ? copy.expandSidebar : copy.collapseSidebar}
            onClick={() => setIsSidebarCollapsed((current) => !current)}
          >
            <AdminIcon name={isSidebarCollapsed ? "panelLeftOpen" : "panelLeftClose"} />
          </button>
          <button className="admin-mobile-close" type="button" aria-label={copy.closeMenu} onClick={closeMenu}><AdminIcon name="x" /></button>
        </div>

        <nav className="admin-nav">
          <Link to="/admin" className={dashboardActive ? "is-active" : undefined} title={isSidebarCollapsed ? copy.dashboard : undefined} onClick={closeMenu} {...routeIntentProps("/admin")}>
            <AdminIcon name="dashboard" />
            <span>{copy.dashboard}</span>
          </Link>

          <div className={`admin-nav-group${postsGroupActive ? " is-active" : ""}${isPostsOpen ? " is-open" : ""}`}>
            <button
              type="button"
              className="admin-nav-group__trigger"
              onClick={() => {
                if (isSidebarCollapsed) {
                  onRouteIntent?.("/admin/posts");
                  navigate("/admin/posts");
                  closeMenu();
                  return;
                }
                setIsPostsOpen((current) => !current);
              }}
              aria-expanded={isSidebarCollapsed ? undefined : isPostsOpen}
              title={isSidebarCollapsed ? copy.posts : undefined}
            >
              <span><AdminIcon name="posts" /><span>{copy.posts}</span></span>
              <AdminIcon name={isPostsOpen ? "chevronDown" : "chevronRight"} />
            </button>
            {isPostsOpen ? (
              <div className="admin-nav-sublist">
                <NavLink to="/admin/posts" end className={({ isActive }) => (isActive ? "is-active" : undefined)} onClick={closeMenu} {...routeIntentProps("/admin/posts")}>
                  <AdminIcon name="list" />
                  <span>{copy.postList}</span>
                </NavLink>
                <NavLink to="/admin/posts/new" className={({ isActive }) => (isActive ? "is-active" : undefined)} onClick={closeMenu} {...routeIntentProps("/admin/posts/new")}>
                  <AdminIcon name="plusCircle" />
                  <span>{copy.newPost}</span>
                </NavLink>
                <NavLink to="/admin/posts/drafts" className={({ isActive }) => (isActive ? "is-active" : undefined)} onClick={closeMenu} {...routeIntentProps("/admin/posts/drafts")}>
                  <AdminIcon name="inbox" />
                  <span>{copy.drafts}</span>
                </NavLink>
              </div>
            ) : null}
          </div>

          <NavLink to="/admin/resources" title={isSidebarCollapsed ? copy.resources : undefined} className={({ isActive }) => (isActive ? "is-active" : undefined)} onClick={closeMenu} {...routeIntentProps("/admin/resources")}><AdminIcon name="resources" /><span>{copy.resources}</span></NavLink>
          <NavLink to="/admin/categories" title={isSidebarCollapsed ? copy.categories : undefined} className={({ isActive }) => (isActive ? "is-active" : undefined)} onClick={closeMenu} {...routeIntentProps("/admin/categories")}><AdminIcon name="categories" /><span>{copy.categories}</span></NavLink>
          <NavLink to="/admin/tags" title={isSidebarCollapsed ? copy.tags : undefined} className={({ isActive }) => (isActive ? "is-active" : undefined)} onClick={closeMenu} {...routeIntentProps("/admin/tags")}><AdminIcon name="tags" /><span>{copy.tags}</span></NavLink>
          <NavLink to="/admin/about" title={isSidebarCollapsed ? copy.about : undefined} className={({ isActive }) => (isActive ? "is-active" : undefined)} onClick={closeMenu} {...routeIntentProps("/admin/about")}><AdminIcon name="about" /><span>{copy.about}</span></NavLink>
        </nav>

        <div className="admin-sidebar__footer">
          <Link to="/" title={isSidebarCollapsed ? copy.viewSite : undefined} onClick={closeMenu} {...routeIntentProps("/")}><AdminIcon name="external" /><span>{copy.viewSite}</span></Link>
          {isAuthenticated ? <button type="button" aria-label={`${copy.logout} / Logout`} title={isSidebarCollapsed ? copy.logout : undefined} onClick={onLogout}><AdminIcon name="logout" /><span>{copy.logout}</span></button> : null}
        </div>
      </aside>

      {isMenuOpen ? <button className="admin-sidebar-scrim" type="button" aria-label={copy.closeMenu} onClick={closeMenu} /> : null}

      <div className="admin-app-main">
        <header className="admin-topbar">
          <button className="admin-menu-button" type="button" aria-label={isMenuOpen ? copy.closeMenu : copy.openMenu} aria-controls="admin-navigation" aria-expanded={isMenuOpen} onClick={() => setIsMenuOpen((current) => !current)}><AdminIcon name="menu" /></button>
          <Link className="admin-topbar__brand" to="/admin" {...routeIntentProps("/admin")}><TwoRiverMark /><span>TwoRiver Admin</span></Link>
          <div className="admin-topbar__context">
            <span>TwoRiver</span>
            <strong>{pageTitle}</strong>
          </div>
          <div className="admin-topbar__actions">
            <Link className="admin-topbar__link" to="/admin/posts/new" {...routeIntentProps("/admin/posts/new")}><span aria-hidden="true">+</span>{copy.newPost}</Link>
            <Link className="admin-topbar__link admin-topbar__link--ghost" to="/admin/resources" aria-label={`${copy.resources} quick link`} {...routeIntentProps("/admin/resources")}>{copy.resources}</Link>
            <button className="admin-icon-button" type="button" aria-label={`Switch to ${nextTheme} theme`} onClick={() => onThemeChange(nextTheme)}><AdminIcon name={theme === "dark" ? "sun" : "moon"} /></button>
            <LanguageToggle locale={locale} onLocaleChange={onLocaleChange} />
          </div>
        </header>
        <main className="admin-content" id="main-content">{children}</main>
      </div>
    </div>
  );
}

function getAdminPageTitle(pathname: string, locale: Locale): string {
  if (pathname === "/admin" || pathname === "/admin/dashboard") {
    return locale === "zh" ? "仪表盘" : "Dashboard";
  }
  if (pathname === "/admin/posts") {
    return locale === "zh" ? "文章列表" : "Post list";
  }
  if (pathname === "/admin/posts/new") {
    return locale === "zh" ? "新建文章" : "New post";
  }
  if (pathname === "/admin/posts/drafts") {
    return locale === "zh" ? "草稿箱" : "Drafts";
  }
  if (pathname.startsWith("/admin/posts/")) {
    return locale === "zh" ? "编辑文章" : "Edit post";
  }
  if (pathname === "/admin/resources") {
    return locale === "zh" ? "资源管理" : "Resources";
  }
  if (pathname === "/admin/categories") {
    return locale === "zh" ? "分类管理" : "Categories";
  }
  if (pathname === "/admin/tags") {
    return locale === "zh" ? "标签管理" : "Tags";
  }
  if (pathname === "/admin/about") {
    return locale === "zh" ? "关于页面" : "About";
  }
  return locale === "zh" ? "后台控制台" : "Admin console";
}
