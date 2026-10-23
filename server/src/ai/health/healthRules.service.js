"use strict";

/**
 * LabelIQ - deterministic health rule engine (Phase 3).
 *
 * AI explains. Deterministic rules decide.
 *
 * This module is PURE: no database, no MongoDB, no Groq, no RAG,
 * no network. Given the same input it always returns the same
 * score, grade, penalties and rule matches. scan.service.js loads
 * the data from PostgreSQL, calls evaluateHealthRules(), then stores
 * the returned matches. This is the ONLY place where the health
 * score is calculated.
 *
 * Score  = 100 - sum(penalties of recorded rule matches), clamped
 *          to 0..100.
 * Grade  = 90-100 A, 75-89 B, 50-74 C, 0-49 D.
 */

// ============================================
// CONSTANTS (values unchanged from the original engine)
// ============================================

const MAX_SCORE = 100;
const MIN_SCORE = 0;

const PERSONAL_PENALTIES = {
    moderate: {
        USER_BLOCKLIST: 20,
        CALORIE_LIMIT: 5,
        SUGAR_LIMIT: 10,
        SODIUM_LIMIT: 8,
        DIETARY_CONFLICT: 8,
    },
    strict: {
        USER_BLOCKLIST: 25,
        CALORIE_LIMIT: 8,
        SUGAR_LIMIT: 15,
        SODIUM_LIMIT: 12,
        DIETARY_CONFLICT: 12,
    },
};

const PERSONAL_RULE_CODES = {
    BLOCKLIST: "USER_BLOCKLIST",
    CALORIE: "CALORIE_LIMIT",
    SUGAR: "SUGAR_LIMIT",
    SODIUM: "SODIUM_LIMIT",
};

// SUGAR_LIMIT means declared nutrition exceeded the user's limit.
// It is NOT hidden sugar.
const HIDDEN_SUGAR_EXCLUDED_CODES = [PERSONAL_RULE_CODES.SUGAR];

const BLOCKLIST_ALIASES = {
    "ARTIFICIAL SWEETENER": [
        "ASPARTAME",
        "SUCRALOSE",
        "SACCHARIN",
        "ACESULFAME",
        "ACESULFAME POTASSIUM",
        "E950",
        "E951",
        "E954",
        "E955",
    ],
};

const HIGH_SUGAR_TERMS = [
    "SUGAR",
    "DEXTROSE",
    "FRUCTOSE",
    "CORN SYRUP",
    "HIGH FRUCTOSE CORN SYRUP",
    "INVERT SUGAR",
    "MOLASSES",
    "HONEY",
    "GLUCOSE SYRUP",
    "MALTODEXTRIN",
];

const DIETARY_MODES = {
    vegan: {
        code: "DIET_VEGAN",
        label: "vegan",
        terms: [
            "MILK",
            "BUTTERMILK",
            "WHEY",
            "LACTOSE",
            "CASEIN",
            "CASEINATE",
            "EGG",
            "HONEY",
            "GELATIN",
            "GELATINE",
            "BEEF",
            "PORK",
            "CHICKEN",
            "FISH",
            "MEAT",
            "LARD",
            "TALLOW",
            "BUTTER",
            "GHEE",
            "CREAM",
            "CHEESE",
            "YOGURT",
            "YOGHURT",
            "CARMINE",
        ],
        exceptions: [
            "COCONUT MILK",
            "ALMOND MILK",
            "SOY MILK",
            "SOYA MILK",
            "OAT MILK",
            "RICE MILK",
            "COCOA BUTTER",
            "SHEA BUTTER",
            "PEANUT BUTTER",
            "ALMOND BUTTER",
            "NUT BUTTER",
            "COCONUT BUTTER",
            "COCONUT CREAM",
            "CREAM OF TARTAR",
        ],
    },

    "gluten-free": {
        code: "DIET_GLUTEN_FREE",
        label: "gluten-free",
        terms: [
            "WHEAT",
            "BARLEY",
            "RYE",
            "MALT",
            "MALTED",
            "GLUTEN",
            "SEMOLINA",
            "SPELT",
            "TRITICALE",
            "BULGUR",
            "COUSCOUS",
        ],
        exceptions: ["GLUTEN FREE", "GLUTEN-FREE"],
    },

    keto: {
        code: "DIET_KETO",
        label: "keto",
        usesSugarRules: true,
    },

    "type-2-diabetic": {
        code: "DIET_TYPE_2_DIABETIC",
        label: "type 2 diabetic",
        usesSugarRules: true,
    },
};

