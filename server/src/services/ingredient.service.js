const normalizeIngredientName = (name = "") => {
    return String(name)
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ");
};

const normalizeSource = (source) => {
    if (!source || typeof source !== "object") {
        return null;
    }

    return {
        sourceName:
            (typeof source.sourceName === "string" && source.sourceName) ||
            (typeof source.source === "string" && source.source) ||
            null,

        sourceType:
            (typeof source.sourceType === "string" && source.sourceType) ||
            (typeof source.type === "string" && source.type) ||
            null,

        url:
            source.url ||
            null,
    };
};

const normalizeEvidence = (evidence = []) => {
    if (!Array.isArray(evidence)) {
        return [];
    }

    return evidence
        .map((item) => {
            if (!item || typeof item !== "object") {
                return null;
            }

            const source = normalizeSource(item.source);

            return {
                description:
                    item.description ||
                    item.information ||
                    item.purpose ||
                    null,

                possibleUses:
                    Array.isArray(item.possibleUses)
                        ? item.possibleUses
                        : [],

                source,
            };
        })
        .filter(Boolean);
};

/*
 * Detects extraction fragments that are not real ingredient names -
 * e.g. "296)" left over from a mis-split additive group. These must
 * never get a health-risk color - they are a data-quality artifact,
 * not a food substance.
 *
 * Defensive backstop only. The primary fix is parsing "(330, 296)"
 * as one unit before it ever reaches here - see
 * parseIngredientsList() in ProductInput.jsx.
 */
const isUnparsedFragment = (name = "") => {
    const trimmed = String(name).trim();

    if (!trimmed) {
        return true;
    }

    if (/^\d+\)?$/.test(trimmed)) {
        return true;
    }

    if (/^[()\s]+$/.test(trimmed)) {
        return true;
    }

    return false;
};

/*
 * Matches INS (International Numbering System) additive codes
 * embedded inside an ingredient string, e.g. "Acidity Regulators
 * (330, 296)" or "Colour (160c)". Labels frequently group several
 * INS numbers under one descriptive ingredient name, so
 * classification has to key off the numbers, not the free-text
 * name.
 */
const INS_NUMBER_REGEX = /\b\d{3}[a-z]?\b/gi;

const extractInsNumbers = (name = "") => {
    const matches =
        String(name).match(INS_NUMBER_REGEX) || [];

    return [
        ...new Set(
            matches.map((match) => match.toLowerCase())
        ),
    ];
};

/*
 * Curated additive safety classifications, keyed by INS number.
 *
 * LabelIQ's own extraction rules forbid Gemini from inventing or
 * guessing health information - the same standard applies here.
 * Every entry below reflects the additive's official JECFA
 * (Joint FAO/WHO Expert Committee on Food Additives) Acceptable
 * Daily Intake (ADI) classification, cross-checked against FSSAI's
 * permitted-additives framework. "safe" here means "no numeric ADI
 * limit was set" - it is a regulatory classification, not a
 * personal dietary recommendation, and does not account for
 * individual sensitivities or conditions.
 *
 * category: "safe" | "caution" | "concern"
 * dietaryNote: an optional non-health flag (e.g. animal origin)
 * that matters for dietary suitability but isn't a safety verdict.
 */
const INS_RISK_CLASSIFICATIONS = {
    "330": {
        commonName: "Citric acid",
        category: "safe",
        note:
            "Naturally occurring fruit acid used as an acidity regulator. JECFA ADI: not specified (no numeric intake limit).",
        source: "JECFA / Codex Alimentarius additive database",
    },

    "296": {
        commonName: "Malic acid",
        category: "safe",
        note:
            "Naturally occurring fruit acid used as an acidity regulator. JECFA ADI: not specified.",
        source: "JECFA / Codex Alimentarius additive database",
    },

    "627": {
        commonName: "Disodium guanylate",
        category: "safe",
        note:
            "Umami flavour enhancer. JECFA ADI: not specified, established at the 18th JECFA meeting (1974), reconfirmed 1993.",
        source: "JECFA Additive Monograph 165 (fao.org)",
        dietaryNote:
            "Often derived from meat or fish sources; not confirmed vegetarian/vegan from the label alone.",
    },

    "631": {
        commonName: "Disodium inosinate",
        category: "safe",
        note:
            "Umami flavour enhancer, usually paired with 627. Evaluated jointly as disodium 5'-ribonucleotides; JECFA ADI: not specified.",
        source: "JECFA Additive Monograph 169 (fao.org)",
        dietaryNote:
            "Often derived from meat or fish sources; not confirmed vegetarian/vegan from the label alone.",
    },

    "160c": {
        commonName: "Paprika oleoresin",
        category: "safe",
        note:
            "Natural colour extract from paprika. Permitted with no specified ADI limit.",
        source: "Codex / FSSAI permitted colour additive list",
    },
};

