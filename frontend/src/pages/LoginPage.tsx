import { useEffect, useState } from "react";
import SplashScreen from "../components/SplashScreen";
import eyeIcon from "../assets/eye.svg";
import eyeSlashIcon from "../assets/eye-slash.svg";
import Eye from "../assets/eye.svg?react";
import EyeSlash from "../assets/eye-slash.svg?react";

type VerifyResponse = {
  access_token: string;
  token_type: string;
};

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSplash, setShowSplash] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 900);
    return () => clearTimeout(timer);
  }, []);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }
    setError(null);
    setStatus("Authenticating...");
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/password-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password: password.trim(),
        }),
      });
      // Prefer JSON when available; fall back to text so we can surface
      // backend error messages even if the response isn't JSON.
      const contentType = res.headers.get("content-type") || "";
      let data: any = null;
      let rawText: string | null = null;
      if (contentType.includes("application/json")) {
        try {
          data = await res.json();
        } catch (_) {
          // leave data as null and try text below
        }
      }
      if (!data) {
        try {
          rawText = await res.text();
        } catch (_) {
          rawText = null;
        }
      }

      if (!res.ok) {
        const serverMsg =
          (data && (data.detail || data.message || data.error)) ||
          rawText ||
          res.statusText ||
          "Authentication failed";
        throw new Error(serverMsg);
      }

      const token = data?.access_token;
      if (!token) {
        const msg = rawText || "Unexpected server response (missing token)";
        throw new Error(msg);
      }

      localStorage.setItem("access_token", token);
      setStatus("Success! Redirecting...");
      setTimeout(() => {
        window.location.href = "/";
      }, 500);
    } catch (err: any) {
      setStatus(null);
      setIsLoading(false);
      setError(
        err.message || "Authentication failed. Please verify your credentials.",
      );
    }
  };

  if (showSplash) {
    return <SplashScreen label="Login" />;
  }

  return (
    <div className="login-shell">
      {/* Centered Login Card */}
      <div className="login-card ">
        <div className="login-card-body">
          <img src="/three65.png" alt="Three65" className="logo-365" />
          <form className="login-form" onSubmit={signIn}>
            <div>
              <div className="input-group">
                <input
                  id="email"
                  type="email"
                  placeholder="Email Address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  disabled={isLoading}
                />
              </div>

              <div className="input-group">
                <div className="input-with-action">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    disabled={isLoading}
                    className="input-has-action"
                  />
                  <button
                    type="button"
                    className="input-action-btn"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    disabled={isLoading}
                  >
                    <img
                      src={showPassword ? eyeSlashIcon : eyeIcon}
                      alt=""
                      aria-hidden="true"
                    />
                  </button>
                </div>
              </div>
            </div>

            <button className="login-btn" type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <span className="spinner"></span>
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </>
              )}
            </button>
          </form>

          {status && !error && (
            <div className="login-status">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              {status}
            </div>
          )}
          {error && (
            <div className="login-error">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error}
            </div>
          )}
        </div>

        <div className="login-card-footer">
          <span>
            <strong>
              <a
                style={{ textDecoration: "underline", color: "var(--blue-50)" }}
                target="_blank"
                rel="noreferrer"
                href="http://www.geenet.co.zw"
              >
                Powered by GeeNet
              </a>
            </strong>
          </span>
        </div>
        <div className="login-socials">
          <a href="#linkedin" target="_blank" rel="noreferrer">
            <img src="/linkedin-icon.svg" alt="LinkedIn" />
          </a>
          <a href="#facebook" target="_blank" rel="noreferrer">
            <img src="/facebook-icon.svg" alt="Facebook" />
          </a>
          <a href="#twitter" target="_blank" rel="noreferrer">
            <img src="/twitter-icon.svg" alt="Twitter" />
          </a>
        </div>
      </div>
    </div>
  );
}
