import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronRight,
  CircleCheck,
  FileSearch,
  Leaf,
  Menu,
  Play,
  ScanLine,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import { Link } from "react-router-dom";

/* =========================================================
   DATA
========================================================= */

const features = [
  {
    icon: ScanLine,
    title: "Instant Label Scanning",
    description:
      "Upload a food label and automatically extract nutrition facts, ingredients, and important product information.",
  },
  {
    icon: ShieldCheck,
    title: "Personalized Safety Analysis",
    description:
      "Evaluate products against your dietary preferences, health limits, allergies, and ingredient blocklist.",
  },
  {
    icon: Sparkles,
    title: "AI-Powered Insights",
    description:
      "Understand confusing ingredients with simple explanations backed by ingredient knowledge.",
  },
  {
    icon: BarChart3,
    title: "Track & Improve",
    description:
      "Review your scans, nutrition patterns, health scores, and food choices over time.",
  },
];

const steps = [
  {
    number: "01",
    icon: ScanLine,
    title: "Scan the label",
    description:
      "Upload a clear photo of the nutrition or ingredient label.",
  },
  {
    number: "02",
    icon: Sparkles,
    title: "Let LabelIQ analyze",
    description:
      "LabelIQ extracts, analyzes, and evaluates the information based on your preferences.",
  },
  {
    number: "03",
    icon: FileSearch,
    title: "Understand your food",
    description:
      "Get a health score, key warnings, nutrition breakdown, and personalized insights.",
  },
];

const benefits = [
  {
    icon: ShieldCheck,
    title: "Healthier Choices",
    description: "Understand what you're eating.",
    className: "text-emerald-400 bg-emerald-400/10",
  },
  {
    icon: Zap,
    title: "Save Time",
    description: "Get clear insights quickly.",
    className: "text-violet-400 bg-violet-400/10",
  },
  {
    icon: UserRound,
    title: "Personalized for You",
    description: "Analysis based on your preferences.",
    className: "text-cyan-400 bg-cyan-400/10",
  },
  {
    icon: BarChart3,
    title: "Build Better Habits",
    description: "Track your food choices over time.",
    className: "text-orange-400 bg-orange-400/10",
  },
];

/*
  Keep these as product-level facts only.
  Avoid making unsupported marketing claims.
*/
const stats = [
  {
    to: 9,
    label: "nutrition fields tracked",
  },
  {
    to: 5,
    label: "analysis layers working together",
  },
  {
    to: 4,
    label: "core dietary modes",
  },
];

const marquee = [
  "Nutrition facts",
  "Ingredients",
  "Allergens",
  "Hidden sugar",
  "Sodium",
  "Calories",
  "Dietary modes",
  "Blocklist",
  "AI insights",
  "Health score",
];

const mobileLinks = [
  ["Features", "#features"],
  ["How it works", "#how-it-works"],
  ["Why LabelIQ", "#why-labeliq"],
  ["About", "#about"],
];

/* =========================================================
   REVEAL ANIMATION
========================================================= */

