import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../api/admin";

interface LoginPageProps {
  locale: "zh" | "en";
}

export function LoginPage({ locale }: LoginPageProps) {
  const navigate = useNavigate();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const copy = {
    eyebrow: locale === "zh" ? "TwoRiver 控制台" : "TwoRiver Console",
    title: locale === "zh" ? "进入写作中控室" : "Enter the writing cockpit",
    intro:
      locale === "zh"
        ? "这里用于发布文章、维护双语内容，并在上线前完成最后一次校准。"
        : "Publish essays, tune bilingual drafts, and run the final pre-flight check before release.",
    username: locale === "zh" ? "用户名" : "Username",
    password: locale === "zh" ? "密码" : "Password",
    button: locale === "zh" ? "解锁后台" : "Unlock admin",
    submitting: locale === "zh" ? "正在验证..." : "Verifying...",
    signal: locale === "zh" ? "安全会话" : "Secure session",
    signalText: locale === "zh" ? "登录后将创建仅用于后台编辑的会话。" : "A dedicated editor session starts after login.",
    checkpoint: locale === "zh" ? "今日检查" : "Today check",
    checkpointText: locale === "zh" ? "草稿、标签与翻译状态保持同步。" : "Drafts, tags, and translations stay aligned.",
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      await login(username, password);
      navigate("/admin/posts");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="admin-login" aria-labelledby="admin-login-title">
      <div className="admin-login__ambient" aria-hidden="true" />
      <div className="admin-login__panel">
        <div className="admin-login__story">
          <p className="admin-login__eyebrow">{copy.eyebrow}</p>
          <h1 id="admin-login-title">{copy.title}</h1>
          <p>{copy.intro}</p>
          <div className="admin-login__signal" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>

        <form className="admin-login__form" onSubmit={handleSubmit}>
          <div className="admin-login__form-head">
            <span>{copy.signal}</span>
            <strong>01</strong>
          </div>
          <label>
            <span>{copy.username}</span>
            <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
          </label>
          <label>
            <span>{copy.password}</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>
          {error ? <p className="error-text admin-login__error">{error}</p> : null}
          <button className="admin-login__button" type="submit" disabled={isSubmitting}>
            <span>{isSubmitting ? copy.submitting : copy.button}</span>
          </button>
        </form>

        <aside className="admin-login__note" aria-label={copy.checkpoint}>
          <span>{copy.checkpoint}</span>
          <p>{copy.checkpointText}</p>
        </aside>
        <aside className="admin-login__note admin-login__note--soft" aria-label={copy.signal}>
          <span>{copy.signal}</span>
          <p>{copy.signalText}</p>
        </aside>
      </div>
    </section>
  );
}
