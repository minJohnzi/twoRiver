import type { Locale } from "@tworiver/shared";

interface ArticleLocaleTabsProps {
  activeLocale: Locale;
  onChange: (locale: Locale) => void;
}

export function ArticleLocaleTabs({ activeLocale, onChange }: ArticleLocaleTabsProps) {
  return (
    <div className="language-tabs" role="tablist" aria-label="Editor language">
      {(["zh", "en"] as const).map((translationLocale) => (
        <button
          type="button"
          key={translationLocale}
          className={activeLocale === translationLocale ? "is-active" : undefined}
          onClick={() => onChange(translationLocale)}
        >
          {translationLocale === "zh" ? "中文" : "EN"}
        </button>
      ))}
    </div>
  );
}
