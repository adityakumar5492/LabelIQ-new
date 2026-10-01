import React, { useEffect, useMemo, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Clock3,
  Droplets,
  ExternalLink,
  Flame,
  Leaf,
  ShieldAlert,
  Sparkles,
  Utensils,
  Zap,
} from "lucide-react";

import api from "../api/axios";

/* =========================================================
   Helpers
========================================================= */

const normalizeData = (locationState, fetchedData = null) => {
  const data =
    locationState?.scanData || fetchedData;

  if (!data) return null;

  return {
    filename: data.filename || "Food label",
    ocr: data.ocr || {},
    aiAnalysis: data.ai_analysis || {},
    rag: data.rag || {},
    analysis: data.analysis || {},
    database: data.database || {},
  };
};

const formatScore = (score) => {
  if (
    score === null ||
    score === undefined ||
    score === ""
  ) {
    return "--";
  }

  const number = Number(score);

  if (Number.isNaN(number)) {
    return "--";
  }

  return Number.isInteger(number)
    ? number
    : number.toFixed(1);
};

const formatValue = (
  value,
  fallback = "—"
) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  return value;
};

const severityConfig = {
  high: {
    label: "High",
    className:
      "border-red-400/20 bg-red-400/10 text-red-300",
    icon: CircleAlert,
  },

  medium: {
    label: "Medium",
    className:
      "border-amber-400/20 bg-amber-400/10 text-amber-300",
    icon: AlertTriangle,
  },

  low: {
    label: "Low",
    className:
      "border-cyan-400/20 bg-cyan-400/10 text-cyan-300",
    icon: ShieldAlert,
  },
};

const gradeConfig = {
  A: {
    label: "Excellent",
    className:
      "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  },

  B: {
    label: "Good",
    className:
      "border-lime-400/30 bg-lime-400/10 text-lime-300",
  },

  C: {
    label: "Moderate",
    className:
      "border-amber-400/30 bg-amber-400/10 text-amber-300",
  },

  D: {
    label: "Issues detected",
    className:
      "border-red-400/30 bg-red-400/10 text-red-300",
  },
};

/* =========================================================
   Small Components
========================================================= */

function SectionHeader({
  icon: Icon,
  eyebrow,
  title,
  description,
}) {
  return (
    <div className="mb-5">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
        <Icon size={15} />
        {eyebrow}
      </div>

      <h2 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
        {title}
      </h2>

      {description && (
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-400">
          {description}
        </p>
      )}
    </div>
  );
}

function GlassCard({
  children,
  className = "",
}) {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-white/[0.035] shadow-[0_20px_70px_rgba(0,0,0,0.2)] backdrop-blur-xl ${className}`}
    >
      {children}
    </div>
  );
}

function SeverityBadge({
  severity,
}) {
  const normalized = String(
    severity || "medium"
  ).toLowerCase();

  const config =
    severityConfig[normalized] ||
    severityConfig.medium;

  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${config.className}`}
    >
      <Icon size={12} />
      {config.label}
    </span>
  );
}

function EmptyState({ message }) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 bg-black/10 px-5 py-8 text-center">
      <CheckCircle2
        className="mx-auto mb-2 text-emerald-400"
        size={24}
      />

      <p className="text-sm text-slate-400">
        {message}
      </p>
    </div>
  );
}

/* =========================================================
   Nutrition
========================================================= */

