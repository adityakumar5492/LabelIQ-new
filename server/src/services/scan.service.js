"use strict";
const { analyzeImage: analyzeAIImage } = require("../ai/pipeline/ai-pipeline.service");
const {
    parseNutritionMultiPass,
    validateNutrition,
} = require("../ai/nutrition/nutrition.service");

const {
    readLabelFacts,
} = require("../ai/extraction/label-facts.service");

const {
    reconcileNutrition,
} = require("../ai/nutrition/nutrition-reconcile.service");

const { getIngredientEvidence } = require("../ai/rag/rag.service");
const {
    generateAiInsights,
} = require("../ai/explanation/explanation.service");
const ScanRawData = require("../models/scanRawData.model");
const { createScanTimer, throwIfAborted } = require("../utils/scanTimer");
const pool = require("../config/db");
const {
    evaluateHealthRules,
    attachStoredPenalties,
    normalizeDietaryMode,
    normalizeStrictness,
    getMatchCategory,
    isHiddenSugarCode,
    categorizeMatches,
} = require("../ai/health/healthRules.service");

// ============================================
// CONSTANTS
// ============================================

// ---------- Group 2: nutrition ----------
// Project rule: sodium (mg) = salt (g) x 400.
// Only applied when salt was explicitly detected on the label.
const SALT_TO_SODIUM_MG_PER_G = 400;
const NUTRIENT_KEYS = [
    "calories",
    "protein",
    "carbohydrates",
    "totalFat",
    "saturatedFat",
    "sugar",
    "fiber",
    "sodium",
    "salt",
];
const ALLOWED_BASES = new Set([
    "per-serving",
    "per-100g",
    "per-100ml",
    "per-piece",
]);
const ALLOWED_NUTRITION_SOURCES = new Set(["table", "table+ai", "ai"]);
// The AI fallback may only supply a nutrient when the OCR text
// actually contains a word for it. This stops the model from
// "filling in" fiber / sodium / salt that the label never printed.
const NUTRIENT_EVIDENCE = {
    calories: /kcal|calorie|energy/i,
    protein: /protein/i,
    carbohydrates: /carbohydrate|carbs?\b/i,
    totalFat: /\bfat/i,
    saturatedFat: /saturat/i,
    sugar: /sugar/i,
    fiber: /fib(?:re|er)/i,
    sodium: /sodium/i,
    salt: /\bsalt\b/i,
};
// Columns of nutrition_details (numeric ones), in display order.
const NUMERIC_NUTRITION_FIELDS = [
    "calories",
    "protein_g",
    "carbohydrates_g",
    "total_fat_g",
    "saturated_fat_g",
    "dietary_fiber_g",
    "total_sugars_g",
    "added_sugars_g",
    "sodium_mg",
];
const SEVERITY_RANK = {
    high: 3,
    medium: 2,
    low: 1,
};

// ============================================
// HELPERS

