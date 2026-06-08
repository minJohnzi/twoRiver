import type { Locale } from "@tworiver/shared";
import { Link } from "react-router-dom";

interface NotFoundPageProps {
  locale: Locale;
}

export function NotFoundPage({ locale }: NotFoundPageProps) {
  return (
    <section className="page-section not-found">
      <p className="admin-kicker">404</p>
      <h1>Page not found</h1>
      <p>{locale === "zh" ? "这个页面不存在，可能已经移动或删除。" : "This page does not exist or has moved."}</p>
      <Link className="primary-button" to="/">
        Back to home
      </Link>
    </section>
  );
}