const RISK_SEVERITY_ORDER = {
    concern: 3,
    caution: 2,
    safe: 1,
};

/*
 * Classifies an ingredient by extracting any INS numbers in its
 * name and looking each one up individually. When a group covers
 * several numbers (e.g. "330, 296"), the overall tier is the most
 * severe of the group, and each number's own verdict is kept in
 * `matches` so the UI can show a per-additive breakdown instead of
 * one opaque group verdict.
 *
 * Ingredients with no INS number (plain foods like "Rice Flour",
 * "Iodised Salt", "Sugar") are not additives, so they are not
 * pushed through this risk scale at all - forcing them into
 * "unknown" or "safe" would imply a claim that was never made.
 */
const classifyIngredientRisk = ({
    name,
    hasTrustedEvidence,
}) => {
    const insNumbers = extractInsNumbers(name);

    if (insNumbers.length === 0) {
        return {
            riskLevel: hasTrustedEvidence
                ? "recognized-unclassified"
                : "not-applicable",
            riskNote: null,
            riskSource: null,
            insMatches: [],
        };
    }

    const insMatches = insNumbers.map((insNumber) => {
        const classification =
            INS_RISK_CLASSIFICATIONS[insNumber];

        if (!classification) {
            return {
                insNumber,
                commonName: null,
                category: "unknown",
                note: null,
                source: null,
                dietaryNote: null,
            };
        }

        return {
            insNumber,
            commonName: classification.commonName,
            category: classification.category,
            note: classification.note,
            source: classification.source,
            dietaryNote:
                classification.dietaryNote || null,
        };
    });

    const knownMatches = insMatches.filter(
        (match) => match.category !== "unknown"
    );

    if (knownMatches.length === 0) {
        return {
            riskLevel: "unknown",
            riskNote: null,
            riskSource: null,
            insMatches,
        };
    }

    const worst = knownMatches.reduce(
        (worstSoFar, match) =>
            RISK_SEVERITY_ORDER[match.category] >
            RISK_SEVERITY_ORDER[worstSoFar.category]
                ? match
                : worstSoFar
    );

    return {
        riskLevel: worst.category,
        riskNote: null,
        riskSource: null,
        insMatches,
    };
};

const analyzeIngredients = (
    ingredients = [],
    trustedEvidence = {}
) => {
    if (!Array.isArray(ingredients)) {
        return [];
    }

    return ingredients.map((ingredient) => {
        const normalizedName =
            ingredient.normalizedName ||
            normalizeIngredientName(ingredient.name);

        const unparsedFragment = isUnparsedFragment(
            ingredient.name
        );

        const evidence =
            trustedEvidence[normalizedName] ||
            trustedEvidence[ingredient.name] ||
            [];

        const normalizedEvidence =
            normalizeEvidence(evidence);

        const hasStoredPurpose =
            Boolean(
                ingredient.purpose &&
                String(ingredient.purpose).trim()
            );

        const hasTrustedEvidence =
            normalizedEvidence.length > 0;

        const riskClassification = unparsedFragment
            ? {
                  riskLevel: "unparsed",
                  riskNote:
                      "This looks like a leftover fragment from the label text rather than a distinct ingredient.",
                  riskSource: null,
                  insMatches: [],
              }
            : classifyIngredientRisk({
                  name: ingredient.name,
                  hasTrustedEvidence,
              });

        return {
            name: ingredient.name,
            normalizedName,
            purpose: ingredient.purpose || null,

            informationAvailable:
                hasStoredPurpose ||
                hasTrustedEvidence,

            trustedEvidence:
                normalizedEvidence,

            ...riskClassification,
        };
    });
};

module.exports = {
    normalizeIngredientName,
    analyzeIngredients,
    classifyIngredientRisk,
    extractInsNumbers,
};