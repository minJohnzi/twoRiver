import type { Locale } from "@tworiver/shared";
import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { LanguageToggle } from "./LanguageToggle";

interface LayoutProps {
  children: ReactNode;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
}

export function Layout({ children, locale, onLocaleChange }: LayoutProps) {
  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="site-header__inner">
          <NavLink to="/" className="brand" aria-label="TwoRiver home">
            TwoRiver
          </NavLink>
          <nav className="site-nav" aria-label="Primary navigation">
            <NavLink to="/">Blog</NavLink>
            <NavLink to="/about">About</NavLink>
            <NavLink to="/admin/login">Admin</NavLink>
          </nav>
          <LanguageToggle locale={locale} onLocaleChange={onLocaleChange} />
        </div>
      </header>
      <main className="site-main">{children}</main>
    </div>
  );
}
