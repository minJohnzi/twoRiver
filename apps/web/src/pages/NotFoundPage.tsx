import type { Locale } from "@tworiver/shared";
import { Link } from "react-router-dom";

interface NotFoundPageProps {
  locale: Locale;
}

const notFoundCopy: Record<
  Locale,
  {
    caption: string;
    actionsLabel: string;
    homeLabel: string;
    tagsLabel: string;
  }
> = {
  zh: {
    caption: "最后一次信号停在未发布的岸边。",
    actionsLabel: "页面恢复操作",
    homeLabel: "回到首页",
    tagsLabel: "浏览标签"
  },
  en: {
    caption: "The last signal stopped on an unpublished shore.",
    actionsLabel: "Page recovery actions",
    homeLabel: "Back home",
    tagsLabel: "Browse tags"
  }
};

export function NotFoundPage({ locale }: NotFoundPageProps) {
  const copy = notFoundCopy[locale];

  return (
    <section className="page-section not-found" aria-labelledby="not-found-code">
      <div className="not-found__status" aria-label="404 status">
        <p>TWORIVER://404</p>
        <p>route.missing</p>
      </div>

      <h1 className="not-found__code" id="not-found-code" aria-label="404">
        <span>4</span>
        <span className="not-found__zero" aria-hidden="true" />
        <span>4</span>
      </h1>

      <p className="not-found__caption">{copy.caption}</p>

      <nav className="not-found__actions" aria-label={copy.actionsLabel}>
        <Link to="/">{copy.homeLabel}</Link>
        <Link to="/tags">{copy.tagsLabel}</Link>
      </nav>
    </section>
  );
}
