import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  FileSearch,
  Flame,
  Leaf,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Utensils,
} from "lucide-react";
import api from "../api/axios";

/* =========================================================
   Helpers
========================================================= */

const numberValue = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const normalizeGrade = (value) => {
  if (!value) return null;

  const grade = String(value).trim().toUpperCase();

  return ["A", "B", "C", "D"].includes(grade)
    ? grade
    : null;
};

const getGradeScore = (grade) => {
  const scores = {
    A: 90,
    B: 75,
    C: 50,
    D: 0,
  };

  return scores[grade] ?? 0;
};

const gradeStyle = {
  A: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
  B: "border-lime-400/20 bg-lime-400/10 text-lime-300",
  C: "border-amber-400/20 bg-amber-400/10 text-amber-300",
  D: "border-red-400/20 bg-red-400/10 text-red-300",
};

const extractScanArray = (response) => {
  const root = response?.data;

  const candidates = [
    root,
    root?.data,
    root?.scans,
    root?.data?.scans,
    root?.results,
    root?.data?.results,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
};

const normalizeScan = (scan) => {
  if (!scan || typeof scan !== "object") {
    return null;
  }

  const analysis =
    scan.analysis ||
    scan.analysis_result ||
    scan.analysisResult ||
    {};

  const nutrition =
    scan.nutrition ||
    scan.nutrition_details ||
    scan.nutritionDetails ||
    {};

  const grade = normalizeGrade(
    scan.safetyGrade ??
      scan.safety_grade ??
      analysis.safetyGrade ??
      analysis.safety_grade
  );

  const score =
    scan.safetyScore ??
    scan.safety_score ??
    analysis.safetyScore ??
    analysis.safety_score;

  const scanId =
    scan.scanId ??
    scan.scan_id ??
    scan.id ??
    scan.product_id;

  const productName =
    scan.productName ||
    scan.product_name ||
    scan.name ||
    scan.filename ||
    "Unknown product";

  const createdAt =
    scan.createdAt ||
    scan.created_at ||
    scan.scannedAt ||
    scan.scanned_at ||
    null;

  const issueCount =
    scan.issueCount ??
    scan.issue_count ??
    analysis.ruleMatches?.length ??
    0;

  return {
    id: scanId,
    productName,
    grade,
    score:
      score === null || score === undefined
        ? null
        : numberValue(score, null),
    createdAt,
    issueCount: numberValue(issueCount),
    hiddenSugarDetected: Boolean(
      scan.hiddenSugarDetected ??
        scan.hidden_sugar_detected ??
        analysis.hiddenSugarDetected
    ),
    nutrition,
  };
};

const formatDate = (date) => {
  if (!date) return "Date unavailable";

  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) {
    return "Date unavailable";
  }

  return parsed.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const formatNumber = (value, decimals = 1) => {
  if (value === null || value === undefined) return "—";

  const number = Number(value);

  if (!Number.isFinite(number)) return "—";

  return number.toFixed(decimals);
};

/* =========================================================
   UI Components
========================================================= */

function GlassCard({ children, className = "" }) {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-white/[0.035] shadow-[0_20px_70px_rgba(0,0,0,0.18)] backdrop-blur-xl ${className}`}
    >
      {children}
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  eyebrow,
  title,
  description,
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
        <Icon size={14} />
        {eyebrow}
      </div>

      <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">
        {title}
      </h2>

      {description && (
        <p className="mt-1.5 text-sm leading-6 text-slate-500">
          {description}
        </p>
      )}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  description,
  iconClass = "text-emerald-300 bg-emerald-400/10 border-emerald-400/20",
}) {
  return (
    <GlassCard className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-slate-500">
            {label}
          </p>

          <p className="mt-2 text-2xl font-bold tracking-tight text-white">
            {value}
          </p>
        </div>

        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${iconClass}`}
        >
          <Icon size={18} />
        </div>
      </div>

      {description && (
        <p className="mt-3 text-xs leading-5 text-slate-600">
          {description}
        </p>
      )}
    </GlassCard>
  );
}

/* =========================================================
   Grade Distribution
========================================================= */

