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
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Clock3,
  Droplets,
  Flag,
  Flame,
  Info,
  Leaf,
  Package,
  ShieldAlert,
  Sparkles,
  Utensils,
  Zap,
} from "lucide-react";

import api from "../api/axios";

/* =========================================================
   Helpers
========================================================= */

const isPlainObject = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value);

const asArray = (value) =>
  Array.isArray(value) ? value : [];

/*
 * Returns a finite number, or null.
 * null / undefined / "" / NaN all become null so that a
 * missing value is never shown as 0.
 * (A real 0 stays 0.)
 */
const toNumber = (value) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
};

/* 13.90 -> "13.9", 140.00 -> "140", null -> null */
const formatNumber = (value) => {
  const number = toNumber(value);

  if (number === null) return null;

  return String(Number(number.toFixed(2)));
};

/* Display only. The score itself is calculated by the backend. */
const formatScore = (score) => {
  const number = toNumber(score);

  if (number === null) return "--";

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

/* Same key the backend uses to match evidence to ingredients. */
const nameKey = (name) =>
  String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

/*
 * The page only trusts the shape it understands.
 * Anything else becomes an empty object / array so a
 * malformed response never crashes the page.
 *
 * NOTE: ai_insights is a TOP-LEVEL field of the scan response
 * (next to ai_analysis), for both a fresh scan and a saved scan.
 */
const normalizeData = (
  locationState,
  fetchedData = null
) => {
  const data =
    locationState?.scanData || fetchedData;

  if (!isPlainObject(data)) return null;

  return {
    filename:
      typeof data.filename === "string" &&
      data.filename
        ? data.filename
        : "Food label",
    ocr: isPlainObject(data.ocr)
      ? data.ocr
      : {},
    aiAnalysis: isPlainObject(
      data.ai_analysis
    )
      ? data.ai_analysis
      : {},
    aiInsights: isPlainObject(
      data.ai_insights
    )
      ? data.ai_insights
      : {},
    analysis: isPlainObject(data.analysis)
      ? data.analysis
      : {},
    database: isPlainObject(data.database)
      ? data.database
      : {},
  };
};

/*
 * Ingredient details come from the backend
 * (ai_analysis.ingredient_details). "flagged" is the
 * backend's decision, taken from stored rule matches.
 * Nothing is matched or calculated here.
 *
 * If an older response only has plain ingredient names,
 * they are shown as normal ingredients (flag state
 * unknown, never guessed).
 */
const normalizeIngredientDetails = (
  details,
  names
) => {
  const list = asArray(details)
    .filter(isPlainObject)
    .filter(
      (item) =>
        typeof item.name === "string" &&
        item.name.trim()
    )
    .map((item, index) => ({
      id: item.id ?? `ing-${index}`,
      name: item.name,
      order: toNumber(item.order) ?? index + 1,
      flagged: item.flagged === true,
      highestSeverity:
        typeof item.highest_severity ===
        "string"
          ? item.highest_severity
          : null,
      flags: asArray(item.flags).filter(
        isPlainObject
      ),
      evidence: asArray(
        item.evidence
      ).filter(isPlainObject),
    }));

  if (list.length > 0) return list;

  return asArray(names)
    .filter(
      (name) =>
        typeof name === "string" &&
        name.trim()
    )
    .map((name, index) => ({
      id: `name-${index}`,
      name,
      order: index + 1,
      flagged: false,
      highestSeverity: null,
      flags: [],
      evidence: [],
    }));
};

/*
 * Groq explanation, as stored by the backend in ai_insights:
 * { summary, key_findings, ingredient_explanations }.
 * Only cleaned for display. Nothing is generated here.
 */
const normalizeInsights = (insights) => {
  const source = isPlainObject(insights)
    ? insights
    : {};

  const summary =
    typeof source.summary === "string" &&
    source.summary.trim()
      ? source.summary.trim()
      : null;

  const keyFindings = asArray(
    source.key_findings
  ).filter(
    (item) =>
      typeof item === "string" &&
      item.trim()
  );

  const ingredientExplanations = asArray(
    source.ingredient_explanations
  )
    .filter(isPlainObject)
    .filter(
      (item) =>
        typeof item.ingredient === "string" &&
        item.ingredient.trim() &&
        typeof item.explanation === "string" &&
        item.explanation.trim()
    );

  return {
    summary,
    keyFindings,
    ingredientExplanations,
    hasAny:
      Boolean(summary) ||
      keyFindings.length > 0 ||
      ingredientExplanations.length > 0,
  };
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

const chipSeverityClass = {
  high: "border-red-400/25 bg-red-400/[0.07] text-red-200",
  medium:
    "border-amber-400/20 bg-amber-400/[0.07] text-amber-200",
  low: "border-cyan-400/20 bg-cyan-400/[0.07] text-cyan-200",
};

/*
 * Display styling for the grade the BACKEND returned.
 * No score thresholds live here.
 */
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

const gradeUnavailable = {
  label: "Grade unavailable",
  className:
    "border-white/10 bg-white/[0.04] text-slate-400",
};

/* Display labels for values the backend sends as codes */

const BASIS_LABELS = {
  "per-serving": "Per serving",
  "per-100g": "Per 100 g",
  "per-100ml": "Per 100 ml",
  "per-piece": "Per piece",
};

const FLAG_TYPE_LABELS = {
  hidden_sugar: "Hidden sugar",
  ingredient: "Ingredient rule",
  blocklist: "Personal blocklist",
  dietary: "Dietary mode",
  nutrition_limit: "Nutrition limit",
};

const FLAG_SOURCE_LABELS = {
  general: "General LabelIQ rule",
  blocklist: "Your personal blocklist",
  dietary: "Your dietary mode",
  nutrition_limit: "Your nutrition limits",
};

const basisLabel = (basis) =>
  BASIS_LABELS[basis] || "As extracted";

const flagTypeLabel = (type) =>
  FLAG_TYPE_LABELS[type] || "Rule match";

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

/*
 * Renders nothing when the severity is missing or unknown,
 * so the page never invents a severity.
 */
function SeverityBadge({ severity }) {
  const config =
    severityConfig[
      String(severity || "").toLowerCase()
    ];

  if (!config) return null;

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

/*
 * Small label that tells the reader WHERE a piece of
 * information comes from, so rule decisions, evidence and
 * AI text are never mixed up.
 *   rule     = deterministic rule engine (the decision)
 *   evidence = RAG knowledge base (supporting context)
 *   ai       = Groq (natural-language explanation)
 */
const SOURCE_TAGS = {
  rule: {
    label: "Rule decision",
    className:
      "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
  },
  evidence: {
    label: "Evidence",
    className:
      "border-cyan-400/25 bg-cyan-400/10 text-cyan-300",
  },
  ai: {
    label: "AI explanation",
    className:
      "border-violet-400/25 bg-violet-400/10 text-violet-300",
  },
};

function SourceTag({ kind }) {
  const tag = SOURCE_TAGS[kind];

  if (!tag) return null;

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tag.className}`}
    >
      {tag.label}
    </span>
  );
}

/* tone "ok" = good news, tone "info" = nothing to show */
function EmptyState({
  message,
  tone = "ok",
}) {
  const Icon =
    tone === "ok" ? CheckCircle2 : Info;

  return (
    <div className="rounded-xl border border-dashed border-white/10 bg-black/10 px-5 py-8 text-center">
      <Icon
        className={`mx-auto mb-2 ${
          tone === "ok"
            ? "text-emerald-400"
            : "text-slate-500"
        }`}
        size={24}
      />

      <p className="text-sm text-slate-400">
        {message}
      </p>
    </div>
  );
}

function Notice({ children }) {
  return (
    <div className="mb-4 flex gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3.5">
      <AlertTriangle
        size={16}
        className="mt-0.5 shrink-0 text-amber-300"
      />

      <p className="text-xs leading-5 text-amber-200/80">
        {children}
      </p>
    </div>
  );
}

/* =========================================================
   Product information (read only)
========================================================= */

function ProductInfoCard({ aiAnalysis }) {
  const packSize = isPlainObject(
    aiAnalysis.pack_size
  )
    ? aiAnalysis.pack_size.display ||
      aiAnalysis.pack_size.raw ||
      null
    : null;

  const servings = formatNumber(
    aiAnalysis.servings_per_container
  );

  const rows = [
    ["Product", aiAnalysis.product_name],
    ["Brand", aiAnalysis.brand],
    ["Variant", aiAnalysis.variant],
    ["Pack size", packSize],
    ["Servings per pack", servings],
  ];

  return (
    <GlassCard className="p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <Package
          size={16}
          className="text-emerald-300"
        />

        <h3 className="font-semibold text-white">
          Product
        </h3>
      </div>

      <div className="space-y-3">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-start justify-between gap-4"
          >
            <span className="text-xs text-slate-500">
              {label}
            </span>

            <span
              className={`text-right text-xs font-medium ${
                value
                  ? "text-slate-300"
                  : "text-slate-600"
              }`}
            >
              {value || "Not available"}
            </span>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

/* =========================================================
   Nutrition
========================================================= */

/*
 * Rows shown in the nutrition card.
 * "issueKey" points at the rule-engine breakdown group
 * that already decided whether a limit was exceeded.
 * The page never compares values with thresholds itself.
 */
const NUTRITION_ROWS = [
  {
    key: "calories",
    label: "Calories",
    unit: "kcal",
    icon: Flame,
    issueKey: "calorieIssues",
  },
  {
    key: "protein_g",
    label: "Protein",
    unit: "g",
    icon: Zap,
  },
  {
    key: "carbohydrates_g",
    label: "Carbohydrates",
    unit: "g",
    icon: Utensils,
  },
  {
    key: "total_fat_g",
    label: "Total Fat",
    unit: "g",
    icon: Droplets,
  },
  {
    key: "saturated_fat_g",
    label: "Saturated Fat",
    unit: "g",
    icon: Droplets,
  },
  {
    key: "dietary_fiber_g",
    label: "Fiber",
    unit: "g",
    icon: Leaf,
  },
  {
    key: "total_sugars_g",
    label: "Total Sugars",
    unit: "g",
    icon: Sparkles,
    issueKey: "sugarIssues",
  },
  {
    key: "added_sugars_g",
    label: "Added Sugars",
    unit: "g",
    icon: Sparkles,
  },
  {
    key: "sodium_mg",
    label: "Sodium",
    unit: "mg",
    icon: Droplets,
    issueKey: "sodiumIssues",
  },
];

function NutritionCard({
  nutrition,
  meta,
  converted,
  breakdown,
}) {
  const declaredBasis = meta?.basis || null;

  const convertedValues =
    isPlainObject(converted) &&
    isPlainObject(converted.values) &&
    converted.basis
      ? converted
      : null;

  /*
   * Tabs: the label's declared basis is always available.
   * The other basis only exists when the backend could
   * calculate it from an explicit serving size.
   */
  const tabs = useMemo(() => {
    const list = [
      {
        id: "declared",
        basis: declaredBasis,
        calculated: false,
      },
    ];

    if (convertedValues) {
      list.push({
        id: "converted",
        basis: convertedValues.basis,
        calculated: true,
      });
    }

    // Per serving first, then per 100 g / ml.
    return list.sort((a, b) => {
      const rank = (tab) =>
        tab.basis === "per-serving" ? 0 : 1;

      return rank(a) - rank(b);
    });
  }, [declaredBasis, convertedValues]);

  const [activeId, setActiveId] =
    useState("declared");

  const active =
    tabs.find((tab) => tab.id === activeId) ||
    tabs.find((tab) => tab.id === "declared");

  const showingConverted =
    active.id === "converted";

  const source = showingConverted
    ? convertedValues.values
    : nutrition;

  const hasAnyValue = NUTRITION_ROWS.some(
    (row) => toNumber(nutrition[row.key]) !== null
  );

  const servingSize =
    typeof nutrition.serving_size === "string" &&
    nutrition.serving_size.trim()
      ? nutrition.serving_size
      : null;

  const usedAi =
    meta?.source === "ai" ||
    meta?.source === "table+ai";

  return (
    <GlassCard className="p-5 sm:p-6">
      <SectionHeader
        icon={Utensils}
        eyebrow="Nutrition"
        title="Nutrition facts"
        description={`Serving size: ${
          servingSize || "Not available"
        }`}
      />

      {!hasAnyValue ? (
        <EmptyState
          tone="info"
          message="No nutrition values could be read from this label."
        />
      ) : (
        <>
          {/* Basis tabs */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {tabs.map((tab) => {
              const selected =
                tab.id === active.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  disabled={tabs.length === 1}
                  onClick={() =>
                    setActiveId(tab.id)
                  }
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                    selected
                      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                      : "border-white/10 bg-white/[0.04] text-slate-400 hover:border-white/20 hover:text-white"
                  } ${
                    tabs.length === 1
                      ? "cursor-default"
                      : ""
                  }`}
                >
                  {tab.basis
                    ? basisLabel(tab.basis)
                    : "Basis unavailable"}

                  {tab.calculated && (
                    <span className="ml-1.5 text-[10px] font-medium uppercase tracking-wide opacity-70">
                      calculated
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Basis explanation */}
          <p className="mb-4 text-xs leading-5 text-slate-500">
            {showingConverted
              ? `Calculated from the label values using the serving size (${
                  convertedValues.serving_size
                }). These numbers are not printed on the label.`
              : declaredBasis
              ? `Values as printed on the label (${basisLabel(
                  declaredBasis
                ).toLowerCase()}).`
              : "The nutrition basis could not be determined from the label."}
          </p>

          {!declaredBasis && (
            <Notice>
              It is unclear whether these values
              are per serving or per 100 g. Check
              the original packaging before
              relying on them.
            </Notice>
          )}

          {usedAi && !showingConverted && (
            <Notice>
              Some values were read with AI
              assistance because the nutrition
              table could not be fully read.
              Please verify them against the pack.
            </Notice>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {NUTRITION_ROWS.map((row) => {
              const Icon = row.icon;

              const formatted = formatNumber(
                source[row.key]
              );

              /*
               * The rule engine compared the stored
               * (declared basis) values, so the limit
               * highlight is only shown for that view.
               */
              const danger =
                !showingConverted &&
                row.issueKey &&
                asArray(
                  breakdown?.[row.issueKey]
                ).length > 0;

              const derivedFromSalt =
                row.key === "sodium_mg" &&
                formatted !== null &&
                meta?.sodium_source === "salt";

              return (
                <div
                  key={row.key}
                  className={`rounded-xl border p-4 ${
                    danger
                      ? "border-red-400/20 bg-red-400/[0.06]"
                      : "border-white/8 bg-black/10"
                  }`}
                >
                  <div className="mb-2 flex items-center gap-2 text-slate-500">
                    <Icon size={14} />

                    <span className="text-xs">
                      {row.label}
                    </span>
                  </div>

                  {formatted !== null ? (
                    <div
                      className={`text-base font-semibold ${
                        danger
                          ? "text-red-300"
                          : "text-white"
                      }`}
                    >
                      {formatted} {row.unit}
                    </div>
                  ) : (
                    <div className="text-sm text-slate-600">
                      Not available
                    </div>
                  )}

                  {danger && (
                    <p className="mt-1.5 text-[11px] text-red-300/70">
                      Exceeds your limit
                    </p>
                  )}

                  {derivedFromSalt && (
                    <p className="mt-1.5 text-[11px] leading-4 text-slate-500">
                      {!showingConverted &&
                      toNumber(meta.salt_g) !==
                        null
                        ? `Derived from salt: ${formatNumber(
                            meta.salt_g
                          )} g × 400`
                        : "Derived from the salt value on the label"}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </GlassCard>
  );
}

/* =========================================================
   Rule Match (rule engine overview)
========================================================= */

function RuleMatch({ match }) {
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

          <div className="mt-2 flex flex-wrap gap-2">
            {match.rule_code && (
              <span className="inline-flex rounded-md border border-white/8 bg-white/[0.025] px-2.5 py-1 font-mono text-[11px] text-slate-500">
                {match.rule_code}
              </span>
            )}

            {match.matched_value && (
              <span className="inline-flex rounded-md border border-white/8 bg-white/[0.025] px-2.5 py-1 text-xs text-slate-400">
                Matched: {match.matched_value}
              </span>
            )}
          </div>
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
  if (!items || items.length === 0) {
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
        {items.map((match, index) => (
          <RuleMatch
            key={
              match.id ||
              `${match.rule_code}-${match.matched_value}-${index}`
            }
            match={match}
          />
        ))}
      </div>
    </div>
  );
}

/* =========================================================
   Personalized warnings
   Built only from the rule engine's personal rule groups
   (blocklist, calorie / sugar / sodium limits, dietary mode).
   Nothing is evaluated here.
========================================================= */

function PersonalizedWarningsCard({
  groups,
  personalization,
}) {
  const profileApplied = Boolean(
    personalization?.profileApplied
  );

  const warnings = groups.flatMap((group) =>
    group.items.map((match) => ({
      ...match,
      groupTitle: group.title,
    }))
  );

  return (
    <GlassCard className="p-5 sm:p-6">
      <SectionHeader
        icon={ShieldAlert}
        eyebrow="Personalized warnings"
        title={
          warnings.length > 0
            ? `${warnings.length} ${
                warnings.length === 1
                  ? "warning"
                  : "warnings"
              } for your profile`
            : "No personalized warnings"
        }
        description="Warnings come from LabelIQ's deterministic rules applied to your blocklist, nutrition limits and dietary mode."
      />

      {warnings.length === 0 ? (
        <EmptyState
          message={
            profileApplied
              ? "This product did not conflict with your configured profile."
              : "No personal health profile was applied, so no personalized warnings were generated."
          }
        />
      ) : (
        <div className="space-y-3">
          {warnings.map((warning, index) => (
            <div
              key={
                warning.id ||
                `${warning.rule_code}-${warning.matched_value}-${index}`
              }
              className="rounded-xl border border-white/8 bg-black/10 p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <SourceTag kind="rule" />

                <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-0.5 text-[11px] font-semibold text-slate-200">
                  {warning.groupTitle}
                </span>

                <SeverityBadge
                  severity={warning.severity}
                />
              </div>

              <h4 className="mt-3 font-medium text-white">
                {formatValue(
                  warning.rule_name,
                  "Rule match"
                )}
              </h4>

              {warning.matched_value && (
                <p className="mt-1 text-xs text-slate-400">
                  Detected:{" "}
                  <span className="text-slate-300">
                    {warning.matched_value}
                  </span>
                </p>
              )}

              {warning.explanation && (
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  {warning.explanation}
                </p>
              )}

              {warning.rule_code && (
                <p className="mt-2 font-mono text-[11px] text-slate-600">
                  {warning.rule_code}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}

/* =========================================================
   Ingredients
========================================================= */

function IngredientsCard({ ingredients }) {
  const flaggedCount = ingredients.filter(
    (ingredient) => ingredient.flagged
  ).length;

  return (
    <GlassCard className="p-5 sm:p-6">
      <SectionHeader
        icon={Leaf}
        eyebrow="Ingredients"
        title="Ingredient list"
        description="Ingredients in the order printed on the label. Flagged ingredients matched a LabelIQ rule."
      />

      {ingredients.length === 0 ? (
        <EmptyState
          tone="info"
          message="No ingredients were found for this scan."
        />
      ) : (
        <>
          <p className="mb-4 text-xs text-slate-500">
            {ingredients.length}{" "}
            {ingredients.length === 1
              ? "ingredient"
              : "ingredients"}
            {" · "}
            {flaggedCount} flagged
          </p>

          <div className="flex flex-wrap gap-2">
            {ingredients.map((ingredient) => {
              const firstFlag =
                ingredient.flags[0];

              const chipClass =
                ingredient.flagged
                  ? chipSeverityClass[
                      ingredient
                        .highestSeverity
                    ] ||
                    chipSeverityClass.medium
                  : "border-white/8 bg-black/10 text-slate-300";

              return (
                <span
                  key={ingredient.id}
                  className={`rounded-lg border px-3 py-2 text-xs sm:text-sm ${chipClass}`}
                >
                  <span className="mr-1.5 text-slate-500">
                    {ingredient.order}.
                  </span>

                  {ingredient.name}

                  {ingredient.flagged && (
                    <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide opacity-80">
                      {firstFlag
                        ? flagTypeLabel(
                            firstFlag.flag_type
                          )
                        : "Flagged"}
                      {ingredient.flags.length >
                        1 &&
                        ` +${
                          ingredient.flags
                            .length - 1
                        }`}
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        </>
      )}
    </GlassCard>
  );
}

/* =========================================================
   RAG evidence (supporting context only)
========================================================= */

function EvidenceList({ evidence }) {
  if (evidence.length === 0) {
    return (
      <p className="text-xs leading-5 text-slate-600">
        No supporting evidence is available in
        the LabelIQ knowledge base for this
        ingredient.
      </p>
    );
  }

  return (
    <div className="space-y-2.5">
      {evidence.map((item, index) => (
        <div
          key={`${item.name}-${index}`}
          className="rounded-lg border border-white/8 bg-white/[0.025] p-3"
        >
          {item.name && (
            <p className="text-xs font-medium capitalize text-slate-300">
              {item.name}
            </p>
          )}

          {item.description && (
            <p className="mt-1.5 text-xs leading-5 text-slate-400">
              {item.description}
            </p>
          )}

          {item.purpose && (
            <p className="mt-1.5 text-xs leading-5 text-slate-500">
              <span className="text-slate-400">
                Purpose:
              </span>{" "}
              {item.purpose}
            </p>
          )}

          {item.source && (
            <p className="mt-1.5 text-[11px] text-cyan-300/80">
              Source: {item.source}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

/* =========================================================
   Flagged ingredients
   Ingredient -> Rule decision -> Evidence -> AI explanation
   Each source is shown in its own labelled block.
========================================================= */

function FlagReason({ flag }) {
  const details = [
    ["Rule", flag.rule_name],
    ["Rule code", flag.rule_code],
    ["Matched value", flag.matched_value],
    ["Configured pattern", flag.rule_pattern],
    [
      "Rule source",
      FLAG_SOURCE_LABELS[flag.category] ||
        null,
    ],
  ].filter(([, value]) => value);

  return (
    <div className="rounded-xl border border-white/8 bg-black/10 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] font-semibold text-slate-200">
          {flagTypeLabel(flag.flag_type)}
        </span>

        <SeverityBadge
          severity={flag.severity}
        />
      </div>

      <p className="mt-3 text-sm leading-6 text-slate-300">
        {flag.explanation ||
          "No explanation was stored for this rule match."}
      </p>

      <dl className="mt-3 grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-[auto_1fr]">
        {details.map(([label, value]) => (
          <React.Fragment key={label}>
            <dt className="text-slate-500">
              {label}
            </dt>

            <dd className="break-words text-slate-300">
              {value}
            </dd>
          </React.Fragment>
        ))}
      </dl>
    </div>
  );
}

function FlaggedIngredient({
  ingredient,
  aiExplanation,
  aiAvailable,
}) {
  const [showEvidence, setShowEvidence] =
    useState(false);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-white">
          <span className="mr-2 text-sm font-normal text-slate-500">
            {ingredient.order}.
          </span>

          {ingredient.name}
        </h3>

        <SeverityBadge
          severity={ingredient.highestSeverity}
        />
      </div>

      {/* 1. Rule decision */}
      <div className="mb-3 mt-4 flex items-center gap-2">
        <SourceTag kind="rule" />

        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Why was this flagged?
        </span>
      </div>

      <div className="space-y-2.5">
        {ingredient.flags.map(
          (flag, index) => (
            <FlagReason
              key={flag.id || `${flag.rule_code}-${index}`}
              flag={flag}
            />
          )
        )}
      </div>

      {/* 2. Evidence (does not decide anything) */}
      <div className="mt-5">
        <button
          type="button"
          onClick={() =>
            setShowEvidence((value) => !value)
          }
          className="inline-flex items-center gap-2 text-xs font-medium text-cyan-300 transition hover:text-cyan-200"
        >
          <BookOpen size={14} />

          {showEvidence
            ? "Hide supporting evidence"
            : "Show supporting evidence"}

          {showEvidence ? (
            <ChevronUp size={14} />
          ) : (
            <ChevronDown size={14} />
          )}
        </button>

        {showEvidence && (
          <div className="mt-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <SourceTag kind="evidence" />

              <span className="text-[11px] text-slate-500">
                Background knowledge only. It
                did not decide this flag.
              </span>
            </div>

            <EvidenceList
              evidence={ingredient.evidence}
            />
          </div>
        )}
      </div>

      {/* 3. AI explanation (does not decide anything) */}
      {aiExplanation && (
        <div className="mt-5 rounded-xl border border-violet-400/15 bg-violet-400/[0.04] p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <SourceTag kind="ai" />

            {aiExplanation.source_name && (
              <span className="text-[11px] text-slate-500">
                {aiExplanation.source_name}
              </span>
            )}
          </div>

          <p className="text-sm leading-6 text-slate-300">
            {aiExplanation.explanation}
          </p>
        </div>
      )}

      {!aiExplanation && !aiAvailable && (
        <p className="mt-4 text-[11px] leading-4 text-slate-600">
          No AI explanation was generated for
          this scan.
        </p>
      )}
    </div>
  );
}

function FlaggedIngredientsCard({
  ingredients,
  insights,
}) {
  const flagged = ingredients.filter(
    (ingredient) => ingredient.flagged
  );

  const explanationLookup = useMemo(() => {
    const lookup = new Map();

    for (const item of insights.ingredientExplanations) {
      lookup.set(nameKey(item.ingredient), item);
    }

    return lookup;
  }, [insights]);

  return (
    <GlassCard className="p-5 sm:p-6">
      <SectionHeader
        icon={Flag}
        eyebrow="Flagged ingredients"
        title={
          flagged.length > 0
            ? `${flagged.length} flagged ${
                flagged.length === 1
                  ? "ingredient"
                  : "ingredients"
              }`
            : "No flagged ingredients"
        }
        description="Flags come from LabelIQ's deterministic rules. Evidence and AI text only explain a flag. They never change the score."
      />

      {flagged.length === 0 ? (
        <EmptyState message="None of the ingredients matched a rule." />
      ) : (
        <div className="space-y-4">
          {flagged.map((ingredient) => (
            <FlaggedIngredient
              key={ingredient.id}
              ingredient={ingredient}
              aiExplanation={
                explanationLookup.get(
                  nameKey(ingredient.name)
                ) || null
              }
              aiAvailable={insights.hasAny}
            />
          ))}
        </div>
      )}
    </GlassCard>
  );
}

/*
 * Knowledge-base context for ingredients that were NOT
 * flagged (flagged ones show their evidence above).
 * Hidden when there is nothing to show.
 */
function IngredientKnowledgeCard({
  ingredients,
}) {
  const items = ingredients.filter(
    (ingredient) =>
      !ingredient.flagged &&
      ingredient.evidence.length > 0
  );

  if (items.length === 0) return null;

  return (
    <GlassCard className="p-5 sm:p-6">
      <SectionHeader
        icon={BookOpen}
        eyebrow="Evidence"
        title="Ingredient knowledge"
        description="Supporting context from the LabelIQ knowledge base for other ingredients on this label. This is information only. It is not a safety decision."
      />

      <div className="space-y-3">
        {items.map((ingredient) => (
          <div
            key={ingredient.id}
            className="rounded-xl border border-white/8 bg-black/10 p-4"
          >
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h3 className="font-medium text-white">
                {ingredient.name}
              </h3>

              <SourceTag kind="evidence" />
            </div>

            <EvidenceList
              evidence={ingredient.evidence}
            />
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

/* =========================================================
   Allergens
========================================================= */

function AllergensCard({ allergens }) {
  const confirmed = Array.isArray(
    allergens?.confirmed
  )
    ? allergens.confirmed
    : [];

  const mayContain = Array.isArray(
    allergens?.may_contain
  )
    ? allergens.may_contain
    : [];

  const hasConfirmed = confirmed.length > 0;
  const hasMayContain = mayContain.length > 0;

  if (!hasConfirmed && !hasMayContain) {
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
        description="Confirmed allergens are separated from may-contain warnings found on the label."
      />

      {hasConfirmed && (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <CheckCircle2
              size={15}
              className="text-emerald-300"
            />

            <h4 className="text-sm font-semibold text-white">
              Confirmed
            </h4>
          </div>

          <div className="flex flex-wrap gap-2">
            {confirmed.map((allergen, index) => (
              <span
                key={`confirmed-${allergen}-${index}`}
                className="rounded-lg border border-red-400/20 bg-red-400/[0.07] px-3 py-2 text-sm text-red-200"
              >
                {allergen}
              </span>
            ))}
          </div>
        </div>
      )}

      {hasMayContain && (
        <div
          className={
            hasConfirmed ? "mt-5" : ""
          }
        >
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle
              size={15}
              className="text-amber-300"
            />

            <h4 className="text-sm font-semibold text-white">
              May contain
            </h4>
          </div>

          <div className="flex flex-wrap gap-2">
            {mayContain.map((allergen, index) => (
              <span
                key={`may-contain-${allergen}-${index}`}
                className="rounded-lg border border-amber-400/20 bg-amber-400/[0.07] px-3 py-2 text-sm text-amber-200"
              >
                {allergen}
              </span>
            ))}
          </div>

          <p className="mt-3 text-xs leading-5 text-slate-500">
            "May contain" indicates possible
            cross-contact and does not mean the
            allergen was confirmed as an ingredient.
          </p>
        </div>
      )}
    </GlassCard>
  );
}

/* =========================================================
   AI explanation (Groq, from the backend)
   Summary / Key findings / Ingredient explanations.
   Presentation only: nothing is generated in the browser.
========================================================= */

function AIInsightsCard({ insights }) {
  return (
    <GlassCard className="p-5 sm:p-6">
      <SectionHeader
        icon={Sparkles}
        eyebrow="AI explanation"
        title="What the analysis found"
        description="Written by AI to explain the rule results in plain language. It does not change the score, grade or any flag."
      />

      {!insights.hasAny ? (
        <EmptyState
          tone="info"
          message="No AI explanation is available for this scan."
        />
      ) : (
        <>
          {insights.summary && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-white">
                Summary
              </h3>

              <div className="rounded-xl border border-violet-400/15 bg-violet-400/[0.04] p-4">
                <p className="text-sm leading-7 text-slate-300">
                  {insights.summary}
                </p>
              </div>
            </div>
          )}

          {insights.keyFindings.length > 0 && (
            <div className="mt-5">
              <h3 className="mb-3 text-sm font-semibold text-white">
                Key findings
              </h3>

              <div className="space-y-2.5">
                {insights.keyFindings.map(
                  (finding, index) => (
                    <div
                      key={index}
                      className="flex gap-3 rounded-xl border border-white/8 bg-black/10 p-3.5"
                    >
                      <CheckCircle2
                        size={16}
                        className="mt-0.5 shrink-0 text-violet-300"
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

          {insights.ingredientExplanations
            .length > 0 && (
            <div className="mt-5 border-t border-white/8 pt-5">
              <h3 className="mb-3 text-sm font-semibold text-white">
                Ingredient explanations
              </h3>

              <div className="space-y-3">
                {insights.ingredientExplanations.map(
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
                          <span className="text-[11px] text-slate-500">
                            {item.source_name}
                          </span>
                        )}
                      </div>

                      <p className="mt-2 text-sm leading-6 text-slate-400">
                        {item.explanation}
                      </p>
                    </div>
                  )
                )}
              </div>
            </div>
          )}
        </>
      )}
    </GlassCard>
  );
}

/* =========================================================
   Personalization
========================================================= */

function PersonalizationCard({
  personalization,
}) {
  if (!personalization?.profileApplied) {
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

function OCRCard({ text }) {
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
            Fetching the saved analysis from
            LabelIQ.
          </p>
        </GlassCard>
      </div>
    </div>
  );
}

/* =========================================================
   Error State
========================================================= */

function ErrorState({ message, onBack }) {
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
  const location = useLocation();

  const navigate = useNavigate();

  const { scanId } = useParams();

  const [fetchedData, setFetchedData] =
    useState(null);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] = useState("");

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

        const response = await api.get(
          `/scan/${scanId}`
        );

        if (cancelled) {
          return;
        }

        const payload = response.data?.data;

        // A response that is not an object cannot be rendered.
        if (!isPlainObject(payload)) {
          setFetchedData(null);
          setError(
            "The server returned an unexpected response for this scan."
          );
          return;
        }

        setFetchedData(payload);
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
  }, [location.state, scanId]);

  const data = useMemo(
    () =>
      normalizeData(
        location.state,
        fetchedData
      ),
    [location.state, fetchedData]
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
        onBack={() => navigate("/history")}
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
              This scan could not be loaded.
              Please open another scan or
              analyze the food label again.
            </p>

            <button
              type="button"
              onClick={() => navigate("/scan")}
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
    aiInsights,
    analysis,
    database,
    ocr,
  } = data;

  const nutrition = isPlainObject(
    aiAnalysis.nutrition
  )
    ? aiAnalysis.nutrition
    : {};

  const nutritionMeta = isPlainObject(
    aiAnalysis.nutrition_meta
  )
    ? aiAnalysis.nutrition_meta
    : null;

  const nutritionConverted = isPlainObject(
    aiAnalysis.nutrition_converted
  )
    ? aiAnalysis.nutrition_converted
    : null;

  const ingredients =
    normalizeIngredientDetails(
      aiAnalysis.ingredient_details,
      aiAnalysis.ingredients
    );

  const insights = normalizeInsights(
    aiInsights
  );

  const allergens = isPlainObject(
  aiAnalysis.allergens
)
  ? {
      confirmed: asArray(
        aiAnalysis.allergens.confirmed
      ),
      may_contain: asArray(
        aiAnalysis.allergens.may_contain
      ),
    }
  : {
      confirmed: [],
      may_contain: [],
    };

  const ruleMatches = asArray(
    analysis.ruleMatches
  );

  const breakdown = isPlainObject(
    analysis.breakdown
  )
    ? analysis.breakdown
    : {};

  /* Score and grade are the backend's values, shown as-is. */
  const rawGrade = String(
    analysis.safetyGrade || ""
  ).toUpperCase();

  const grade = gradeConfig[rawGrade]
    ? rawGrade
    : "—";

  const gradeInfo =
    gradeConfig[rawGrade] ||
    gradeUnavailable;

  const issueCount = ruleMatches.length;

  const generalGroup = {
    title: "General ingredient issues",

    description:
      "General rules matched against the detected ingredient list.",

    items: asArray(breakdown.generalIssues),

    icon: AlertTriangle,
  };

  const personalGroups = [
    {
      title: "Personal blocklist",

      description:
        "Ingredients matched against your personal blocklist.",

      items: asArray(
        breakdown.blocklistIssues
      ),

      icon: ShieldAlert,
    },

    {
      title: "Sugar limit",

      description:
        "Nutrition values compared with your configured sugar threshold.",

      items: asArray(breakdown.sugarIssues),

      icon: Sparkles,
    },

    {
      title: "Calorie limit",

      description:
        "Nutrition values compared with your configured calorie limit.",

      items: asArray(breakdown.calorieIssues),

      icon: Flame,
    },

    {
      title: "Sodium limit",

      description:
        "Nutrition values compared with your configured sodium threshold.",

      items: asArray(breakdown.sodiumIssues),

      icon: Droplets,
    },

    {
      title: "Dietary conflict",

      description:
        "Ingredients that conflict with your selected dietary mode.",

      items: asArray(
        breakdown.dietaryConflicts
      ),

      icon: Leaf,
    },
  ];

  const allIssueGroups = [
    generalGroup,
    ...personalGroups,
  ];

  const visibleIssueGroups = showAllIssues
    ? allIssueGroups
    : allIssueGroups.filter(
        (group) => group.items.length > 0
      );

  const hasIssues = issueCount > 0;

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
            backgroundSize: "48px 48px",
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
            onClick={() => navigate("/scan")}
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
                    Scan #{database.scanId}
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
                    Health score
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

                  <p className="mt-2 text-[11px] leading-4 text-slate-600">
                    Score and grade are calculated
                    by LabelIQ's deterministic
                    rule engine.
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
              This analysis considers the
              preferences configured in your
              LabelIQ health profile.
            </p>

            {analysis.personalization
              ?.profileApplied ? (
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
                        A sugar-related
                        ingredient rule was
                        triggered in the
                        ingredient analysis.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-6 rounded-xl border border-white/8 bg-black/10 p-4 text-sm text-slate-500">
                No personal health profile was
                applied to this analysis.
              </div>
            )}
          </GlassCard>
        </section>

        {/* Main content */}
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="space-y-6">
            {/* Nutrition */}
            <NutritionCard
              nutrition={nutrition}
              meta={nutritionMeta}
              converted={nutritionConverted}
              breakdown={breakdown}
            />

            {/* Ingredients */}
            <IngredientsCard
              ingredients={ingredients}
            />

            {/* Flagged ingredients:
                rule decision -> evidence -> AI explanation */}
            {ingredients.length > 0 && (
              <FlaggedIngredientsCard
                ingredients={ingredients}
                insights={insights}
              />
            )}

            {/* Personalized warnings */}
            <PersonalizedWarningsCard
              groups={personalGroups}
              personalization={
                analysis.personalization
              }
            />

            {/* Rule engine breakdown */}
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
                    ? "Rule breakdown"
                    : "No rule violations detected"
                }
                description={
                  hasIssues
                    ? "Every rule that affected this analysis. These findings come directly from the deterministic rules applied by LabelIQ."
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
                      group.items.length === 0
                  ) && (
                    <button
                      type="button"
                      onClick={() =>
                        setShowAllIssues(
                          (value) => !value
                        )
                      }
                      className="mt-6 inline-flex items-center gap-2 text-xs font-medium text-emerald-300 transition hover:text-emerald-200"
                    >
                      {showAllIssues
                        ? "Hide empty rule categories"
                        : "Show all rule categories"}

                      {showAllIssues ? (
                        <ChevronUp size={14} />
                      ) : (
                        <ChevronDown size={14} />
                      )}
                    </button>
                  )}
                </>
              ) : (
                <EmptyState message="No rule violations were found for this scan." />
              )}
            </GlassCard>

            {/* Evidence for the other ingredients */}
            <IngredientKnowledgeCard
              ingredients={ingredients}
            />

            {/* AI explanation */}
            <AIInsightsCard
              insights={insights}
            />

            {/* OCR */}
            <OCRCard text={ocr.text} />
          </div>

          {/* Sidebar */}
          <aside className="space-y-6">
            <ProductInfoCard
              aiAnalysis={aiAnalysis}
            />

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
                Scan another food product to
                compare its ingredients,
                nutrition and personalized
                findings.
              </p>

              <button
                type="button"
                onClick={() => navigate("/scan")}
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
            LabelIQ provides label analysis and
            personalized rule-based insights.
            Always review the original product
            packaging for the most current
            information.
          </p>
        </div>
      </main>
    </div>
  );
}