// ============================================
// SAFE NUMBER HELPERS
// ============================================

// Finite number or null. null / undefined / "" / "   " / "abc" /
// NaN / Infinity / booleans / objects all become null. 0 stays 0.
// (The old helper turned "   " into 0 and true into 1.)
const toFiniteNumber = (value) => {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
    }

    if (typeof value === "string") {
        const text = value.trim();

        if (!text) {
            return null;
        }

        const number = Number(text);

        return Number.isFinite(number) ? number : null;
    }

    return null;
};

// Nutrition values and user limits can never be negative.
// A negative value is malformed, so it is treated as missing.
const toNonNegativeNumber = (value) => {
    const number = toFiniteNumber(value);

    return number !== null && number >= 0 ? number : null;
};

// A penalty is a non-negative number. Anything else is 0, so a
// malformed rule row can never raise the score above 100.
const toPenalty = (value) => {
    return toNonNegativeNumber(value) ?? 0;
};

const round2 = (value) => {
    return Math.round(value * 100) / 100;
};

const hasOwn = (object, key) => {
    return Object.prototype.hasOwnProperty.call(object, key);
};

const isPlainObject = (value) => {
    return value !== null && typeof value === "object" && !Array.isArray(value);
};

// ============================================
// TEXT HELPERS
// ============================================

