import { useState } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Leaf,
  LockKeyhole,
  Mail,
  ScanLine,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/axios";

function Logo() {
  return (
    <Link
      to="/"
      className="group flex items-center gap-3"
      aria-label="LabelIQ home"
    >
      <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-300 to-emerald-600 text-white shadow-[0_0_28px_rgba(16,185,129,0.3)] transition duration-300 group-hover:scale-105 group-hover:rotate-6">
        <Leaf size={21} strokeWidth={2.2} />
      </div>

      <div>
        <div className="text-lg font-bold tracking-tight text-white">
          Label
          <span className="text-emerald-400">IQ</span>
        </div>

        <div className="text-[8px] font-semibold tracking-[0.2em] text-slate-500">
          FOOD INTELLIGENCE
        </div>
      </div>
    </Link>
  );
}

const highlights = [
  {
    icon: ScanLine,
    title: "Scan food labels",
    description: "Extract nutrition and ingredient information.",
  },
  {
    icon: ShieldCheck,
    title: "Personalized analysis",
    description: "Evaluate food against your preferences.",
  },
  {
    icon: Sparkles,
    title: "AI-powered insights",
    description: "Understand complex ingredients clearly.",
  },
];

function Login() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));

    if (error) {
      setError("");
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");

    if (!form.email.trim()) {
      setError("Please enter your email address.");
      return;
    }

    if (!form.password) {
      setError("Please enter your password.");
      return;
    }

    try {
      setLoading(true);

      const response = await api.post("/auth/login", {
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });

      /*
       * Existing LabelIQ authentication uses JWT.
       * The backend returns the token and safe user information.
       */
      const data = response.data;

      const token =
        data?.token ||
        data?.data?.token ||
        data?.accessToken ||
        data?.data?.accessToken;

      if (!token) {
        throw new Error(
          "Login succeeded but no authentication token was returned."
        );
      }

      localStorage.setItem("token", token);

      /*
       * Keep the user object available for existing frontend
       * authentication/profile flows when the backend provides it.
       */
      const user =
        data?.user ||
        data?.data?.user ||
        null;

      if (user) {
        localStorage.setItem(
          "user",
          JSON.stringify(user)
        );
      }

      navigate("/dashboard");
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error?.message ||
        err?.message ||
        "Unable to sign in. Please check your credentials.";

      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page relative min-h-screen overflow-hidden bg-[#02110f] text-white">
      {/* =====================================================
          BACKGROUND
      ===================================================== */}

      <div className="pointer-events-none absolute inset-0">
        <div className="auth-grid absolute inset-0 opacity-[0.045]" />

        <div className="auth-glow auth-glow-one absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-emerald-500/[0.12] blur-[130px]" />

        <div className="auth-glow auth-glow-two absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full bg-cyan-400/[0.07] blur-[130px]" />

        <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-400/[0.035]" />

        <div className="absolute left-1/2 top-1/2 h-[430px] w-[430px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-400/[0.04]" />
      </div>

      {/* =====================================================
          TOP BAR
      ===================================================== */}

      <header className="relative z-20 flex items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
        <Logo />

        <Link
          to="/"
          className="text-xs font-medium text-slate-500 transition hover:text-white"
        >
          Back to home
        </Link>
      </header>

      {/* =====================================================
          MAIN
      ===================================================== */}

      <main className="relative z-10 mx-auto flex min-h-[calc(100vh-88px)] max-w-7xl items-center px-5 pb-12 pt-4 sm:px-8 lg:px-10">
        <div className="grid w-full items-center gap-12 lg:grid-cols-[1fr_0.9fr] lg:gap-20">
          {/* =================================================
              LEFT CONTENT
          ================================================= */}

          <section className="hidden lg:block">
            <div className="max-w-xl">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-4 py-2 text-[10px] font-semibold tracking-wide text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.8)]" />

                FOOD INTELLIGENCE, PERSONALIZED
              </div>

              <h1 className="text-5xl font-bold leading-[1.02] tracking-[-0.045em] xl:text-6xl">
                Welcome back to{" "}
                <span className="gradient-text">
                  LabelIQ.
                </span>
              </h1>

              <p className="mt-6 max-w-lg text-base leading-7 text-slate-400">
                Continue understanding your food with
                personalized nutrition analysis,
                ingredient intelligence, and AI-powered
                insights.
              </p>

              <div className="mt-10 space-y-3">
                {highlights.map(
                  ({
                    icon: Icon,
                    title,
                    description,
                  }) => (
                    <div
                      key={title}
                      className="group flex items-center gap-4 rounded-2xl border border-white/[0.05] bg-white/[0.015] p-4 transition duration-300 hover:border-emerald-400/20 hover:bg-emerald-400/[0.025]"
                    >
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-400 ring-1 ring-emerald-400/10 transition group-hover:scale-105">
                        <Icon size={19} />
                      </div>

                      <div>
                        <p className="text-xs font-bold text-white">
                          {title}
                        </p>

                        <p className="mt-1 text-[10px] leading-5 text-slate-500">
                          {description}
                        </p>
                      </div>
                    </div>
                  )
                )}
              </div>

              <div className="mt-10 flex items-center gap-3 text-[10px] text-slate-600">
                <div className="h-px w-12 bg-emerald-400/20" />
                <span>
                  Scan. Understand. Decide.
                </span>
              </div>
            </div>
          </section>

          {/* =================================================
              LOGIN CARD
          ================================================= */}

          <section className="mx-auto w-full max-w-[460px] lg:ml-auto">
            <div className="auth-card relative overflow-hidden rounded-[28px] border border-emerald-400/15 bg-[#061a18]/90 p-6 shadow-[0_30px_100px_rgba(0,0,0,0.45)] backdrop-blur-2xl sm:p-8">
              {/* card glow */}
              <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-emerald-400/[0.08] blur-[70px]" />

              <div className="relative">
                {/* mobile logo */}
                <div className="mb-8 flex items-center justify-center lg:hidden">
                  <Logo />
                </div>

                <div className="mb-8">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-400 ring-1 ring-emerald-400/10">
                    <LockKeyhole size={20} />
                  </div>

                  <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                    Welcome back
                  </h2>

                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Sign in to continue to your LabelIQ
                    account.
                  </p>
                </div>

                {/* error */}
                {error && (
                  <div
                    role="alert"
                    className="mb-5 rounded-xl border border-red-400/20 bg-red-400/[0.06] px-4 py-3 text-xs leading-5 text-red-300"
                  >
                    {error}
                  </div>
                )}

                <form
                  onSubmit={handleSubmit}
                  className="space-y-5"
                >
                  {/* email */}
                  <div>
                    <label
                      htmlFor="login-email"
                      className="mb-2 block text-[11px] font-semibold text-slate-400"
                    >
                      Email address
                    </label>

                    <div className="input-wrap relative">
                      <Mail
                        size={17}
                        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-600"
                      />

                      <input
                        id="login-email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        value={form.email}
                        onChange={handleChange}
                        placeholder="you@example.com"
                        className="auth-input h-12 w-full rounded-xl border border-white/[0.08] bg-black/20 pl-11 pr-4 text-sm text-white outline-none placeholder:text-slate-700 transition focus:border-emerald-400/50 focus:bg-emerald-400/[0.025] focus:ring-4 focus:ring-emerald-400/[0.05]"
                      />
                    </div>
                  </div>

                  {/* password */}
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <label
                        htmlFor="login-password"
                        className="block text-[11px] font-semibold text-slate-400"
                      >
                        Password
                      </label>

                      <button
                        type="button"
                        className="text-[10px] font-medium text-slate-600 transition hover:text-emerald-400"
                        onClick={() => {
                          /*
                           * Password recovery is not part of the
                           * current authentication flow.
                           */
                        }}
                      >
                        Forgot password?
                      </button>
                    </div>

                    <div className="input-wrap relative">
                      <LockKeyhole
                        size={17}
                        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-600"
                      />

                      <input
                        id="login-password"
                        name="password"
                        type={
                          showPassword
                            ? "text"
                            : "password"
                        }
                        autoComplete="current-password"
                        value={form.password}
                        onChange={handleChange}
                        placeholder="Enter your password"
                        className="auth-input h-12 w-full rounded-xl border border-white/[0.08] bg-black/20 pl-11 pr-12 text-sm text-white outline-none placeholder:text-slate-700 transition focus:border-emerald-400/50 focus:bg-emerald-400/[0.025] focus:ring-4 focus:ring-emerald-400/[0.05]"
                      />

                      <button
                        type="button"
                        aria-label={
                          showPassword
                            ? "Hide password"
                            : "Show password"
                        }
                        onClick={() =>
                          setShowPassword(
                            (current) => !current
                          )
                        }
                        className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-600 transition hover:bg-white/[0.04] hover:text-slate-300"
                      >
                        {showPassword ? (
                          <EyeOff size={16} />
                        ) : (
                          <Eye size={16} />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* submit */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="shine group flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 text-sm font-bold text-slate-950 shadow-[0_12px_35px_rgba(16,185,129,0.18)] transition hover:-translate-y-0.5 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                  >
                    {loading ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950/30 border-t-slate-950" />
                        Signing in...
                      </>
                    ) : (
                      <>
                        Sign in
                        <ArrowRight
                          size={16}
                          className="transition group-hover:translate-x-1"
                        />
                      </>
                    )}
                  </button>
                </form>

                {/* divider */}
                <div className="my-7 flex items-center gap-3">
                  <div className="h-px flex-1 bg-white/[0.06]" />

                  <span className="text-[9px] font-medium uppercase tracking-[0.16em] text-slate-700">
                    New here?
                  </span>

                  <div className="h-px flex-1 bg-white/[0.06]" />
                </div>

                <Link
                  to="/register"
                  className="flex h-11 w-full items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/[0.025] text-xs font-semibold text-slate-300 transition hover:border-emerald-400/40 hover:bg-emerald-400/[0.06] hover:text-white"
                >
                  Create your LabelIQ account
                </Link>

                <p className="mt-6 text-center text-[9px] leading-5 text-slate-700">
                  By continuing, you agree to use
                  LabelIQ responsibly for informational
                  purposes.
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>

      <style>{`
        html {
          scroll-behavior: smooth;
        }

        .auth-grid {
          background-image:
            linear-gradient(
              rgba(52,211,153,.8) 1px,
              transparent 1px
            ),
            linear-gradient(
              90deg,
              rgba(52,211,153,.8) 1px,
              transparent 1px
            );

          background-size: 55px 55px;

          animation:
            authGrid 24s linear infinite;
        }

        .gradient-text {
          background:
            linear-gradient(
              90deg,
              #34d399,
              #22d3ee,
              #34d399
            );

          background-size: 200% auto;

          -webkit-background-clip: text;
          background-clip: text;

          -webkit-text-fill-color: transparent;
          color: transparent;

          animation:
            authShimmer 5s linear infinite;
        }

        .auth-glow {
          animation:
            authGlow 8s ease-in-out infinite;
        }

        .auth-glow-two {
          animation-delay:
            -3s;
        }

        .auth-card {
          animation:
            authCardIn .7s
            cubic-bezier(.22,1,.36,1)
            both;
        }

        .shine {
          position: relative;
          overflow: hidden;
        }

        .shine::before {
          content: "";
          position: absolute;
          top: 0;
          left: -80%;
          width: 50%;
          height: 100%;

          background:
            linear-gradient(
              120deg,
              transparent,
              rgba(255,255,255,.55),
              transparent
            );

          transform:
            skewX(-20deg);

          animation:
            shineSweep 3.6s
            ease-in-out infinite;
        }

        @keyframes authGrid {
          to {
            background-position:
              55px 55px;
          }
        }

        @keyframes authShimmer {
          to {
            background-position:
              200% center;
          }
        }

        @keyframes authGlow {
          0%,
          100% {
            opacity: .6;
            transform:
              scale(1);
          }

          50% {
            opacity: 1;
            transform:
              scale(1.08);
          }
        }

        @keyframes authCardIn {
          from {
            opacity: 0;
            transform:
              translateY(20px)
              scale(.98);
          }

          to {
            opacity: 1;
            transform:
              none;
          }
        }

        @keyframes shineSweep {
          0%,
          60% {
            left: -80%;
          }

          100% {
            left: 140%;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          *,
          *::before,
          *::after {
            animation-duration:
              .01ms !important;

            animation-iteration-count:
              1 !important;

            transition-duration:
              .01ms !important;
          }
        }
      `}</style>
    </div>
  );
}

export default Login;