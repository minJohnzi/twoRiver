import type { Locale } from "@tworiver/shared";
import { useState } from "react";
import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AdminAboutPage } from "./pages/AdminAboutPage";
import { AdminEditorPage } from "./pages/AdminEditorPage";
import { AdminPostsPage } from "./pages/AdminPostsPage";
import { AboutPage } from "./pages/AboutPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { PostPage } from "./pages/PostPage";

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

export function App() {
  const [locale, setLocale] = useState<Locale>(getInitialLocale);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  function handleLocaleChange(nextLocale: Locale) {
    setLocale(nextLocale);
    window.localStorage.setItem("tworiver_locale", nextLocale);
  }

  function handleThemeChange(nextTheme: Theme) {
    setTheme(nextTheme);
    window.localStorage.setItem("tworiver_theme", nextTheme);
  }

  return (
    <Layout locale={locale} theme={theme} onLocaleChange={handleLocaleChange} onThemeChange={handleThemeChange}>
      <Routes>
        <Route path="/" element={<HomePage locale={locale} />} />
        <Route path="/posts/:slug" element={<PostPage locale={locale} />} />
        <Route path="/about" element={<AboutPage locale={locale} />} />
        <Route path="/admin/login" element={<LoginPage locale={locale} />} />
        <Route path="/admin/about" element={<AdminAboutPage locale={locale} />} />
        <Route path="/admin/posts" element={<AdminPostsPage locale={locale} />} />
        <Route path="/admin/posts/new" element={<AdminEditorPage locale={locale} />} />
        <Route path="/admin/posts/:id" element={<AdminEditorPage locale={locale} />} />
      </Routes>
    </Layout>
  );
}
