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

function getInitialLocale(): Locale {
  if (typeof window === "undefined") {
    return DEFAULT_LOCALE;
  }

  const savedLocale = window.localStorage.getItem("tworiver_locale");
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
  const [locale, setLocale] = useState<Locale>(getInitialLocale);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [adminUser, setAdminUser] = useState<CurrentUser | null>(null);
  const [adminAuthStatus, setAdminAuthStatus] = useState<AdminAuthStatus>("unknown");
  const adminAuthRequestRef = useRef<Promise<void> | null>(null);
  const navigate = useNavigate();

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

  function handleLocaleChange(nextLocale: Locale) {
    setLocale(nextLocale);
    window.localStorage.setItem("tworiver_locale", nextLocale);
    document.documentElement.lang = getHtmlLang(nextLocale);
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
      onLocaleChange={handleLocaleChange}
      onThemeChange={handleThemeChange}
    >
      <Suspense fallback={<LoadingSection />}>
        <Routes>
          <Route path="/" element={<HomePage locale={locale} />} />
          <Route path="/posts/:slug" element={<PostPage locale={locale} />} />
          <Route path="/categories" element={<CategoryListPage locale={locale} />} />
          <Route path="/categories/:slug" element={<CategoryDetailPage locale={locale} />} />
          <Route path="/tags" element={<TagListPage locale={locale} />} />
          <Route path="/tags/:slug" element={<TagDetailPage locale={locale} />} />
          <Route path="/about" element={<AboutPage locale={locale} />} />
          <Route path="/admin/login" element={<LoginPage locale={locale} />} />
          <Route path="/admin/about" element={requireAdmin(<AdminAboutPage locale={locale} />)} />
          <Route path="/admin/posts" element={requireAdmin(<AdminPostsPage locale={locale} />)} />
          <Route path="/admin/posts/new" element={requireAdmin(<AdminEditorPage locale={locale} />)} />
          <Route path="/admin/posts/:id" element={requireAdmin(<AdminEditorPage locale={locale} />)} />
          <Route path="/admin/categories" element={requireAdmin(<AdminTaxonomyPage kind="categories" locale={locale} />)} />
          <Route path="/admin/tags" element={requireAdmin(<AdminTaxonomyPage kind="tags" locale={locale} />)} />
          <Route path="*" element={<NotFoundPage locale={locale} />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}
