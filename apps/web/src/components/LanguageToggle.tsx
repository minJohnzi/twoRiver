import type { Locale } from "@tworiver/shared";

interface LanguageToggleProps {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
}

export function LanguageToggle({ locale, onLocaleChange }: LanguageToggleProps) {
  return (
    <div className="language-toggle" aria-label="Language">
      <button
        type="button"
        className={locale === "zh" ? "is-active" : undefined}
        aria-pressed={locale === "zh"}
        onClick={() => onLocaleChange("zh")}
      >
        中文
      </button>
      <button
        type="button"
        className={locale === "en" ? "is-active" : undefined}
        aria-pressed={locale === "en"}
        onClick={() => onLocaleChange("en")}
      >
        EN
      </button>
    </div>
  );
}
