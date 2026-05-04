import { useEffect, useState } from "react";
import SplashScreen from "../components/SplashScreen";
import eyeIcon from "../assets/eye.svg";
import eyeSlashIcon from "../assets/eye-slash.svg";

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

      const contentType = res.headers.get("content-type") || "";
      let data: any = null;
      let rawText: string | null = null;
      if (contentType.includes("application/json")) {
        try {
          data = await res.json();
        } catch {
          data = null;
        }
      }
      if (!data) {
        try {
          rawText = await res.text();
        } catch {
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
        throw new Error(rawText || "Unexpected server response (missing token)");
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
    <div className="login-canvas">
      <div className="login-canvas__bg" />
      <div className="login-canvas__overlay" />
      <div className="login-canvas__orb login-canvas__orb--green" />
      <div className="login-canvas__orb login-canvas__orb--green-bottom" />
      <div className="login-canvas__orb login-canvas__orb--blue-top" />
      <div className="login-canvas__orb login-canvas__orb--blue-bottom" />
      <div className="login-canvas__content">
        <div className="login-canvas__panel-wrap">
          <div className="login-canvas__panel">
            <div className="login-canvas__panel-inner">
              <div className="login-canvas__brand">
                <img src="/three65.png" alt="Three65" className="login-canvas__logo" />
                <div className="login-canvas__brand-copy">
                  <strong>Welcome back</strong>
                  <span>Sign in to continue to three65</span>
                </div>
              </div>

              <form className="login-canvas__form" onSubmit={signIn}>
                <div className="login-canvas__field">
                  <input
                    id="email"
                    type="email"
                    placeholder="Email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    disabled={isLoading}
                  />
                </div>

                <div className="login-canvas__field">
                  <div className="login-canvas__password-wrap">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      className="login-canvas__password-btn"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
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

                <button className="login-canvas__submit" type="submit" disabled={isLoading}>
                  {isLoading ? "Signing in..." : "Login"}
                </button>
              </form>

              {status && !error && <div className="login-canvas__message login-canvas__message--success">{status}</div>}
              {error && <div className="login-canvas__message login-canvas__message--error">{error}</div>}

              <div className="login-canvas__powered">
                Powered by{" "}
                <a href="http://www.geenet.co.zw" target="_blank" rel="noreferrer">
                  GeeNet
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="login-canvas__footer">
        <a href="#contact">Contact Us</a>
        <a href="#privacy">Privacy Policy</a>
        <a href="#terms">Terms &amp; Conditions</a>
        <a href="#faq">FAQs</a>
        <span className="login-canvas__footer-divider" />
        <a href="#facebook" aria-label="Facebook">f</a>
        <a href="#twitter" aria-label="X">x</a>
        <a href="#linkedin" aria-label="LinkedIn">in</a>
        <a href="#instagram" aria-label="Instagram">ig</a>
        <a href="#whatsapp" aria-label="WhatsApp">wa</a>
      </div>
    </div>
  );
}
