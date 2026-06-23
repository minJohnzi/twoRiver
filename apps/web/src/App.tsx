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
type AdminAuthStatus = "unknown" | "checking" | "allowed" | "denied";

function lazyNamed<TProps>(loader: () => Promise<Record<string, unknown>>, name: string) {
  return lazy(async () => ({ default: (await loader())[name] as ComponentType<TProps> }));
}

const HomePage = lazyNamed<{ locale: Locale }>(() => import("./pages/HomePage"), "HomePage");
const PostPage = lazyNamed<{ locale: Locale }>(() => import("./pages/PostPage"), "PostPage");
const CategoryListPage = lazyNamed<{ locale: Locale }>(() => import("./pages/TaxonomyPages"), "CategoryListPage");
const CategoryDetailPage = lazyNamed<{ locale: Locale }>(() => import("./pages/TaxonomyPages"), "CategoryDetailPage");
const TagListPage = lazyNamed<{ locale: Locale }>(() => import("./pages/TaxonomyPages"), "TagListPage");
const TagDetailPage = lazyNamed<{ locale: Locale }>(() => import("./pages/TaxonomyPages"), "TagDetailPage");
const AboutPage = lazyNamed<{ locale: Locale }>(() => import("./pages/AboutPage"), "AboutPage");
const LoginPage = lazyNamed<{ locale: Locale }>(() => import("./pages/LoginPage"), "LoginPage");
const NotFoundPage = lazyNamed<{ locale: Locale }>(() => import("./pages/NotFoundPage"), "NotFoundPage");
const AdminAboutPage = lazyNamed<{ locale: Locale }>(() => import("./pages/AdminAboutPage"), "AdminAboutPage");
const AdminEditorPage = lazyNamed<{ locale: Locale }>(() => import("./pages/AdminEditorPage"), "AdminEditorPage");
const AdminPostsPage = lazyNamed<{ locale: Locale }>(() => import("./pages/AdminPostsPage"), "AdminPostsPage");
const AdminTaxonomyPage = lazyNamed<{ kind: "categories" | "tags"; locale: Locale }>(
  () => import("./pages/AdminTaxonomyPage"),
  "AdminTaxonomyPage"
);

function getInitialLocale(storageKey: string): Locale {
  if (typeof window === "undefined") {
    return DEFAULT_LOCALE;
  }

  const savedLocale = window.localStorage.getItem(storageKey);
  return savedLocale === "en" || savedLocale === "zh" ? savedLocale : DEFAULT_LOCALE;
}

function getInitialTheme(): Theme {
  if (typeof window === "undefined") {
    return DEFAULT_THEME;
  }

  const savedTheme = window.localStorage.getItem("tworiver_theme");
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
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [adminUser, setAdminUser] = useState<CurrentUser | null>(null);
  const [adminAuthStatus, setAdminAuthStatus] = useState<AdminAuthStatus>("unknown");
  const adminAuthRequestRef = useRef<Promise<void> | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const isAdminRoute = location.pathname.startsWith("/admin");
  const locale = isAdminRoute ? adminLocale : publicLocale;

  useEffect(() => {
    document.documentElement.lang = getHtmlLang(locale);
  }, [locale]);

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

  function handleThemeChange(nextTheme: Theme) {
    setTheme(nextTheme);
    window.localStorage.setItem("tworiver_theme", nextTheme);
  }

  async function handleLogout() {
    await logout();
    setAdminUser(null);
    setAdminAuthStatus("denied");
    navigate("/admin/login", { replace: true });
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
      onThemeChange={handleThemeChange}
    >
      <Suspense fallback={<LoadingSection />}>
        <Routes>
          <Route path="/" element={<HomePage locale={publicLocale} />} />
          <Route path="/posts/:slug" element={<PostPage locale={publicLocale} />} />
          <Route path="/categories" element={<CategoryListPage locale={publicLocale} />} />
          <Route path="/categories/:slug" element={<CategoryDetailPage locale={publicLocale} />} />
          <Route path="/tags" element={<TagListPage locale={publicLocale} />} />
          <Route path="/tags/:slug" element={<TagDetailPage locale={publicLocale} />} />
          <Route path="/about" element={<AboutPage locale={publicLocale} />} />
          <Route path="/admin/login" element={<LoginPage locale={adminLocale} />} />
          <Route path="/admin/about" element={requireAdmin(<AdminAboutPage locale={adminLocale} />)} />
          <Route path="/admin/posts" element={requireAdmin(<AdminPostsPage locale={adminLocale} />)} />
          <Route path="/admin/posts/new" element={requireAdmin(<AdminEditorPage locale={adminLocale} />)} />
          <Route path="/admin/posts/:id" element={requireAdmin(<AdminEditorPage locale={adminLocale} />)} />
          <Route path="/admin/categories" element={requireAdmin(<AdminTaxonomyPage kind="categories" locale={adminLocale} />)} />
          <Route path="/admin/tags" element={requireAdmin(<AdminTaxonomyPage kind="tags" locale={adminLocale} />)} />
          <Route path="*" element={<NotFoundPage locale={locale} />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}
