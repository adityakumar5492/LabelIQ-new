import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  Leaf,
  Loader2,
  Save,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import api from "../api/axios";

/* =========================================================
   Constants
========================================================= */

const DEFAULT_PROFILE = {
  calorieLimit: "",
  maxSugarThreshold: "",
  maxSodiumThreshold: "",
  dietaryMode: "none",
  analysisStrictness: "moderate",
};

const DIETARY_OPTIONS = [
  {
    value: "none",
    label: "No specific diet",
    description:
      "Analyze products without a specific dietary restriction.",
  },
  {
    value: "vegan",
    label: "Vegan",
    description:
      "Flag ingredients that conflict with a vegan diet.",
  },
  {
    value: "vegetarian",
    label: "Vegetarian",
    description:
      "Flag ingredients that conflict with a vegetarian diet.",
  },
];

const STRICTNESS_OPTIONS = [
  {
    value: "low",
    label: "Low",
    description:
      "Focus mainly on stronger and clearer concerns.",
  },
  {
    value: "moderate",
    label: "Moderate",
    description:
      "Balanced analysis for everyday food decisions.",
  },
  {
    value: "high",
    label: "High",
    description:
      "Apply stricter rules to potential concerns.",
  },
];

/* =========================================================
   Helpers
========================================================= */

const normalizeProfile = (profile) => {
  if (!profile) {
    return { ...DEFAULT_PROFILE };
  }

  return {
    calorieLimit:
      profile.calorie_limit ??
      profile.calorieLimit ??
      "",

    maxSugarThreshold:
      profile.max_sugar_threshold ??
      profile.maxSugarThreshold ??
      "",

    maxSodiumThreshold:
      profile.max_sodium_threshold ??
      profile.maxSodiumThreshold ??
      "",

    dietaryMode:
      profile.dietary_mode ??
      profile.dietaryMode ??
      "none",

    analysisStrictness:
      profile.analysis_strictness ??
      profile.analysisStrictness ??
      "moderate",
  };
};

const validateProfile = (profile) => {
  const errors = {};

  if (
    profile.calorieLimit !== "" &&
    (!Number.isFinite(Number(profile.calorieLimit)) ||
      Number(profile.calorieLimit) < 0)
  ) {
    errors.calorieLimit =
      "Enter a valid calorie limit.";
  }

  if (
    profile.maxSugarThreshold !== "" &&
    (!Number.isFinite(
      Number(profile.maxSugarThreshold)
    ) ||
      Number(profile.maxSugarThreshold) < 0)
  ) {
    errors.maxSugarThreshold =
      "Enter a valid sugar threshold.";
  }

  if (
    profile.maxSodiumThreshold !== "" &&
    (!Number.isFinite(
      Number(profile.maxSodiumThreshold)
    ) ||
      Number(profile.maxSodiumThreshold) < 0)
  ) {
    errors.maxSodiumThreshold =
      "Enter a valid sodium threshold.";
  }

  if (
    !["none", "vegan", "vegetarian"].includes(
      profile.dietaryMode
    )
  ) {
    errors.dietaryMode =
      "Select a valid dietary preference.";
  }

  if (
    !["low", "moderate", "high"].includes(
      profile.analysisStrictness
    )
  ) {
    errors.analysisStrictness =
      "Select a valid analysis strictness.";
  }

  return errors;
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

function SectionHeader({
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
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500">
          {description}
        </p>
      )}
    </div>
  );
}

