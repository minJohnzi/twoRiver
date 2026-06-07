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
    <section className="page-section admin-panel">
      <h1>{locale === "zh" ? "管理员登录" : "Admin Login"}</h1>
      <form className="form-stack" onSubmit={handleSubmit}>
        <label>
          <span>{locale === "zh" ? "用户名" : "Username"}</span>
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
        </label>
        <label>
          <span>{locale === "zh" ? "密码" : "Password"}</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
        </label>
        {error ? <p className="error-text">{error}</p> : null}
        <button className="primary-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "..." : locale === "zh" ? "登录" : "Log in"}
        </button>
      </form>
    </section>
  );
}
