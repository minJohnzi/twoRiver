import type { Locale } from "@tworiver/shared";
import {
  type ComponentType,
  type ReactNode,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { fetchCurrentUser, logout, type CurrentUser } from "./api/auth";

const DEFAULT_LOCALE: Locale = "zh";
const PUBLIC_LOCALE_STORAGE_KEY = "tworiver_locale";
const ADMIN_LOCALE_STORAGE_KEY = "tworiver_admin_locale";
type Theme = "dark" | "light";
const DEFAULT_THEME: Theme = "dark";
const PUBLIC_THEME_STORAGE_KEY = "tworiver_theme";
const ADMIN_THEME_STORAGE_KEY = "tworiver_admin_theme";
type AdminAuthStatus = "unknown" | "checking" | "allowed" | "denied";

function createRouteModuleLoader<TModule extends object>(loader: () => Promise<TModule>) {
  let modulePromise: Promise<TModule> | null = null;
  return () => {
    modulePromise ??= loader().catch((error: unknown) => {
      modulePromise = null;
      throw error;
    });
    return modulePromise;
  };
}

function lazyNamed<TProps>(loader: () => Promise<object>, name: string) {
  return lazy(async () => {
    const module = (await loader()) as Record<string, ComponentType<TProps>>;
    const component = module[name];
    if (!component) {
      throw new Error(`Route module is missing export "${name}".`);
    }

    return { default: component };
  });
}

const loadHomePage = createRouteModuleLoader(() => import("./pages/HomePage"));
const loadPostPage = createRouteModuleLoader(() => import("./pages/PostPage"));
const loadTaxonomyPages = createRouteModuleLoader(() => import("./pages/TaxonomyPages"));
const loadAboutPage = createRouteModuleLoader(() => import("./pages/AboutPage"));
const loadLoginPage = createRouteModuleLoader(() => import("./pages/LoginPage"));
const loadNotFoundPage = createRouteModuleLoader(() => import("./pages/NotFoundPage"));
const loadAdminAboutPage = createRouteModuleLoader(() => import("./pages/AdminAboutPage"));
const loadAdminDashboardPage = createRouteModuleLoader(() => import("./pages/AdminDashboardPage"));
const loadAdminDraftsPage = createRouteModuleLoader(() => import("./pages/AdminDraftsPage"));
const loadAdminEditorPage = createRouteModuleLoader(() => import("./pages/AdminEditorPage"));
const loadAdminPostsPage = createRouteModuleLoader(() => import("./pages/AdminPostsPage"));
const loadAdminResourcesPage = createRouteModuleLoader(() => import("./pages/AdminResourcesPage"));
const loadAdminTaxonomyPage = createRouteModuleLoader(() => import("./pages/AdminTaxonomyPage"));

const HomePage = lazyNamed<{ locale: Locale }>(loadHomePage, "HomePage");
const PostPage = lazyNamed<{ locale: Locale }>(loadPostPage, "PostPage");
const CategoryListPage = lazyNamed<{ locale: Locale }>(loadTaxonomyPages, "CategoryListPage");
const CategoryDetailPage = lazyNamed<{ locale: Locale }>(loadTaxonomyPages, "CategoryDetailPage");
const TagListPage = lazyNamed<{ locale: Locale }>(loadTaxonomyPages, "TagListPage");
const TagDetailPage = lazyNamed<{ locale: Locale }>(loadTaxonomyPages, "TagDetailPage");
const AboutPage = lazyNamed<{ locale: Locale }>(loadAboutPage, "AboutPage");
const LoginPage = lazyNamed<{ locale: Locale; onLoginSuccess?: (user: CurrentUser) => void }>(
  loadLoginPage,
  "LoginPage"
);
const NotFoundPage = lazyNamed<{ locale: Locale }>(loadNotFoundPage, "NotFoundPage");
const AdminAboutPage = lazyNamed<{ locale: Locale }>(loadAdminAboutPage, "AdminAboutPage");
const AdminDashboardPage = lazyNamed<{ locale: Locale }>(loadAdminDashboardPage, "AdminDashboardPage");
const AdminDraftsPage = lazyNamed<{ locale: Locale }>(loadAdminDraftsPage, "AdminDraftsPage");
const AdminEditorPage = lazyNamed<{ locale: Locale }>(loadAdminEditorPage, "AdminEditorPage");
const AdminPostsPage = lazyNamed<{ locale: Locale }>(loadAdminPostsPage, "AdminPostsPage");
const AdminResourcesPage = lazyNamed<{ locale: Locale }>(loadAdminResourcesPage, "AdminResourcesPage");
const AdminTaxonomyPage = lazyNamed<{ kind: "categories" | "tags"; locale: Locale }>(
  loadAdminTaxonomyPage,
  "AdminTaxonomyPage"
);

function scheduleIdleTask(task: () => void): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const idleWindow = window as Window & {
    requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  if (idleWindow.requestIdleCallback && idleWindow.cancelIdleCallback) {
    const handle = idleWindow.requestIdleCallback(task, { timeout: 2_500 });
    return () => idleWindow.cancelIdleCallback?.(handle);
  }

  const handle = globalThis.setTimeout(task, 1_200);
  return () => globalThis.clearTimeout(handle);
}

function getInitialLocale(storageKey: string): Locale {
  if (typeof window === "undefined") {
    return DEFAULT_LOCALE;
  }

  const savedLocale = window.localStorage.getItem(storageKey);
  return savedLocale === "en" || savedLocale === "zh" ? savedLocale : DEFAULT_LOCALE;
}

function getInitialTheme(storageKey: string): Theme {
  if (typeof window === "undefined") {
    return DEFAULT_THEME;
  }

  const savedTheme = window.localStorage.getItem(storageKey);
  return savedTheme === "light" || savedTheme === "dark" ? savedTheme : DEFAULT_THEME;
}

function getHtmlLang(locale: Locale): string {
  return locale === "zh" ? "zh-Hans" : "en";
}

interface RequireAdminProps {
  children: ReactNode;
  authStatus: AdminAuthStatus;
  verifyAdminSession: () => Promise<void>;
}

function LoadingSection() {
  return (
    <section className="page-section admin-panel">
      <p className="muted">Loading...</p>
    </section>
  );
}

function RequireAdmin({ children, authStatus, verifyAdminSession }: RequireAdminProps) {
  const location = useLocation();

  useEffect(() => {
    if (authStatus === "unknown") {
      void verifyAdminSession();
    }
  }, [authStatus, verifyAdminSession]);

  if (authStatus === "unknown" || authStatus === "checking") {
    return <LoadingSection />;
  }

  if (authStatus === "denied") {
    return <Navigate to="/admin/login" replace state={{ from: location }} />;
  }

  return children;
}

export function App() {
  const [publicLocale, setPublicLocale] = useState<Locale>(() => getInitialLocale(PUBLIC_LOCALE_STORAGE_KEY));
  const [adminLocale, setAdminLocale] = useState<Locale>(() => getInitialLocale(ADMIN_LOCALE_STORAGE_KEY));
  const [publicTheme, setPublicTheme] = useState<Theme>(() => getInitialTheme(PUBLIC_THEME_STORAGE_KEY));
  const [adminTheme, setAdminTheme] = useState<Theme>(() => getInitialTheme(ADMIN_THEME_STORAGE_KEY));
  const [adminUser, setAdminUser] = useState<CurrentUser | null>(null);
  const [adminAuthStatus, setAdminAuthStatus] = useState<AdminAuthStatus>("unknown");
  const adminAuthRequestRef = useRef<Promise<void> | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const isAdminRoute = location.pathname.startsWith("/admin");
  const locale = isAdminRoute ? adminLocale : publicLocale;
  const theme = isAdminRoute ? adminTheme : publicTheme;

  useEffect(() => {
    document.documentElement.lang = getHtmlLang(locale);
  }, [locale]);

  useEffect(
    () =>
      scheduleIdleTask(() => {
        void Promise.all([
          loadHomePage(),
          loadPostPage(),
          loadTaxonomyPages(),
          loadAboutPage(),
          loadNotFoundPage()
        ]);
      }),
    []
  );

  useEffect(() => {
    if (!isAdminRoute) {
      return undefined;
    }

    return scheduleIdleTask(() => {
      void Promise.all([
        loadLoginPage(),
        loadAdminDashboardPage(),
        loadAdminDraftsPage(),
        loadAdminPostsPage(),
        loadAdminResourcesPage(),
        loadAdminTaxonomyPage(),
        loadAdminAboutPage(),
        loadAdminEditorPage()
      ]);
    });
  }, [isAdminRoute]);

  const verifyAdminSession = useCallback(() => {
    if (adminAuthRequestRef.current) {
      return adminAuthRequestRef.current;
    }

    const request = fetchCurrentUser()
      .then(({ user }) => {
        setAdminUser(user);
        setAdminAuthStatus("allowed");
      })
      .catch(() => {
        setAdminUser(null);
        setAdminAuthStatus("denied");
      })
      .finally(() => {
        adminAuthRequestRef.current = null;
      });

    setAdminAuthStatus("checking");
    adminAuthRequestRef.current = request;
    return request;
  }, []);

  function handlePublicLocaleChange(nextLocale: Locale) {
    setPublicLocale(nextLocale);
    window.localStorage.setItem(PUBLIC_LOCALE_STORAGE_KEY, nextLocale);
  }

  function handleAdminLocaleChange(nextLocale: Locale) {
    setAdminLocale(nextLocale);
    window.localStorage.setItem(ADMIN_LOCALE_STORAGE_KEY, nextLocale);
  }

  function handlePublicThemeChange(nextTheme: Theme) {
    setPublicTheme(nextTheme);
    window.localStorage.setItem(PUBLIC_THEME_STORAGE_KEY, nextTheme);
  }

  function handleAdminThemeChange(nextTheme: Theme) {
    setAdminTheme(nextTheme);
    window.localStorage.setItem(ADMIN_THEME_STORAGE_KEY, nextTheme);
  }

  async function handleLogout() {
    await logout();
    setAdminUser(null);
    setAdminAuthStatus("denied");
    navigate("/admin/login", { replace: true });
  }

  function handleAdminLoginSuccess(user: CurrentUser) {
    setAdminUser(user);
    setAdminAuthStatus("allowed");
  }

  function handleRouteIntent(pathname: string) {
    if (pathname === "/") {
      void loadHomePage();
      return;
    }

    if (pathname === "/about") {
      void loadAboutPage();
      return;
    }

    if (pathname === "/categories" || pathname.startsWith("/categories/")) {
      void loadTaxonomyPages();
      return;
    }

    if (pathname === "/tags" || pathname.startsWith("/tags/")) {
      void loadTaxonomyPages();
      return;
    }

    if (pathname.startsWith("/posts/")) {
      void loadPostPage();
      return;
    }

    if (pathname === "/admin/login") {
      void loadLoginPage();
      return;
    }

    if (pathname === "/admin" || pathname === "/admin/dashboard") {
      void loadAdminDashboardPage();
      return;
    }

    if (pathname === "/admin/posts") {
      void loadAdminPostsPage();
      return;
    }

    if (pathname === "/admin/posts/drafts") {
      void loadAdminDraftsPage();
      return;
    }

    if (pathname.startsWith("/admin/posts/")) {
      void loadAdminEditorPage();
      return;
    }

    if (pathname === "/admin/resources") {
      void loadAdminResourcesPage();
      return;
    }

    if (pathname === "/admin/categories" || pathname === "/admin/tags") {
      void loadAdminTaxonomyPage();
      return;
    }

    if (pathname === "/admin/about") {
      void loadAdminAboutPage();
    }
  }

  function requireAdmin(children: ReactNode) {
    return (
      <RequireAdmin authStatus={adminAuthStatus} verifyAdminSession={verifyAdminSession}>
        {children}
      </RequireAdmin>
    );
  }

  return (
    <Layout
      locale={locale}
      theme={theme}
      isAdminAuthenticated={adminUser !== null}
      onLogout={() => void handleLogout()}
      onLocaleChange={isAdminRoute ? handleAdminLocaleChange : handlePublicLocaleChange}
      onThemeChange={isAdminRoute ? handleAdminThemeChange : handlePublicThemeChange}
      onRouteIntent={handleRouteIntent}
    >
      <div
        className={`route-transition ${isAdminRoute ? "route-transition--admin" : "route-transition--public"}`}
      >
        <Suspense fallback={<LoadingSection />}>
          <Routes location={location}>
            <Route path="/" element={<HomePage locale={publicLocale} />} />
            <Route path="/posts/:slug" element={<PostPage locale={publicLocale} />} />
            <Route path="/categories" element={<CategoryListPage locale={publicLocale} />} />
            <Route path="/categories/:slug" element={<CategoryDetailPage locale={publicLocale} />} />
            <Route path="/tags" element={<TagListPage locale={publicLocale} />} />
            <Route path="/tags/:slug" element={<TagDetailPage locale={publicLocale} />} />
            <Route path="/about" element={<AboutPage locale={publicLocale} />} />
            <Route
              path="/admin/login"
              element={<LoginPage locale={adminLocale} onLoginSuccess={handleAdminLoginSuccess} />}
            />
            <Route path="/admin" element={requireAdmin(<AdminDashboardPage locale={adminLocale} />)} />
            <Route path="/admin/dashboard" element={requireAdmin(<AdminDashboardPage locale={adminLocale} />)} />
            <Route path="/admin/about" element={requireAdmin(<AdminAboutPage locale={adminLocale} />)} />
            <Route path="/admin/posts" element={requireAdmin(<AdminPostsPage locale={adminLocale} />)} />
            <Route path="/admin/posts/new" element={requireAdmin(<AdminEditorPage locale={adminLocale} />)} />
            <Route path="/admin/posts/drafts" element={requireAdmin(<AdminDraftsPage locale={adminLocale} />)} />
            <Route path="/admin/posts/:id" element={requireAdmin(<AdminEditorPage locale={adminLocale} />)} />
            <Route path="/admin/resources" element={requireAdmin(<AdminResourcesPage locale={adminLocale} />)} />
            <Route path="/admin/categories" element={requireAdmin(<AdminTaxonomyPage kind="categories" locale={adminLocale} />)} />
            <Route path="/admin/tags" element={requireAdmin(<AdminTaxonomyPage kind="tags" locale={adminLocale} />)} />
            <Route path="*" element={<NotFoundPage locale={locale} />} />
          </Routes>
        </Suspense>
      </div>
    </Layout>
  );
}