function NumberField({
  label,
  description,
  value,
  onChange,
  error,
  unit,
  placeholder,
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300">
        {label}
      </label>

      <p className="mt-1 text-xs leading-5 text-slate-600">
        {description}
      </p>

      <div className="relative mt-3">
        <input
          type="number"
          min="0"
          step="any"
          value={value}
          onChange={(event) =>
            onChange(event.target.value)
          }
          placeholder={placeholder}
          className={`h-11 w-full rounded-xl border bg-black/15 px-4 pr-16 text-sm text-white outline-none transition placeholder:text-slate-700 ${
            error
              ? "border-red-400/30 focus:border-red-400/50"
              : "border-white/10 focus:border-emerald-400/30"
          }`}
        />

        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-600">
          {unit}
        </span>
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}

function OptionCard({
  selected,
  title,
  description,
  onClick,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border p-4 text-left transition ${
        selected
          ? "border-emerald-400/30 bg-emerald-400/[0.08]"
          : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
            selected
              ? "border-emerald-300 bg-emerald-300"
              : "border-slate-600"
          }`}
        >
          {selected && (
            <div className="h-1.5 w-1.5 rounded-full bg-[#06100d]" />
          )}
        </div>

        <div>
          <p
            className={`text-sm font-medium ${
              selected
                ? "text-emerald-200"
                : "text-slate-300"
            }`}
          >
            {title}
          </p>

          <p className="mt-1 text-xs leading-5 text-slate-600">
            {description}
          </p>
        </div>
      </div>
    </button>
  );
}

/* =========================================================
   Main
========================================================= */

export default function HealthProfile() {
  const [profile, setProfile] = useState({
    ...DEFAULT_PROFILE,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [validationErrors, setValidationErrors] =
    useState({});

  /* =======================================================
     Get Profile
  ======================================================= */

  const fetchProfile = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await api.get(
        "/health-profile"
      );

      const serverProfile =
        response?.data?.data ?? null;

      setProfile(
        normalizeProfile(serverProfile)
      );
    } catch (err) {
      console.error(
        "Health profile fetch error:",
        err
      );

      setError(
        err?.response?.data?.message ||
          "Unable to load your health profile."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  /* =======================================================
     Update Field
  ======================================================= */

  const updateField = (field, value) => {
    setProfile((current) => ({
      ...current,
      [field]: value,
    }));

    setValidationErrors((current) => ({
      ...current,
      [field]: "",
    }));

    setSuccess("");
  };

  /* =======================================================
     Save Profile
  ======================================================= */

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");
    setSuccess("");

    const errors = validateProfile(profile);

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    try {
      setSaving(true);

      const payload = {
        calorieLimit:
          profile.calorieLimit === ""
            ? null
            : Number(profile.calorieLimit),

        maxSugarThreshold:
          profile.maxSugarThreshold === ""
            ? null
            : Number(profile.maxSugarThreshold),

        maxSodiumThreshold:
          profile.maxSodiumThreshold === ""
            ? null
            : Number(profile.maxSodiumThreshold),

        dietaryMode:
          profile.dietaryMode,

        analysisStrictness:
          profile.analysisStrictness,
      };

      const response = await api.put(
        "/health-profile",
        payload
      );

      const savedProfile =
        response?.data?.data;

      if (savedProfile) {
        setProfile(
          normalizeProfile(savedProfile)
        );
      }

      setSuccess(
        response?.data?.message ||
          "Health profile saved successfully."
      );
    } catch (err) {
      console.error(
        "Health profile save error:",
        err
      );

      setError(
        err?.response?.data?.message ||
          "Unable to save your health profile."
      );
    } finally {
      setSaving(false);
    }
  };

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
              Loading your health profile...
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

        <div className="absolute right-[-10%] top-[30%] h-[360px] w-[360px] rounded-full bg-cyan-500/[0.05] blur-[120px]" />

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

          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-sm font-medium text-slate-300 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
          >
            <ArrowLeft size={15} />

            <span className="hidden sm:inline">
              Dashboard
            </span>
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-5xl px-4 py-7 sm:px-6 sm:py-10 lg:px-8">
        {/* Heading */}
        <div className="mb-8">
          <Link
            to="/dashboard"
            className="mb-4 inline-flex items-center gap-2 text-xs text-slate-500 transition hover:text-slate-300"
          >
            <ArrowLeft size={14} />
            Back to dashboard
          </Link>

          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10">
              <UserRound
                size={22}
                className="text-emerald-300"
              />
            </div>

            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
                <Sparkles size={13} />
                Personalization
              </div>

              <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
                Health Profile
              </h1>
            </div>
          </div>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            Set your nutrition preferences so LabelIQ
            can personalize food-label analysis for you.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-400/20 bg-red-400/[0.06] p-4">
            <CircleAlert
              size={18}
              className="mt-0.5 shrink-0 text-red-300"
            />

            <div>
              <p className="text-sm font-medium text-red-200">
                Something went wrong
              </p>

              <p className="mt-1 text-xs leading-5 text-red-200/60">
                {error}
              </p>
            </div>
          </div>
        )}

        {/* Success */}
        {success && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4">
            <CheckCircle2
              size={18}
              className="mt-0.5 shrink-0 text-emerald-300"
            />

            <div>
              <p className="text-sm font-medium text-emerald-200">
                Profile updated
              </p>

              <p className="mt-1 text-xs leading-5 text-emerald-200/60">
                {success}
              </p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Nutrition */}
          <GlassCard className="p-5 sm:p-7">
            <SectionHeader
              icon={ShieldCheck}
              eyebrow="Nutrition"
              title="Nutrition limits"
              description="These thresholds help LabelIQ identify nutrition-related concerns during food analysis."
            />

            <div className="mt-7 grid gap-6 md:grid-cols-3">
              <NumberField
                label="Daily calorie limit"
                description="Your preferred daily calorie limit."
                value={profile.calorieLimit}
                onChange={(value) =>
                  updateField(
                    "calorieLimit",
                    value
                  )
                }
                error={
                  validationErrors.calorieLimit
                }
                unit="kcal"
                placeholder="e.g. 2000"
              />

              <NumberField
                label="Maximum sugar"
                description="Sugar threshold used during product analysis."
                value={profile.maxSugarThreshold}
                onChange={(value) =>
                  updateField(
                    "maxSugarThreshold",
                    value
                  )
                }
                error={
                  validationErrors.maxSugarThreshold
                }
                unit="g"
                placeholder="e.g. 10"
              />

              <NumberField
                label="Maximum sodium"
                description="Sodium threshold used during product analysis."
                value={profile.maxSodiumThreshold}
                onChange={(value) =>
                  updateField(
                    "maxSodiumThreshold",
                    value
                  )
                }
                error={
                  validationErrors.maxSodiumThreshold
                }
                unit="mg"
                placeholder="e.g. 500"
              />
            </div>
          </GlassCard>

          {/* Dietary preference */}
          <GlassCard className="mt-6 p-5 sm:p-7">
            <SectionHeader
              icon={Leaf}
              eyebrow="Diet"
              title="Dietary preference"
              description="Choose the dietary mode that LabelIQ should consider when evaluating ingredients."
            />

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {DIETARY_OPTIONS.map((option) => (
                <OptionCard
                  key={option.value}
                  selected={
                    profile.dietaryMode ===
                    option.value
                  }
                  onClick={() =>
                    updateField(
                      "dietaryMode",
                      option.value
                    )
                  }
                  title={option.label}
                  description={
                    option.description
                  }
                />
              ))}
            </div>

            {validationErrors.dietaryMode && (
              <p className="mt-3 text-xs text-red-300">
                {validationErrors.dietaryMode}
              </p>
            )}
          </GlassCard>

          {/* Analysis strictness */}
          <GlassCard className="mt-6 p-5 sm:p-7">
            <SectionHeader
              icon={Sparkles}
              eyebrow="Analysis"
              title="Analysis strictness"
              description="Control how strictly LabelIQ applies personalized rules to your scans."
            />

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {STRICTNESS_OPTIONS.map(
                (option) => (
                  <OptionCard
                    key={option.value}
                    selected={
                      profile.analysisStrictness ===
                      option.value
                    }
                    onClick={() =>
                      updateField(
                        "analysisStrictness",
                        option.value
                      )
                    }
                    title={option.label}
                    description={
                      option.description
                    }
                  />
                )
              )}
            </div>

            {validationErrors.analysisStrictness && (
              <p className="mt-3 text-xs text-red-300">
                {
                  validationErrors.analysisStrictness
                }
              </p>
            )}
          </GlassCard>

          {/* Information */}
          <div className="mt-6 rounded-2xl border border-cyan-400/10 bg-cyan-400/[0.035] p-5">
            <div className="flex items-start gap-3">
              <Sparkles
                size={18}
                className="mt-0.5 shrink-0 text-cyan-300"
              />

              <div>
                <p className="text-sm font-medium text-cyan-200">
                  How personalization works
                </p>

                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Your selected nutrition thresholds and
                  dietary preferences are applied by
                  LabelIQ's analysis engine when you scan
                  a product.
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Link
              to="/dashboard"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-5 text-sm font-medium text-slate-400 transition hover:bg-white/[0.06] hover:text-white"
            >
              Cancel
            </Link>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-400 px-6 text-sm font-semibold text-[#03110c] transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? (
                <>
                  <Loader2
                    size={16}
                    className="animate-spin"
                  />
                  Saving...
                </>
              ) : (
                <>
                  <Save size={16} />
                  Save profile
                </>
              )}
            </button>
          </div>
        </form>

        {/* Footer */}
        <footer className="mt-10 border-t border-white/8 pt-6 text-center">
          <p className="text-xs text-slate-600">
            LabelIQ Health Profile · Scan. Understand. Decide.
          </p>
        </footer>
      </main>
    </div>
  );
}