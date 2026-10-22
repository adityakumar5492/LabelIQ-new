import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  FileSearch,
  Filter,
  Leaf,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import api from "../api/axios";

/* =========================================================
   Constants
========================================================= */

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 350;

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "score_high", label: "Highest score" },
  { value: "score_low", label: "Lowest score" },
];

const RANGE_OPTIONS = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "custom", label: "Custom" },
];

/* =========================================================
   Helpers
========================================================= */

const normalizeGrade = (value) => {
  if (!value) return null;

  const grade = String(value).trim().toUpperCase();

  return ["A", "B", "C", "D"].includes(grade) ? grade : null;
};

const numberValue = (value, fallback = null) => {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
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

const formatTime = (date) => {
  if (!date) return "";

  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });
};

const normalizeScan = (scan) => {
  if (!scan || typeof scan !== "object") {
    return null;
  }

  return {
    id: scan.scan_id ?? scan.scanId ?? scan.id ?? null,

    productName:
      scan.product_name ||
      scan.productName ||
      scan.name ||
      "Food label scan",

    grade: normalizeGrade(scan.safety_grade ?? scan.safetyGrade),

    score: numberValue(scan.safety_score ?? scan.safetyScore),

    createdAt: scan.created_at ?? scan.createdAt ?? null,

    assessment: scan.assessment || null,

    scanStatus: scan.scan_status || scan.scanStatus || "completed",

    hiddenSugarDetected: Boolean(
      scan.hidden_sugar_detected ?? scan.hiddenSugarDetected
    ),
  };
};

/* =========================================================
   Styles
========================================================= */

const gradeStyle = {
  A: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
  B: "border-lime-400/20 bg-lime-400/10 text-lime-300",
  C: "border-amber-400/20 bg-amber-400/10 text-amber-300",
  D: "border-red-400/20 bg-red-400/10 text-red-300",
};

const statusStyle = {
  completed: "border-emerald-400/15 bg-emerald-400/10 text-emerald-300",
  failed: "border-red-400/15 bg-red-400/10 text-red-300",
  processing: "border-amber-400/15 bg-amber-400/10 text-amber-300",
};

const chipActive =
  "border-emerald-400/20 bg-emerald-400/10 text-emerald-300";

const chipIdle =
  "border-white/10 bg-white/[0.03] text-slate-500 hover:text-slate-300";