function GradeDistribution({ scans }) {
  const counts = {
    A: 0,
    B: 0,
    C: 0,
    D: 0,
  };

  scans.forEach((scan) => {
    if (scan.grade && counts[scan.grade] !== undefined) {
      counts[scan.grade] += 1;
    }
  });

  const total = scans.length;

  return (
    <GlassCard className="p-5 sm:p-6">
      <SectionTitle
        icon={BarChart3}
        eyebrow="Distribution"
        title="Safety grade distribution"
        description="How your analyzed products are distributed across LabelIQ safety grades."
      />

      <div className="mt-6 space-y-4">
        {["A", "B", "C", "D"].map((grade) => {
          const count = counts[grade];
          const percentage =
            total > 0 ? (count / total) * 100 : 0;

          return (
            <div key={grade}>
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-lg border text-xs font-bold ${gradeStyle[grade]}`}
                  >
                    {grade}
                  </span>

                  <span className="text-sm text-slate-300">
                    Grade {grade}
                  </span>
                </div>

                <span className="text-xs text-slate-500">
                  {count} scan{count !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-white/5">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    grade === "A"
                      ? "bg-emerald-400"
                      : grade === "B"
                      ? "bg-lime-400"
                      : grade === "C"
                      ? "bg-amber-400"
                      : "bg-red-400"
                  }`}
                  style={{
                    width: `${percentage}%`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}

/* =========================================================
   Score Trend
========================================================= */

function ScoreTrend({ scans }) {
  const scoredScans = scans
    .filter((scan) => scan.score !== null)
    .slice()
    .reverse();

  return (
    <GlassCard className="p-5 sm:p-6">
      <SectionTitle
        icon={TrendingUp}
        eyebrow="Trend"
        title="Safety score trend"
        description="Safety scores across your analyzed products."
      />

      {scoredScans.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-white/10 bg-black/10 p-8 text-center">
          <BarChart3
            size={24}
            className="mx-auto text-slate-600"
          />

          <p className="mt-3 text-sm text-slate-500">
            Score data will appear here after scans are
            available.
          </p>
        </div>
      ) : (
        <div className="mt-7">
          <div className="flex h-44 items-end gap-2 overflow-x-auto pb-1">
            {scoredScans.map((scan, index) => {
              const score = Math.max(
                0,
                Math.min(100, numberValue(scan.score))
              );

              return (
                <div
                  key={`${scan.id}-${index}`}
                  className="group flex min-w-[42px] flex-1 flex-col items-center justify-end"
                >
                  <div className="relative flex h-36 w-full items-end justify-center">
                    <div
                      className="w-7 min-w-7 rounded-t-lg bg-emerald-400/70 transition-all duration-500 group-hover:bg-emerald-300"
                      style={{
                        height: `${Math.max(score, 4)}%`,
                      }}
                    >
                      <div className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-[#0b1713] px-2 py-1 text-[10px] text-white shadow-xl group-hover:block">
                        {formatNumber(score, 0)}
                      </div>
                    </div>
                  </div>

                  <span className="mt-2 max-w-[52px] truncate text-[10px] text-slate-600">
                    {scan.productName}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </GlassCard>
  );
}

/* =========================================================
   Recent Scans
========================================================= */

function RecentScans({ scans }) {
  const recent = scans.slice(0, 6);

  return (
    <GlassCard className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <SectionTitle
          icon={FileSearch}
          eyebrow="Recent"
          title="Recent scans"
          description="Your latest analyzed products."
        />

        <Link
          to="/history"
          className="shrink-0 text-xs font-medium text-emerald-300 transition hover:text-emerald-200"
        >
          View history
        </Link>
      </div>

      {recent.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-white/10 bg-black/10 p-8 text-center">
          <FileSearch
            size={24}
            className="mx-auto text-slate-600"
          />

          <p className="mt-3 text-sm text-slate-500">
            No scans available yet.
          </p>
        </div>
      ) : (
        <div className="mt-5 divide-y divide-white/6">
          {recent.map((scan, index) => (
            <Link
              key={`${scan.id}-${index}`}
              to={
                scan.id
                  ? `/scan/${scan.id}`
                  : "/history"
              }
              className="flex items-center gap-3 py-4 transition hover:bg-white/[0.02]"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-400/10 bg-emerald-400/[0.05]">
                <Leaf
                  size={17}
                  className="text-emerald-300"
                />
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">
                  {scan.productName}
                </p>

                <p className="mt-1 text-xs text-slate-600">
                  {formatDate(scan.createdAt)}
                </p>
              </div>

              {scan.grade && (
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-xs font-bold ${gradeStyle[scan.grade]}`}
                >
                  {scan.grade}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </GlassCard>
  );
}

/* =========================================================
   Main
========================================================= */

export default function Analytics() {
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const fetchAnalyticsData = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      const response = await api.get("/scan/history");

      const rawScans = extractScanArray(response);

      const normalized = rawScans
        .map(normalizeScan)
        .filter(Boolean);

      setScans(normalized);
    } catch (err) {
      console.error("Analytics fetch error:", err);

      setError(
        err?.response?.data?.message ||
          "Unable to load analytics data."
      );

      setScans([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAnalyticsData();
  }, []);

  /* =======================================================
     Calculated metrics
  ======================================================= */

  const metrics = useMemo(() => {
    const total = scans.length;

    const scored = scans.filter(
      (scan) => scan.score !== null
    );

    const averageScore =
      scored.length > 0
        ? scored.reduce(
            (sum, scan) => sum + numberValue(scan.score),
            0
          ) / scored.length
        : null;

    const issueCount = scans.reduce(
      (sum, scan) => sum + numberValue(scan.issueCount),
      0
    );

    const hiddenSugarCount = scans.filter(
      (scan) => scan.hiddenSugarDetected
    ).length;

    const gradeCounts = {
      A: 0,
      B: 0,
      C: 0,
      D: 0,
    };

    scans.forEach((scan) => {
      if (scan.grade && gradeCounts[scan.grade] !== undefined) {
        gradeCounts[scan.grade] += 1;
      }
    });

    const bestGrade =
      gradeCounts.A > 0
        ? "A"
        : gradeCounts.B > 0
        ? "B"
        : gradeCounts.C > 0
        ? "C"
        : gradeCounts.D > 0
        ? "D"
        : null;

    const averageGradeScore =
      averageScore !== null
        ? averageScore
        : total > 0
        ? scans.reduce(
            (sum, scan) =>
              sum + getGradeScore(scan.grade),
            0
          ) / total
        : null;

    return {
      total,
      averageScore,
      issueCount,
      hiddenSugarCount,
      bestGrade,
      averageGradeScore,
    };
  }, [scans]);

  /* =======================================================
     Loading
  ======================================================= */

  if (loading) {
    return (
      <div className="min-h-screen bg-[#06100d] text-white">
        <div className="flex min-h-screen items-center justify-center">
          <div className="flex flex-col items-center">
            <Loader2
              size={28}
              className="animate-spin text-emerald-400"
            />

            <p className="mt-3 text-sm text-slate-500">
              Loading your analytics...
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* =======================================================
     Page
  ======================================================= */

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#06100d] text-white">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-[-10%] top-[-10%] h-[420px] w-[420px] rounded-full bg-emerald-500/10 blur-[120px]" />

        <div className="absolute right-[-10%] top-[25%] h-[360px] w-[360px] rounded-full bg-cyan-500/[0.05] blur-[120px]" />

        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.7) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-white/8 bg-[#06100d]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link
            to="/dashboard"
            className="flex items-center gap-3"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10">
              <Leaf
                size={18}
                className="text-emerald-300"
              />
            </div>

            <div>
              <div className="text-base font-bold tracking-tight">
                Label<span className="text-emerald-300">IQ</span>
              </div>

              <div className="hidden text-[10px] uppercase tracking-widest text-slate-600 sm:block">
                Food intelligence
              </div>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fetchAnalyticsData(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-sm font-medium text-slate-300 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw
                size={15}
                className={
                  refreshing ? "animate-spin" : ""
                }
              />

              <span className="hidden sm:inline">
                Refresh
              </span>
            </button>

            <Link
              to="/scan"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-3.5 py-2 text-sm font-semibold text-[#03110c] transition hover:bg-emerald-300"
            >
              <FileSearch size={15} />
              <span className="hidden sm:inline">
                New scan
              </span>
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-10 lg:px-8">
        {/* Page heading */}
        <div className="mb-8">
          <Link
            to="/dashboard"
            className="mb-4 inline-flex items-center gap-2 text-xs text-slate-500 transition hover:text-slate-300"
          >
            <ArrowLeft size={14} />
            Back to dashboard
          </Link>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
                <BarChart3 size={14} />
                Analytics
              </div>

              <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
                Your food analysis overview
              </h1>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                Understand the products you've scanned and
                the patterns in their LabelIQ assessments.
              </p>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-400/20 bg-red-400/[0.06] p-4">
            <CircleAlert
              size={18}
              className="mt-0.5 shrink-0 text-red-300"
            />

            <div className="flex-1">
              <p className="text-sm font-medium text-red-200">
                Analytics data could not be loaded
              </p>

              <p className="mt-1 text-xs leading-5 text-red-200/60">
                {error}
              </p>
            </div>

            <button
              type="button"
              onClick={() => fetchAnalyticsData()}
              className="text-xs font-semibold text-red-300 hover:text-red-200"
            >
              Retry
            </button>
          </div>
        )}

        {/* Metrics */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            icon={FileSearch}
            label="Total scans"
            value={metrics.total}
            description="Products analyzed with LabelIQ."
          />

          <MetricCard
            icon={BarChart3}
            label="Average score"
            value={
              metrics.averageScore !== null
                ? `${formatNumber(metrics.averageScore, 1)}/100`
                : "—"
            }
            description="Average safety score from available scan data."
          />

          <MetricCard
            icon={CircleAlert}
            label="Issues detected"
            value={metrics.issueCount}
            description="Total rule matches across available scans."
            iconClass="text-amber-300 bg-amber-400/10 border-amber-400/20"
          />

          <MetricCard
            icon={Sparkles}
            label="Hidden sugar"
            value={metrics.hiddenSugarCount}
            description="Scans where a sugar-related ingredient rule was triggered."
            iconClass="text-cyan-300 bg-cyan-400/10 border-cyan-400/20"
          />
        </section>

        {/* Empty state */}
        {scans.length === 0 ? (
          <GlassCard className="mt-6 p-8 sm:p-12">
            <div className="mx-auto max-w-lg text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10">
                <BarChart3
                  size={28}
                  className="text-emerald-300"
                />
              </div>

              <h2 className="mt-5 text-xl font-semibold text-white">
                Your analytics will appear here
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Scan a food label to start building your
                personalized food analysis history.
              </p>

              <Link
                to="/scan"
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-[#03110c] transition hover:bg-emerald-300"
              >
                <FileSearch size={16} />
                Scan a food label
              </Link>
            </div>
          </GlassCard>
        ) : (
          <>
            {/* Charts */}
            <section className="mt-6 grid gap-6 lg:grid-cols-2">
              <GradeDistribution scans={scans} />

              <ScoreTrend scans={scans} />
            </section>

            {/* Additional overview */}
            <section className="mt-6 grid gap-6 lg:grid-cols-[0.75fr_1.25fr]">
              <GlassCard className="p-5 sm:p-6">
                <SectionTitle
                  icon={Sparkles}
                  eyebrow="Overview"
                  title="Your current picture"
                  description="A quick summary of your available scan data."
                />

                <div className="mt-6 space-y-3">
                  <div className="flex items-center justify-between rounded-xl border border-white/8 bg-black/10 p-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg border border-emerald-400/15 bg-emerald-400/10 p-2">
                        <TrendingUp
                          size={16}
                          className="text-emerald-300"
                        />
                      </div>

                      <span className="text-sm text-slate-400">
                        Average score
                      </span>
                    </div>

                    <span className="font-semibold text-white">
                      {metrics.averageScore !== null
                        ? `${formatNumber(
                            metrics.averageScore,
                            1
                          )}`
                        : "—"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-white/8 bg-black/10 p-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg border border-lime-400/15 bg-lime-400/10 p-2">
                        <CheckCircle2
                          size={16}
                          className="text-lime-300"
                        />
                      </div>

                      <span className="text-sm text-slate-400">
                        Highest grade seen
                      </span>
                    </div>

                    {metrics.bestGrade ? (
                      <span
                        className={`flex h-8 w-8 items-center justify-center rounded-lg border text-xs font-bold ${gradeStyle[metrics.bestGrade]}`}
                      >
                        {metrics.bestGrade}
                      </span>
                    ) : (
                      <span className="text-sm text-slate-600">
                        —
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-white/8 bg-black/10 p-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg border border-red-400/15 bg-red-400/10 p-2">
                        <ShieldAlert
                          size={16}
                          className="text-red-300"
                        />
                      </div>

                      <span className="text-sm text-slate-400">
                        Products with issues
                      </span>
                    </div>

                    <span className="font-semibold text-white">
                      {
                        scans.filter(
                          (scan) => scan.issueCount > 0
                        ).length
                      }
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-white/8 bg-black/10 p-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg border border-cyan-400/15 bg-cyan-400/10 p-2">
                        <Utensils
                          size={16}
                          className="text-cyan-300"
                        />
                      </div>

                      <span className="text-sm text-slate-400">
                        Clean scans
                      </span>
                    </div>

                    <span className="font-semibold text-white">
                      {
                        scans.filter(
                          (scan) => scan.issueCount === 0
                        ).length
                      }
                    </span>
                  </div>
                </div>
              </GlassCard>

              <RecentScans scans={scans} />
            </section>
          </>
        )}

        {/* Footer */}
        <footer className="mt-10 border-t border-white/8 pt-6 text-center">
          <p className="text-xs text-slate-600">
            LabelIQ Analytics · Scan. Understand. Decide.
          </p>
        </footer>
      </main>
    </div>
  );
}