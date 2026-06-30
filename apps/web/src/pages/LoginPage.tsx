import type { Locale } from "@tworiver/shared";
import { type FormEvent, type SVGProps, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { login, type CurrentUser } from "../api/auth";

interface LoginPageProps {
  locale: Locale;
  onLoginSuccess?: (user: CurrentUser) => void;
}

interface LoginLocationState {
  from?: {
    pathname?: string;
  };
}

type LoginIconName = "arrow-right" | "eye" | "eye-off" | "loader" | "lock" | "mail" | "shield";

function LoginIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: LoginIconName }) {
  const iconProps = {
    "aria-hidden": true,
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 2,
    viewBox: "0 0 24 24",
    ...props
  };

  switch (name) {
    case "arrow-right":
      return (
        <svg {...iconProps}>
          <path d="M5 12h14" />
          <path d="m12 5 7 7-7 7" />
        </svg>
      );
    case "eye":
      return (
        <svg {...iconProps}>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "eye-off":
      return (
        <svg {...iconProps}>
          <path d="m3 3 18 18" />
          <path d="M10.6 10.6a3 3 0 0 0 2.8 2.8" />
          <path d="M9.9 4.24A9.8 9.8 0 0 1 12 4c6.5 0 10 8 10 8a18 18 0 0 1-2.16 3.19" />
          <path d="M6.4 6.4C3.68 8.24 2 12 2 12s3.5 8 10 8a9.7 9.7 0 0 0 4.8-1.26" />
        </svg>
      );
    case "loader":
      return (
        <svg {...iconProps}>
          <path d="M21 12a9 9 0 0 1-9 9" />
          <path d="M3 12a9 9 0 0 1 9-9" />
        </svg>
      );
    case "lock":
      return (
        <svg {...iconProps}>
          <rect width="16" height="11" x="4" y="11" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      );
    case "mail":
      return (
        <svg {...iconProps}>
          <rect width="20" height="16" x="2" y="4" rx="2" />
          <path d="m22 7-10 6L2 7" />
        </svg>
      );
    case "shield":
      return (
        <svg {...iconProps}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
  }
}

export function LoginPage({ locale, onLoginSuccess }: LoginPageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LoginLocationState | null;
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberConnection, setRememberConnection] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const copy = {
    title: locale === "zh" ? "TwoRiver" : "TwoRiver",
    subtitle: locale === "zh" ? "博客管理终端" : "TwoRiver Blog · Technical publishing console",
    username: locale === "zh" ? "账号" : "Account",
    usernamePlaceholder: locale === "zh" ? "用户名或邮箱" : "Username or email",
    password: locale === "zh" ? "访问密码" : "Access password",
    passwordPlaceholder: locale === "zh" ? "请输入您的安全密码" : "Enter your secure password",
    forgotPassword: locale === "zh" ? "忘记密码?" : "Forgot password?",
    rememberConnection: locale === "zh" ? "记住当前连接" : "Remember this connection",
    secured: "SECURED SSL",
    button: locale === "zh" ? "验证并登录控制台" : "Verify and enter console",
    submitting: locale === "zh" ? "建立安全通信中..." : "Establishing secure session...",
    missingUsername: locale === "zh" ? "请输入账号。" : "Enter your account.",
    shortPassword: locale === "zh" ? "密码长度不能少于 6 位" : "Password must be at least 6 characters.",
    loginFailed: locale === "zh" ? "登录失败，请检查账号或密码。" : "Login failed. Check your account and password.",
    resetHint:
      locale === "zh"
        ? "请联系站点管理员重置后台密码，系统不会在页面上显示默认密码。"
        : "Contact the site administrator to reset the admin password.",
    footer: locale === "zh" ? "© 2026 Explorer Space. Open Source System." : "© 2026 Explorer Space. Open Source System.",
    terms: locale === "zh" ? "服务条款" : "Terms",
    privacy: locale === "zh" ? "安全隐私" : "Security"
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!username.trim()) {
      setError(copy.missingUsername);
      return;
    }

    if (password.length < 6) {
      setError(copy.shortPassword);
      return;
    }

    setIsSubmitting(true);

    try {
      const { user } = await login(username, password);
      onLoginSuccess?.(user);
      const targetPath = state?.from?.pathname?.startsWith("/admin") ? state.from.pathname : "/admin";
      navigate(targetPath, { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.loginFailed);
    } finally {
      setIsSubmitting(false);
    }
  }

  function showResetHint() {
    setError(copy.resetHint);
  }

  return (
    <section className="admin-login" aria-labelledby="admin-login-title">
      <div className="admin-login__container">
        <header className="admin-login__header">
          <span className="admin-login__badge" aria-hidden="true">
            <LoginIcon name="shield" />
          </span>
          <h1 id="admin-login-title">{copy.title}</h1>
          <p>{copy.subtitle}</p>
        </header>

        <form className="admin-login__card" onSubmit={handleSubmit}>
          {error ? (
            <p className="admin-login__error" role="alert">
              {error}
            </p>
          ) : null}

          <label className="admin-login__field" htmlFor="admin-login-email">
            <span>{copy.username}</span>
            <span className="admin-login__control">
              <LoginIcon name="mail" />
              <input
                id="admin-login-email"
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder={copy.usernamePlaceholder}
                autoComplete="username"
                required
              />
            </span>
          </label>

          <label className="admin-login__field" htmlFor="admin-login-password">
            <span className="admin-login__field-heading">
              <span>{copy.password}</span>
              <button type="button" className="admin-login__link" onClick={showResetHint}>
                {copy.forgotPassword}
              </button>
            </span>
            <span className="admin-login__control">
              <LoginIcon name="lock" />
              <input
                id="admin-login-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={copy.passwordPlaceholder}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="admin-login__icon-button"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                <LoginIcon name={showPassword ? "eye-off" : "eye"} />
              </button>
            </span>
          </label>

          <div className="admin-login__meta">
            <label className="admin-login__remember">
              <input
                type="checkbox"
                checked={rememberConnection}
                onChange={(event) => setRememberConnection(event.target.checked)}
              />
              <span>{copy.rememberConnection}</span>
            </label>
            <span>{copy.secured}</span>
          </div>

          <button className="admin-login__button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <LoginIcon name="loader" className="admin-login__spinner" />
                <span>{copy.submitting}</span>
              </>
            ) : (
              <>
                <span>{copy.button}</span>
                <LoginIcon name="arrow-right" />
              </>
            )}
          </button>
        </form>

        <footer className="admin-login__footer">
          <p>{copy.footer}</p>
          <span>{copy.terms}</span>
          <span aria-hidden="true">·</span>
          <span>{copy.privacy}</span>
        </footer>
      </div>
    </section>
  );
}