const escapeRegex = (text) => {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

// Case-insensitive whole-term matching.
const containsTerm = (text, term) => {
    if (!text || !term) {
        return false;
    }

    const normalizedText = String(text).trim();
    const normalizedTerm = String(term).trim();

    if (!normalizedText || !normalizedTerm) {
        return false;
    }

    const regex = new RegExp(
        `(?<![A-Za-z0-9])${escapeRegex(normalizedTerm)}s?(?![A-Za-z0-9])`,
        "i"
    );

    return regex.test(normalizedText);
};

const stripExceptions = (text, exceptions = []) => {
    let result = text;

    for (const phrase of exceptions) {
        result = result.replace(new RegExp(escapeRegex(phrase), "gi"), " ");
    }

    return result;
};

const normalizeKey = (text) => {
    return String(text ?? "")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();
};

// ============================================
// PROFILE NORMALIZERS
// ============================================

// Returns a supported dietary mode key, or null.
// "none", "", unknown values and prototype names ("constructor")
// all become null (no dietary rules applied).
const normalizeDietaryMode = (mode) => {
    if (!mode || typeof mode !== "string") {
        return null;
    }

    const normalized = mode
        .trim()
        .toLowerCase()
        .replace(/[\s_]+/g, "-");

    return hasOwn(DIETARY_MODES, normalized) ? normalized : null;
};

// Only "strict" (any letter case, surrounding spaces ignored) is
// strict. Everything else, including unknown values, is moderate.
const normalizeStrictness = (strictness) => {
    if (
        typeof strictness === "string" &&
        strictness.trim().toLowerCase() === "strict"
    ) {
        return "strict";
    }

    return "moderate";
};

// In strict mode, medium personalized issues become high.
const getSeverity = (baseSeverity, strictness) => {
    if (strictness === "strict" && baseSeverity === "medium") {
        return "high";
    }

    return baseSeverity;
};

// Accepts the database row (snake_case) and also camelCase, so a
// renamed property can never silently drop a user value.
// 0 is a valid value and is kept. null / undefined / negative /
// non numeric values become null (= "no limit set").
const readHealthProfile = (profile) => {
    if (!isPlainObject(profile)) {
        return null;
    }

    return {
        calorieLimit: toNonNegativeNumber(
            profile.calorie_limit ?? profile.calorieLimit
        ),
        sugarLimit: toNonNegativeNumber(
            profile.max_sugar_threshold ?? profile.maxSugarThreshold
        ),
        sodiumLimit: toNonNegativeNumber(
            profile.max_sodium_threshold ?? profile.maxSodiumThreshold
        ),
        dietaryMode: normalizeDietaryMode(
            profile.dietary_mode ?? profile.dietaryMode
        ),
        strictness: normalizeStrictness(
            profile.analysis_strictness ?? profile.analysisStrictness
        ),
    };
};

// ============================================
// RULE CATEGORIES
// ============================================

const getMatchCategory = (code) => {
    const ruleCode = String(code);

    if (ruleCode === PERSONAL_RULE_CODES.BLOCKLIST) {
        return "blocklist";
    }

    if (ruleCode.startsWith("DIET_")) {
        return "dietary";
    }

    if (
        ruleCode === PERSONAL_RULE_CODES.CALORIE ||
        ruleCode === PERSONAL_RULE_CODES.SUGAR ||
        ruleCode === PERSONAL_RULE_CODES.SODIUM
    ) {
        return "nutrition_limit";
    }

    return "general";
};

// SUGAR_xxx general rules are hidden sugar. SUGAR_LIMIT is not.
const isHiddenSugarCode = (code) => {
    const ruleCode = String(code);

    return (
        ruleCode.startsWith("SUGAR_") &&
        !HIDDEN_SUGAR_EXCLUDED_CODES.includes(ruleCode)
    );
};

// One definition of "hidden sugar rule", used by the dietary check
// and by hiddenSugarDetected (they used to disagree).
const isHiddenSugarRule = (rule) => {
    return (
        Boolean(rule) &&
        (rule.rule_type === "hidden_sugar" || isHiddenSugarCode(rule.rule_code))
    );
};

const categorizeMatches = (matches) => {
    const list = Array.isArray(matches) ? matches : [];

    const categoryOf = (match) => getMatchCategory(match.rule_code);

    return {
        generalIssues: list.filter((match) => categoryOf(match) === "general"),
        blocklistIssues: list.filter(
            (match) => categoryOf(match) === "blocklist"
        ),
        calorieIssues: list.filter(
            (match) => match.rule_code === PERSONAL_RULE_CODES.CALORIE
        ),
        sugarIssues: list.filter(
            (match) => match.rule_code === PERSONAL_RULE_CODES.SUGAR
        ),
        sodiumIssues: list.filter(
            (match) => match.rule_code === PERSONAL_RULE_CODES.SODIUM
        ),
        dietaryConflicts: list.filter(
            (match) => categoryOf(match) === "dietary"
        ),
    };
};

// ============================================
// SCORE + GRADE
// ============================================

// Always a number from 0 to 100. A missing / invalid score
// counts as "no penalties" only when the caller passes NaN
// through calculateScore, never silently here.
const clampScore = (value) => {
    const number = toFiniteNumber(value);

    if (number === null) {
        return null;
    }

    return Math.min(MAX_SCORE, Math.max(MIN_SCORE, number));
};

// 90-100 A, 75-89 B, 50-74 C, 0-49 D.
// Out of range numbers are clamped first (-20 -> D, 150 -> A).
// A missing / non numeric score has no grade (null).
const calculateGrade = (score) => {
    const value = clampScore(score);

    if (value === null) {
        return null;
    }

    if (value >= 90) {
        return "A";
    }

    if (value >= 75) {
        return "B";
    }

    if (value >= 50) {
        return "C";
    }

    return "D";
};

// 100 - total penalties, never below 0 and never above 100.
// Invalid penalties count as 0.
const calculateScore = (penalties) => {
    const list = Array.isArray(penalties) ? penalties : [];

    let total = 0;

    for (const penalty of list) {
        total += toPenalty(penalty);
    }

    return clampScore(round2(MAX_SCORE - total));
};

// ============================================
// DIETARY CONFLICT CHECK
// ============================================

const getDietaryConflict = (
    modeConfig,
    ingredientName,
    generalRulesMatched
) => {
    if (!modeConfig) {
        return null;
    }

    // Keto / Type-2 diabetic
    if (modeConfig.usesSugarRules) {
        const sugarRule = (generalRulesMatched || []).find(isHiddenSugarRule);

        if (sugarRule) {
            return `matches the "${sugarRule.rule_name}" rule`;
        }

        const term = HIGH_SUGAR_TERMS.find((item) =>
            containsTerm(ingredientName, item)
        );

        if (term) {
            return `contains ${term.toLowerCase()}`;
        }

        return null;
    }

    // Vegan / Gluten-free
    const cleanedName = stripExceptions(
        String(ingredientName ?? ""),
        modeConfig.exceptions
    );

    const term = (modeConfig.terms || []).find((item) =>
        containsTerm(cleanedName, item)
    );

    return term ? `contains ${term.toLowerCase()}` : null;
};

// ============================================
// RULE ENGINE
// ============================================

/**
 * @param {object}   input
 * @param {Array}    input.ingredients  [{ id, name }] in label order
 * @param {Array}    input.generalRules ingredient_rules rows
 * @param {Array}    input.blocklist    [{ ingredient_name, reason }]
 * @param {object}   input.healthProfile health_profiles row or null
 * @param {object}   input.nutrition    { calories, total_sugars_g,
 *                                        added_sugars_g, sodium_mg }
 *
 * @returns {{
 *   score: number, grade: string, matches: Array,
 *   totalPenalty: number, hiddenSugarDetected: boolean,
 *   breakdown: object, healthProfile: object|null,
 *   personalization: object
 * }}
 */
const evaluateHealthRules = (input = {}) => {
    const rawProfile = isPlainObject(input.healthProfile)
        ? input.healthProfile
        : null;
    const profile = readHealthProfile(rawProfile);

    const strictness = profile ? profile.strictness : "moderate";
    const dietaryMode = profile ? profile.dietaryMode : null;
    const penalties = PERSONAL_PENALTIES[strictness];

    const nutrition = isPlainObject(input.nutrition) ? input.nutrition : {};

    const generalRules = Array.isArray(input.generalRules)
        ? input.generalRules.filter(isPlainObject)
        : [];

    const blocklist = Array.isArray(input.blocklist)
        ? input.blocklist.filter(isPlainObject)
        : [];

    // One entry per distinct ingredient name (case-insensitive,
    // label order kept). A repeated ingredient can never be
    // penalized twice.
    const ingredients = [];
    const seenIngredientNames = new Set();

    for (const item of Array.isArray(input.ingredients)
        ? input.ingredients
        : []) {
        if (!isPlainObject(item) || typeof item.name !== "string") {
            continue;
        }

        const key = normalizeKey(item.name);

        if (!key || seenIngredientNames.has(key)) {
            continue;
        }

        seenIngredientNames.add(key);

        ingredients.push({
            id: item.id ?? null,
            name: item.name,
            key,
        });
    }

    // ---------- match bookkeeping ----------

    const matches = [];
    const seenRuleKeys = new Set();
    let hiddenSugarDetected = false;

    // Returns true when the match was recorded (= penalty applied).
    const addMatch = (match) => {
        const scope = match.ingredientKey ?? "none";
        const codeKey = `${scope}:${match.ruleCode}`;

        // A rule fires once per ingredient (or once per product for
        // nutrition rules).
        if (seenRuleKeys.has(codeKey)) {
            return false;
        }

        // Alias rows of one logical rule (E621 / MSG / Monosodium
        // Glutamate stored under different codes but one rule name)
        // must not stack penalties on the same ingredient.
        const nameKey = match.dedupeByName
            ? `${scope}:name:${normalizeKey(match.ruleName)}`
            : null;

        if (nameKey && seenRuleKeys.has(nameKey)) {
            return false;
        }

        seenRuleKeys.add(codeKey);

        if (nameKey) {
            seenRuleKeys.add(nameKey);
        }

        matches.push({
            ingredient_id: match.ingredientId ?? null,
            rule_code: match.ruleCode,
            rule_name: match.ruleName,
            matched_value: match.matchedValue,
            severity: match.severity,
            explanation: match.explanation,
            penalty: toPenalty(match.penalty),
        });

        return true;
    };

    const generalRulesByIngredient = new Map();

    // ---------- 1. GENERAL INGREDIENT RULES ----------

    for (const ingredient of ingredients) {
        const matchedRules = [];

        for (const rule of generalRules) {
            if (!containsTerm(ingredient.name, rule.pattern)) {
                continue;
            }

            matchedRules.push(rule);

            const recorded = addMatch({
                ingredientId: ingredient.id,
                ingredientKey: ingredient.key,
                ruleCode: rule.rule_code,
                ruleName: rule.rule_name,
                matchedValue: ingredient.name,
                severity: rule.severity,
                explanation: rule.explanation,
                penalty: rule.score_penalty,
                dedupeByName: true,
            });

            if (recorded && isHiddenSugarRule(rule)) {
                hiddenSugarDetected = true;
            }
        }

        generalRulesByIngredient.set(ingredient.key, matchedRules);
    }

    // ---------- 2. USER BLOCKLIST ----------

    for (const ingredient of ingredients) {
        for (const blocked of blocklist) {
            const blockedName = String(blocked.ingredient_name ?? "")
                .trim()
                .toUpperCase();

            if (!blockedName) {
                continue;
            }

            const singular = blockedName.endsWith("S")
                ? blockedName.slice(0, -1)
                : blockedName;

            const aliases = hasOwn(BLOCKLIST_ALIASES, singular)
                ? BLOCKLIST_ALIASES[singular]
                : hasOwn(BLOCKLIST_ALIASES, blockedName)
                  ? BLOCKLIST_ALIASES[blockedName]
                  : [];

            const searchTerms = [blockedName, ...aliases];

            const isBlocked = searchTerms.some((term) =>
                containsTerm(ingredient.name, term)
            );

            if (!isBlocked) {
                continue;
            }

            addMatch({
                ingredientId: ingredient.id,
                ingredientKey: ingredient.key,
                ruleCode: PERSONAL_RULE_CODES.BLOCKLIST,
                ruleName: "User Blocklist",
                matchedValue: ingredient.name,
                severity: "high",
                explanation:
                    blocked.reason ||
                    "Ingredient is present in your personal blocklist.",
                penalty: penalties.USER_BLOCKLIST,
            });
        }
    }

    // ---------- 3. NUTRITION LIMITS ----------
    //
    // Only when a profile exists. A missing nutrition value or a
    // missing limit never creates a violation. Zero stays zero.
    // The comparison is strictly "greater than" the limit.

    if (profile) {
        const calories = toNonNegativeNumber(nutrition.calories);

        if (
            calories !== null &&
            profile.calorieLimit !== null &&
            calories > profile.calorieLimit
        ) {
            addMatch({
                ingredientId: null,
                ruleCode: PERSONAL_RULE_CODES.CALORIE,
                ruleName: "Calorie Limit Exceeded",
                matchedValue: `${calories} kcal`,
                severity: getSeverity("medium", strictness),
                explanation: `Detected calories (${calories} kcal) exceed your calorie limit (${profile.calorieLimit} kcal).`,
                penalty: penalties.CALORIE_LIMIT,
            });
        }

        const sugar = toNonNegativeNumber(nutrition.total_sugars_g);

        if (
            sugar !== null &&
            profile.sugarLimit !== null &&
            sugar > profile.sugarLimit
        ) {
            addMatch({
                ingredientId: null,
                ruleCode: PERSONAL_RULE_CODES.SUGAR,
                ruleName: "Sugar Limit Exceeded",
                matchedValue: `${sugar} g`,
                severity: "high",
                explanation: `Detected total sugars (${sugar} g) exceed your sugar threshold (${profile.sugarLimit} g).`,
                penalty: penalties.SUGAR_LIMIT,
            });
        }

        const sodium = toNonNegativeNumber(nutrition.sodium_mg);

        if (
            sodium !== null &&
            profile.sodiumLimit !== null &&
            sodium > profile.sodiumLimit
        ) {
            addMatch({
                ingredientId: null,
                ruleCode: PERSONAL_RULE_CODES.SODIUM,
                ruleName: "Sodium Limit Exceeded",
                matchedValue: `${sodium} mg`,
                severity: getSeverity("medium", strictness),
                explanation: `Detected sodium (${sodium} mg) exceeds your sodium threshold (${profile.sodiumLimit} mg).`,
                penalty: penalties.SODIUM_LIMIT,
            });
        }
    }

    // ---------- 4. DIETARY MODE ----------

    if (dietaryMode) {
        const modeConfig = DIETARY_MODES[dietaryMode];

        for (const ingredient of ingredients) {
            const reason = getDietaryConflict(
                modeConfig,
                ingredient.name,
                generalRulesByIngredient.get(ingredient.key) || []
            );

            if (!reason) {
                continue;
            }

            addMatch({
                ingredientId: ingredient.id,
                ingredientKey: ingredient.key,
                ruleCode: modeConfig.code,
                ruleName: `Dietary Mode Conflict (${modeConfig.label})`,
                matchedValue: ingredient.name,
                severity: getSeverity("medium", strictness),
                explanation: `Potential conflict with your selected dietary mode (${modeConfig.label}): "${ingredient.name}" ${reason}.`,
                penalty: penalties.DIETARY_CONFLICT,
            });
        }

        // Type-2 diabetic: declared added sugar > 0 (one product-level
        // conflict). Missing added sugar (null) is NOT zero and does
        // not create a conflict.
        const addedSugar = toNonNegativeNumber(nutrition.added_sugars_g);

        if (
            dietaryMode === "type-2-diabetic" &&
            addedSugar !== null &&
            addedSugar > 0
        ) {
            addMatch({
                ingredientId: null,
                ruleCode: modeConfig.code,
                ruleName: `Dietary Mode Conflict (${modeConfig.label})`,
                matchedValue: `${addedSugar} g added sugars`,
                severity: getSeverity("medium", strictness),
                explanation: `Potential conflict with your selected dietary mode (${modeConfig.label}): the product contains ${addedSugar} g of added sugars.`,
                penalty: penalties.DIETARY_CONFLICT,
            });
        }
    }

    // ---------- 5. FINAL SCORE (single source of truth) ----------

    const score = calculateScore(matches.map((match) => match.penalty));
    const grade = calculateGrade(score);

    const totalPenalty = round2(
        matches.reduce((sum, match) => sum + match.penalty, 0)
    );

    return {
        score,
        grade,
        matches,
        totalPenalty,
        hiddenSugarDetected,
        breakdown: categorizeMatches(matches),
        healthProfile: rawProfile,
        personalization: {
            profileApplied: Boolean(profile),
            dietaryMode,
            analysisStrictness: strictness,
        },
    };
};

// ============================================
// PENALTIES FOR STORED MATCHES (GET /scan/:id)
// ============================================
//
// rule_matches has no penalty column (and the schema must not
// change), so a stored scan's penalties are re-derived from the
// CURRENT configuration. They are attached ONLY if they reproduce
// the stored score exactly. If the rules or the user's strictness
// changed since the scan, penalty is null instead of a wrong number.
//
// This never changes the stored score or grade.

const getPersonalPenaltyKey = (ruleCode) => {
    const code = String(ruleCode);

    if (code === PERSONAL_RULE_CODES.BLOCKLIST) {
        return "USER_BLOCKLIST";
    }

    if (code === PERSONAL_RULE_CODES.CALORIE) {
        return "CALORIE_LIMIT";
    }

    if (code === PERSONAL_RULE_CODES.SUGAR) {
        return "SUGAR_LIMIT";
    }

    if (code === PERSONAL_RULE_CODES.SODIUM) {
        return "SODIUM_LIMIT";
    }

    if (code.startsWith("DIET_")) {
        return "DIETARY_CONFLICT";
    }

    return null;
};

const attachStoredPenalties = ({
    matches,
    ruleInfo,
    strictness,
    storedScore,
}) => {
    const list = Array.isArray(matches) ? matches : [];
    const personal = PERSONAL_PENALTIES[normalizeStrictness(strictness)];

    const derived = list.map((match) => {
        const key = getPersonalPenaltyKey(match.rule_code);

        if (key) {
            return personal[key];
        }

        const info =
            ruleInfo && typeof ruleInfo.get === "function"
                ? ruleInfo.get(match.rule_code)
                : null;

        if (!info) {
            return null;
        }

        return toFiniteNumber(info.score_penalty) === null
            ? null
            : toPenalty(info.score_penalty);
    });

    const stored = toFiniteNumber(storedScore);

    const complete = derived.every((penalty) => penalty !== null);

    const consistent =
        complete &&
        stored !== null &&
        Math.abs(calculateScore(derived) - stored) < 0.01;

    return list.map((match, index) => ({
        ...match,
        penalty: consistent ? derived[index] : null,
    }));
};

// ============================================
// EXPORTS
// ============================================

module.exports = {
    // constants
    PERSONAL_PENALTIES,
    PERSONAL_RULE_CODES,
    HIDDEN_SUGAR_EXCLUDED_CODES,
    BLOCKLIST_ALIASES,
    HIGH_SUGAR_TERMS,
    DIETARY_MODES,

    // engine
    evaluateHealthRules,
    attachStoredPenalties,

    // score / grade
    calculateScore,
    calculateGrade,
    clampScore,

    // normalizers
    normalizeDietaryMode,
    normalizeStrictness,
    readHealthProfile,
    getSeverity,
    toFiniteNumber,
    toNonNegativeNumber,

    // matches
    getMatchCategory,
    isHiddenSugarCode,
    isHiddenSugarRule,
    categorizeMatches,
    getDietaryConflict,
    containsTerm,
};