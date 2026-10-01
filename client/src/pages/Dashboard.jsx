import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  Camera,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Droplets,
  Flame,
  Leaf,
  Loader2,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useNavigate } from "react-router-dom";
import api from "../api/axios";

// ============================================================
// HELPERS
// ============================================================

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
};

const getGradeColor = (grade) => {
  const styles = {
    A: "border-emerald-400/20 bg-emerald-400/10 text-emerald-400",
    B: "border-lime-400/20 bg-lime-400/10 text-lime-400",
    C: "border-amber-400/20 bg-amber-400/10 text-amber-400",
    D: "border-orange-400/20 bg-orange-400/10 text-orange-400",
    E: "border-rose-400/20 bg-rose-400/10 text-rose-400",
  };

  return (
    styles[String(grade || "").toUpperCase()] ||
    "border-white/10 bg-white/5 text-white/50"
  );
};

const getScanStatus = (grade) => {
  switch (String(grade || "").toUpperCase()) {
    case "A":
      return "Good Choice";

    case "B":
      return "Good Choice";

    case "C":
      return "Moderate";

    case "D":
    case "E":
      return "High Risk";

    default:
      return "Analyzed";
  }
};

const formatNumber = (value, decimals = 0) => {
  if (value === null || value === undefined) {
    return "—";
  }

  return Number(value).toLocaleString("en-IN", {
    maximumFractionDigits: decimals,
  });
};

const formatDateTime = (value) => {
  if (!value) {
    return "Date unavailable";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
};

const getDayLabel = (date) => {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
  });
};

const average = (values) => {
  const validValues = values.filter(
    (value) => value !== null && value !== undefined
  );

  if (!validValues.length) {
    return null;
  }

  return (
    validValues.reduce((sum, value) => sum + Number(value), 0) /
    validValues.length
  );
};

// ============================================================
// STAT CARD
// ============================================================

function StatCard({
  icon: Icon,
  label,
  value,
  change,
  description,
  iconClass,
  changeType = "positive",
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 transition duration-300 hover:-translate-y-0.5 hover:border-emerald-400/20 hover:bg-white/[0.035] sm:p-5">
      <div className="absolute -right-8 -top-8 h-20 w-20 rounded-full bg-emerald-400/[0.035] blur-2xl transition group-hover:bg-emerald-400/[0.07]" />

      <div className="relative">
        <div className="flex items-start justify-between">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconClass}`}
          >
            <Icon size={18} />
          </div>

          {change && (
            <span
              className={`flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-bold ${
                changeType === "positive"
                  ? "bg-emerald-400/10 text-emerald-400"
                  : "bg-rose-400/10 text-rose-400"
              }`}
            >
              {changeType === "positive" ? (
                <TrendingUp size={10} />
              ) : (
                <TrendingDown size={10} />
              )}

              {change}
            </span>
          )}
        </div>

        <p className="mt-4 text-xs text-slate-500">{label}</p>

        <p className="mt-1 text-2xl font-bold tracking-tight text-white">
          {value}
        </p>

        <p className="mt-1 text-[10px] text-slate-600">{description}</p>
      </div>
    </div>
  );
}

// ============================================================
// SECTION HEADER
// ============================================================

function SectionHeader({
  eyebrow,
  title,
  description,
  action,
}) {
  return (
    <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && (
          <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.2em] text-emerald-400">
            {eyebrow}
          </p>
        )}

        <h2 className="text-lg font-semibold tracking-tight text-white">
          {title}
        </h2>

        {description && (
          <p className="mt-1 text-xs text-slate-600">
            {description}
          </p>
        )}
      </div>

      {action}
    </div>
  );
}

// ============================================================
// GRADE BADGE
// ============================================================

function GradeBadge({ grade }) {
  return (
    <div
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-xs font-black ${getGradeColor(
        grade
      )}`}
    >
      {grade || "—"}
    </div>
  );
}

// ============================================================
// DASHBOARD
// ============================================================

