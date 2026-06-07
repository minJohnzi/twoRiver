import type { Locale } from "@tworiver/shared";
import { useState } from "react";
import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AboutPage } from "./pages/AboutPage";
import { HomePage } from "./pages/HomePage";
import { PostPage } from "./pages/PostPage";

const DEFAULT_LOCALE: Locale = "zh";

function getInitialLocale(): Locale {
  if (typeof window === "undefined") {
    return DEFAULT_LOCALE;
  }

  const savedLocale = window.localStorage.getItem("tworiver_locale");
  return savedLocale === "en" || savedLocale === "zh" ? savedLocale : DEFAULT_LOCALE;
}

function AdminPlaceholderPage() {
  return (
    <section className="page-section">
      <h1>Admin</h1>
      <p className="muted">Admin interface coming in the next task.</p>
    </section>
  );
}

export function App() {
  const [locale, setLocale] = useState<Locale>(getInitialLocale);

  function handleLocaleChange(nextLocale: Locale) {
    setLocale(nextLocale);
    window.localStorage.setItem("tworiver_locale", nextLocale);
  }

  return (
    <Layout locale={locale} onLocaleChange={handleLocaleChange}>
      <Routes>
        <Route path="/" element={<HomePage locale={locale} />} />
        <Route path="/posts/:slug" element={<PostPage locale={locale} />} />
        <Route path="/about" element={<AboutPage locale={locale} />} />
        <Route path="/admin/login" element={<AdminPlaceholderPage />} />
      </Routes>
    </Layout>
  );
}
