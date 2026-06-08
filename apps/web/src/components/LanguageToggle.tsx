import type { Locale } from "@tworiver/shared";

interface LanguageToggleProps {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
}

export function LanguageToggle({ locale, onLocaleChange }: LanguageToggleProps) {
  const nextLocale = locale === "zh" ? "en" : "zh";

  return (
    <button
      type="button"
      className="language-toggle"
      aria-label={`Switch to ${nextLocale === "zh" ? "Chinese" : "English"}`}
      onClick={() => onLocaleChange(nextLocale)}
    >
      {locale === "zh" ? "en" : "中"}
    </button>
  );
}
