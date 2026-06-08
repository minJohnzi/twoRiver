import type { Locale } from "@tworiver/shared";
import { type Dispatch, type ReactNode, type SetStateAction, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { fetchCurrentUser, logout, type CurrentUser } from "./api/admin";
import { AdminAboutPage } from "./pages/AdminAboutPage";
import { AdminEditorPage } from "./pages/AdminEditorPage";
import { AdminPostsPage } from "./pages/AdminPostsPage";
import { AdminTaxonomyPage } from "./pages/AdminTaxonomyPage";
import { AboutPage } from "./pages/AboutPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PostPage } from "./pages/PostPage";
import { CategoryDetailPage, CategoryListPage, TagDetailPage, TagListPage } from "./pages/TaxonomyPages";

const DEFAULT_LOCALE: Locale = "zh";
type Theme = "dark" | "light";
const DEFAULT_THEME: Theme = "dark";

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

interface RequireAdminProps {
  children: ReactNode;
  setAdminUser: Dispatch<SetStateAction<CurrentUser | null>>;
}

function RequireAdmin({ children, setAdminUser }: RequireAdminProps) {
  const location = useLocation();
  const [status, setStatus] = useState<"checking" | "allowed" | "denied">("checking");

  useEffect(() => {
    let isMounted = true;

    async function verifySession() {
      try {
        const { user } = await fetchCurrentUser();
        if (isMounted) {
          setAdminUser(user);
          setStatus("allowed");
        }
      } catch {
        if (isMounted) {
          setAdminUser(null);
          setStatus("denied");
        }
      }
    }

    void verifySession();

    return () => {
      isMounted = false;
    };
  }, [location.pathname, setAdminUser]);

  if (status === "checking") {
    return (
      <section className="page-section admin-panel">
        <p className="muted">Loading...</p>
      </section>
    );
  }

  if (status === "denied") {
    return <Navigate to="/admin/login" replace state={{ from: location }} />;
  }

  return children;
}

export function App() {
  const [locale, setLocale] = useState<Locale>(getInitialLocale);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [adminUser, setAdminUser] = useState<CurrentUser | null>(null);
  const navigate = useNavigate();

  function handleLocaleChange(nextLocale: Locale) {
    setLocale(nextLocale);
    window.localStorage.setItem("tworiver_locale", nextLocale);
  }

  function handleThemeChange(nextTheme: Theme) {
    setTheme(nextTheme);
    window.localStorage.setItem("tworiver_theme", nextTheme);
  }

  async function handleLogout() {
    await logout();
    setAdminUser(null);
    navigate("/admin/login", { replace: true });
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
      <Routes>
        <Route path="/" element={<HomePage locale={locale} />} />
        <Route path="/posts/:slug" element={<PostPage locale={locale} />} />
        <Route path="/categories" element={<CategoryListPage locale={locale} />} />
        <Route path="/categories/:slug" element={<CategoryDetailPage locale={locale} />} />
        <Route path="/tags" element={<TagListPage locale={locale} />} />
        <Route path="/tags/:slug" element={<TagDetailPage locale={locale} />} />
        <Route path="/about" element={<AboutPage locale={locale} />} />
        <Route path="/admin/login" element={<LoginPage locale={locale} />} />
        <Route
          path="/admin/about"
          element={
            <RequireAdmin setAdminUser={setAdminUser}>
              <AdminAboutPage locale={locale} />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/posts"
          element={
            <RequireAdmin setAdminUser={setAdminUser}>
              <AdminPostsPage locale={locale} />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/posts/new"
          element={
            <RequireAdmin setAdminUser={setAdminUser}>
              <AdminEditorPage locale={locale} />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/posts/:id"
          element={
            <RequireAdmin setAdminUser={setAdminUser}>
              <AdminEditorPage locale={locale} />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/categories"
          element={
            <RequireAdmin setAdminUser={setAdminUser}>
              <AdminTaxonomyPage kind="categories" locale={locale} />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/tags"
          element={
            <RequireAdmin setAdminUser={setAdminUser}>
              <AdminTaxonomyPage kind="tags" locale={locale} />
            </RequireAdmin>
          }
        />
        <Route path="*" element={<NotFoundPage locale={locale} />} />
      </Routes>
    </Layout>
  );
}
