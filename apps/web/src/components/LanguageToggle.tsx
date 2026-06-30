import type { Locale } from "@tworiver/shared";

interface LanguageToggleProps {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
}

export function LanguageToggle({ locale, onLocaleChange }: LanguageToggleProps) {
  const nextLocale = locale === "zh" ? "en" : "zh";
  const label = locale === "zh" ? "切换到英文" : "Switch to Chinese";

  return (
    <button
      type="button"
      className="language-toggle"
      aria-label={label}
      onClick={() => onLocaleChange(nextLocale)}
    >
      {locale === "zh" ? "EN" : "中文"}
    </button>
  );
}
