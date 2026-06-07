import type { Locale } from "@tworiver/shared";

interface AboutPageProps {
  locale: Locale;
}

export function AboutPage({ locale }: AboutPageProps) {
  return (
    <section className="page-section">
      <h1>{locale === "zh" ? "关于 TwoRiver" : "About TwoRiver"}</h1>
      {locale === "zh" ? (
        <p>
          这是一个个人技术博客，主要记录软件工程相关的学习、实践和思考，
          包括开发方法、系统设计、工具使用和工程经验。
        </p>
      ) : (
        <p>
          TwoRiver is a personal technical blog focused on software engineering notes,
          including development practice, system design, tooling, and engineering lessons.
        </p>
      )}
    </section>
  );
}
