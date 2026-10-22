import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Award,
  BarChart3,
  CircleAlert,
  FileSearch,
  Flame,
  Gauge,
  Leaf,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import api from "../api/axios";

/* =========================================================
   Constants
========================================================= */

const DAY_OPTIONS = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
];

const GRADE_COLORS = {
  A: "#34d399",
  B: "#a3e635",
  C: "#fbbf24",
  D: "#f87171",
};

const gradeStyle = {
  A: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
  B: "border-lime-400/20 bg-lime-400/10 text-lime-300",
  C: "border-amber-400/20 bg-amber-400/10 text-amber-300",
  D: "border-red-400/20 bg-red-400/10 text-red-300",
};

const AXIS_TICK = { fill: "#64748b", fontSize: 11 };

const TOOLTIP_STYLE = {
  backgroundColor: "#0b1713",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 12,
  color: "#fff",
  fontSize: 12,
};

/* =========================================================
   Helpers
========================================================= */

const formatShortDate = (value) => {
  if (!value) return "";

  const parsed = new Date(`${value}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
};

const truncate = (text, max = 22) => {
  const value = String(text ?? "");

  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
};

const prettyRuleName = (rule) =>
  rule.rule_name ||
  String(rule.rule_code || "")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());

/* =========================================================
   UI components
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

function SectionTitle({ icon: Icon, eyebrow, title, description }) {
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
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{label}</p>

          <p className="mt-2 truncate text-2xl font-bold tracking-tight text-white">
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

function ChartEmpty({ message }) {
  return (
    <div className="mt-6 rounded-xl border border-dashed border-white/10 bg-black/10 p-8 text-center">
      <BarChart3 size={24} className="mx-auto text-slate-600" />

      <p className="mt-3 text-sm text-slate-500">{message}</p>
    </div>
  );
}

/* =========================================================
   Charts
========================================================= */

function GradeDistributionChart({ distribution }) {
  const total = distribution.reduce((sum, item) => sum + item.count, 0);

  return (
    <GlassCard className="p-5 sm:p-6">
      <SectionTitle
        icon={BarChart3}
        eyebrow="Distribution"
        title="Safety grade distribution"
        description="How your scanned products are spread across LabelIQ safety grades."
      />

      {total === 0 ? (
        <ChartEmpty message="No graded scans yet." />
      ) : (
        <div className="mt-6 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={distribution}
              margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
            >
              <CartesianGrid
                stroke="rgba(255,255,255,0.05)"
                vertical={false}
              />

              <XAxis
                dataKey="grade"
                tick={AXIS_TICK}
                tickFormatter={(grade) => `Grade ${grade}`}
                axisLine={false}
                tickLine={false}
              />

              <YAxis
                allowDecimals={false}
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
              />

              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                contentStyle={TOOLTIP_STYLE}
                formatter={(value) => [value, "Scans"]}
                labelFormatter={(grade) => `Grade ${grade}`}
              />

              <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                {distribution.map((item) => (
                  <Cell key={item.grade} fill={GRADE_COLORS[item.grade]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </GlassCard>
  );
}

function ActivityChart({ activity }) {
  const points = activity?.points || [];
  const hasData = points.some((point) => point.scans > 0);

  return (
    <GlassCard className="p-5 sm:p-6">
      <SectionTitle
        icon={BarChart3}
        eyebrow="Activity"
        title="Scan activity"
        description={`Number of scans per day over the last ${
          activity?.days ?? 30
        } days.`}
      />

      {!hasData ? (
        <ChartEmpty message="No scans in this period." />
      ) : (
        <div className="mt-6 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={points}
              margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
            >
              <CartesianGrid
                stroke="rgba(255,255,255,0.05)"
                vertical={false}
              />

              <XAxis
                dataKey="date"
                tick={AXIS_TICK}
                tickFormatter={formatShortDate}
                axisLine={false}
                tickLine={false}
                minTickGap={24}
              />

              <YAxis
                allowDecimals={false}
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
              />

              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                contentStyle={TOOLTIP_STYLE}
                formatter={(value) => [value, "Scans"]}
                labelFormatter={formatShortDate}
              />

              <Bar
                dataKey="scans"
                fill="#34d399"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </GlassCard>
  );
}

function ScoreTrendChart({ activity }) {
  // Only days that actually had scans carry an average score.
  const points = (activity?.points || []).filter(
    (point) => point.averageScore !== null
  );

  return (
    <GlassCard className="p-5 sm:p-6">
      <SectionTitle
        icon={Gauge}
        eyebrow="Trend"
        title="Average safety score by day"
        description="Daily average of the safety scores of the products you scanned."
      />

      {points.length === 0 ? (
        <ChartEmpty message="Score data will appear after you scan products." />
      ) : (
        <div className="mt-6 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={points}
              margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
            >
              <CartesianGrid
                stroke="rgba(255,255,255,0.05)"
                vertical={false}
              />

              <XAxis
                dataKey="date"
                tick={AXIS_TICK}
                tickFormatter={formatShortDate}
                axisLine={false}
                tickLine={false}
                minTickGap={24}
              />

              <YAxis
                domain={[0, 100]}
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
              />

              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value) => [value, "Average score"]}
                labelFormatter={formatShortDate}
              />

              <Line
                type="monotone"
                dataKey="averageScore"
                stroke="#22d3ee"
                strokeWidth={2}
                dot={{ r: 3, fill: "#22d3ee" }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </GlassCard>
  );
}

function HorizontalBarChart({
  icon,
  eyebrow,
  title,
  description,
  data,
  labelKey,
  emptyMessage,
  color,
}) {
  const height = Math.max(180, data.length * 38 + 20);

  return (
    <GlassCard className="p-5 sm:p-6">
      <SectionTitle
        icon={icon}
        eyebrow={eyebrow}
        title={title}
        description={description}
      />

      {data.length === 0 ? (
        <ChartEmpty message={emptyMessage} />
      ) : (
        <div className="mt-6" style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                stroke="rgba(255,255,255,0.05)"
                horizontal={false}
              />

              <XAxis
                type="number"
                allowDecimals={false}
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
              />

              <YAxis
                type="category"
                dataKey={labelKey}
                width={130}
                tick={AXIS_TICK}
                tickFormatter={(value) => truncate(value, 20)}
                axisLine={false}
                tickLine={false}
              />

              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                contentStyle={TOOLTIP_STYLE}
                formatter={(value, name, item) => [
                  `${value} match${value !== 1 ? "es" : ""} in ${
                    item.payload.scans
                  } scan${item.payload.scans !== 1 ? "s" : ""}`,
                  "",
                ]}
              />

              <Bar
                dataKey="matches"
                fill={color}
                radius={[0, 6, 6, 0]}
                barSize={18}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </GlassCard>
  );
}

/* =========================================================
   Main
========================================================= */

export default function Analytics() {
  const navigate = useNavigate();

  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState("");

  const fetchAnalytics = useCallback(async () => {
    try {
      setFetching(true);
      setError("");

      const response = await api.get("/analytics/summary", {
        params: { days },
      });

      setData(response?.data?.data || null);
    } catch (err) {
      console.error("Analytics fetch error:", err);

      if (err?.response?.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");

        navigate("/login", { replace: true });
        return;
      }

      setError(
        err?.response?.data?.message || "Unable to load your analytics."
      );
    } finally {
      setLoading(false);
      setFetching(false);
    }
  }, [days, navigate]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  /* -------------------------------------------------------
     Loading
  ------------------------------------------------------- */

  if (loading) {
    return (
      <div className="min-h-screen bg-[#06100d] text-white">
        <div className="flex min-h-screen items-center justify-center">
          <div className="flex flex-col items-center">
            <Loader2 size={28} className="animate-spin text-emerald-400" />

            <p className="mt-3 text-sm text-slate-500">
              Loading your analytics...
            </p>
          </div>
        </div>
      </div>
    );
  }

  const totals = data?.totals;
  const distribution = data?.gradeDistribution || [];
  const topIngredients = data?.topIngredients || [];
  const topRules = (data?.topRules || []).map((rule) => ({
    ...rule,
    label: prettyRuleName(rule),
  }));

  const hasScans = (totals?.totalScans ?? 0) > 0;

  // Derived from the grade distribution returned by the server.
  const bestGrade = ["A", "B", "C", "D"].find(
    (grade) => distribution.find((item) => item.grade === grade)?.count > 0
  );

  const mostCommonGrade = distribution.reduce(
    (top, item) => (item.count > (top?.count ?? 0) ? item : top),
    null
  );

  const topIngredient = topIngredients[0] || null;

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

      <main className="relative z-10 mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-10 lg:px-8">
        {/* Heading */}
        <div className="mb-7">
          <Link
            to="/dashboard"
            className="mb-4 inline-flex items-center gap-2 text-xs text-slate-500 transition hover:text-slate-300"
          >
            <ArrowLeft size={14} />
            Back to dashboard
          </Link>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
                <BarChart3 size={14} />
                Analytics
              </div>

              <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
                Your food label analytics
              </h1>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                Insights calculated from the products you've scanned with
                LabelIQ.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
                {DAY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setDays(option.value)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      days === option.value
                        ? "bg-emerald-400 text-[#03110c]"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={fetchAnalytics}
                disabled={fetching}
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-sm font-medium text-slate-300 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw
                  size={15}
                  className={fetching ? "animate-spin" : ""}
                />

                <span className="hidden sm:inline">Refresh</span>
              </button>
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
                Analytics could not be loaded
              </p>

              <p className="mt-1 text-xs leading-5 text-red-200/60">
                {error}
              </p>
            </div>

            <button
              type="button"
              onClick={fetchAnalytics}
              className="text-xs font-semibold text-red-300 hover:text-red-200"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {!error && data && !hasScans && (
          <GlassCard className="p-10 sm:p-14">
            <div className="mx-auto max-w-md text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10">
                <BarChart3 size={28} className="text-emerald-300" />
              </div>

              <h2 className="mt-5 text-xl font-semibold text-white">
                No analytics yet
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Scan a food product to start building your analytics.
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
        )}

        {/* Analytics */}
        {!error && data && hasScans && (
          <div
            className={`space-y-6 transition-opacity ${
              fetching ? "opacity-60" : "opacity-100"
            }`}
          >
            {/* Summary cards */}
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                icon={FileSearch}
                label="Total scans"
                value={totals.totalScans}
                description={
                  totals.hiddenSugarScans > 0
                    ? `${totals.hiddenSugarScans} with hidden sugar detected`
                    : "No hidden sugar detected so far"
                }
              />

              <MetricCard
                icon={Gauge}
                label="Average safety score"
                value={
                  totals.averageScore !== null
                    ? `${totals.averageScore.toFixed(1)}/100`
                    : "—"
                }
                description={
                  totals.bestScore !== null
                    ? `Best ${Number(totals.bestScore).toFixed(0)} · Lowest ${Number(
                        totals.lowestScore
                      ).toFixed(0)}`
                    : "No scored scans yet"
                }
                iconClass="text-cyan-300 bg-cyan-400/10 border-cyan-400/20"
              />

              <MetricCard
                icon={Award}
                label="Best grade achieved"
                value={bestGrade ? `Grade ${bestGrade}` : "—"}
                description={
                  mostCommonGrade && mostCommonGrade.count > 0
                    ? `Most common: Grade ${mostCommonGrade.grade} (${mostCommonGrade.count} scan${
                        mostCommonGrade.count !== 1 ? "s" : ""
                      })`
                    : "No graded scans yet"
                }
                iconClass={
                  bestGrade
                    ? gradeStyle[bestGrade]
                    : "text-slate-400 bg-white/5 border-white/10"
                }
              />

              <MetricCard
                icon={Flame}
                label="Most flagged ingredient"
                value={topIngredient ? topIngredient.ingredient : "None"}
                description={
                  topIngredient
                    ? `Flagged ${topIngredient.matches} time${
                        topIngredient.matches !== 1 ? "s" : ""
                      } across ${topIngredient.scans} scan${
                        topIngredient.scans !== 1 ? "s" : ""
                      }`
                    : "No ingredient has been flagged yet"
                }
                iconClass="text-amber-300 bg-amber-400/10 border-amber-400/20"
              />
            </section>

            {/* Grade + Activity */}
            <section className="grid gap-6 lg:grid-cols-2">
              <GradeDistributionChart distribution={distribution} />

              <ActivityChart activity={data.activity} />
            </section>

            {/* Score trend */}
            <ScoreTrendChart activity={data.activity} />

            {/* Flagged ingredients + rules */}
            <section className="grid gap-6 lg:grid-cols-2">
              <HorizontalBarChart
                icon={Flame}
                eyebrow="Ingredients"
                title="Frequently flagged ingredients"
                description="Ingredients that triggered the most safety rules across your scans."
                data={topIngredients}
                labelKey="ingredient"
                emptyMessage="No ingredients have been flagged yet."
                color="#fbbf24"
              />

              <HorizontalBarChart
                icon={ShieldAlert}
                eyebrow="Rules"
                title="Most triggered rules"
                description="Safety rules that matched most often, including nutrition limits."
                data={topRules}
                labelKey="label"
                emptyMessage="No safety rules have been triggered yet."
                color="#f87171"
              />
            </section>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-10 border-t border-white/8 pt-6 text-center">
          <p className="text-xs text-slate-600">
            <Leaf size={12} className="mr-1 inline text-emerald-400" />
            LabelIQ Analytics · Scan. Understand. Decide.
          </p>
        </footer>
      </main>
    </div>
  );
}