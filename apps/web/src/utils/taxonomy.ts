import type { Category, Locale, Tag } from "@tworiver/shared";

type TaxonomyItem = Category | Tag;
type TaxonomyTranslation = NonNullable<TaxonomyItem["translations"]>[number];

export function getTaxonomyTranslationName(item: TaxonomyItem, locale: Locale): string {
  const translation = item.translations?.find((candidate: TaxonomyTranslation) => candidate.locale === locale);
  return translation && "name" in translation ? translation.name?.trim() ?? "" : "";
}

export function getTaxonomyDisplayName(item: TaxonomyItem, locale: Locale): string {
  const localizedName = getTaxonomyTranslationName(item, locale);
  if (localizedName) {
    return localizedName;
  }

  const fallbackLocale: Locale = locale === "zh" ? "en" : "zh";
  const fallbackName = getTaxonomyTranslationName(item, fallbackLocale);
  return fallbackName || item.name || item.slug;
}

export function getTaxonomyAlternateName(item: TaxonomyItem, locale: Locale): string {
  const fallbackLocale: Locale = locale === "zh" ? "en" : "zh";
  const localizedName = getTaxonomyDisplayName(item, locale);
  const alternateName = getTaxonomyTranslationName(item, fallbackLocale);
  return alternateName && alternateName !== localizedName ? alternateName : "";
}

export function getCategoryDescription(category: Category, locale: Locale): string {
  return (
    category.translations?.find((translation) => translation.locale === locale)?.description?.trim() ??
    category.translations?.find((translation) => translation.locale !== locale)?.description?.trim() ??
    ""
  );
}

export function getTaxonomySearchText(item: TaxonomyItem, locale: Locale): string {
  const translatedNames = item.translations
    ?.map((translation: TaxonomyTranslation) => ("name" in translation ? translation.name : ""))
    .filter(Boolean) ?? [];
  return [item.slug, item.name, getTaxonomyDisplayName(item, locale), ...translatedNames].join(" ");
}