function Reveal({ children, delay = 0, className = "" }) {
  const ref = useRef(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    const element = ref.current;

    if (!element) return;

    if (!("IntersectionObserver" in window)) {
      setOn(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setOn(true);
          observer.disconnect();
        }
      },
      {
        threshold: 0.15,
      }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{
        transitionDelay: `${delay}ms`,
      }}
      className={`reveal ${on ? "in" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

/* =========================================================
   COUNT UP
========================================================= */

function CountUp({ to, duration = 1400, suffix = "" }) {
  const ref = useRef(null);
  const [value, setValue] = useState(0);

  useEffect(() => {
    const element = ref.current;

    if (!element) return;

    if (!("IntersectionObserver" in window)) {
      setValue(to);
      return;
    }

    let raf = null;
    let start = null;

    const step = (timestamp) => {
      start ??= timestamp;

      const progress = Math.min(
        (timestamp - start) / duration,
        1
      );

      const eased =
        1 - Math.pow(1 - progress, 3);

      setValue(Math.round(to * eased));

      if (progress < 1) {
        raf = requestAnimationFrame(step);
      }
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          raf = requestAnimationFrame(step);
          observer.disconnect();
        }
      },
      {
        threshold: 0.4,
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();

      if (raf) {
        cancelAnimationFrame(raf);
      }
    };
  }, [to, duration]);

  return (
    <span ref={ref}>
      {value}
      {suffix}
    </span>
  );
}

/* =========================================================
   LOGO
========================================================= */

function Logo() {
  return (
    <Link
      to="/"
      aria-label="LabelIQ home"
      className="group flex items-center gap-3"
    >
      <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-300 to-emerald-600 text-white shadow-[0_0_28px_rgba(16,185,129,0.3)] transition duration-300 group-hover:scale-105 group-hover:rotate-6">
        <Leaf
          size={21}
          strokeWidth={2.2}
        />
      </div>

      <div>
        <div className="text-lg font-bold tracking-tight text-white">
          Label
          <span className="text-emerald-400">
            IQ
          </span>
        </div>

        <div className="text-[8px] font-semibold tracking-[0.2em] text-slate-500">
          FOOD INTELLIGENCE
        </div>
      </div>
    </Link>
  );
}

/* =========================================================
   PHONE DATA
========================================================= */

const DETECTED = [
  "Sugars 13.9 g",
  "Fat 5.0 g",
  "Salt 0.06 g",
  "Palm Oil",
];

const CHECKS = [
  "Extracting text",
  "Reading nutrition table",
  "Matching ingredients",
  "Applying your rules",
];

/* =========================================================
   PHONE SCREEN
========================================================= */

function PhoneScreen({ phase }) {
  return (
    <div className="h-full overflow-hidden rounded-[31px] bg-[#071917]">
      {/* phone header */}
      <div className="flex items-center justify-between px-5 pb-3 pt-8">
        <span className="text-slate-400">
          ‹
        </span>

        <div className="flex items-center gap-1.5">
          <Leaf
            size={12}
            className="text-emerald-400"
          />

          <span className="text-[10px] font-bold text-white">
            LabelIQ
          </span>
        </div>

        <span className="text-[10px] text-slate-500">
          •••
        </span>
      </div>

      {/* scanned label */}
      <div className="relative mx-4 h-[170px] overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-100 to-slate-300">
        <div className="p-3">
          <div className="mb-2 h-2 w-24 rounded bg-slate-500/60" />

          {[80, 60, 72, 50, 66, 44].map(
            (width, index) => (
              <div
                key={index}
                className="mb-1.5 flex items-center justify-between"
              >
                <div
                  className="h-1.5 rounded bg-slate-500/40"
                  style={{
                    width: `${width}%`,
                  }}
                />

                <div className="h-1.5 w-8 rounded bg-slate-600/50" />
              </div>
            )
          )}
        </div>

        {/* scanning beam */}
        <div
          className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${
            phase === 0
              ? "opacity-100"
              : "opacity-40"
          }`}
        >
          <div className="beam absolute left-0 right-0 top-0 h-14 bg-gradient-to-b from-transparent via-emerald-400/40 to-transparent" />

          <div className="beam-line absolute left-0 right-0 top-0 h-[2px] bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,1)]" />
        </div>

        {/* scanner corners */}
        {[
          "left-3 top-3 border-l-2 border-t-2",
          "right-3 top-3 border-r-2 border-t-2",
          "bottom-3 left-3 border-b-2 border-l-2",
          "bottom-3 right-3 border-b-2 border-r-2",
        ].map((classes) => (
          <div
            key={classes}
            className={`corner absolute h-6 w-6 border-emerald-500 ${classes}`}
          />
        ))}

        {/* detected information */}
        {phase === 0 &&
          DETECTED.map((item, index) => (
            <span
              key={item}
              className="chip absolute rounded-full bg-emerald-500 px-2 py-0.5 text-[8px] font-bold text-slate-950 shadow-lg"
              style={{
                left: `${8 + (index % 2) * 42}%`,
                top: `${22 + index * 17}%`,
                animationDelay: `${
                  0.5 + index * 0.55
                }s`,
              }}
            >
              {item}
            </span>
          ))}
      </div>

      {/* fixed phase area */}
      <div className="mx-4 mt-3 h-[168px]">
        {/* phase 1 */}
        {phase === 0 && (
          <div className="pop rounded-xl border border-emerald-400/15 bg-emerald-400/[0.06] p-3">
            <div className="flex justify-between text-[9px]">
              <span className="text-slate-400">
                Scanning label...
              </span>

              <span className="font-bold text-emerald-400">
                Detecting
              </span>
            </div>

            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div className="progress-bar h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400" />
            </div>
          </div>
        )}

        {/* phase 2 */}
        {phase === 1 && (
          <div className="pop rounded-xl border border-white/[0.06] bg-slate-950/60 p-3">
            {CHECKS.map((check, index) => (
              <div
                key={check}
                className="tick flex items-center justify-between border-b border-white/[0.05] py-1.5 last:border-0"
                style={{
                  animationDelay: `${index * 0.55}s`,
                }}
              >
                <span className="text-[9px] text-slate-400">
                  {check}
                </span>

                <Check
                  size={11}
                  className="text-emerald-400"
                />
              </div>
            ))}
          </div>
        )}

        {/* phase 3 */}
        {phase === 2 && (
          <div className="pop rounded-xl border border-white/[0.06] bg-slate-950/60 p-3">
            <div className="flex items-center gap-3">
              <div className="relative h-16 w-16">
                <svg
                  viewBox="0 0 64 64"
                  className="h-16 w-16 -rotate-90"
                >
                  <circle
                    cx="32"
                    cy="32"
                    r="26"
                    fill="none"
                    stroke="rgba(52,211,153,0.15)"
                    strokeWidth="6"
                  />

                  <circle
                    className="ring"
                    cx="32"
                    cy="32"
                    r="26"
                    fill="none"
                    stroke="#34d399"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray="163.4"
                    style={{
                      "--off": 45.8,
                    }}
                  />
                </svg>

                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-lg font-bold text-white">
                    <CountUp
                      to={72}
                      duration={1100}
                    />
                  </span>

                  <span className="text-[6px] font-semibold text-emerald-400">
                    GOOD
                  </span>
                </div>
              </div>

              <div>
                <p className="text-[9px] text-slate-500">
                  Health Score
                </p>

                <p className="mt-1 text-xs font-bold text-white">
                  Good choice
                </p>
              </div>
            </div>

            <div className="mt-2.5 grid grid-cols-4 gap-1">
              {[
                ["140", "kcal"],
                ["13.9g", "sugar"],
                ["5.0g", "fat"],
                ["24mg", "sodium"],
              ].map(([value, label]) => (
                <div
                  key={label}
                  className="rounded-lg border border-white/[0.06] bg-black/20 py-1.5 text-center"
                >
                  <p className="text-[9px] font-bold text-white">
                    {value}
                  </p>

                  <p className="text-[7px] text-slate-600">
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mx-4 mt-2 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-emerald-500 py-2.5 text-[9px] font-bold text-slate-950">
        View full analysis

        <ArrowRight size={10} />
      </div>
    </div>
  );
}

/* =========================================================
   FLOATING PHONE CARD
========================================================= */

function FloatCard({
  className,
  icon: Icon,
  title,
  sub,
  delay = "0s",
  children,
}) {
  return (
    <div
      className={`floating-card absolute z-30 hidden rounded-2xl border border-emerald-400/20 bg-[#071b19]/95 p-3 shadow-2xl backdrop-blur-xl sm:block ${className}`}
      style={{
        animationDelay: delay,
      }}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-400">
          <Icon size={16} />
        </div>

        <div>
          <p className="text-[10px] font-bold text-white">
            {title}
          </p>

          <p className="mt-0.5 text-[8px] text-slate-500">
            {sub}
          </p>
        </div>

        {children}
      </div>
    </div>
  );
}

/* =========================================================
   PHONE PREVIEW
========================================================= */

function PhonePreview() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setPhase((current) => (current + 1) % 3);
    }, 3600);

    return () => clearInterval(id);
  }, []);

  return (
    <div className="phone-stage relative mx-auto h-[600px] w-full max-w-[560px]">
      {/* glow */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-[360px] w-[360px] rounded-full bg-emerald-500/20 blur-[110px]" />
      </div>

      {/* primary ring */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="orbit h-[440px] w-[440px] rounded-full border border-emerald-400/15" />
      </div>

      {/* outer ring */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="orbit-2 h-[540px] w-[540px] rounded-full border border-dashed border-emerald-400/10" />
      </div>

      {/* decorative leaves */}
      <div className="float-slow absolute left-[4%] top-[6%] text-emerald-500/30">
        <Leaf
          size={58}
          strokeWidth={1}
        />
      </div>

      <div className="float absolute bottom-[6%] right-[3%] text-emerald-500/25">
        <Leaf
          size={70}
          strokeWidth={1}
        />
      </div>

      {/* phone */}
      <div className="absolute inset-0 z-20 flex items-center justify-center">
        <div className="phone-float relative h-[500px] w-[250px] rounded-[40px] border-[7px] border-slate-700 bg-black p-2 shadow-[0_35px_90px_rgba(0,0,0,0.7),0_0_60px_rgba(16,185,129,0.15)]">
          {/* dynamic island */}
          <div className="absolute left-1/2 top-2 z-30 h-6 w-24 -translate-x-1/2 rounded-full bg-black" />

          <PhoneScreen phase={phase} />
        </div>
      </div>

      {/* floating cards */}
      <FloatCard
        className="left-[0%] top-[20%]"
        icon={Leaf}
        title="Ingredients"
        sub="19 detected"
      />

      <FloatCard
        className="right-[0%] top-[32%]"
        icon={BarChart3}
        title="Nutrition Facts"
        sub="Personalized insights"
        delay="-1.2s"
      />

      <FloatCard
        className="bottom-[18%] left-[2%]"
        icon={ScanLine}
        title="Scanning label..."
        sub="OCR + table detection"
        delay="-2.2s"
      />

      <FloatCard
        className="bottom-[5%] right-[8%]"
        icon={Sparkles}
        title="AI Insight"
        sub="Suitable for your preferences"
        delay="-3s"
      >
        <CircleCheck
          size={16}
          className="text-emerald-400"
        />
      </FloatCard>
    </div>
  );
}

/* =========================================================
   LANDING PAGE
========================================================= */

function Landing() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);

  const heroRef = useRef(null);

  /* ---------------- scroll state ---------------- */

  useEffect(() => {
    const onScroll = () => {
      const scrollY = window.scrollY;

      setScrolled(scrollY > 12);

      const documentHeight =
        document.documentElement.scrollHeight -
        window.innerHeight;

      const progress =
        documentHeight > 0
          ? (scrollY / documentHeight) * 100
          : 0;

      setScrollProgress(progress);
    };

    onScroll();

    window.addEventListener(
      "scroll",
      onScroll,
      {
        passive: true,
      }
    );

    return () =>
      window.removeEventListener(
        "scroll",
        onScroll
      );
  }, []);

  /* ---------------- close mobile menu ---------------- */

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setMobileMenu(false);
      }
    };

    window.addEventListener(
      "resize",
      handleResize
    );

    return () =>
      window.removeEventListener(
        "resize",
        handleResize
      );
  }, []);

  /* ---------------- hero mouse glow ---------------- */

  const onMove = (event) => {
    const element = heroRef.current;

    if (!element) return;

    const rect =
      element.getBoundingClientRect();

    element.style.setProperty(
      "--mx",
      `${event.clientX - rect.left}px`
    );

    element.style.setProperty(
      "--my",
      `${event.clientY - rect.top}px`
    );
  };

  /* ---------------- nav helper ---------------- */

  const closeMobileMenu = () => {
    setMobileMenu(false);
  };

  return (
    <div className="landing-page min-h-screen overflow-x-hidden bg-[#02110f] text-white">
      {/* =====================================================
          SCROLL PROGRESS
      ===================================================== */}

      <div
        className="fixed left-0 right-0 top-0 z-[200] h-[2px] origin-left bg-gradient-to-r from-emerald-400 via-cyan-400 to-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.7)]"
        style={{
          transform: `scaleX(${scrollProgress / 100})`,
        }}
      />

      {/* =====================================================
          NAVBAR
      ===================================================== */}

      <header
        className={`fixed inset-x-0 top-0 z-[100] border-b transition duration-300 ${
          scrolled
            ? "border-white/[0.08] bg-[#02110f]/90 shadow-[0_10px_40px_rgba(0,0,0,0.4)]"
            : "border-transparent bg-[#02110f]/40"
        } backdrop-blur-2xl`}
      >
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-5 lg:px-8">
          <Logo />

          {/* desktop nav */}
          <nav className="hidden items-center gap-9 text-xs font-medium text-slate-400 lg:flex">
            {mobileLinks.map(
              ([label, href]) => (
                <a
                  key={href}
                  href={href}
                  className="nav-link transition hover:text-white"
                >
                  {label}
                </a>
              )
            )}
          </nav>

          {/* desktop actions */}
          <div className="hidden items-center gap-2 sm:flex">
            <Link
              to="/login"
              className="rounded-xl border border-slate-700/70 px-4 py-2.5 text-xs font-semibold text-slate-200 transition hover:border-emerald-400/40 hover:bg-emerald-400/5 hover:text-white"
            >
              Sign in
            </Link>

            <Link
              to="/register"
              className="shine group flex items-center gap-2 rounded-xl bg-emerald-400 px-5 py-2.5 text-xs font-bold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:-translate-y-0.5 hover:bg-emerald-300"
            >
              Get started

              <ArrowRight
                size={13}
                className="transition group-hover:translate-x-1"
              />
            </Link>
          </div>

          {/* mobile actions */}
          <div className="flex items-center gap-2 sm:hidden">
            <Link
              to="/login"
              className="rounded-xl border border-slate-700/70 px-3.5 py-2.5 text-xs font-semibold text-slate-200"
            >
              Sign in
            </Link>

            <button
              type="button"
              aria-label={
                mobileMenu
                  ? "Close menu"
                  : "Open menu"
              }
              aria-expanded={mobileMenu}
              onClick={() =>
                setMobileMenu(
                  (current) => !current
                )
              }
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-slate-200 transition hover:border-emerald-400/30 hover:text-emerald-400"
            >
              {mobileMenu ? (
                <X size={19} />
              ) : (
                <Menu size={19} />
              )}
            </button>
          </div>
        </div>

        {/* mobile navigation */}
        <div
          className={`overflow-hidden border-t border-white/[0.05] bg-[#02110f]/95 backdrop-blur-2xl transition-all duration-300 lg:hidden ${
            mobileMenu
              ? "max-h-[400px] opacity-100"
              : "max-h-0 opacity-0"
          }`}
        >
          <nav className="mx-auto flex max-w-7xl flex-col px-5 py-4">
            {mobileLinks.map(
              ([label, href]) => (
                <a
                  key={href}
                  href={href}
                  onClick={closeMobileMenu}
                  className="rounded-xl px-4 py-3 text-sm font-medium text-slate-400 transition hover:bg-white/[0.03] hover:text-white"
                >
                  {label}
                </a>
              )
            )}

            <Link
              to="/register"
              onClick={closeMobileMenu}
              className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-bold text-slate-950"
            >
              Get started

              <ArrowRight size={15} />
            </Link>
          </nav>
        </div>
      </header>

      {/* =====================================================
          HERO
      ===================================================== */}

      <section
        ref={heroRef}
        onMouseMove={onMove}
        className="relative overflow-hidden pt-[72px]"
      >
        {/* mouse glow */}
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background:
              "radial-gradient(500px circle at var(--mx,60%) var(--my,30%), rgba(16,185,129,0.10), transparent 60%)",
          }}
        />

        {/* atmospheric glows */}
        <div className="hero-glow absolute left-[45%] top-[-80px] h-[650px] w-[650px] rounded-full bg-emerald-500/[0.09] blur-[140px]" />

        <div className="hero-glow-2 absolute right-[-180px] top-[100px] h-[500px] w-[500px] rounded-full bg-green-400/[0.06] blur-[130px]" />

        {/* grid */}
        <div className="grid-bg pointer-events-none absolute inset-0 opacity-[0.04]" />

        {/* bottom arc */}
        <div className="pointer-events-none absolute bottom-[-230px] left-[-10%] h-[350px] w-[120%] rounded-[50%] border border-emerald-400/20 shadow-[0_-10px_100px_rgba(16,185,129,0.06)]" />

        <div className="relative mx-auto grid max-w-7xl items-center px-5 py-12 sm:px-6 md:min-h-[700px] md:grid-cols-[0.96fr_1.04fr] lg:px-8">
          {/* hero copy */}
          <div className="relative z-20">
            <div className="fade-up mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] px-4 py-2 text-[10px] font-semibold tracking-wide text-emerald-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />

                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>

              AI-POWERED FOOD INTELLIGENCE
            </div>

            <h1 className="fade-up delay-100 max-w-[680px] text-[44px] font-bold leading-[0.98] tracking-[-0.045em] sm:text-6xl xl:text-[68px]">
              Know what's
              <br />
              <span className="gradient-text">
                really
              </span>{" "}
              in your food.
            </h1>

            <p className="fade-up delay-200 mt-6 max-w-[560px] text-base leading-7 text-slate-400 lg:text-lg">
              LabelIQ transforms complicated food
              labels into clear, personalized health
              intelligence — so you can understand
              what you're eating before you buy it.
            </p>

            <div className="fade-up delay-300 mt-8 flex flex-wrap gap-3">
              <Link
                to="/register"
                className="shine group flex items-center gap-2 rounded-xl bg-emerald-400 px-6 py-3.5 text-sm font-bold text-slate-950 shadow-[0_10px_35px_rgba(16,185,129,0.25)] transition hover:-translate-y-0.5 hover:bg-emerald-300"
              >
                Start scanning

                <ArrowRight
                  size={17}
                  className="transition group-hover:translate-x-1"
                />
              </Link>

              <a
                href="#how-it-works"
                className="group flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/[0.03] px-6 py-3.5 text-sm font-semibold text-slate-200 transition hover:-translate-y-0.5 hover:border-emerald-400/60 hover:bg-emerald-400/[0.07]"
              >
                See how it works

                <Play
                  size={13}
                  className="text-emerald-400 transition group-hover:scale-125"
                />
              </a>
            </div>

            <div className="fade-up delay-400 mt-8 flex flex-wrap gap-x-6 gap-y-3">
              {[
                "Instant label scanning",
                "Personalized analysis",
                "Easy to understand",
              ].map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-2 text-[11px] text-slate-500"
                >
                  <CircleCheck
                    size={15}
                    className="text-emerald-400"
                  />

                  {item}
                </div>
              ))}
            </div>
          </div>

          {/* phone */}
          <div className="relative z-10 mt-6 md:mt-0">
            <PhonePreview />
          </div>
        </div>
      </section>

      {/* =====================================================
          MARQUEE
      ===================================================== */}

      <div className="group relative overflow-hidden border-y border-white/[0.05] bg-[#031816] py-4">
        <div className="marquee flex w-max gap-3 group-hover:[animation-play-state:paused]">
          {[...marquee, ...marquee].map(
            (item, index) => (
              <span
                key={`${item}-${index}`}
                className="flex items-center gap-2 rounded-full border border-emerald-400/10 bg-emerald-400/[0.04] px-4 py-1.5 text-[11px] font-medium text-slate-400"
              >
                <Sparkles
                  size={11}
                  className="text-emerald-400"
                />

                {item}
              </span>
            )
          )}
        </div>
      </div>

      {/* =====================================================
          STATS
      ===================================================== */}

      <section className="bg-[#031816] py-14">
        <div className="mx-auto grid max-w-5xl gap-8 px-5 text-center sm:grid-cols-3">
          {stats.map((stat, index) => (
            <Reveal
              key={stat.label}
              delay={index * 120}
            >
              <p className="gradient-text text-5xl font-black">
                <CountUp to={stat.to} />
              </p>

              <p className="mt-2 text-xs text-slate-500">
                {stat.label}
              </p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* =====================================================
          FEATURES
      ===================================================== */}

      <section
        id="features"
        className="relative overflow-hidden border-t border-white/[0.04] bg-[#041b19] py-24"
      >
        <div className="absolute right-[-200px] top-20 h-[400px] w-[400px] rounded-full bg-emerald-500/[0.06] blur-[100px]" />

        <div className="relative mx-auto max-w-7xl px-5 lg:px-8">
          <Reveal className="max-w-2xl">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-emerald-400">
              Built for better decisions
            </p>

            <h2 className="mt-4 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
              Food labels are complicated.
              <br />

              <span className="text-emerald-400">
                Understanding them shouldn't be.
              </span>
            </h2>

            <p className="mt-5 max-w-xl text-sm leading-7 text-slate-400">
              LabelIQ turns confusing nutrition
              facts and ingredients into clear,
              personalized insights you can actually use.
            </p>
          </Reveal>

          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {features.map(
              (
                {
                  icon: Icon,
                  title,
                  description,
                },
                index
              ) => (
                <Reveal
                  key={title}
                  delay={index * 110}
                >
                  <div className="feature-card group relative h-full overflow-hidden rounded-2xl border border-emerald-500/10 bg-[#062522] p-6 transition duration-500 hover:-translate-y-2 hover:border-emerald-400/40 hover:shadow-[0_20px_50px_rgba(16,185,129,0.12)]">
                    <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-emerald-400/[0.06] blur-2xl transition duration-500 group-hover:bg-emerald-400/20" />

                    <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-400 ring-1 ring-emerald-400/10 transition duration-300 group-hover:scale-110 group-hover:rotate-6">
                      <Icon size={21} />
                    </div>

                    <h3 className="relative mt-6 text-sm font-bold">
                      {title}
                    </h3>

                    <p className="relative mt-3 text-xs leading-6 text-slate-500">
                      {description}
                    </p>

                    <div className="relative mt-5 flex items-center gap-1 text-[10px] font-semibold text-emerald-400 opacity-0 transition group-hover:opacity-100">
                      Learn more

                      <ChevronRight size={12} />
                    </div>

                    <span className="absolute bottom-4 right-5 text-[34px] font-black text-white/[0.03]">
                      0{index + 1}
                    </span>
                  </div>
                </Reveal>
              )
            )}
          </div>
        </div>
      </section>

      {/* =====================================================
          HOW IT WORKS
      ===================================================== */}

      <section
        id="how-it-works"
        className="relative overflow-hidden border-t border-white/[0.04] bg-[#031816] py-24"
      >
        <div className="absolute left-1/2 top-0 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-emerald-500/[0.04] blur-[120px]" />

        <div className="relative mx-auto max-w-7xl px-5 lg:px-8">
          <Reveal>
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-emerald-400">
              How it works
            </p>

            <h2 className="mt-4 text-3xl font-bold sm:text-4xl">
              From label to insight in seconds.
            </h2>

            <p className="mt-3 text-sm text-slate-500">
              Three simple steps to understand your food.
            </p>
          </Reveal>

          <div className="relative mt-16 grid gap-12 md:grid-cols-3 md:gap-10">
            <div className="flow-line absolute left-[16%] right-[16%] top-9 hidden h-px bg-gradient-to-r from-emerald-500/10 via-emerald-400/70 to-emerald-500/10 md:block" />

            {steps.map(
              (
                {
                  number,
                  icon: Icon,
                  title,
                  description,
                },
                index
              ) => (
                <Reveal
                  key={number}
                  delay={index * 160}
                >
                  <div className="flex gap-5">
                    <div className="step-icon relative z-10 flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full border border-emerald-400/30 bg-[#031816] text-emerald-400 shadow-[0_0_35px_rgba(16,185,129,0.12)]">
                      <Icon size={24} />

                      <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400 text-[8px] font-black text-slate-950">
                        {number}
                      </span>
                    </div>

                    <div className="pt-1">
                      <h3 className="text-base font-bold">
                        {title}
                      </h3>

                      <p className="mt-2 text-xs leading-6 text-slate-500">
                        {description}
                      </p>
                    </div>
                  </div>

                  {number === "02" && (
                    <div className="mt-5 rounded-xl border border-emerald-400/10 bg-black/20 p-3">
                      {CHECKS.map(
                        (check, checkIndex) => (
                          <div
                            key={check}
                            className="tick-loop flex items-center justify-between border-b border-white/[0.04] py-2 last:border-0"
                            style={{
                              animationDelay: `${
                                checkIndex * 0.6
                              }s`,
                            }}
                          >
                            <span className="text-[10px] text-slate-500">
                              {check}...
                            </span>

                            <Check
                              size={12}
                              className="text-emerald-400"
                            />
                          </div>
                        )
                      )}
                    </div>
                  )}

                  {number === "03" && (
                    <div className="mt-5 flex items-center gap-3 rounded-xl border border-emerald-400/10 bg-black/20 p-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full border-4 border-emerald-400/40 text-sm font-bold">
                        <CountUp to={72} />
                      </div>

                      <div>
                        <p className="text-[9px] text-slate-600">
                          Health Score
                        </p>

                        <p className="mt-1 text-xs font-bold text-emerald-400">
                          Good
                        </p>
                      </div>
                    </div>
                  )}
                </Reveal>
              )
            )}
          </div>
        </div>
      </section>

      {/* =====================================================
          WHY LABELIQ
      ===================================================== */}

      <section
        id="why-labeliq"
        className="relative overflow-hidden border-t border-white/[0.04] bg-[#041b19] py-24"
      >
        <div className="absolute right-[-100px] top-1/2 h-[500px] w-[500px] -translate-y-1/2 rounded-full bg-emerald-500/[0.08] blur-[120px]" />

        <div className="relative mx-auto grid max-w-7xl gap-14 px-5 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
          <div className="space-y-3">
            {benefits.map(
              (
                {
                  icon: Icon,
                  title,
                  description,
                  className,
                },
                index
              ) => (
                <Reveal
                  key={title}
                  delay={index * 100}
                >
                  <div className="group flex items-center gap-4 rounded-xl border border-white/[0.05] bg-black/20 p-4 transition duration-300 hover:-translate-x-1 hover:border-emerald-400/25 hover:bg-white/[0.03]">
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition group-hover:scale-110 ${className}`}
                    >
                      <Icon size={19} />
                    </div>

                    <div>
                      <p className="text-xs font-bold">
                        {title}
                      </p>

                      <p className="mt-1 text-[10px] text-slate-500">
                        {description}
                      </p>
                    </div>

                    <ChevronRight
                      size={15}
                      className="ml-auto text-slate-700 transition group-hover:translate-x-1 group-hover:text-emerald-400"
                    />
                  </div>
                </Reveal>
              )
            )}
          </div>

          <Reveal className="flex items-center">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-emerald-400">
                Why LabelIQ?
              </p>

              <h2 className="mt-4 text-3xl font-bold sm:text-4xl">
                More than just a scanner.
                <br />

                <span className="gradient-text">
                  A smarter way to understand food.
                </span>
              </h2>

              <p className="mt-5 max-w-xl text-sm leading-7 text-slate-400">
                LabelIQ helps you make confident
                food choices with clear insights,
                personalized to your lifestyle,
                dietary needs, and health goals.
              </p>

              <Link
                to="/register"
                className="group mt-7 inline-flex items-center gap-2 text-xs font-bold text-emerald-400"
              >
                Start understanding your food

                <ArrowRight
                  size={14}
                  className="transition group-hover:translate-x-1"
                />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* =====================================================
          ABOUT
      ===================================================== */}

      <section
        id="about"
        className="relative overflow-hidden border-t border-white/[0.04] bg-[#031816] py-24"
      >
        <div className="relative mx-auto grid max-w-7xl gap-8 px-5 lg:grid-cols-2 lg:px-8">
          <Reveal>
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-emerald-400">
              About LabelIQ
            </p>

            <h2 className="mt-4 max-w-xl text-3xl font-bold leading-tight sm:text-4xl">
              Make food labels easier to understand.
            </h2>

            <p className="mt-5 max-w-xl text-sm leading-7 text-slate-400">
              LabelIQ combines label scanning,
              nutrition extraction, ingredient
              analysis, personalized rules, and
              AI-powered explanations into one
              practical food intelligence platform.
            </p>
          </Reveal>

          <div className="grid gap-3 sm:grid-cols-2">
            {[
              [
                "OCR",
                "Extract information from food labels.",
              ],
              [
                "Nutrition",
                "Structure important nutrition facts.",
              ],
              [
                "Personalization",
                "Evaluate products against your profile.",
              ],
              [
                "AI insights",
                "Explain complex ingredients clearly.",
              ],
            ].map(([title, description], index) => (
              <Reveal
                key={title}
                delay={index * 100}
              >
                <div className="h-full rounded-2xl border border-emerald-400/10 bg-[#062522] p-5 transition duration-300 hover:-translate-y-1 hover:border-emerald-400/30 hover:shadow-[0_15px_40px_rgba(16,185,129,0.08)]">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />

                    <h3 className="text-sm font-bold">
                      {title}
                    </h3>
                  </div>

                  <p className="mt-3 text-xs leading-6 text-slate-500">
                    {description}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* =====================================================
          CTA
      ===================================================== */}

      <section className="bg-[#031816] px-5 pb-24 pt-8">
        <Reveal>
          <div className="cta-glow relative mx-auto max-w-7xl overflow-hidden rounded-[28px] border border-emerald-400/30 bg-gradient-to-br from-emerald-500/20 via-emerald-500/10 to-cyan-500/[0.08] px-6 py-12 shadow-[0_0_70px_rgba(16,185,129,0.06)] sm:px-12 sm:py-14">
            <div className="absolute -right-20 -top-32 h-80 w-80 rounded-full bg-emerald-400/20 blur-[100px]" />

            <div className="absolute bottom-[-130px] left-1/3 h-56 w-[500px] rounded-full border border-emerald-400/10" />

            <div className="relative flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
              <div>
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-[9px] font-semibold text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />

                  READY TO MAKE BETTER FOOD CHOICES?
                </div>

                <h2 className="max-w-2xl text-3xl font-bold sm:text-4xl">
                  Start your journey with LabelIQ today.
                </h2>

                <p className="mt-3 text-sm text-slate-400">
                  Scan, understand, and take control
                  of what you eat.
                </p>
              </div>

              <Link
                to="/register"
                className="shine group flex shrink-0 items-center gap-2 rounded-xl bg-emerald-400 px-6 py-3.5 text-sm font-bold text-slate-950 shadow-xl shadow-emerald-500/20 transition hover:-translate-y-0.5 hover:bg-emerald-300"
              >
                Get started for free

                <ArrowRight
                  size={16}
                  className="transition group-hover:translate-x-1"
                />
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      {/* =====================================================
          FOOTER
      ===================================================== */}

      <footer className="border-t border-white/[0.05] bg-[#020d0c]">
        <div className="mx-auto max-w-7xl px-5 py-10 lg:px-8">
          <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
            <Logo />

            <div className="flex flex-wrap gap-x-7 gap-y-3 text-xs text-slate-500">
              {mobileLinks.map(
                ([label, href]) => (
                  <a
                    key={href}
                    href={href}
                    className="transition hover:text-white"
                  >
                    {label}
                  </a>
                )
              )}

              <Link
                to="/login"
                className="transition hover:text-white"
              >
                Sign in
              </Link>

              <Link
                to="/register"
                className="transition hover:text-white"
              >
                Register
              </Link>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-2 border-t border-white/[0.05] pt-6 text-[10px] text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <p>
              © 2026 LabelIQ. All rights reserved.
            </p>

            <p>
              Designed & built by{" "}
              <span className="font-semibold text-slate-400">
                Aditya Kumar
              </span>
            </p>

            <p>
              Scan. Understand. Decide.
            </p>
          </div>
        </div>
      </footer>

      {/* =====================================================
          ANIMATIONS
      ===================================================== */}

      <style>{`
        html {
          scroll-behavior: smooth;
        }

        /* ---------------- grid ---------------- */

        .grid-bg {
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
            gridDrift 24s linear infinite;
        }

        /* ---------------- gradient text ---------------- */

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
            shimmer 5s linear infinite;
        }

        /* ---------------- navigation ---------------- */

        .nav-link {
          position: relative;
        }

        .nav-link::after {
          content: "";
          position: absolute;
          left: 0;
          bottom: -6px;
          height: 2px;
          width: 0;
          background: #34d399;
          transition: width .3s ease;
        }

        .nav-link:hover::after {
          width: 100%;
        }

        /* ---------------- shine ---------------- */

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

          transform: skewX(-20deg);

          animation:
            shineSweep 3.6s ease-in-out infinite;
        }

        /* ---------------- reveal ---------------- */

        .reveal {
          opacity: 0;
          transform: translateY(32px);

          transition:
            opacity .8s cubic-bezier(.22,1,.36,1),
            transform .8s cubic-bezier(.22,1,.36,1);
        }

        .reveal.in {
          opacity: 1;
          transform: none;
        }

        /* ---------------- hero ---------------- */

        .fade-up {
          animation:
            fadeUp .9s cubic-bezier(.22,1,.36,1) both;
        }

        .delay-100 {
          animation-delay: .1s;
        }

        .delay-200 {
          animation-delay: .2s;
        }

        .delay-300 {
          animation-delay: .3s;
        }

        .delay-400 {
          animation-delay: .4s;
        }

        /* ---------------- phone ---------------- */

        .phone-float {
          animation:
            phoneFloat 6s ease-in-out infinite;
        }

        .floating-card {
          animation:
            cardFloat 4.5s ease-in-out infinite;
        }

        .float {
          animation:
            leafFloat 5s ease-in-out infinite;
        }

        .float-slow {
          animation:
            leafFloat 7s ease-in-out infinite reverse;
        }

        .orbit {
          animation:
            orbitPulse 8s ease-in-out infinite;
        }

        .orbit-2 {
          animation:
            spin 40s linear infinite;
        }

        /* ---------------- scanning ---------------- */

        .beam {
          animation:
            beam 2.2s ease-in-out infinite;
        }

        .beam-line {
          animation:
            beamLine 2.2s ease-in-out infinite;
        }

        .corner {
          animation:
            cornerPulse 1.6s ease-in-out infinite;
        }

        .chip {
          opacity: 0;

          animation:
            chipPop .5s cubic-bezier(.34,1.56,.64,1)
            forwards;
        }

        .pop {
          animation:
            popIn .5s cubic-bezier(.22,1,.36,1) both;
        }

        .tick {
          opacity: 0;

          animation:
            popIn .4s ease forwards;
        }

        .tick-loop {
          animation:
            tickLoop 3.2s ease-in-out infinite;
        }

        .progress-bar {
          animation:
            progress 3.2s ease-in-out infinite;
        }

        .ring {
          stroke-dashoffset: 163.4;

          animation:
            ringFill 1.2s .1s
            cubic-bezier(.22,1,.36,1)
            forwards;
        }

        /* ---------------- atmosphere ---------------- */

        .hero-glow {
          animation:
            glowPulse 7s ease-in-out infinite;
        }

        .hero-glow-2 {
          animation:
            glowPulse 9s ease-in-out infinite reverse;
        }

        .cta-glow {
          animation:
            ctaPulse 5s ease-in-out infinite;
        }

        /* ---------------- marquee ---------------- */

        .marquee {
          animation:
            marquee 32s linear infinite;
        }

        /* ---------------- steps ---------------- */

        .step-icon {
          animation:
            stepPulse 3s ease-in-out infinite;
        }

        .flow-line {
          animation:
            flowLine 3s ease-in-out infinite;
        }

        /* =================================================
           KEYFRAMES
        ================================================= */

        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(26px);
          }

          to {
            opacity: 1;
            transform: none;
          }
        }

        @keyframes phoneFloat {
          0%,
          100% {
            transform:
              translateY(0)
              rotate(4deg);
          }

          50% {
            transform:
              translateY(-12px)
              rotate(2deg);
          }
        }

        @keyframes cardFloat {
          0%,
          100% {
            transform:
              translateY(0);
          }

          50% {
            transform:
              translateY(-9px);
          }
        }

        @keyframes leafFloat {
          0%,
          100% {
            transform:
              translateY(0)
              rotate(-30deg);
          }

          50% {
            transform:
              translateY(-14px)
              rotate(-18deg);
          }
        }

        @keyframes orbitPulse {
          0%,
          100% {
            transform:
              scale(1);
            opacity: .5;
          }

          50% {
            transform:
              scale(1.06);
            opacity: 1;
          }
        }

        @keyframes spin {
          to {
            transform:
              rotate(360deg);
          }
        }

        @keyframes beam {
          0% {
            transform:
              translateY(-60px);
          }

          100% {
            transform:
              translateY(170px);
          }
        }

        @keyframes beamLine {
          0% {
            transform:
              translateY(0);
            opacity: .2;
          }

          50% {
            opacity: 1;
          }

          100% {
            transform:
              translateY(168px);
            opacity: .2;
          }
        }

        @keyframes cornerPulse {
          0%,
          100% {
            opacity: .5;
            transform:
              scale(1);
          }

          50% {
            opacity: 1;
            transform:
              scale(1.12);
          }
        }

        @keyframes chipPop {
          from {
            opacity: 0;
            transform:
              scale(.4)
              translateY(6px);
          }

          to {
            opacity: 1;
            transform:
              none;
          }
        }

        @keyframes popIn {
          from {
            opacity: 0;
            transform:
              translateY(10px)
              scale(.97);
          }

          to {
            opacity: 1;
            transform:
              none;
          }
        }

        @keyframes tickLoop {
          0%,
          100% {
            opacity: .35;
          }

          30%,
          70% {
            opacity: 1;
          }
        }

        @keyframes progress {
          0% {
            width: 20%;
          }

          60% {
            width: 92%;
          }

          100% {
            width: 68%;
          }
        }

        @keyframes ringFill {
          to {
            stroke-dashoffset:
              var(--off);
          }
        }

        @keyframes glowPulse {
          0%,
          100% {
            opacity: .55;
            transform:
              scale(1);
          }

          50% {
            opacity: .95;
            transform:
              scale(1.1);
          }
        }

        @keyframes ctaPulse {
          0%,
          100% {
            box-shadow:
              0 0 60px
              rgba(16,185,129,.05);
          }

          50% {
            box-shadow:
              0 0 100px
              rgba(16,185,129,.16);
          }
        }

        @keyframes marquee {
          to {
            transform:
              translateX(-50%);
          }
        }

        @keyframes shimmer {
          to {
            background-position:
              200% center;
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

        @keyframes gridDrift {
          to {
            background-position:
              55px 55px;
          }
        }

        @keyframes stepPulse {
          0%,
          100% {
            box-shadow:
              0 0 25px
              rgba(16,185,129,.1);
          }

          50% {
            box-shadow:
              0 0 50px
              rgba(16,185,129,.3);
          }
        }

        @keyframes flowLine {
          0%,
          100% {
            opacity: .4;
          }

          50% {
            opacity: 1;
          }
        }

        /* =================================================
           TABLET
        ================================================= */

        @media (min-width: 768px) and (max-width: 1023px) {
          .phone-stage {
            transform:
              scale(.85);

            margin:
              -30px 0;
          }
        }

        /* =================================================
           MOBILE
        ================================================= */

        @media (max-width: 767px) {
          .phone-stage {
            height:
              560px;
          }

          .orbit {
            width:
              390px;

            height:
              390px;
          }

          .orbit-2 {
            width:
              460px;

            height:
              460px;
          }

          .phone-float {
            width:
              230px;

            height:
              465px;
          }
        }

        /* =================================================
           REDUCED MOTION
        ================================================= */

        @media (prefers-reduced-motion: reduce) {
          *,
          *::before,
          *::after {
            animation-duration:
              .01ms !important;

            animation-iteration-count:
              1 !important;

            scroll-behavior:
              auto !important;

            transition-duration:
              .01ms !important;
          }

          .reveal {
            opacity:
              1;

            transform:
              none;
          }
        }
      `}</style>
    </div>
  );
}

export default Landing;