function NutritionCard({
  nutrition,
}) {
  const values = [
    {
      label: "Calories",
      value:
        nutrition.calories !== null &&
        nutrition.calories !== undefined
          ? `${nutrition.calories} kcal`
          : "—",
      icon: Flame,
    },

    {
      label: "Protein",
      value:
        nutrition.protein_g !== null &&
        nutrition.protein_g !== undefined
          ? `${nutrition.protein_g} g`
          : "—",
      icon: Zap,
    },

    {
      label: "Carbohydrates",
      value:
        nutrition.carbohydrates_g !== null &&
        nutrition.carbohydrates_g !== undefined
          ? `${nutrition.carbohydrates_g} g`
          : "—",
      icon: Utensils,
    },

    {
      label: "Total Fat",
      value:
        nutrition.total_fat_g !== null &&
        nutrition.total_fat_g !== undefined
          ? `${nutrition.total_fat_g} g`
          : "—",
      icon: Droplets,
    },

    {
      label: "Saturated Fat",
      value:
        nutrition.saturated_fat_g !== null &&
        nutrition.saturated_fat_g !== undefined
          ? `${nutrition.saturated_fat_g} g`
          : "—",
      icon: Droplets,
    },

    {
      label: "Fiber",
      value:
        nutrition.dietary_fiber_g !== null &&
        nutrition.dietary_fiber_g !== undefined
          ? `${nutrition.dietary_fiber_g} g`
          : "—",
      icon: Leaf,
    },

    {
      label: "Total Sugars",
      value:
        nutrition.total_sugars_g !== null &&
        nutrition.total_sugars_g !== undefined
          ? `${nutrition.total_sugars_g} g`
          : "—",
      icon: Sparkles,

      danger:
        Number(nutrition.total_sugars_g) >
        Number(
          nutrition.__sugarThreshold ??
            Number.POSITIVE_INFINITY
        ),
    },

    {
      label: "Added Sugars",
      value:
        nutrition.added_sugars_g !== null &&
        nutrition.added_sugars_g !== undefined
          ? `${nutrition.added_sugars_g} g`
          : "Not declared",
      icon: Sparkles,
    },

    {
      label: "Sodium",
      value:
        nutrition.sodium_mg !== null &&
        nutrition.sodium_mg !== undefined
          ? `${nutrition.sodium_mg} mg`
          : "—",
      icon: Droplets,
    },
  ];

  return (
    <GlassCard className="p-5 sm:p-6">
      <SectionHeader
        icon={Utensils}
        eyebrow="Nutrition"
        title="Nutrition facts"
        description={`Values are based on ${
          nutrition.serving_size ||
          "the analyzed serving"
        }.`}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {values.map((item) => {
          const Icon = item.icon;

          return (
            <div
              key={item.label}
              className={`rounded-xl border p-4 ${
                item.danger
                  ? "border-red-400/20 bg-red-400/[0.06]"
                  : "border-white/8 bg-black/10"
              }`}
            >
              <div className="mb-2 flex items-center gap-2 text-slate-500">
                <Icon size={14} />

                <span className="text-xs">
                  {item.label}
                </span>
              </div>

              <div
                className={`text-base font-semibold ${
                  item.danger
                    ? "text-red-300"
                    : "text-white"
                }`}
              >
                {item.value}
              </div>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}

/* =========================================================
   Rule Match
========================================================= */

function RuleMatch({
  match,
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-black/10 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-medium text-white">
              {formatValue(
                match.rule_name,
                "Rule match"
              )}
            </h4>

            <SeverityBadge
              severity={match.severity}
            />
          </div>

          {match.matched_value && (
            <div className="mt-2 inline-flex rounded-md border border-white/8 bg-white/[0.025] px-2.5 py-1 text-xs text-slate-400">
              {match.matched_value}
            </div>
          )}
        </div>
      </div>

      {match.explanation && (
        <p className="mt-3 text-sm leading-6 text-slate-400">
          {match.explanation}
        </p>
      )}
    </div>
  );
}

/* =========================================================
   Issue Section
========================================================= */

function IssueSection({
  title,
  description,
  items,
  icon: Icon,
}) {
  if (
    !items ||
    items.length === 0
  ) {
    return null;
  }

  return (
    <div>
      <div className="mb-3 flex items-start gap-3">
        <div className="mt-0.5 rounded-lg border border-white/10 bg-white/[0.04] p-2 text-amber-300">
          <Icon size={17} />
        </div>

        <div>
          <h3 className="font-semibold text-white">
            {title}
          </h3>

          {description && (
            <p className="mt-0.5 text-xs leading-5 text-slate-500">
              {description}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2.5">
        {items.map(
          (match, index) => (
            <RuleMatch
              key={
                match.id ||
                `${match.rule_code}-${match.matched_value}-${index}`
              }
              match={match}
            />
          )
        )}
      </div>
    </div>
  );
}

/* =========================================================
   Ingredients
========================================================= */

function IngredientsCard({
  ingredients,
  ruleMatches,
}) {
  const flaggedIngredients =
    useMemo(() => {
      const values = new Set();

      ruleMatches.forEach(
        (match) => {
          if (match.matched_value) {
            values.add(
              String(
                match.matched_value
              ).toLowerCase()
            );
          }
        }
      );

      return values;
    }, [ruleMatches]);

  return (
    <GlassCard className="p-5 sm:p-6">
      <SectionHeader
        icon={Leaf}
        eyebrow="Ingredients"
        title="Ingredient breakdown"
        description="Ingredients extracted from the product label and evaluated against your configured profile."
      />

      {ingredients.length === 0 ? (
        <EmptyState message="No ingredients were saved for this scan." />
      ) : (
        <div className="flex flex-wrap gap-2">
          {ingredients.map(
            (ingredient, index) => {
              const isFlagged =
                flaggedIngredients.has(
                  String(
                    ingredient
                  ).toLowerCase()
                );

              return (
                <span
                  key={`${ingredient}-${index}`}
                  className={`rounded-lg border px-3 py-2 text-xs sm:text-sm ${
                    isFlagged
                      ? "border-amber-400/20 bg-amber-400/[0.07] text-amber-200"
                      : "border-white/8 bg-black/10 text-slate-300"
                  }`}
                >
                  {ingredient}

                  {isFlagged && (
                    <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
                      flagged
                    </span>
                  )}
                </span>
              );
            }
          )}
        </div>
      )}
    </GlassCard>
  );
}

/* =========================================================
   Allergens
========================================================= */

function AllergensCard({
  allergens,
}) {
  if (
    !allergens ||
    allergens.length === 0
  ) {
    return (
      <GlassCard className="p-5 sm:p-6">
        <SectionHeader
          icon={ShieldAlert}
          eyebrow="Allergens"
          title="Allergen information"
        />

        <EmptyState message="No allergens were returned by the analysis." />
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-5 sm:p-6">
      <SectionHeader
        icon={ShieldAlert}
        eyebrow="Allergens"
        title="Potential allergens"
        description="Allergens identified or declared in the analyzed label."
      />

      <div className="flex flex-wrap gap-2">
        {allergens.map(
          (allergen, index) => (
            <span
              key={`${allergen}-${index}`}
              className="rounded-lg border border-amber-400/20 bg-amber-400/[0.07] px-3 py-2 text-sm text-amber-200"
            >
              {allergen}
            </span>
          )
        )}
      </div>
    </GlassCard>
  );
}

/* =========================================================
   AI Insights
========================================================= */

function AIInsightsCard({
  insights,
}) {
  const [expanded, setExpanded] =
    useState(false);

  if (
    !insights ||
    (!insights.summary &&
      !insights.key_findings?.length)
  ) {
    return null;
  }

  return (
    <GlassCard className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <SectionHeader
          icon={Sparkles}
          eyebrow="AI Insights"
          title="What the analysis found"
        />

        {insights
          .ingredient_explanations
          ?.length > 0 && (
          <button
            type="button"
            onClick={() =>
              setExpanded(
                (value) => !value
              )
            }
            className="shrink-0 rounded-lg border border-white/10 bg-white/[0.04] p-2 text-slate-400 transition hover:border-white/20 hover:text-white"
            aria-label={
              expanded
                ? "Collapse ingredient explanations"
                : "Expand ingredient explanations"
            }
          >
            {expanded ? (
              <ChevronUp size={17} />
            ) : (
              <ChevronDown size={17} />
            )}
          </button>
        )}
      </div>

      {insights.summary && (
        <div className="rounded-xl border border-emerald-400/10 bg-emerald-400/[0.035] p-4">
          <p className="text-sm leading-7 text-slate-300">
            {insights.summary}
          </p>
        </div>
      )}

      {insights.key_findings
        ?.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-3 text-sm font-semibold text-white">
            Key findings
          </h3>

          <div className="space-y-2.5">
            {insights.key_findings.map(
              (finding, index) => (
                <div
                  key={index}
                  className="flex gap-3 rounded-xl border border-white/8 bg-black/10 p-3.5"
                >
                  <CheckCircle2
                    size={16}
                    className="mt-0.5 shrink-0 text-emerald-400"
                  />

                  <p className="text-sm leading-6 text-slate-400">
                    {finding}
                  </p>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {expanded &&
        insights
          .ingredient_explanations
          ?.length > 0 && (
          <div className="mt-5 border-t border-white/8 pt-5">
            <h3 className="mb-3 text-sm font-semibold text-white">
              Ingredient explanations
            </h3>

            <div className="space-y-3">
              {insights.ingredient_explanations.map(
                (item, index) => (
                  <div
                    key={`${item.ingredient}-${index}`}
                    className="rounded-xl border border-white/8 bg-black/10 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="font-medium text-white">
                        {item.ingredient}
                      </h4>

                      {item.source_name && (
                        <span className="text-[11px] text-emerald-300">
                          {item.source_name}
                        </span>
                      )}
                    </div>

                    {item.explanation && (
                      <p className="mt-2 text-sm leading-6 text-slate-400">
                        {item.explanation}
                      </p>
                    )}
                  </div>
                )
              )}
            </div>
          </div>
        )}
    </GlassCard>
  );
}

/* =========================================================
   RAG Evidence
========================================================= */

function EvidenceCard({
  rag,
}) {
  const sources =
    rag?.sources || [];

  const evidenceSources =
    sources.filter(
      (source) =>
        source?.evidence?.length > 0
    );

  if (
    evidenceSources.length === 0
  ) {
    return null;
  }

  return (
    <GlassCard className="p-5 sm:p-6">
      <SectionHeader
        icon={ExternalLink}
        eyebrow="Evidence"
        title="Ingredient evidence"
        description="Supporting evidence retrieved from the LabelIQ knowledge base."
      />

      <div className="space-y-3">
        {evidenceSources.map(
          (source, index) => (
            <div
              key={`${source.ingredient}-${index}`}
              className="rounded-xl border border-white/8 bg-black/10 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-medium text-white">
                  {source.ingredient}
                </h3>

                <span className="text-[11px] text-emerald-300">
                  Evidence found
                </span>
              </div>

              <div className="mt-3 space-y-3">
                {source.evidence.map(
                  (
                    evidence,
                    evidenceIndex
                  ) => (
                    <div
                      key={`${evidence.source_name}-${evidenceIndex}`}
                      className="rounded-lg border border-white/8 bg-white/[0.025] p-3"
                    >
                      {evidence.source_name && (
                        <p className="text-xs font-medium text-slate-300">
                          {evidence.source_name}
                        </p>
                      )}

                      {evidence.evidence && (
                        <p className="mt-2 whitespace-pre-line text-xs leading-5 text-slate-500">
                          {evidence.evidence}
                        </p>
                      )}

                      {evidence.source_url && (
                        <div className="mt-2 break-all text-[11px] text-emerald-400/80">
                          {evidence.source_url}
                        </div>
                      )}
                    </div>
                  )
                )}
              </div>
            </div>
          )
        )}
      </div>
    </GlassCard>
  );
}

/* =========================================================
   Personalization
========================================================= */

function PersonalizationCard({
  personalization,
}) {
  if (
    !personalization?.profileApplied
  ) {
    return null;
  }

  return (
    <GlassCard className="p-5 sm:p-6">
      <SectionHeader
        icon={Sparkles}
        eyebrow="Personalized"
        title="Assessment based on your profile"
        description="These results were evaluated using your configured health preferences."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/8 bg-black/10 p-4">
          <p className="text-xs text-slate-500">
            Dietary mode
          </p>

          <p className="mt-1 font-medium capitalize text-white">
            {formatValue(
              personalization.dietaryMode
            )}
          </p>
        </div>

        <div className="rounded-xl border border-white/8 bg-black/10 p-4">
          <p className="text-xs text-slate-500">
            Analysis strictness
          </p>

          <p className="mt-1 font-medium capitalize text-white">
            {formatValue(
              personalization.analysisStrictness
            )}
          </p>
        </div>
      </div>
    </GlassCard>
  );
}

/* =========================================================
   OCR
========================================================= */

function OCRCard({
  text,
}) {
  if (!text) return null;

  return (
    <details className="group rounded-2xl border border-white/10 bg-white/[0.025]">
      <summary className="flex cursor-pointer list-none items-center justify-between p-5 text-sm font-medium text-slate-300">
        <span className="flex items-center gap-2">
          <Clock3
            size={16}
            className="text-slate-500"
          />
          View extracted label text
        </span>

        <ChevronDown
          size={16}
          className="text-slate-500 transition-transform group-open:rotate-180"
        />
      </summary>

      <div className="border-t border-white/8 px-5 pb-5 pt-4">
        <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap text-xs leading-6 text-slate-500">
          {text}
        </pre>
      </div>
    </details>
  );
}

/* =========================================================
   Loading State
========================================================= */

function LoadingState() {
  return (
    <div className="min-h-screen bg-[#06100d] text-white">
      <div className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-5 py-12">
        <GlassCard className="w-full p-8 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10">
            <Sparkles
              size={26}
              className="animate-pulse text-emerald-300"
            />
          </div>

          <h1 className="text-2xl font-semibold">
            Loading scan result
          </h1>

          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-400">
            Fetching the saved analysis from LabelIQ.
          </p>
        </GlassCard>
      </div>
    </div>
  );
}

/* =========================================================
   Error State
========================================================= */

function ErrorState({
  message,
  onBack,
}) {
  return (
    <div className="min-h-screen bg-[#06100d] text-white">
      <div className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-5 py-12">
        <GlassCard className="w-full p-8 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-red-400/20 bg-red-400/10">
            <AlertTriangle
              size={26}
              className="text-red-300"
            />
          </div>

          <h1 className="text-2xl font-semibold">
            Unable to load scan
          </h1>

          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-400">
            {message}
          </p>

          <button
            type="button"
            onClick={onBack}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-[#03110c] transition hover:bg-emerald-300"
          >
            <ArrowLeft size={16} />
            Back to history
          </button>
        </GlassCard>
      </div>
    </div>
  );
}

/* =========================================================
   Main Page
========================================================= */

export default function ScanResult() {
  const location =
    useLocation();

  const navigate =
    useNavigate();

  const { scanId } =
    useParams();

  const [fetchedData, setFetchedData] =
    useState(null);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [showAllIssues, setShowAllIssues] =
    useState(false);

  /* -------------------------------------------------------
     Fetch historical scan
  ------------------------------------------------------- */

  useEffect(() => {
    const existingData =
      location.state?.scanData;

    if (existingData) {
      setFetchedData(null);
      setLoading(false);
      setError("");
      return;
    }

    if (!scanId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchScan = async () => {
      try {
        setLoading(true);
        setError("");

        const response =
          await api.get(
            `/scan/${scanId}`
          );

        if (cancelled) {
          return;
        }

        setFetchedData(
          response.data?.data || null
        );
      } catch (err) {
        if (cancelled) {
          return;
        }

        console.error(
          "Failed to fetch scan:",
          err
        );

        setError(
          err.response?.data?.message ||
            "Failed to load this scan result."
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchScan();

    return () => {
      cancelled = true;
    };
  }, [
    location.state,
    scanId,
  ]);

  const data = useMemo(
    () =>
      normalizeData(
        location.state,
        fetchedData
      ),
    [
      location.state,
      fetchedData,
    ]
  );

  /* -------------------------------------------------------
     Loading
  ------------------------------------------------------- */

  if (loading && !data) {
    return <LoadingState />;
  }

  /* -------------------------------------------------------
     Error
  ------------------------------------------------------- */

  if (error && !data) {
    return (
      <ErrorState
        message={error}
        onBack={() =>
          navigate("/history")
        }
      />
    );
  }

  /* -------------------------------------------------------
     No scan data
  ------------------------------------------------------- */

  if (!data) {
    return (
      <div className="min-h-screen bg-[#06100d] text-white">
        <div className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-5 py-12">
          <GlassCard className="w-full p-8 text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-400/10">
              <AlertTriangle
                size={26}
                className="text-amber-300"
              />
            </div>

            <h1 className="text-2xl font-semibold">
              Scan result unavailable
            </h1>

            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-400">
              This scan could not be loaded. Please open
              another scan or analyze the food label again.
            </p>

            <button
              type="button"
              onClick={() =>
                navigate("/scan")
              }
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-[#03110c] transition hover:bg-emerald-300"
            >
              <ArrowLeft size={16} />
              Back to scanner
            </button>
          </GlassCard>
        </div>
      </div>
    );
  }

  const {
    aiAnalysis,
    rag,
    analysis,
    database,
    ocr,
  } = data;

  const nutrition = {
    ...(aiAnalysis.nutrition || {}),
  };

  /*
   * Historical scans contain the saved health profile.
   * Attach the sugar threshold so NutritionCard can still
   * highlight the value when appropriate.
   */
  if (
    analysis.healthProfile
      ?.max_sugar_threshold !== null &&
    analysis.healthProfile
      ?.max_sugar_threshold !== undefined
  ) {
    nutrition.__sugarThreshold =
      Number(
        analysis.healthProfile
          .max_sugar_threshold
      );
  }

  const ingredients =
    Array.isArray(
      aiAnalysis.ingredients
    )
      ? aiAnalysis.ingredients
      : [];

  const allergens =
    Array.isArray(
      aiAnalysis.allergens
    )
      ? aiAnalysis.allergens
      : [];

  const ruleMatches =
    Array.isArray(
      analysis.ruleMatches
    )
      ? analysis.ruleMatches
      : [];

  const breakdown =
    analysis.breakdown || {};

  const grade = String(
    analysis.safetyGrade || "—"
  ).toUpperCase();

  const gradeInfo =
    gradeConfig[grade] ||
    gradeConfig.D;

  const issueCount =
    ruleMatches.length;

  const allIssueGroups = [
    {
      title:
        "General ingredient issues",

      description:
        "General rules matched against the detected ingredient list.",

      items:
        breakdown.generalIssues ||
        [],

      icon: AlertTriangle,
    },

    {
      title:
        "Personal blocklist",

      description:
        "Ingredients matched against your personal blocklist.",

      items:
        breakdown.blocklistIssues ||
        [],

      icon: ShieldAlert,
    },

    {
      title:
        "Sugar limits",

      description:
        "Nutrition values compared with your configured sugar threshold.",

      items:
        breakdown.sugarIssues ||
        [],

      icon: Sparkles,
    },

    {
      title:
        "Calorie limits",

      description:
        "Nutrition values compared with your configured calorie limit.",

      items:
        breakdown.calorieIssues ||
        [],

      icon: Flame,
    },

    {
      title:
        "Sodium limits",

      description:
        "Nutrition values compared with your configured sodium threshold.",

      items:
        breakdown.sodiumIssues ||
        [],

      icon: Droplets,
    },

    {
      title:
        "Dietary conflicts",

      description:
        "Ingredients that conflict with your selected dietary mode.",

      items:
        breakdown.dietaryConflicts ||
        [],

      icon: Leaf,
    },
  ];

  const visibleIssueGroups =
    showAllIssues
      ? allIssueGroups
      : allIssueGroups.filter(
          (group) =>
            group.items.length > 0
        );

  const hasIssues =
    issueCount > 0;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#06100d] text-white">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-[-10%] top-[-10%] h-[420px] w-[420px] rounded-full bg-emerald-500/10 blur-[120px]" />

        <div className="absolute right-[-10%] top-[20%] h-[360px] w-[360px] rounded-full bg-cyan-500/[0.06] blur-[120px]" />

        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.7) 1px, transparent 1px)",
            backgroundSize:
              "48px 48px",
          }}
        />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-white/8 bg-[#06100d]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link
            to="/"
            className="flex items-center gap-2.5"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10">
              <Leaf
                size={18}
                className="text-emerald-300"
              />
            </div>

            <span className="text-lg font-bold tracking-tight">
              Label
              <span className="text-emerald-300">
                IQ
              </span>
            </span>
          </Link>

          <button
            type="button"
            onClick={() =>
              navigate("/scan")
            }
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-sm font-medium text-slate-300 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
          >
            <ArrowLeft size={15} />

            <span className="hidden sm:inline">
              Scan another
            </span>

            <span className="sm:hidden">
              Scan
            </span>
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-10 lg:px-8">
        {/* Breadcrumb / heading */}
        <div className="mb-7">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-emerald-300">
            <Sparkles size={14} />
            Label analysis complete
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
                Your food label analysis
              </h1>

              <p className="mt-2 text-sm text-slate-400">
                {data.filename}

                {database.scanId && (
                  <>
                    <span className="mx-2 text-slate-700">
                      •
                    </span>

                    Scan #
                    {database.scanId}
                  </>
                )}
              </p>
            </div>

            <div
              className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${gradeInfo.className}`}
            >
              {grade !== "—" && (
                <span className="text-base font-bold">
                  {grade}
                </span>
              )}

              {gradeInfo.label}
            </div>
          </div>
        </div>

        {/* Hero result */}
        <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          {/* Score */}
          <GlassCard className="relative overflow-hidden p-6 sm:p-8">
            <div className="pointer-events-none absolute right-[-70px] top-[-70px] h-56 w-56 rounded-full bg-emerald-400/10 blur-[70px]" />

            <div className="relative">
              <div className="flex flex-col gap-7 sm:flex-row sm:items-center">
                <div className="relative mx-auto sm:mx-0">
                  <div className="flex h-36 w-36 flex-col items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-400/[0.045] shadow-[0_0_80px_rgba(52,211,153,0.08)]">
                    <span className="text-5xl font-bold tracking-tight text-white">
                      {grade}
                    </span>

                    <span className="mt-1 text-xs uppercase tracking-widest text-slate-500">
                      Grade
                    </span>
                  </div>
                </div>

                <div className="flex-1 text-center sm:text-left">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Safety score
                  </p>

                  <div className="mt-1 flex items-baseline justify-center gap-2 sm:justify-start">
                    <span className="text-4xl font-bold text-white">
                      {formatScore(
                        analysis.safetyScore
                      )}
                    </span>

                    <span className="text-sm text-slate-500">
                      / 100
                    </span>
                  </div>

                  <p className="mt-3 text-sm leading-6 text-slate-400">
                    {analysis.assessment ||
                      "The product has been analyzed against the available rules and your profile."}
                  </p>
                </div>
              </div>

              <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-white/8 bg-black/10 p-3">
                  <p className="text-[11px] text-slate-500">
                    Issues
                  </p>

                  <p className="mt-1 text-lg font-semibold text-white">
                    {issueCount}
                  </p>
                </div>

                <div className="rounded-xl border border-white/8 bg-black/10 p-3">
                  <p className="text-[11px] text-slate-500">
                    Ingredients
                  </p>

                  <p className="mt-1 text-lg font-semibold text-white">
                    {ingredients.length}
                  </p>
                </div>

                <div className="rounded-xl border border-white/8 bg-black/10 p-3">
                  <p className="text-[11px] text-slate-500">
                    Allergens
                  </p>

                  <p className="mt-1 text-lg font-semibold text-white">
                    {allergens.length}
                  </p>
                </div>

                <div className="rounded-xl border border-white/8 bg-black/10 p-3">
                  <p className="text-[11px] text-slate-500">
                    Hidden sugar
                  </p>

                  <p
                    className={`mt-1 text-lg font-semibold ${
                      analysis.hiddenSugarDetected
                        ? "text-amber-300"
                        : "text-emerald-300"
                    }`}
                  >
                    {analysis.hiddenSugarDetected
                      ? "Detected"
                      : "Not detected"}
                  </p>
                </div>
              </div>
            </div>
          </GlassCard>

          {/* Personalized summary */}
          <GlassCard className="p-6 sm:p-8">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
              <Sparkles size={15} />
              Personalized assessment
            </div>

            <h2 className="mt-3 text-xl font-semibold text-white">
              What matters for you
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-400">
              This analysis considers the preferences configured
              in your LabelIQ health profile.
            </p>

            {analysis.personalization?.profileApplied ? (
              <div className="mt-6 space-y-3">
                <div className="flex items-center justify-between rounded-xl border border-white/8 bg-black/10 px-4 py-3">
                  <span className="text-sm text-slate-500">
                    Dietary mode
                  </span>

                  <span className="font-medium capitalize text-white">
                    {formatValue(
                      analysis.personalization
                        .dietaryMode
                    )}
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-white/8 bg-black/10 px-4 py-3">
                  <span className="text-sm text-slate-500">
                    Strictness
                  </span>

                  <span className="font-medium capitalize text-white">
                    {formatValue(
                      analysis.personalization
                        .analysisStrictness
                    )}
                  </span>
                </div>

                {analysis.hiddenSugarDetected && (
                  <div className="flex gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-4">
                    <AlertTriangle
                      size={18}
                      className="mt-0.5 shrink-0 text-amber-300"
                    />

                    <div>
                      <p className="text-sm font-medium text-amber-200">
                        Hidden sugar detected
                      </p>

                      <p className="mt-1 text-xs leading-5 text-amber-200/60">
                        A sugar-related ingredient rule was
                        triggered in the ingredient analysis.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-6 rounded-xl border border-white/8 bg-black/10 p-4 text-sm text-slate-500">
                No personal health profile was applied to
                this analysis.
              </div>
            )}
          </GlassCard>
        </section>

        {/* Main content */}
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="space-y-6">
            {/* Issues */}
            <GlassCard className="p-5 sm:p-6">
              <SectionHeader
                icon={
                  hasIssues
                    ? CircleAlert
                    : CheckCircle2
                }
                eyebrow="Rule engine"
                title={
                  hasIssues
                    ? "Issues that need attention"
                    : "No rule violations detected"
                }
                description={
                  hasIssues
                    ? "These findings come directly from the deterministic rules applied by LabelIQ."
                    : "The configured rules did not identify any issues for this product."
                }
              />

              {hasIssues ? (
                <>
                  <div className="space-y-6">
                    {visibleIssueGroups.map(
                      (group) => (
                        <IssueSection
                          key={group.title}
                          title={group.title}
                          description={
                            group.description
                          }
                          items={group.items}
                          icon={group.icon}
                        />
                      )
                    )}
                  </div>

                  {allIssueGroups.some(
                    (group) =>
                      group.items.length ===
                      0
                  ) && (
                    <button
                      type="button"
                      onClick={() =>
                        setShowAllIssues(
                          (value) =>
                            !value
                        )
                      }
                      className="mt-6 inline-flex items-center gap-2 text-xs font-medium text-emerald-300 transition hover:text-emerald-200"
                    >
                      {showAllIssues
                        ? "Hide empty rule categories"
                        : "Show all rule categories"}

                      {showAllIssues ? (
                        <ChevronUp
                          size={14}
                        />
                      ) : (
                        <ChevronDown
                          size={14}
                        />
                      )}
                    </button>
                  )}
                </>
              ) : (
                <EmptyState message="No rule violations were found for this scan." />
              )}
            </GlassCard>

            {/* Nutrition */}
            <NutritionCard
              nutrition={nutrition}
            />

            {/* Ingredients */}
            <IngredientsCard
              ingredients={
                ingredients
              }
              ruleMatches={
                ruleMatches
              }
            />

            {/* AI */}
            <AIInsightsCard
              insights={
                aiAnalysis.ai_insights
              }
            />

            {/* Evidence */}
            <EvidenceCard
              rag={rag}
            />

            {/* OCR */}
            <OCRCard
              text={ocr.text}
            />
          </div>

          {/* Sidebar */}
          <aside className="space-y-6">
            <AllergensCard
              allergens={allergens}
            />

            <PersonalizationCard
              personalization={
                analysis.personalization
              }
            />

            {/* Scan metadata */}
            <GlassCard className="p-5 sm:p-6">
              <div className="mb-4 flex items-center gap-2">
                <Clock3
                  size={16}
                  className="text-emerald-300"
                />

                <h3 className="font-semibold text-white">
                  Scan details
                </h3>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs text-slate-500">
                    Scan ID
                  </span>

                  <span className="text-xs font-medium text-slate-300">
                    {formatValue(
                      database.scanId
                    )}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs text-slate-500">
                    Nutrition ID
                  </span>

                  <span className="text-xs font-medium text-slate-300">
                    {formatValue(
                      database.nutritionId
                    )}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs text-slate-500">
                    Ingredients saved
                  </span>

                  <span className="text-xs font-medium text-slate-300">
                    {formatValue(
                      database.ingredientsSaved
                    )}
                  </span>
                </div>
              </div>
            </GlassCard>

            {/* CTA */}
            <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.045] p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10">
                <Sparkles
                  size={18}
                  className="text-emerald-300"
                />
              </div>

              <h3 className="mt-4 font-semibold text-white">
                Analyze another label
              </h3>

              <p className="mt-1.5 text-sm leading-6 text-slate-500">
                Scan another food product to compare its
                ingredients, nutrition and personalized findings.
              </p>

              <button
                type="button"
                onClick={() =>
                  navigate("/scan")
                }
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-[#03110c] transition hover:bg-emerald-300"
              >
                <Zap size={15} />
                Scan another product
              </button>
            </div>
          </aside>
        </div>

        {/* Footer note */}
        <div className="mt-8 border-t border-white/8 pt-6 text-center">
          <p className="text-xs leading-5 text-slate-600">
            LabelIQ provides label analysis and personalized
            rule-based insights. Always review the original
            product packaging for the most current information.
          </p>
        </div>
      </main>
    </div>
  );
}