// ============================================
// Keeps null as null. Keeps 0 as 0.
const toNumberOrNull = (value) => {
    if (value === null || value === undefined || value === "") {
        return null;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
};
// Trimmed string or null. Never invents a value.
const cleanText = (value, maxLength = 255) => {
    if (typeof value !== "string") {
        return null;
    }
    const text = value.trim().replace(/\s+/g, " ");
    return text ? text.slice(0, maxLength) : null;
};
const round2 = (value) => {
    return Math.round(value * 100) / 100;
};
// Pack size = net content of the package (product pack info).
// Returns null when the label did not provide any pack size.
// "display" is only a formatted copy of what was extracted.
const buildPackSize = (packSize) => {
    if (!packSize || typeof packSize !== "object") {
        return null;
    }
    const value = toNumberOrNull(packSize.value);
    const unit = cleanText(packSize.unit, 20);
    const raw = cleanText(packSize.raw, 100);
    if (value === null && !raw) {
        return null;
    }
    const display = value !== null && unit ? `${value} ${unit}` : raw;
    return {
        value,
        unit: value !== null ? unit : null,
        raw,
        display,
    };
};
// Servings per container must be a positive number, else null.
const toServingsPerContainer = (value) => {
    const number = toNumberOrNull(value);
    return number !== null && number > 0 ? number : null;
};
// Clean and normalize ingredient list.
// Keeps the label's original order. Removes only exact
// (case-insensitive) duplicates.
const cleanIngredientList = (rawIngredients) => {
    const seen = new Set();
    const cleaned = [];
    if (!Array.isArray(rawIngredients)) {
        return cleaned;
    }
    for (const item of rawIngredients) {
        if (typeof item !== "string") {
            continue;
        }
        const name = item.trim().replace(/\s+/g, " ").slice(0, 255);
        if (!name) {
            continue;
        }
        const key = name.toLowerCase();
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        cleaned.push(name);
    }
    return cleaned;
};

// ============================================
// GROUP 2 — NUTRITION (merge, basis, conversion)
// ============================================
const normalizeBasis = (value) => {
    if (typeof value !== "string") {
        return null;
    }
    const text = value.trim().toLowerCase();
    return ALLOWED_BASES.has(text) ? text : null;
};
// { value, unit } -> positive value + lowercase unit, or both null.
const normalizeServing = (serving) => {
    const value = toNumberOrNull(serving?.value);
    const unit =
        typeof serving?.unit === "string" && serving.unit.trim()
            ? serving.unit.trim().toLowerCase()
            : null;
    if (value === null || value <= 0 || !unit) {
        return { value: null, unit: null };
    }
    return { value, unit };
};
// Serving sizes are compatible when either one is unknown,
// or both are identical.
const servingsCompatible = (a, b) => {
    if (a.value === null || b.value === null) {
        return true;
    }
    return a.value === b.value && a.unit === b.unit;
};
const formatServingSize = (serving) => {
    return serving.value !== null && serving.unit
        ? `${serving.value} ${serving.unit}`
        : null;
};
// "32 g" -> { value: 32, unit: "g" } (only g / ml are convertible)
const parseServingString = (text) => {
    if (typeof text !== "string") {
        return null;
    }
    const match = text.match(/^\s*(\d+(?:\.\d+)?)\s*(g|ml)\s*$/i);
    if (!match) {
        return null;
    }
    const value = Number(match[1]);
    return value > 0 ? { value, unit: match[2].toLowerCase() } : null;
};
/**
 * Builds the nutrition that is saved to PostgreSQL.
 *
 * Priority (as designed):
 *   1. Deterministic coordinate/table parsing (nutrition.service.js)
 *   2. Validated deterministic values are NEVER overwritten
 *   3. Groq (AI) only fills what the table could not read, and only if
 *        - it used the SAME nutrition basis and a compatible serving size
 *        - the OCR text contains a word for that nutrient
 *        - the merged result still passes validation without losing any
 *          table value
 *      When the table parser found no column at all, Groq values are used
 *      as a last resort (source = "ai") under the same checks.
 *
 * Sodium rule:
 *   - explicit sodium on the label wins
 *   - otherwise, if salt was explicitly detected: sodium_mg = salt_g x 400
 *   - otherwise null
 *
 * Nothing is converted between per-serving and per-100g here.
 * Added sugars are never invented: the parser does not extract them,
 * so the column stays null.
 */
const buildNutrition = ({
    ocrText,
    passes,
    extraction,
    labelFacts = null,
}) => {
    const warnings = [];

    const text =
        typeof ocrText === "string"
            ? ocrText
            : "";

    const usablePasses =
        Array.isArray(passes) && passes.length > 0
            ? passes
            : [
                  {
                      name: "ocr-text",
                      text,
                      words: [],
                  },
              ];

    // --------------------------------------------------
    // 1. Existing deterministic nutrition parser
    // --------------------------------------------------
    let parsed = null;

    try {
        parsed = parseNutritionMultiPass(usablePasses);
    } catch (error) {
        console.error(
            "Nutrition table parsing failed:",
            error.message
        );

        warnings.push("table parser failed");
    }

    const validatedTable = validateNutrition(
        parsed?.nutrition || {}
    );

    const tableBasis = normalizeBasis(
        parsed?.nutritionBasis
    );

    const tableServing = normalizeServing(
        parsed?.servingSize
    );

    // --------------------------------------------------
    // 2. Prepare OCR texts for reconciliation
    // --------------------------------------------------
    const texts = [
        text,
        ...(Array.isArray(passes)
            ? passes.map((pass) => pass?.text || "")
            : []),
    ].filter(Boolean);

    // --------------------------------------------------
    // 3. Prepare table evidence
    // --------------------------------------------------
    const table = {
        values: {
            calories: toNumberOrNull(
                validatedTable.calories
            ),

            protein: toNumberOrNull(
                validatedTable.protein
            ),

            carbohydrates: toNumberOrNull(
                validatedTable.carbohydrates
            ),

            totalFat: toNumberOrNull(
                validatedTable.totalFat
            ),

            saturatedFat: toNumberOrNull(
                validatedTable.saturatedFat
            ),

            fiber: toNumberOrNull(
                validatedTable.fiber
            ),

            sugar: toNumberOrNull(
                validatedTable.sugar
            ),

            addedSugar: null,

            sodium: toNumberOrNull(
                validatedTable.sodium
            ),
        },

        basis: tableBasis,

        serving:
            tableServing.value !== null
                ? tableServing
                : null,
    };

    // --------------------------------------------------
    // 4. Prepare Groq evidence
    // --------------------------------------------------
    const aiBasis = normalizeBasis(
        extraction?.nutritionBasis
    );

    const aiServing = normalizeServing(
        extraction?.servingSize
    );

    const aiNutrition =
        extraction?.nutrition &&
        typeof extraction.nutrition === "object"
            ? extraction.nutrition
            : {};

    const ai = {
        values: {
            calories: toNumberOrNull(
                aiNutrition.calories
            ),

            protein: toNumberOrNull(
                aiNutrition.protein
            ),

            carbohydrates: toNumberOrNull(
                aiNutrition.carbohydrates
            ),

            totalFat: toNumberOrNull(
                aiNutrition.totalFat
            ),

            saturatedFat: toNumberOrNull(
                aiNutrition.saturatedFat
            ),

            fiber: toNumberOrNull(
                aiNutrition.fiber
            ),

            sugar: toNumberOrNull(
                aiNutrition.sugar
            ),

            addedSugar: toNumberOrNull(
                aiNutrition.addedSugar ??
                aiNutrition.added_sugar ??
                aiNutrition.added_sugars_g
            ),

            sodium: toNumberOrNull(
                aiNutrition.sodium
            ),
        },

        serving:
            aiServing.value !== null
                ? aiServing
                : null,

        basis: aiBasis,
    };

    // --------------------------------------------------
    // 5. NEW nutrition reconciliation
    // --------------------------------------------------
    let reconciled = null;

    try {
        reconciled = reconcileNutrition({
            texts,

            servingCandidates:
                labelFacts?.servingCandidates || [],

            table,

            ai,
        });
    } catch (error) {
        console.error(
            "Nutrition reconciliation failed:",
            error.message
        );

        warnings.push(
            "nutrition reconciliation failed"
        );
    }

    // --------------------------------------------------
    // 6. Use reconciled values when evidence is strong
    // --------------------------------------------------
    if (reconciled?.active) {
        const values = reconciled.values || {};

        const serving =
            reconciled.serving &&
            Number.isFinite(
                Number(reconciled.serving.value)
            )
                ? {
                      value: Number(
                          reconciled.serving.value
                      ),
                      unit:
                          String(
                              reconciled.serving.unit || ""
                          ).toLowerCase(),
                  }
                : null;

        const finalServing =
            serving ||
            tableServing ||
            aiServing;

        const nutrition = {
            serving_size: formatServingSize(
                finalServing
            ),

            calories:
                toNumberOrNull(
                    values.calories
                ),

            protein_g:
                toNumberOrNull(
                    values.protein
                ),

            carbohydrates_g:
                toNumberOrNull(
                    values.carbohydrates
                ),

            total_fat_g:
                toNumberOrNull(
                    values.totalFat
                ),

            saturated_fat_g:
                toNumberOrNull(
                    values.saturatedFat
                ),

            dietary_fiber_g:
                toNumberOrNull(
                    values.fiber
                ),

            total_sugars_g:
                toNumberOrNull(
                    values.sugar
                ),

            added_sugars_g:
                toNumberOrNull(
                    values.addedSugar
                ),

            sodium_mg:
                toNumberOrNull(
                    values.sodium
                ),
        };

        // Preserve explicit salt -> sodium fallback
        if (
            nutrition.sodium_mg === null &&
            validatedTable.salt !== null
        ) {
            nutrition.sodium_mg = round2(
                validatedTable.salt *
                    SALT_TO_SODIUM_MG_PER_G
            );
        }

        if (Array.isArray(reconciled.notes)) {
            warnings.push(
                ...reconciled.notes
            );
        }

        return {
            nutrition,

            meta: {
                basis:
                    tableBasis ||
                    aiBasis ||
                    null,

                serving_size:
                    finalServing?.value !== null
                        ? finalServing
                        : null,

                source: "reconciled",

                sodium_source:
                    nutrition.sodium_mg !== null
                        ? validatedTable.sodium !== null
                            ? "label"
                            : "reconciled"
                        : null,

                salt_g:
                    validatedTable.salt ?? null,

                ai_filled_fields: [],

                verified_per_100:
                    reconciled.verifiedPer100 ||
                    {},

                reconciliation_sources:
                    reconciled.sources || {},

                parser_warnings:
                    warnings.slice(0, 20),
            },
        };
    }

    // --------------------------------------------------
    // 7. SAFE fallback to existing parser
    // --------------------------------------------------
    let merged = {
        ...validatedTable,
    };

    let serving = tableServing;

    if (
        serving.value === null &&
        aiServing.value !== null
    ) {
        serving = aiServing;
    }

    let sodiumMg = merged.sodium;
    let sodiumSource = null;

    if (sodiumMg !== null) {
        sodiumSource = "label";
    } else if (merged.salt !== null) {
        sodiumMg = round2(
            merged.salt *
                SALT_TO_SODIUM_MG_PER_G
        );

        sodiumSource = "salt";
    }

    return {
        nutrition: {
            serving_size:
                formatServingSize(serving),

            calories:
                merged.calories ?? null,

            protein_g:
                merged.protein ?? null,

            carbohydrates_g:
                merged.carbohydrates ?? null,

            total_fat_g:
                merged.totalFat ?? null,

            saturated_fat_g:
                merged.saturatedFat ?? null,

            dietary_fiber_g:
                merged.fiber ?? null,

            total_sugars_g:
                merged.sugar ?? null,

            added_sugars_g:
                toNumberOrNull(
                    aiNutrition.addedSugar ??
                    aiNutrition.added_sugar ??
                    aiNutrition.added_sugars_g
                ),

            sodium_mg:
                sodiumMg,
        },

        meta: {
            basis:
                tableBasis ||
                aiBasis ||
                null,

            serving_size:
                serving.value !== null
                    ? serving
                    : null,

            source:
                tableBasis
                    ? "table"
                    : aiBasis
                      ? "ai"
                      : null,

            sodium_source:
                sodiumSource,

            salt_g:
                merged.salt ?? null,

            ai_filled_fields: [],

            verified_per_100: {},

            reconciliation_sources: {},

            parser_warnings:
                warnings.slice(0, 20),
        },
    };
};
// Reads the stored meta defensively (MongoDB may be missing or old).
const normalizeNutritionMeta = (raw) => {
    const meta = raw && typeof raw === "object" ? raw : {};
    const serving = normalizeServing(meta.serving_size);
    return {
        basis: normalizeBasis(meta.basis),
        serving_size: serving.value !== null ? serving : null,
        source: ALLOWED_NUTRITION_SOURCES.has(meta.source)
            ? meta.source
            : null,
        sodium_source:
            meta.sodium_source === "label" || meta.sodium_source === "salt"
                ? meta.sodium_source
                : null,
        salt_g: toNumberOrNull(meta.salt_g),
        ai_filled_fields: Array.isArray(meta.ai_filled_fields)
            ? meta.ai_filled_fields.filter((f) => typeof f === "string")
            : [],
    };
};
/**
 * Calculates the "other" nutrition basis for display.
 * The stored values are NOT changed.
 *
 *   per-serving  -> per-100g / per-100ml   factor = 100 / serving
 *   per-100g     -> per-serving            factor = serving / 100
 *   per-100ml    -> per-serving            factor = serving / 100
 *
 * Only possible when the label stated a numeric serving size in
 * g or ml whose unit matches the basis. Otherwise returns null
 * (no fake data). Null values stay null.
 */
const convertNutritionBasis = (nutrition, basis) => {
    if (!nutrition || !basis) {
        return null;
    }
    const serving = parseServingString(nutrition.serving_size);
    if (!serving) {
        return null;
    }
    let factor;
    let targetBasis;
    if (basis === "per-serving") {
        factor = 100 / serving.value;
        targetBasis = serving.unit === "ml" ? "per-100ml" : "per-100g";
    } else if (basis === "per-100g" && serving.unit === "g") {
        factor = serving.value / 100;
        targetBasis = "per-serving";
    } else if (basis === "per-100ml" && serving.unit === "ml") {
        factor = serving.value / 100;
        targetBasis = "per-serving";
    } else {
        return null;
    }
    const values = {};
    for (const field of NUMERIC_NUTRITION_FIELDS) {
        const value = toNumberOrNull(nutrition[field]);
        values[field] = value === null ? null : round2(value * factor);
    }
    return {
        basis: targetBasis,
        calculated: true,
        serving_size: nutrition.serving_size,
        values,
    };
};

// ============================================
// GROUP 2 — INGREDIENT DETAILS (flags + evidence)

// ============================================
// Lookup of ingredient_rules by code (type + configured pattern).
// Failure only removes this extra detail, never the scan itself.
const loadRuleInfo = async (db) => {
    const info = new Map();
    try {
        const result = await db.query(
            `SELECT rule_code, rule_type, pattern, score_penalty FROM ingredient_rules;`
        );
        for (const row of result.rows) {
            info.set(row.rule_code, {
                rule_type: row.rule_type,
                pattern: row.pattern,
                score_penalty: row.score_penalty,
            });
        }
    } catch (error) {
        console.error("Failed to load ingredient rule info:", error.message);
    }
    return info;
};
const evidenceKey = (name) => {
    return String(name || "")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();
};
// rag.ingredients = [{ ingredient, evidence: [...] }]
// Returns null when no RAG data was stored for this scan.
const buildEvidenceLookup = (ragIngredients) => {
    if (!Array.isArray(ragIngredients)) {
        return null;
    }
    const lookup = new Map();
    for (const item of ragIngredients) {
        if (!item || typeof item.ingredient !== "string") {
            continue;
        }
        lookup.set(
            evidenceKey(item.ingredient),
            Array.isArray(item.evidence) ? item.evidence : []
        );
    }
    return lookup;
};
const toEvidenceEntries = (list) => {
    if (!Array.isArray(list)) {
        return [];
    }
    return list
        .filter((item) => item && typeof item === "object")
        .map((item) => ({
            name: cleanText(item.ingredient),
            description: cleanText(item.description, 2000),
            purpose: cleanText(item.purpose, 1000),
            source: cleanText(item.source),
        }))
        .filter((item) => item.description || item.purpose);
};
const lookupEvidence = (lookup, name) => {
    if (lookup) {
        return toEvidenceEntries(lookup.get(evidenceKey(name)) || []);
    }
    // No stored RAG data (e.g. MongoDB unavailable): the knowledge
    // base is a local deterministic lookup, so it can be re-read.
    try {
        return toEvidenceEntries(getIngredientEvidence(name));
    } catch (error) {
        return [];
    }
};
/**
 * One entry per saved ingredient, in the label's original order.
 *
 * "flagged" is TRUE only when the rule engine stored a rule_match for
 * that ingredient (rule_matches.ingredient_id). Nothing here decides
 * danger: the flags are copies of the stored rule results, and the
 * evidence is supporting RAG context only.
 */
const buildIngredientDetails = ({
    ingredients,
    matches,
    ruleInfo,
    ragIngredients,
}) => {
    const lookup = buildEvidenceLookup(ragIngredients);
    return ingredients.map((ingredient) => {
        const flags = (matches || [])
            .filter(
                (match) =>
                    match.ingredient_id !== null &&
                    match.ingredient_id !== undefined &&
                    String(match.ingredient_id) === String(ingredient.id)
            )
            .map((match) => {
                const category = getMatchCategory(match.rule_code);
                const info = ruleInfo?.get(match.rule_code) || null;
                let flagType = category;
                if (category === "general") {
                    flagType =
                        isHiddenSugarCode(match.rule_code) ||
                        info?.rule_type === "hidden_sugar"
                            ? "hidden_sugar"
                            : "ingredient";
                }
                return {
                    id: match.id,
                    rule_code: match.rule_code,
                    rule_name: match.rule_name,
                    rule_type: info?.rule_type ?? null,
                    rule_pattern: category === "general" ? info?.pattern ?? null : null,
                    category,
                    flag_type: flagType,
                    severity: match.severity ?? null,
                    matched_value: match.matched_value ?? null,
                    explanation: match.explanation ?? null,
                };
            });
        let highestSeverity = null;
        for (const flag of flags) {
            const rank = SEVERITY_RANK[flag.severity] || 0;
            if (rank > (SEVERITY_RANK[highestSeverity] || 0)) {
                highestSeverity = flag.severity;
            }
        }
        return {
            id: ingredient.id,
            name: ingredient.name,
            order: ingredient.order,
            detected_by: ingredient.detected_by ?? null,
            flagged: flags.length > 0,
            highest_severity: highestSeverity,
            flags,
            evidence: lookupEvidence(lookup, ingredient.name),
        };
    });
};

// ============================================
// MONGODB RAW SCAN STORAGE
// ============================================
const saveRawScanData = async ({ scanId, userId, filename, aiData }) => {
    try {
        await ScanRawData.create({
            scan_id: String(scanId),
            user_id: String(userId),
            filename: filename || null,
            ocr: aiData?.ocr || {},
            ai_analysis: aiData?.ai_analysis || {},
            rag: aiData?.rag || {
                sources: [],
            },
            ai_insights: aiData?.ai_insights || {},
            created_at: new Date(),
        });
        console.log(`Raw scan data saved to MongoDB for scan ${scanId}`);
    } catch (error) {
        // MongoDB failure must not invalidate a successful
        // PostgreSQL scan.
        console.error(
            "Failed to save raw scan data to MongoDB:",
            error.message
        );
    }
};

// ============================================
// RULE ENGINE (database part)
// ============================================
//
// The score, grade, penalties and rule matches are calculated by the
// pure, deterministic evaluateHealthRules() in healthRules.service.js.
// This function only loads the inputs from PostgreSQL and stores the
// matches that engine returned. It never calculates a score itself,
// and Groq / RAG are never involved.
const insertRuleMatch = async (client, analysisId, match) => {
    const matchQuery = `
        INSERT INTO rule_matches (
            analysis_id,
            ingredient_id,
            rule_code,
            rule_name,
            matched_value,
            severity,
            explanation
        )
        VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7
        )
        RETURNING *;
    `;

    const matchResult = await client.query(matchQuery, [
        analysisId,
        match.ingredient_id ?? null,
        match.rule_code,
        match.rule_name,
        match.matched_value,
        match.severity,
        match.explanation,
    ]);

    // rule_matches has no penalty column, so the penalty that was
    // applied to the score is attached to the returned match.
    return {
        ...matchResult.rows[0],
        penalty: match.penalty,
    };
};

const runIngredientRules = async (client, scanId, analysisId, userId) => {
    // 1. GET SCANNED INGREDIENTS
    const ingredientQuery = `
        SELECT
            i.id,
            i.name
        FROM scan_ingredients si
        JOIN ingredients i
            ON si.ingredient_id = i.id
        WHERE si.scan_id = $1
        ORDER BY si.ingredient_order;
    `;

    const ingredientResult = await client.query(ingredientQuery, [scanId]);

    // 2. GET GENERAL INGREDIENT RULES
    const ruleQuery = `
        SELECT
            id,
            rule_code,
            rule_name,
            rule_type,
            pattern,
            severity,
            score_penalty,
            explanation
        FROM ingredient_rules
        ORDER BY id;
    `;

    const ruleResult = await client.query(ruleQuery);

    // 3. GET USER BLOCKLIST
    const blocklistQuery = `
        SELECT
            id,
            ingredient_name,
            reason
        FROM ingredient_blocklist
        WHERE user_id = $1
        ORDER BY id;
    `;

    const blocklistResult = await client.query(blocklistQuery, [userId]);

    // 4. GET USER HEALTH PROFILE
    const healthProfileQuery = `
        SELECT
            calorie_limit,
            max_sugar_threshold,
            max_sodium_threshold,
            dietary_mode,
            analysis_strictness
        FROM health_profiles
        WHERE user_id = $1;
    `;

    const healthProfileResult = await client.query(healthProfileQuery, [
        userId,
    ]);

    const healthProfile = healthProfileResult.rows[0] || null;

    // 5. GET NUTRITION (values as stored; null stays null)
    const nutritionQuery = `
        SELECT
            calories,
            total_sugars_g,
            added_sugars_g,
            sodium_mg
        FROM nutrition_details
        WHERE scan_id = $1;
    `;

    const nutritionResult = await client.query(nutritionQuery, [scanId]);

    const nutrition = nutritionResult.rows[0] || {};

    // 6. DETERMINISTIC EVALUATION (pure, no I/O)
    const evaluation = evaluateHealthRules({
        ingredients: ingredientResult.rows,
        generalRules: ruleResult.rows,
        blocklist: blocklistResult.rows,
        healthProfile,
        nutrition,
    });

    // 7. STORE EXACTLY THE MATCHES THAT WERE PENALIZED
    const matches = [];

    for (const match of evaluation.matches) {
        matches.push(await insertRuleMatch(client, analysisId, match));
    }

    // 8. RETURN THE ONE AUTHORITATIVE RESULT
    return {
        score: evaluation.score,
        grade: evaluation.grade,
        totalPenalty: evaluation.totalPenalty,
        matches,
        healthProfile: evaluation.healthProfile,
        hiddenSugarDetected: evaluation.hiddenSugarDetected,
        breakdown: categorizeMatches(matches),
        personalization: evaluation.personalization,
    };
};

// Plain-data deep copy handed to the AI explanation layer.
const cloneForAi = (value) => {
    return JSON.parse(JSON.stringify(value));
};

// ============================================
// ANALYZE IMAGE
// ============================================
// options (all optional): { signal: AbortSignal, timer }
//   signal  aborted when the HTTP client disconnects, so a scan nobody is
//           waiting for stops using CPU / Groq quota between stages.
const analyzeImage = async (file, userId, options = {}) => {
    const signal = options?.signal;
    const timer = options?.timer || createScanTimer();

    timer.log(
        `upload received: ${file?.size ?? file?.buffer?.length ?? "?"} bytes`
    );

    // ========================================
    // 1. RUN NODE AI PIPELINE
    // ========================================
    // Pipeline returns:
    // { ocr: { text }, ocrPasses, product, rag: { ingredients } }
    const pipelineResult = await analyzeAIImage(file.buffer, {
        signal,
        timer,
    });
    const product = pipelineResult?.product;
    if (!product) {
        throw new Error("AI analysis data not found");
    }
    // ========================================
// LABEL FACTS
// Deterministic facts from every OCR pass
// ========================================
const labelTexts = [
    pipelineResult.ocr?.text || "",
    ...(Array.isArray(pipelineResult.ocrPasses)
        ? pipelineResult.ocrPasses.map(
              (pass) => pass?.text || ""
          )
        : []),
].filter(Boolean);

const labelFacts = readLabelFacts({
    texts: labelTexts,
    groq: product,
});
    // ========================================
    // 2. NUTRITION
    //    deterministic table parser first,
    //    validated Groq values only as fallback
    // ========================================
    const nutritionDone = timer.stage("nutrition parse");
    const {
    nutrition,
    meta: nutritionMeta,
} = buildNutrition({
    ocrText:
        pipelineResult.ocr?.text || "",

    passes:
        pipelineResult.ocrPasses,

    extraction:
        product,

    labelFacts,
});
    nutritionDone();
    // ========================================
    // 3. BUILD aiData IN THE SHAPE THE REST OF
    //    THE FLOW (MongoDB, API response) EXPECTS
    // ========================================
    // Ingredients are cleaned ONCE here, so MongoDB, PostgreSQL and
    // the API response all contain exactly the same list and order.
const ingredientList = cleanIngredientList(
    labelFacts?.ingredients?.length
        ? labelFacts.ingredients
        : product.ingredients
);    // Product identity: product_name, brand, variant.
    // Pack information: pack_size, servings_per_container.
    // Every value comes from extraction only. Missing stays null.
    const aiAnalysis = {
    product_name:
        product.product_name ||
        product.name ||
        null,

    brand:
        cleanText(product.brand),

    variant:
        cleanText(product.variant),

    // Prefer deterministic label facts.
    pack_size:
        buildPackSize(
            labelFacts?.packSize ||
            product.packSize
        ),

    // Prefer deterministic label facts.
    servings_per_container:
        toServingsPerContainer(
            labelFacts?.servingsPerPack ??
            product.servingsPerContainer
        ),

    // Prefer deterministic ingredient extraction.
    ingredients:
        labelFacts?.ingredients?.length
            ? labelFacts.ingredients
            : ingredientList,

    // Keep confirmed and may-contain allergens separate.
    allergens:
        labelFacts?.allergens ||
        product.allergens ||
        [],

    nutrition,

    // Nutrition basis, source, sodium/salt details
    // plus deterministic label-fact notes.
    nutrition_meta: {
        ...nutritionMeta,

        label_facts_notes:
            labelFacts?.notes || [],
    },
};
    // AI insights (Groq explanation) are generated further down,
    // AFTER the deterministic rule engine has finished, because
    // they only explain its results. Never used for
    // score/grade/assessment.
    const aiData = {
        ocr: pipelineResult.ocr || {},
        ai_analysis: aiAnalysis,
        rag: pipelineResult.rag || {
            sources: [],
        },
        ai_insights: {},
    };
    // Nobody is waiting any more: do not write a scan to the database.
    throwIfAborted(signal);
    // ========================================
    // 4. START TRANSACTION
    // ========================================
    const dbDone = timer.stage("PostgreSQL transaction");
    const client = await pool.connect();
    // The connection is released right after COMMIT so it is not
    // held while waiting for Groq.
    let released = false;
    try {
        await client.query("BEGIN");
        // ====================================
        // 5. CREATE SCANNED PRODUCT
        // ====================================
        const productQuery = `
            INSERT INTO scanned_products (
                user_id,
                product_name,
                safety_grade,
                safety_score,
                declared_sugar,
                hidden_sugar_detected,
                scan_status
            )
            VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7
            )
            RETURNING *;
        `;
        const productValues = [
            userId,
            aiAnalysis.product_name
                ? String(aiAnalysis.product_name).slice(0, 255)
                : null,
            null,
            null,
            nutrition.total_sugars_g,
            false,
            "completed",
        ];
        const productResult = await client.query(productQuery, productValues);
        const savedProduct = productResult.rows[0];
        // ====================================
        // 6. SAVE NUTRITION
        // ====================================
        const nutritionQuery = `
            INSERT INTO nutrition_details (
                scan_id,
                serving_size,
                calories,
                protein_g,
                carbohydrates_g,
                total_fat_g,
                saturated_fat_g,
                dietary_fiber_g,
                total_sugars_g,
                added_sugars_g,
                sodium_mg
            )
            VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7,
                $8,
                $9,
                $10,
                $11
            )
            RETURNING *;
        `;
        const nutritionValues = [
            savedProduct.id,
            nutrition.serving_size
                ? String(nutrition.serving_size).slice(0, 100)
                : null,
            nutrition.calories,
            nutrition.protein_g,
            nutrition.carbohydrates_g,
            nutrition.total_fat_g,
            nutrition.saturated_fat_g,
            nutrition.dietary_fiber_g,
            nutrition.total_sugars_g,
            nutrition.added_sugars_g,
            nutrition.sodium_mg,
        ];
        const nutritionResult = await client.query(
            nutritionQuery,
            nutritionValues
        );
        // ====================================
        // 7. SAVE INGREDIENTS (label order)
        // ====================================
        const savedIngredients = [];
        for (let i = 0; i < ingredientList.length; i++) {
            const ingredientName = ingredientList[i];
            const ingredientQuery = `
                INSERT INTO ingredients (
                    name
                )
                VALUES ($1)
                ON CONFLICT (name)
                DO UPDATE SET
                    name = EXCLUDED.name
                RETURNING id;
            `;
            const ingredientResult = await client.query(ingredientQuery, [
                ingredientName,
            ]);
            const ingredientId = ingredientResult.rows[0].id;
            const scanIngredientQuery = `
                INSERT INTO scan_ingredients (
                    scan_id,
                    ingredient_id,
                    ingredient_order,
                    detected_by
                )
                VALUES (
                    $1,
                    $2,
                    $3,
                    $4
                )
                ON CONFLICT (
                    scan_id,
                    ingredient_id
                )
                DO NOTHING;
            `;
            await client.query(scanIngredientQuery, [
                savedProduct.id,
                ingredientId,
                i + 1,
                "ai",
            ]);
            savedIngredients.push({
                id: ingredientId,
                name: ingredientName,
                order: i + 1,
                detected_by: "ai",
            });
        }
        // ====================================
        // 8. CREATE ANALYSIS RESULT
        // ====================================
        const analysisQuery = `
            INSERT INTO analysis_results (
                scan_id,
                safety_grade,
                safety_score,
                assessment,
                confidence
            )
            VALUES (
                $1,
                NULL,
                NULL,
                NULL,
                NULL
            )
            RETURNING *;
        `;
        const analysisResult = await client.query(analysisQuery, [
            savedProduct.id,
        ]);
        const analysis = analysisResult.rows[0];
        // ====================================
        // 9. RUN RULE ENGINE (source of truth)
        // ====================================
        const rulesDone = timer.stage("health rules");
        const ruleResult = await runIngredientRules(
            client,
            savedProduct.id,
            analysis.id,
            userId
        );
        rulesDone();
        // ====================================
        // 10. CREATE ASSESSMENT
        // ====================================
        const assessment =
            ruleResult.matches.length > 0
                ? "Issues detected"
                : "No rule violations detected";
        // ====================================
        // 11. UPDATE ANALYSIS RESULT
        // ====================================
        const updateAnalysisQuery = `
            UPDATE analysis_results
            SET
                safety_grade = $1,
                safety_score = $2,
                assessment = $3,
                updated_at = NOW()
            WHERE id = $4
            RETURNING *;
        `;
        const updatedAnalysisResult = await client.query(
            updateAnalysisQuery,
            [ruleResult.grade, ruleResult.score, assessment, analysis.id]
        );
        const finalAnalysis = updatedAnalysisResult.rows[0];
        // ====================================
        // 12. UPDATE SCANNED PRODUCT
        // ====================================
        const updateProductQuery = `
            UPDATE scanned_products
            SET
                safety_grade = $1,
                safety_score = $2,
                hidden_sugar_detected = $3
            WHERE id = $4;
        `;
        await client.query(updateProductQuery, [
            ruleResult.grade,
            ruleResult.score,
            ruleResult.hiddenSugarDetected,
            savedProduct.id,
        ]);
        // ====================================
        // 13. COMMIT POSTGRESQL
        // ====================================
        await client.query("COMMIT");
        // Release the PostgreSQL connection now. Everything below
        // uses the pool (or no database at all).
        client.release();
        released = true;
        dbDone();
        // ====================================
        // 14. DERIVED (NOT STORED) GROUP 2 DATA
        // ====================================
        //
        // These are display extras only. The score, grade and rule
        // matches are already stored and are never recalculated here.
        // A failure (for example malformed RAG data) must not fail a
        // scan that is already committed, so it falls back to the
        // plain ingredient list without evidence.
        let ingredientDetails;
        try {
            const ruleInfo = await loadRuleInfo(pool);
            ingredientDetails = buildIngredientDetails({
                ingredients: savedIngredients,
                matches: ruleResult.matches,
                ruleInfo,
                ragIngredients: aiData.rag?.ingredients,
            });
        } catch (error) {
            console.error("Failed to build ingredient details:", error.message);
            ingredientDetails = buildIngredientDetails({
                ingredients: savedIngredients,
                matches: ruleResult.matches,
                ruleInfo: null,
                ragIngredients: null,
            });
        }
        let nutritionConverted = null;
        try {
            nutritionConverted = convertNutritionBasis(
                nutrition,
                nutritionMeta.basis
            );
        } catch (error) {
            console.error("Failed to convert nutrition basis:", error.message);
        }
        // ====================================
        // 15. AI EXPLANATION (Groq) - GROUP 3
        // ====================================
        //
        // Groq only explains what the rule engine already decided.
        // It receives the final score / grade / rule matches as
        // read-only facts. It cannot change them. This call never
        // throws: on any failure it returns an empty ai_insights
        // and the scan result is returned normally.
        //
        // Groq receives independent COPIES, so nothing it (or the
        // explanation code) does can change the score, grade,
        // penalties or rule matches that are returned below.
        const explanationDone = timer.stage("Groq explanation");
        try {
            aiData.ai_insights = await generateAiInsights(
                cloneForAi({
                    product: aiAnalysis,
                    nutrition,
                    nutritionBasis: nutritionMeta.basis,
                    analysis: {
                        score: ruleResult.score,
                        grade: ruleResult.grade,
                        assessment,
                    },
                    ruleMatches: ruleResult.matches,
                    personalization: ruleResult.personalization,
                    ingredientDetails,
                })
            );
        } catch (error) {
            console.error("AI insights failed:", error.message);
            aiData.ai_insights = {};
        }
        explanationDone();
        // ====================================
        // 16. SAVE RAW DATA TO MONGODB
        // ====================================
        //
        // Saved AFTER the explanation so ai_insights is stored and
        // GET /scan/:id returns the same text as the new scan.
        const mongoDone = timer.stage("MongoDB save");
        await saveRawScanData({
            scanId: savedProduct.id,
            userId,
            filename: file.originalname,
            aiData,
        });
        mongoDone();
        // ====================================
        // 17. RETURN FINAL RESULT
        // ====================================
        timer.total(`scanId=${savedProduct.id}`);
        return {
            ...aiData,
            ai_analysis: {
                ...aiData.ai_analysis,
                nutrition_converted: nutritionConverted,
                ingredient_details: ingredientDetails,
            },
            analysis: {
                id: finalAnalysis.id,
                safetyGrade: finalAnalysis.safety_grade,
                safetyScore: finalAnalysis.safety_score,
                assessment: finalAnalysis.assessment,
                hiddenSugarDetected: ruleResult.hiddenSugarDetected,
                ruleMatches: ruleResult.matches,
                breakdown: ruleResult.breakdown,
                personalization: ruleResult.personalization,
            },
            database: {
                scanId: savedProduct.id,
                nutritionId: nutritionResult.rows[0].id,
                ingredientsSaved: savedIngredients.length,
            },
        };
    } catch (error) {
        // After COMMIT the client is already released and there is
        // nothing left to roll back.
        if (!released) {
            try {
                await client.query("ROLLBACK");
            } catch (rollbackError) {
                console.error("Rollback failed:", rollbackError.message);
            }
        }
        console.error("Failed to save scan data:", error);
        throw error;
    } finally {
        if (!released) {
            client.release();
        }
    }
};

// ============================================
// UPDATE PRODUCT NAME (manual entry)

// ============================================
// Updates only scanned_products.product_name for a scan that
// belongs to the user. Score, grade, nutrition, ingredients and
// rule matches are untouched.
const updateProductName = async (userId, scanId, productName) => {
    const name = cleanText(productName);
    if (!name) {
        return null;
    }
    const query = `
        UPDATE scanned_products
        SET product_name = $1
        WHERE id = $2
          AND user_id = $3
        RETURNING
            id AS scan_id,
            product_name;
    `;
    const result = await pool.query(query, [name, scanId, userId]);
    if (result.rows.length === 0) {
        return null;
    }
    return result.rows[0];
};

// ============================================
// GET SCAN HISTORY
// ============================================
const getScanHistory = async (userId) => {
    const query = `
        SELECT
            sp.id AS scan_id,
            sp.product_name,
            sp.safety_grade,
            sp.safety_score,
            sp.hidden_sugar_detected,
            sp.scan_status,
            ar.created_at AS created_at,
            ar.assessment,
            nd.serving_size,
            nd.calories,
            nd.protein_g,
            nd.carbohydrates_g,
            nd.total_fat_g,
            nd.saturated_fat_g,
            nd.dietary_fiber_g,
            nd.total_sugars_g,
            nd.added_sugars_g,
            nd.sodium_mg
        FROM scanned_products sp
        LEFT JOIN nutrition_details nd
            ON nd.scan_id = sp.id
        LEFT JOIN analysis_results ar
            ON ar.scan_id = sp.id
        WHERE sp.user_id = $1
        ORDER BY ar.created_at DESC;
    `;
    const result = await pool.query(query, [userId]);
    return result.rows;
};

// ============================================
// GET SINGLE SCAN
// ============================================
const getScanById = async (userId, scanId) => {
    // 1. GET MAIN SCAN DATA
    const scanQuery = `
        SELECT
            sp.id AS scan_id,
            sp.user_id,
            sp.product_name,
            sp.safety_grade,
            sp.safety_score,
            sp.declared_sugar,
            sp.hidden_sugar_detected,
            sp.scan_status,
            ar.id AS analysis_id,
            ar.assessment,
            ar.confidence,
            ar.created_at AS analysis_created_at,
            nd.id AS nutrition_id,
            nd.serving_size,
            nd.calories,
            nd.protein_g,
            nd.carbohydrates_g,
            nd.total_fat_g,
            nd.saturated_fat_g,
            nd.dietary_fiber_g,
            nd.total_sugars_g,
            nd.added_sugars_g,
            nd.sodium_mg
        FROM scanned_products sp
        LEFT JOIN analysis_results ar
            ON ar.scan_id = sp.id
        LEFT JOIN nutrition_details nd
            ON nd.scan_id = sp.id
        WHERE sp.id = $1
          AND sp.user_id = $2
        LIMIT 1;
    `;
    const scanResult = await pool.query(scanQuery, [scanId, userId]);
    if (scanResult.rows.length === 0) {
        return null;
    }
    const scan = scanResult.rows[0];
    // 2. GET INGREDIENTS (PostgreSQL, label order)
    const ingredientsQuery = `
        SELECT
            i.id,
            i.name,
            si.ingredient_order,
            si.detected_by
        FROM scan_ingredients si
        JOIN ingredients i
            ON si.ingredient_id = i.id
        WHERE si.scan_id = $1
        ORDER BY si.ingredient_order ASC, si.id ASC;
    `;
    const ingredientsResult = await pool.query(ingredientsQuery, [scanId]);
    // 3. GET RULE MATCHES
    const ruleMatchesQuery = `
        SELECT
            id,
            ingredient_id,
            rule_code,
            rule_name,
            matched_value,
            severity,
            explanation
        FROM rule_matches
        WHERE analysis_id = $1
        ORDER BY id ASC;
    `;
    const ruleMatchesResult = await pool.query(ruleMatchesQuery, [
        scan.analysis_id,
    ]);
    // 4. BUILD RULE BREAKDOWN
    const storedMatches = ruleMatchesResult.rows;
    // 5. GET USER HEALTH PROFILE
    const profileQuery = `
        SELECT
            dietary_mode,
            analysis_strictness,
            calorie_limit,
            max_sugar_threshold,
            max_sodium_threshold
        FROM health_profiles
        WHERE user_id = $1;
    `;
    const profileResult = await pool.query(profileQuery, [userId]);
    const profile = profileResult.rows[0] || null;
    // 6. GET RAW DATA FROM MONGODB
    let rawScanData = null;
    try {
        rawScanData = await ScanRawData.findOne({
            scan_id: String(scan.scan_id),
            user_id: String(userId),
        }).lean();
    } catch (error) {
        console.error(
            "Failed to read raw scan data from MongoDB:",
            error.message
        );
    }
    // 7. GROUP 2: NUTRITION + INGREDIENT DETAILS
    // node-pg returns DECIMAL columns as strings ("13.90").
    // They are converted to numbers here; null stays null, 0 stays 0.
    const nutrition = {
        serving_size: scan.serving_size ?? null,
        calories: toNumberOrNull(scan.calories),
        protein_g: toNumberOrNull(scan.protein_g),
        carbohydrates_g: toNumberOrNull(scan.carbohydrates_g),
        total_fat_g: toNumberOrNull(scan.total_fat_g),
        saturated_fat_g: toNumberOrNull(scan.saturated_fat_g),
        dietary_fiber_g: toNumberOrNull(scan.dietary_fiber_g),
        total_sugars_g: toNumberOrNull(scan.total_sugars_g),
        added_sugars_g: toNumberOrNull(scan.added_sugars_g),
        sodium_mg: toNumberOrNull(scan.sodium_mg),
    };
    const nutritionMeta = normalizeNutritionMeta(
        rawScanData?.ai_analysis?.nutrition_meta
    );
    const nutritionConverted = convertNutritionBasis(
        nutrition,
        nutritionMeta.basis
    );
    const ruleInfo = await loadRuleInfo(pool);
    // Penalties are not stored in rule_matches. They are re-derived
    // and attached only when they reproduce the stored score exactly
    // (otherwise penalty is null). Score and grade are NOT changed.
    const matches = attachStoredPenalties({
        matches: storedMatches,
        ruleInfo,
        strictness: profile?.analysis_strictness,
        storedScore: scan.safety_score,
    });
    const breakdown = categorizeMatches(matches);
    const ingredientRows = ingredientsResult.rows.map((row) => ({
        id: row.id,
        name: row.name,
        order: row.ingredient_order,
        detected_by: row.detected_by,
    }));
    const ingredientDetails = buildIngredientDetails({
        ingredients: ingredientRows,
        matches,
        ruleInfo,
        ragIngredients: rawScanData?.rag?.ingredients,
    });
    // 8. RETURN NORMALIZED RESULT
    return {
        filename: rawScanData?.filename || "Food label",
        ocr: rawScanData?.ocr || {},
        ai_analysis: {
            // product_name comes from PostgreSQL, so a manually
            // entered name is returned here. Null means not available.
            product_name: scan.product_name,
            // Brand, variant and pack information are read from the
            // MongoDB raw data. Null when not extracted / not stored.
            brand: rawScanData?.ai_analysis?.brand ?? null,
            variant: rawScanData?.ai_analysis?.variant ?? null,
            pack_size: rawScanData?.ai_analysis?.pack_size ?? null,
            servings_per_container:
                rawScanData?.ai_analysis?.servings_per_container ?? null,
            // Names only, in label order (unchanged contract).
            ingredients: ingredientRows.map((ingredient) => ingredient.name),
            // Per-ingredient flags (from rule_matches) and RAG evidence.
            ingredient_details: ingredientDetails,
            allergens: rawScanData?.ai_analysis?.allergens || [],
            // Values exactly as stored for the label's declared basis.
            nutrition,
            // Declared basis, source, sodium/salt details.
            nutrition_meta: nutritionMeta,
            // The other basis, calculated for display only. Not stored.
            nutrition_converted: nutritionConverted,
        },
        rag: rawScanData?.rag || {
            sources: [],
        },
        ai_insights: rawScanData?.ai_insights || {},
        analysis: {
            id: scan.analysis_id,
            safetyGrade: scan.safety_grade,
            safetyScore: scan.safety_score,
            assessment: scan.assessment,
            hiddenSugarDetected: scan.hidden_sugar_detected,
            ruleMatches: matches,
            breakdown,
            personalization: {
                profileApplied: Boolean(profile),
                dietaryMode: normalizeDietaryMode(profile?.dietary_mode),
                analysisStrictness: normalizeStrictness(
                    profile?.analysis_strictness
                ),
            },
        },
        database: {
            scanId: scan.scan_id,
            nutritionId: scan.nutrition_id,
            ingredientsSaved: ingredientsResult.rows.length,
        },
    };
};

// ============================================
// EXPORTS
// ============================================
module.exports = {
    analyzeImage,
    runIngredientRules,
    updateProductName,
    getScanHistory,
    getScanById,
    // Pure helpers (exported so they can be unit tested).
    buildNutrition,
    convertNutritionBasis,
    buildIngredientDetails,
};