/* =========================================================
   Components
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

function GradeBadge({ grade }) {
  if (!grade) {
    return (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-xs font-semibold text-slate-600">
        —
      </span>
    );
  }

  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-xs font-bold ${gradeStyle[grade]}`}
    >
      {grade}
    </span>
  );
}

function ScoreBadge({ score }) {
  if (score === null) {
    return (
      <span className="text-xs text-slate-600">Score unavailable</span>
    );
  }

  return (
    <span className="text-sm font-semibold text-white">
      {score.toFixed(0)}
      <span className="ml-0.5 text-xs font-normal text-slate-600">
        /100
      </span>
    </span>
  );
}

function EmptyState({ hasFilters, onClear }) {
  return (
    <GlassCard className="p-10 sm:p-14">
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10">
          <FileSearch size={28} className="text-emerald-300" />
        </div>

        <h2 className="mt-5 text-xl font-semibold text-white">
          {hasFilters ? "No matching scans" : "No scans yet"}
        </h2>

        <p className="mt-2 text-sm leading-6 text-slate-500">
          {hasFilters
            ? "Try changing your search or filters to find another scan."
            : "Scan a food product to start building your history."}
        </p>

        {hasFilters ? (
          <button
            type="button"
            onClick={onClear}
            className="mt-6 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-medium text-slate-300 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
          >
            <X size={16} />
            Clear filters
          </button>
        ) : (
          <Link
            to="/scan"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-[#03110c] transition hover:bg-emerald-300"
          >
            <FileSearch size={16} />
            Scan a food label
          </Link>
        )}
      </div>
    </GlassCard>
  );
}

function ScanCard({ scan }) {
  const navigate = useNavigate();

  const status = String(scan.scanStatus || "completed").toLowerCase();

  return (
    <button
      type="button"
      onClick={() => {
        if (scan.id) {
          navigate(`/scan/${scan.id}`);
        }
      }}
      disabled={!scan.id}
      className="group w-full text-left disabled:cursor-default"
    >
      <GlassCard className="p-4 transition duration-300 hover:border-emerald-400/20 hover:bg-white/[0.05] sm:p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-400/10 bg-emerald-400/[0.06]">
            <Leaf size={19} className="text-emerald-300" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate pr-2 text-sm font-semibold text-white sm:text-base">
                  {scan.productName}
                </h3>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays size={12} />
                    {formatDate(scan.createdAt)}
                  </span>

                  {formatTime(scan.createdAt) && (
                    <span>{formatTime(scan.createdAt)}</span>
                  )}
                </div>
              </div>

              <GradeBadge grade={scan.grade} />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <ScoreBadge score={scan.score} />

              {status && (
                <span
                  className={`rounded-lg border px-2 py-1 text-[10px] font-medium capitalize ${
                    statusStyle[status] ||
                    "border-white/10 bg-white/[0.04] text-slate-500"
                  }`}
                >
                  {status}
                </span>
              )}

              {scan.hiddenSugarDetected && (
                <span className="rounded-lg border border-amber-400/15 bg-amber-400/[0.06] px-2 py-1 text-[10px] font-medium text-amber-300">
                  Hidden sugar detected
                </span>
              )}

              {scan.assessment && (
                <span className="hidden max-w-[280px] truncate text-xs text-slate-600 md:inline">
                  {scan.assessment}
                </span>
              )}

              <ChevronRight
                size={16}
                className="ml-auto text-slate-700 transition group-hover:translate-x-0.5 group-hover:text-emerald-300"
              />
            </div>
          </div>
        </div>
      </GlassCard>
    </button>
  );
}

function Pagination({ pagination, onPageChange, disabled }) {
  const { page, totalPages, total, limit } = pagination;

  if (total === 0) return null;

  const first = (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);

  return (
    <div className="mt-6 flex flex-col items-center justify-between gap-3 sm:flex-row">
      <p className="text-xs text-slate-600">
        Showing {first}–{last} of {total} scan{total !== 1 ? "s" : ""}
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={disabled || !pagination.hasPrev}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-sm font-medium text-slate-300 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft size={15} />
          Previous
        </button>

        <span className="px-2 text-xs text-slate-500">
          Page {page} of {totalPages}
        </span>

        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={disabled || !pagination.hasNext}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-sm font-medium text-slate-300 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

/* =========================================================
   Main
========================================================= */

