import { useState } from "react";
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Leaf,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
  UserRound,
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

const benefits = [
  "Personalized food analysis",
  "Ingredient and nutrition insights",
  "Dietary preference support",
  "AI-powered explanations",
];

function Register() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [showPassword, setShowPassword] =
    useState(false);

  const [showConfirmPassword, setShowConfirmPassword] =
    useState(false);

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

    if (!form.name.trim()) {
      setError("Please enter your name.");
      return;
    }

    if (!form.email.trim()) {
      setError("Please enter your email address.");
      return;
    }

    if (form.password.length < 6) {
      setError(
        "Password must be at least 6 characters long."
      );
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);

      const response = await api.post(
        "/auth/register",
        {
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password,
        }
      );

      const data = response.data;

      /*
       * Registration may return a JWT directly.
       * If it does, keep the user signed in.
       */
      const token =
        data?.token ||
        data?.data?.token ||
        data?.accessToken ||
        data?.data?.accessToken;

      const user =
        data?.user ||
        data?.data?.user ||
        null;

      if (token) {
        localStorage.setItem("token", token);
      }

      if (user) {
        localStorage.setItem(
          "user",
          JSON.stringify(user)
        );
      }

      /*
       * If backend automatically logs the user in,
       * go directly to dashboard.
       *
       * Otherwise redirect to login.
       */
      if (token) {
        navigate("/dashboard");
      } else {
        navigate("/login", {
          state: {
            registered: true,
          },
        });
      }
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error?.message ||
        err?.message ||
        "Unable to create your account. Please try again.";

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
          HEADER
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
        <div className="grid w-full items-center gap-12 lg:grid-cols-[0.9fr_1fr] lg:gap-20">
          {/* =================================================
              REGISTER FORM
          ================================================= */}

          <section className="mx-auto w-full max-w-[500px] lg:mr-auto">
            <div className="auth-card relative overflow-hidden rounded-[28px] border border-emerald-400/15 bg-[#061a18]/90 p-6 shadow-[0_30px_100px_rgba(0,0,0,0.45)] backdrop-blur-2xl sm:p-8">
              <div className="pointer-events-none absolute -left-24 -top-24 h-56 w-56 rounded-full bg-emerald-400/[0.08] blur-[70px]" />

              <div className="relative">
                {/* mobile logo */}
                <div className="mb-8 flex items-center justify-center lg:hidden">
                  <Logo />
                </div>

                <div className="mb-7">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-400 ring-1 ring-emerald-400/10">
                    <Sparkles size={20} />
                  </div>

                  <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                    Create your account
                  </h1>

                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Start turning complicated food labels
                    into clear, personalized insights.
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
                  className="space-y-4"
                >
                  {/* name */}
                  <div>
                    <label
                      htmlFor="register-name"
                      className="mb-2 block text-[11px] font-semibold text-slate-400"
                    >
                      Full name
                    </label>

                    <div className="relative">
                      <UserRound
                        size={17}
                        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-600"
                      />

                      <input
                        id="register-name"
                        name="name"
                        type="text"
                        autoComplete="name"
                        value={form.name}
                        onChange={handleChange}
                        placeholder="Your name"
                        className="h-12 w-full rounded-xl border border-white/[0.08] bg-black/20 pl-11 pr-4 text-sm text-white outline-none placeholder:text-slate-700 transition focus:border-emerald-400/50 focus:bg-emerald-400/[0.025] focus:ring-4 focus:ring-emerald-400/[0.05]"
                      />
                    </div>
                  </div>

                  {/* email */}
                  <div>
                    <label
                      htmlFor="register-email"
                      className="mb-2 block text-[11px] font-semibold text-slate-400"
                    >
                      Email address
                    </label>

                    <div className="relative">
                      <Mail
                        size={17}
                        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-600"
                      />

                      <input
                        id="register-email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        value={form.email}
                        onChange={handleChange}
                        placeholder="you@example.com"
                        className="h-12 w-full rounded-xl border border-white/[0.08] bg-black/20 pl-11 pr-4 text-sm text-white outline-none placeholder:text-slate-700 transition focus:border-emerald-400/50 focus:bg-emerald-400/[0.025] focus:ring-4 focus:ring-emerald-400/[0.05]"
                      />
                    </div>
                  </div>

                  {/* password */}
                  <div>
                    <label
                      htmlFor="register-password"
                      className="mb-2 block text-[11px] font-semibold text-slate-400"
                    >
                      Password
                    </label>

                    <div className="relative">
                      <LockKeyhole
                        size={17}
                        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-600"
                      />

                      <input
                        id="register-password"
                        name="password"
                        type={
                          showPassword
                            ? "text"
                            : "password"
                        }
                        autoComplete="new-password"
                        value={form.password}
                        onChange={handleChange}
                        placeholder="At least 6 characters"
                        className="h-12 w-full rounded-xl border border-white/[0.08] bg-black/20 pl-11 pr-12 text-sm text-white outline-none placeholder:text-slate-700 transition focus:border-emerald-400/50 focus:bg-emerald-400/[0.025] focus:ring-4 focus:ring-emerald-400/[0.05]"
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

                  {/* confirm password */}
                  <div>
                    <label
                      htmlFor="register-confirm-password"
                      className="mb-2 block text-[11px] font-semibold text-slate-400"
                    >
                      Confirm password
                    </label>

                    <div className="relative">
                      <LockKeyhole
                        size={17}
                        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-600"
                      />

                      <input
                        id="register-confirm-password"
                        name="confirmPassword"
                        type={
                          showConfirmPassword
                            ? "text"
                            : "password"
                        }
                        autoComplete="new-password"
                        value={form.confirmPassword}
                        onChange={handleChange}
                        placeholder="Repeat your password"
                        className="h-12 w-full rounded-xl border border-white/[0.08] bg-black/20 pl-11 pr-12 text-sm text-white outline-none placeholder:text-slate-700 transition focus:border-emerald-400/50 focus:bg-emerald-400/[0.025] focus:ring-4 focus:ring-emerald-400/[0.05]"
                      />

                      <button
                        type="button"
                        aria-label={
                          showConfirmPassword
                            ? "Hide password"
                            : "Show password"
                        }
                        onClick={() =>
                          setShowConfirmPassword(
                            (current) => !current
                          )
                        }
                        className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-600 transition hover:bg-white/[0.04] hover:text-slate-300"
                      >
                        {showConfirmPassword ? (
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
                    className="shine group mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 text-sm font-bold text-slate-950 shadow-[0_12px_35px_rgba(16,185,129,0.18)] transition hover:-translate-y-0.5 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                  >
                    {loading ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950/30 border-t-slate-950" />
                        Creating account...
                      </>
                    ) : (
                      <>
                        Create account

                        <ArrowRight
                          size={16}
                          className="transition group-hover:translate-x-1"
                        />
                      </>
                    )}
                  </button>
                </form>

                {/* existing account */}
                <div className="my-7 flex items-center gap-3">
                  <div className="h-px flex-1 bg-white/[0.06]" />

                  <span className="text-[9px] font-medium uppercase tracking-[0.16em] text-slate-700">
                    Already a member?
                  </span>

                  <div className="h-px flex-1 bg-white/[0.06]" />
                </div>

                <Link
                  to="/login"
                  className="flex h-11 w-full items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/[0.025] text-xs font-semibold text-slate-300 transition hover:border-emerald-400/40 hover:bg-emerald-400/[0.06] hover:text-white"
                >
                  Sign in to LabelIQ
                </Link>

                <p className="mt-6 text-center text-[9px] leading-5 text-slate-700">
                  Your account helps LabelIQ personalize
                  analysis around your preferences.
                </p>
              </div>
            </div>
          </section>

          {/* =================================================
              RIGHT CONTENT
          ================================================= */}

          <section className="hidden lg:block">
            <div className="max-w-xl">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-4 py-2 text-[10px] font-semibold tracking-wide text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.8)]" />

                YOUR FOOD. YOUR PREFERENCES.
              </div>

              <h2 className="text-5xl font-bold leading-[1.02] tracking-[-0.045em] xl:text-6xl">
                Make every label
                <br />
                <span className="gradient-text">
                  easier to understand.
                </span>
              </h2>

              <p className="mt-6 max-w-lg text-base leading-7 text-slate-400">
                Create your LabelIQ profile and
                personalize how products are analyzed
                based on your dietary preferences,
                nutrition goals, allergens, and ingredients
                you want to avoid.
              </p>

              <div className="mt-9 rounded-2xl border border-emerald-400/10 bg-emerald-400/[0.025] p-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400">
                  Your LabelIQ profile
                </p>

                <div className="mt-4 space-y-3">
                  {benefits.map((benefit) => (
                    <div
                      key={benefit}
                      className="flex items-center gap-3"
                    >
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-400">
                        <Check size={13} />
                      </div>

                      <span className="text-xs text-slate-400">
                        {benefit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-8 flex items-center gap-3 text-[10px] text-slate-600">
                <div className="h-px w-12 bg-emerald-400/20" />
                <span>
                  Scan. Understand. Decide.
                </span>
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

        @media (max-width: 1023px) {
          .auth-page {
            background:
              radial-gradient(
                circle at 50% 0%,
                rgba(16,185,129,.09),
                transparent 35%
              ),
              #02110f;
          }
        }

        @media (max-width: 640px) {
          .auth-card {
            border-radius:
              24px;
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

export default Register;