export default function Dashboard() {
  const navigate = useNavigate();

  const [scans, setScans] = useState([]);
  const [profile, setProfile] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ============================================================
  // FETCH DASHBOARD DATA
  // ============================================================

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        setError("");

        const [historyResponse, profileResponse] = await Promise.all([
          api.get("/scan/history"),
          api.get("/health-profile"),
        ]);

        const historyData = historyResponse?.data?.data;

        setScans(Array.isArray(historyData) ? historyData : []);

        setProfile(profileResponse?.data?.data || null);
      } catch (err) {
        console.error("Dashboard fetch error:", err);

        setError(
          err?.response?.data?.message ||
            "Failed to load dashboard data."
        );
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  // ============================================================
  // NORMALIZE SCANS
  // ============================================================

  const normalizedScans = useMemo(() => {
    return scans.map((scan) => ({
      id: scan.scan_id,
      name: scan.product_name || "Food label scan",
      grade: scan.safety_grade,
      score: toNumber(scan.safety_score),
      status: getScanStatus(scan.safety_grade),

      createdAt: scan.created_at,

      calories: toNumber(scan.calories),
      protein: toNumber(scan.protein_g),
      carbs: toNumber(scan.carbohydrates_g),
      fat: toNumber(scan.total_fat_g),
      saturatedFat: toNumber(scan.saturated_fat_g),
      fiber: toNumber(scan.dietary_fiber_g),
      sugar: toNumber(scan.total_sugars_g),
      addedSugar: toNumber(scan.added_sugars_g),
      sodium: toNumber(scan.sodium_mg),

      servingSize: scan.serving_size,
      hiddenSugarDetected: Boolean(scan.hidden_sugar_detected),
      assessment: scan.assessment,
    }));
  }, [scans]);

  // ============================================================
  // SORTED SCANS
  // ============================================================

  const sortedScans = useMemo(() => {
    return [...normalizedScans].sort((a, b) => {
      const dateA = a.createdAt
        ? new Date(a.createdAt).getTime()
        : 0;

      const dateB = b.createdAt
        ? new Date(b.createdAt).getTime()
        : 0;

      return dateB - dateA;
    });
  }, [normalizedScans]);

  // ============================================================
  // DASHBOARD STATISTICS
  // ============================================================

  const statistics = useMemo(() => {
    const total = normalizedScans.length;

    const safe = normalizedScans.filter(
      (scan) =>
        scan.grade === "A" ||
        scan.grade === "B"
    ).length;

    const risks = normalizedScans.filter(
      (scan) =>
        scan.grade === "C" ||
        scan.grade === "D" ||
        scan.grade === "E"
    ).length;

    const scores = normalizedScans
      .map((scan) => scan.score)
      .filter((score) => score !== null);

    const avgScore = average(scores);

    return {
      total,
      safe,
      risks,
      avgScore,
    };
  }, [normalizedScans]);

  // ============================================================
  // WEEKLY SCAN ACTIVITY
  // ============================================================

  const weeklyScans = useMemo(() => {
    const days = [];

    for (let index = 6; index >= 0; index -= 1) {
      const date = new Date();

      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - index);

      days.push({
        dateKey: date.toISOString().slice(0, 10),
        day: getDayLabel(date),
        scans: 0,
      });
    }

    normalizedScans.forEach((scan) => {
      if (!scan.createdAt) {
        return;
      }

      const date = new Date(scan.createdAt);

      if (Number.isNaN(date.getTime())) {
        return;
      }

      const key = date.toISOString().slice(0, 10);

      const day = days.find(
        (item) => item.dateKey === key
      );

      if (day) {
        day.scans += 1;
      }
    });

    return days;
  }, [normalizedScans]);

  // ============================================================
  // MACRO DISTRIBUTION
  // ============================================================

  const nutritionData = useMemo(() => {
    const protein = average(
      normalizedScans.map((scan) => scan.protein)
    );

    const carbs = average(
      normalizedScans.map((scan) => scan.carbs)
    );

    const fat = average(
      normalizedScans.map((scan) => scan.fat)
    );

    const values = [
      {
        name: "Protein",
        value: protein || 0,
      },
      {
        name: "Carbs",
        value: carbs || 0,
      },
      {
        name: "Fat",
        value: fat || 0,
      },
    ];

    const total = values.reduce(
      (sum, item) => sum + item.value,
      0
    );

    if (!total) {
      return [];
    }

    return values.map((item) => ({
      ...item,
      percentage: Math.round(
        (item.value / total) * 100
      ),
    }));
  }, [normalizedScans]);

  // ============================================================
  // HEALTH PROFILE
  // ============================================================

  const dietaryMode =
    profile?.dietary_mode ||
    profile?.dietaryMode ||
    "none";

  const calorieLimit = toNumber(
    profile?.calorie_limit ??
      profile?.calorieLimit
  );

  const sugarLimit = toNumber(
    profile?.max_sugar_threshold ??
      profile?.maxSugarThreshold
  );

  const sodiumLimit = toNumber(
    profile?.max_sodium_threshold ??
      profile?.maxSodiumThreshold
  );

  const strictness =
    profile?.analysis_strictness ||
    profile?.analysisStrictness ||
    "moderate";

  // ============================================================
  // RECENT SCANS
  // ============================================================

  const recentScans = sortedScans.slice(0, 5);

  // ============================================================
  // HEALTH SCORE TEXT
  // ============================================================

  const healthScore = statistics.avgScore;

  const healthMessage = useMemo(() => {
    if (healthScore === null) {
      return {
        title: "Start building your food profile.",
        description:
          "Scan food labels to build personalized health insights from your actual products.",
      };
    }

    if (healthScore >= 80) {
      return {
        title: "Your recent scans show strong results.",
        description:
          "Most of your analyzed products have maintained a relatively high safety score.",
      };
    }

    if (healthScore >= 60) {
      return {
        title: "Your food profile has room to improve.",
        description:
          "Review lower-scoring products and compare their nutrition and ingredient warnings.",
      };
    }

    return {
      title: "Several recent scans need attention.",
      description:
        "Review products with lower safety scores and use your health profile to personalize future analysis.",
    };
  }, [healthScore]);

  // ============================================================
  // LOADING
  // ============================================================

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-76px)] items-center justify-center bg-[#06110e]">
        <div className="flex flex-col items-center gap-3 text-center">
          <Loader2
            size={28}
            className="animate-spin text-emerald-400"
          />

          <p className="text-sm text-slate-500">
            Loading your health intelligence...
          </p>
        </div>
      </div>
    );
  }

  // ============================================================
  // PAGE
  // ============================================================

  return (
    <div className="min-h-[calc(100vh-76px)] bg-[#06110e]">
      <div className="mx-auto w-full max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8 xl:px-10">

        {/* ====================================================
            PAGE TITLE
        ==================================================== */}

        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]" />

              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-emerald-400">
                Personal Health Intelligence
              </p>
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Good morning, Aditya
              <span className="ml-2">👋</span>
            </h1>

            <p className="mt-1 text-xs text-slate-600 sm:text-sm">
              Your food scanning activity and health insights at a glance.
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate("/scan")}
            className="flex w-fit items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-xs font-bold text-[#03100c] shadow-[0_8px_25px_rgba(52,211,153,0.08)] transition hover:bg-emerald-300"
          >
            <Camera size={15} />
            Start New Scan
            <ArrowRight size={13} />
          </button>
        </div>

        {/* ====================================================
            ERROR
        ==================================================== */}

        {error && (
          <div className="mb-5 rounded-2xl border border-rose-400/15 bg-rose-400/[0.04] px-4 py-3 text-xs text-rose-300">
            {error}
          </div>
        )}

        {/* ====================================================
            HEALTH OVERVIEW
        ==================================================== */}

        <section className="mb-5 grid gap-4 lg:grid-cols-[1.45fr_0.65fr]">

          {/* Health Intelligence */}

          <div className="relative overflow-hidden rounded-2xl border border-emerald-400/10 bg-gradient-to-br from-emerald-400/[0.07] via-white/[0.02] to-transparent p-5 sm:p-6">
            <div className="pointer-events-none absolute right-[-80px] top-[-80px] h-[240px] w-[240px] rounded-full bg-emerald-400/[0.06] blur-[70px]" />

            <div className="relative flex flex-col justify-between gap-5 md:flex-row md:items-center">
              <div className="max-w-xl">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-400/[0.05] px-3 py-1.5">
                  <Sparkles
                    size={11}
                    className="text-emerald-400"
                  />

                  <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-emerald-300">
                    Your health intelligence
                  </span>
                </div>

                <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  {healthMessage.title}
                </h2>

                <p className="mt-2 max-w-lg text-xs leading-5 text-slate-500 sm:text-sm">
                  {healthMessage.description}
                </p>

                <div className="mt-4 flex flex-wrap gap-2">

                  <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2">
                    <Target
                      size={13}
                      className="text-emerald-400"
                    />

                    <div>
                      <p className="text-[8px] uppercase tracking-wider text-slate-600">
                        Sugar limit
                      </p>

                      <p className="text-[11px] font-semibold text-slate-200">
                        {sugarLimit !== null
                          ? `${formatNumber(sugarLimit, 1)}g`
                          : "Not set"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2">
                    <Leaf
                      size={13}
                      className="text-emerald-400"
                    />

                    <div>
                      <p className="text-[8px] uppercase tracking-wider text-slate-600">
                        Diet
                      </p>

                      <p className="text-[11px] font-semibold capitalize text-slate-200">
                        {dietaryMode === "none"
                          ? "No restriction"
                          : dietaryMode}
                      </p>
                    </div>
                  </div>

                </div>
              </div>

              {/* Health score */}

              <div className="flex shrink-0 justify-center md:pr-5">
                <div className="relative flex h-32 w-32 items-center justify-center sm:h-36 sm:w-36">
                  <div className="absolute inset-0 rounded-full border border-emerald-400/10" />

                  <div className="absolute inset-2 rounded-full border border-emerald-400/10" />

                  {healthScore !== null && (
                    <div
                      className="absolute inset-0 rounded-full"
                      style={{
                        background: `conic-gradient(#34d399 0deg ${
                          Math.min(100, Math.max(0, healthScore)) * 3.6
                        }deg, rgba(255,255,255,0.04) ${
                          Math.min(100, Math.max(0, healthScore)) * 3.6
                        }deg 360deg)`,
                        mask:
                          "radial-gradient(circle, transparent 67%, black 69%)",
                        WebkitMask:
                          "radial-gradient(circle, transparent 67%, black 69%)",
                      }}
                    />
                  )}

                  <div className="relative text-center">
                    <p className="text-3xl font-black text-white">
                      {healthScore !== null
                        ? formatNumber(healthScore, 0)
                        : "—"}
                    </p>

                    <p className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.18em] text-emerald-400">
                      Avg. Score
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Scan */}

          <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
            <div className="pointer-events-none absolute right-[-30px] top-[-30px] h-32 w-32 rounded-full bg-cyan-400/[0.04] blur-3xl" />

            <div className="relative flex h-full flex-col justify-between">
              <div>
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-400">
                  <ScanLine size={18} />
                </div>

                <h3 className="text-base font-bold text-white">
                  Scan a food label
                </h3>

                <p className="mt-2 text-xs leading-5 text-slate-600">
                  Analyze ingredients, nutrition, health risks and personalized recommendations.
                </p>
              </div>

              <button
                type="button"
                onClick={() => navigate("/scan")}
                className="mt-5 flex w-full items-center justify-between rounded-xl bg-emerald-400 px-4 py-3 text-xs font-bold text-[#03100c] transition hover:bg-emerald-300"
              >
                <span>Start a new scan</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </section>

        {/* ====================================================
            STATISTICS
        ==================================================== */}

        <section className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">

          <StatCard
            icon={ScanLine}
            label="Total Scans"
            value={statistics.total}
            description="all analyzed scans"
            iconClass="bg-emerald-400/10 text-emerald-400"
          />

          <StatCard
            icon={ShieldCheck}
            label="Safe Products"
            value={statistics.safe}
            description={
              statistics.total
                ? `${Math.round(
                    (statistics.safe / statistics.total) * 100
                  )}% of your scans`
                : "No scan data yet"
            }
            iconClass="bg-cyan-400/10 text-cyan-400"
          />

          <StatCard
            icon={CircleAlert}
            label="Risk Alerts"
            value={statistics.risks}
            description="C, D or E graded scans"
            iconClass="bg-amber-400/10 text-amber-400"
            changeType="negative"
          />

          <StatCard
            icon={Activity}
            label="Avg. Health Score"
            value={
              statistics.avgScore !== null
                ? formatNumber(statistics.avgScore, 1)
                : "—"
            }
            description="across scored scans"
            iconClass="bg-violet-400/10 text-violet-400"
          />

        </section>

        {/* ====================================================
            CHARTS
        ==================================================== */}

        <section className="mb-5 grid gap-4 xl:grid-cols-[1.4fr_0.6fr]">

          {/* Scan Activity */}

          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 sm:p-5">
            <SectionHeader
              eyebrow="Activity"
              title="Scan activity"
              description="Your scanning activity over the last 7 days."
              action={
                <button
                  type="button"
                  onClick={() => navigate("/history")}
                  className="flex items-center gap-1 text-[10px] font-medium text-slate-600 transition hover:text-emerald-400"
                >
                  View history
                  <ChevronRight size={12} />
                </button>
              }
            />

            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={weeklyScans}
                  margin={{
                    top: 5,
                    right: 5,
                    left: -25,
                    bottom: 0,
                  }}
                >
                  <defs>
                    <linearGradient
                      id="dashboardScanGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="#34d399"
                        stopOpacity={0.22}
                      />

                      <stop
                        offset="100%"
                        stopColor="#34d399"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>

                  <CartesianGrid
                    stroke="rgba(255,255,255,0.04)"
                    vertical={false}
                  />

                  <XAxis
                    dataKey="day"
                    axisLine={false}
                    tickLine={false}
                    tick={{
                      fill: "#475569",
                      fontSize: 10,
                    }}
                  />

                  <YAxis
                    allowDecimals={false}
                    axisLine={false}
                    tickLine={false}
                    tick={{
                      fill: "#475569",
                      fontSize: 10,
                    }}
                  />

                  <Tooltip
                    contentStyle={{
                      background: "#0a1713",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: "10px",
                      color: "#fff",
                      fontSize: "10px",
                    }}
                  />

                  <Area
                    type="monotone"
                    dataKey="scans"
                    stroke="#34d399"
                    strokeWidth={2}
                    fill="url(#dashboardScanGradient)"
                    dot={{
                      fill: "#34d399",
                      strokeWidth: 0,
                      r: 2.5,
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Macro Distribution */}

          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 sm:p-5">
            <SectionHeader
              eyebrow="Nutrition"
              title="Macro distribution"
              description="Average macronutrient values from available scans."
            />

            {nutritionData.length ? (
              <>
                <div className="relative mx-auto h-[170px] max-w-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={nutritionData}
                        dataKey="percentage"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={52}
                        outerRadius={70}
                        paddingAngle={4}
                        stroke="none"
                      >
                        <Cell fill="#34d399" />
                        <Cell fill="#22d3ee" />
                        <Cell fill="#a78bfa" />
                      </Pie>

                      <Tooltip
                        formatter={(value, name) => [
                          `${value}%`,
                          name,
                        ]}
                        contentStyle={{
                          background: "#0a1713",
                          border:
                            "1px solid rgba(255,255,255,0.08)",
                          borderRadius: "10px",
                          fontSize: "10px",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>

                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xl font-black text-white">
                      100%
                    </span>

                    <span className="text-[8px] uppercase tracking-wider text-slate-600">
                      Distribution
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {nutritionData.map((item, index) => {
                    const colors = [
                      "bg-emerald-400",
                      "bg-cyan-400",
                      "bg-violet-400",
                    ];

                    return (
                      <div
                        key={item.name}
                        className="text-center"
                      >
                        <div className="mb-1 flex items-center justify-center gap-1.5">
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${colors[index]}`}
                          />

                          <span className="text-[9px] text-slate-600">
                            {item.name}
                          </span>
                        </div>

                        <p className="text-xs font-bold text-white">
                          {item.percentage}%
                        </p>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="flex h-[220px] items-center justify-center text-center">
                <div>
                  <Activity
                    size={24}
                    className="mx-auto text-white/20"
                  />

                  <p className="mt-3 text-xs text-slate-500">
                    Not enough nutrition data yet.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ====================================================
            RECENT SCANS + GOALS
        ==================================================== */}

        <section className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">

          {/* Recent Scans */}

          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 sm:p-5">
            <SectionHeader
              eyebrow="History"
              title="Recent scans"
              description="Your latest analyzed products."
              action={
                <button
                  type="button"
                  onClick={() => navigate("/history")}
                  className="flex items-center gap-1 text-[10px] font-medium text-emerald-400 transition hover:text-emerald-300"
                >
                  View all
                  <ArrowRight size={12} />
                </button>
              }
            />

            {recentScans.length ? (
              <div className="space-y-1">
                {recentScans.map((scan) => (
                  <button
                    key={scan.id}
                    type="button"
                    onClick={() =>
                      navigate(`/scan/${scan.id}`)
                    }
                    className="group flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition hover:bg-white/[0.025]"
                  >
                    <GradeBadge grade={scan.grade} />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="truncate text-xs font-semibold text-white">
                          {scan.name}
                        </h4>
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[9px] text-slate-600">
                        <span>
                          {formatDateTime(scan.createdAt)}
                        </span>

                        {scan.calories !== null && (
                          <>
                            <span>•</span>
                            <span>
                              {formatNumber(scan.calories)} kcal
                            </span>
                          </>
                        )}

                        {scan.sugar !== null && (
                          <>
                            <span>•</span>
                            <span>
                              {formatNumber(scan.sugar, 1)}g sugar
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <span
                      className={`hidden rounded-full px-2 py-1 text-[8px] font-bold sm:inline ${getGradeColor(
                        scan.grade
                      )}`}
                    >
                      {scan.status}
                    </span>

                    <ChevronRight
                      size={15}
                      className="shrink-0 text-slate-700 transition group-hover:translate-x-1 group-hover:text-emerald-400"
                    />
                  </button>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center">
                <ScanLine
                  size={25}
                  className="mx-auto text-white/15"
                />

                <p className="mt-3 text-sm font-medium text-white/60">
                  No scans yet
                </p>

                <p className="mt-1 text-xs text-slate-600">
                  Start your first food label analysis.
                </p>

                <button
                  type="button"
                  onClick={() => navigate("/scan")}
                  className="mt-4 rounded-xl bg-emerald-400 px-4 py-2 text-xs font-bold text-[#03100c] transition hover:bg-emerald-300"
                >
                  Start Scan
                </button>
              </div>
            )}
          </div>

          {/* Health Goals */}

          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 sm:p-5">
            <SectionHeader
              eyebrow="Profile"
              title="Health goals"
              description="Your configured nutrition limits."
            />

            <div className="space-y-4">

              {/* Sugar */}

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-400/10 text-amber-400">
                      <Droplets size={13} />
                    </div>

                    <div>
                      <p className="text-[11px] font-semibold text-white">
                        Sugar limit
                      </p>

                      <p className="text-[8px] text-slate-700">
                        Health profile
                      </p>
                    </div>
                  </div>

                  <span className="text-[10px] font-bold text-white">
                    {sugarLimit !== null
                      ? `${formatNumber(sugarLimit, 1)}g`
                      : "Not set"}
                  </span>
                </div>

                <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                  <div className="h-full w-full rounded-full bg-amber-400/30" />
                </div>
              </div>

              {/* Calories */}

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-400/10 text-rose-400">
                      <Flame size={13} />
                    </div>

                    <div>
                      <p className="text-[11px] font-semibold text-white">
                        Calorie limit
                      </p>

                      <p className="text-[8px] text-slate-700">
                        Health profile
                      </p>
                    </div>
                  </div>

                  <span className="text-[10px] font-bold text-white">
                    {calorieLimit !== null
                      ? `${formatNumber(calorieLimit)} kcal`
                      : "Not set"}
                  </span>
                </div>

                <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                  <div className="h-full w-full rounded-full bg-rose-400/30" />
                </div>
              </div>

              {/* Sodium */}

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-400">
                      <Activity size={13} />
                    </div>

                    <div>
                      <p className="text-[11px] font-semibold text-white">
                        Sodium limit
                      </p>

                      <p className="text-[8px] text-slate-700">
                        Health profile
                      </p>
                    </div>
                  </div>

                  <span className="text-[10px] font-bold text-white">
                    {sodiumLimit !== null
                      ? `${formatNumber(sodiumLimit)} mg`
                      : "Not set"}
                  </span>
                </div>

                <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                  <div className="h-full w-full rounded-full bg-cyan-400/30" />
                </div>
              </div>

              {/* Dietary preference */}

              <div className="flex items-center justify-between rounded-xl border border-emerald-400/10 bg-emerald-400/[0.035] p-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-400">
                    <Leaf size={13} />
                  </div>

                  <div>
                    <p className="text-[11px] font-semibold text-white">
                      Dietary preference
                    </p>

                    <p className="text-[8px] text-slate-700">
                      Current profile
                    </p>
                  </div>
                </div>

                <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-[8px] font-bold uppercase tracking-wider text-emerald-400">
                  {dietaryMode === "none"
                    ? "None"
                    : dietaryMode}
                </span>
              </div>

              {/* Strictness */}

              <div className="flex items-center justify-between border-t border-white/[0.05] pt-4">
                <span className="text-[10px] text-slate-600">
                  Analysis strictness
                </span>

                <span className="text-[10px] font-semibold capitalize text-white/70">
                  {strictness}
                </span>
              </div>

              <button
                type="button"
                onClick={() => navigate("/profile")}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-4 py-2.5 text-[10px] font-semibold text-slate-400 transition hover:bg-white/[0.05] hover:text-white"
              >
                Manage health profile
                <ArrowRight size={12} />
              </button>
            </div>
          </div>
        </section>

        {/* ====================================================
            AI INSIGHT
        ==================================================== */}

        <section className="mt-4">
          <div className="relative overflow-hidden rounded-2xl border border-violet-400/10 bg-gradient-to-r from-violet-400/[0.05] via-white/[0.02] to-transparent p-4 sm:p-5">
            <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 rounded-full bg-violet-400/[0.04] blur-3xl" />

            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-400/10 text-violet-400">
                  <Sparkles size={17} />
                </div>

                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-violet-400">
                    LabelIQ Intelligence
                  </p>

                  <h3 className="mt-1 text-xs font-bold text-white sm:text-sm">
                    {statistics.total
                      ? `${statistics.total} food ${
                          statistics.total === 1
                            ? "label has"
                            : "labels have"
                        } been analyzed.`
                      : "Your intelligence profile starts with your first scan."}
                  </h3>

                  <p className="mt-1 max-w-2xl text-[10px] leading-4 text-slate-600">
                    {statistics.risks
                      ? `${statistics.risks} recent ${
                          statistics.risks === 1
                            ? "scan contains"
                            : "scans contain"
                        } a C, D or E safety grade. Review these products in your scan history.`
                      : statistics.total
                      ? "Continue scanning products to build a more complete picture of your food choices."
                      : "Scan a food label to generate personalized nutrition and ingredient insights."}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => navigate("/analytics")}
                className="flex shrink-0 items-center justify-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-4 py-2 text-[10px] font-semibold text-slate-400 transition hover:bg-white/[0.05] hover:text-white"
              >
                View analytics
                <ArrowRight size={12} />
              </button>
            </div>
          </div>
        </section>

        {/* ====================================================
            FOOTER STATUS
        ==================================================== */}

        <div className="flex flex-col gap-2 border-t border-white/[0.05] py-5 text-[9px] text-slate-700 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2
              size={11}
              className="text-emerald-500/60"
            />

            <span>
              LabelIQ intelligence system active
            </span>
          </div>

          <span>
            Data sourced from your LabelIQ scans
          </span>
        </div>
      </div>
    </div>
  );
}