export default function History() {
  const navigate = useNavigate();

  const [scans, setScans] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
  });

  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState("");

  // Filter state
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [grade, setGrade] = useState("all");
  const [range, setRange] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);

  const requestId = useRef(0);

  /* =======================================================
     Debounce search
  ======================================================= */

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [searchInput]);

  /* =======================================================
     Custom range validation (client side, mirrors server)
  ======================================================= */

  const customRangeError =
    range === "custom"
      ? !fromDate && !toDate
        ? "Pick a start date, an end date, or both."
        : fromDate && toDate && fromDate > toDate
        ? "The start date cannot be after the end date."
        : ""
      : "";

  /* =======================================================
     Fetch
  ======================================================= */

  const fetchHistory = useCallback(async () => {
    if (customRangeError) {
      return;
    }

    const currentRequest = ++requestId.current;

    try {
      setFetching(true);
      setError("");

      const params = {
        page,
        limit: PAGE_SIZE,
        sort,
      };

      if (search) params.search = search;
      if (grade !== "all") params.grade = grade;

      if (range !== "all") {
        params.range = range;

        if (range === "custom") {
          if (fromDate) params.from = fromDate;
          if (toDate) params.to = toDate;
        }
      }

      const response = await api.get("/scan/history", { params });

      // Ignore stale responses
      if (currentRequest !== requestId.current) {
        return;
      }

      const body = response?.data;
      const rows = Array.isArray(body?.data) ? body.data : [];
      const meta = body?.pagination;

      // Requested page no longer exists (e.g. after filtering)
      if (meta && meta.total > 0 && page > meta.totalPages) {
        setPage(meta.totalPages);
        return;
      }

      setScans(rows.map(normalizeScan).filter(Boolean));

      if (meta) {
        setPagination(meta);
      }
    } catch (err) {
      if (currentRequest !== requestId.current) {
        return;
      }

      console.error("History fetch error:", err);

      if (err?.response?.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");

        navigate("/login", { replace: true });
        return;
      }

      setError(
        err?.response?.data?.message ||
          "Unable to load your scan history."
      );

      setScans([]);
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false);
        setFetching(false);
      }
    }
  }, [
    page,
    sort,
    search,
    grade,
    range,
    fromDate,
    toDate,
    customRangeError,
    navigate,
    reloadKey,
  ]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  /* =======================================================
     Handlers
  ======================================================= */

  const changeGrade = (value) => {
    setGrade(value);
    setPage(1);
  };

  const changeSort = (value) => {
    setSort(value);
    setPage(1);
  };

  const changeRange = (value) => {
    setRange(value);
    setPage(1);

    if (value !== "custom") {
      setFromDate("");
      setToDate("");
    }
  };

  const hasFilters =
    Boolean(search) || grade !== "all" || range !== "all";

  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setGrade("all");
    setRange("all");
    setFromDate("");
    setToDate("");
    setPage(1);
  };

  const goToPage = (next) => {
    if (next < 1 || next > pagination.totalPages) return;

    setPage(next);

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /* =======================================================
     Initial loading
  ======================================================= */

  if (loading) {
    return (
      <div className="min-h-screen bg-[#06100d] text-white">
        <div className="flex min-h-screen items-center justify-center">
          <div className="flex flex-col items-center">
            <Loader2 size={28} className="animate-spin text-emerald-400" />

            <p className="mt-3 text-sm text-slate-500">
              Loading your scan history...
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
          <Link to="/dashboard" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10">
              <Leaf size={18} className="text-emerald-300" />
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
              onClick={() => setReloadKey((value) => value + 1)}
              disabled={fetching}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-sm font-medium text-slate-300 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw
                size={15}
                className={fetching ? "animate-spin" : ""}
              />

              <span className="hidden sm:inline">Refresh</span>
            </button>

            <Link
              to="/scan"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-3.5 py-2 text-sm font-semibold text-[#03110c] transition hover:bg-emerald-300"
            >
              <FileSearch size={15} />
              <span className="hidden sm:inline">New scan</span>
            </Link>
          </div>
        </div>
      </header>

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
                <FileSearch size={14} />
                History
              </div>

              <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
                Your scan history
              </h1>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                Review the food labels you've analyzed with LabelIQ.
              </p>
            </div>

            <Link
              to="/analytics"
              className="inline-flex w-fit items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
            >
              <Sparkles size={15} />
              View analytics
            </Link>
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
                Scan history could not be loaded
              </p>

              <p className="mt-1 text-xs leading-5 text-red-200/60">
                {error}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setReloadKey((value) => value + 1)}
              className="text-xs font-semibold text-red-300 hover:text-red-200"
            >
              Retry
            </button>
          </div>
        )}

        {/* Search + Filters */}
        <GlassCard className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search
                size={17}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600"
              />

              <input
                type="text"
                value={searchInput}
                maxLength={100}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search scanned products..."
                className="h-11 w-full rounded-xl border border-white/10 bg-black/15 pl-10 pr-10 text-sm text-white outline-none transition placeholder:text-slate-700 focus:border-emerald-400/30 focus:bg-black/20"
              />

              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 transition hover:text-slate-300"
                >
                  <X size={15} />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowFilters((value) => !value)}
              className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-medium transition ${
                showFilters || hasFilters
                  ? chipActive
                  : "border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              <Filter size={15} />
              Filters
            </button>
          </div>

          {showFilters && (
            <div className="mt-4 grid gap-4 border-t border-white/8 pt-4 md:grid-cols-3">
              {/* Grade */}
              <div>
                <label className="mb-2 block text-xs font-medium text-slate-500">
                  Safety grade
                </label>

                <div className="flex flex-wrap gap-2">
                  {["all", "A", "B", "C", "D"].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => changeGrade(value)}
                      className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                        grade === value
                          ? value === "all"
                            ? chipActive
                            : gradeStyle[value]
                          : chipIdle
                      }`}
                    >
                      {value === "all" ? "All grades" : `Grade ${value}`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date range */}
              <div>
                <label className="mb-2 block text-xs font-medium text-slate-500">
                  Date range
                </label>

                <div className="flex flex-wrap gap-2">
                  {RANGE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => changeRange(option.value)}
                      className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                        range === option.value ? chipActive : chipIdle
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                {range === "custom" && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={fromDate}
                      max={toDate || undefined}
                      onChange={(event) => {
                        setFromDate(event.target.value);
                        setPage(1);
                      }}
                      aria-label="From date"
                      className="h-10 rounded-lg border border-white/10 bg-black/15 px-3 text-xs text-white outline-none [color-scheme:dark] focus:border-emerald-400/30"
                    />

                    <input
                      type="date"
                      value={toDate}
                      min={fromDate || undefined}
                      onChange={(event) => {
                        setToDate(event.target.value);
                        setPage(1);
                      }}
                      aria-label="To date"
                      className="h-10 rounded-lg border border-white/10 bg-black/15 px-3 text-xs text-white outline-none [color-scheme:dark] focus:border-emerald-400/30"
                    />
                  </div>
                )}

                {customRangeError && (
                  <p className="mt-2 text-xs text-amber-300">
                    {customRangeError}
                  </p>
                )}
              </div>

              {/* Sort */}
              <div>
                <label className="mb-2 block text-xs font-medium text-slate-500">
                  Sort by
                </label>

                <div className="flex flex-wrap gap-2">
                  {SORT_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => changeSort(option.value)}
                      className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                        sort === option.value ? chipActive : chipIdle
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between border-t border-white/8 pt-3">
            <p className="text-xs text-slate-600">
              {fetching ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 size={12} className="animate-spin" />
                  Updating...
                </span>
              ) : (
                <>
                  {pagination.total} scan
                  {pagination.total !== 1 ? "s" : ""}
                  {hasFilters ? " match your filters" : " in total"}
                </>
              )}
            </p>

            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-xs font-medium text-emerald-300 hover:text-emerald-200"
              >
                Clear filters
              </button>
            )}
          </div>
        </GlassCard>

        {/* Results */}
        <section className="mt-6">
          {scans.length === 0 && !error ? (
            fetching ? null : (
              <EmptyState hasFilters={hasFilters} onClear={clearFilters} />
            )
          ) : (
            <div
              className={`space-y-3 transition-opacity ${
                fetching ? "opacity-60" : "opacity-100"
              }`}
            >
              {scans.map((scan, index) => (
                <ScanCard key={`${scan.id}-${index}`} scan={scan} />
              ))}
            </div>
          )}

          <Pagination
            pagination={pagination}
            onPageChange={goToPage}
            disabled={fetching}
          />
        </section>

        {/* Footer */}
        <footer className="mt-10 border-t border-white/8 pt-6 text-center">
          <p className="text-xs text-slate-600">
            LabelIQ History · Scan. Understand. Decide.
          </p>
        </footer>
      </main>
    </div>
  );
}