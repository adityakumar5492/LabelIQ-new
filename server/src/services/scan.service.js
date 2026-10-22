"use strict";



const { analyzeImage: analyzeAIImage } = require("../ai/pipeline/ai-pipeline.service");

const {

    parseNutritionMultiPass,

    validateNutrition,

} = require("../ai/nutrition/nutrition.service");

const { getIngredientEvidence } = require("../ai/rag/rag.service");

const {

    generateAiInsights,

} = require("../ai/explanation/explanation.service");



const ScanRawData = require("../models/scanRawData.model");

const pool = require("../config/db");



// ============================================

// CONSTANTS

// ============================================



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



// SUGAR_LIMIT means declared nutrition exceeded

// the user's limit. It is NOT hidden sugar.

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

        `(?\<![A-Za-z0-9])${escapeRegex(normalizedTerm)}s?(?![A-Za-z0-9])`,

        "i"

    );



    return regex.test(normalizedText);

};



const normalizeDietaryMode = (mode) => {

    if (!mode || typeof mode !== "string") {

        return null;

    }



    const normalized = mode

        .trim()

        .toLowerCase()

        .replace(/[\s\_]+/g, "-");



    return DIETARY_MODES[normalized] ? normalized : null;

};



// Only strict is treated as strict.

const normalizeStrictness = (strictness) => {

    return strictness === "strict" ? "strict" : "moderate";

};



// In strict mode, medium personalized issues become high.

const getSeverity = (baseSeverity, strictness) => {

    if (strictness === "strict" && baseSeverity === "medium") {

        return "high";

    }



    return baseSeverity;

};



const stripExceptions = (text, exceptions = []) => {

    let result = text;



    for (const phrase of exceptions) {

        result = result.replace(new RegExp(escapeRegex(phrase), "gi"), " ");

    }



    return result;

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

const buildNutrition = ({ ocrText, passes, extraction }) => {

    const warnings = [];

    const text = typeof ocrText === "string" ? ocrText : "";



    // ----- 1. deterministic parser -----

    let parsed = null;



    try {

        const usablePasses =

            Array.isArray(passes) && passes.length > 0

                ? passes

                : [{ name: "ocr-text", text, words: [] }];



        parsed = parseNutritionMultiPass(usablePasses);

    } catch (error) {

        console.error("Nutrition table parsing failed:", error.message);

        warnings.push("table parser failed");

    }



    const table = validateNutrition(parsed?.nutrition || {});

    const tableBasis = normalizeBasis(parsed?.nutritionBasis);

    const tableServing = normalizeServing(parsed?.servingSize);

    const tableHasValues = NUTRIENT_KEYS.some((key) => table[key] !== null);



    if (Array.isArray(parsed?.metadata?.warnings)) {

        warnings.push(...parsed.metadata.warnings);

    }



    // ----- 2. AI values (fallback only) -----

    const aiBasis = normalizeBasis(extraction?.nutritionBasis);

    const aiServing = normalizeServing(extraction?.servingSize);



    const aiNutrition =

        extraction?.nutrition && typeof extraction.nutrition === "object"

            ? extraction.nutrition

            : {};



    const aiValue = (key) => {

        const value = toNumberOrNull(aiNutrition[key]);



        if (value === null || value < 0) {

            return null;

        }



        return NUTRIENT_EVIDENCE[key].test(text) ? value : null;

    };



    let basis = null;

    let serving = tableServing;

    let merged = { ...table };

    let source = null;

    const aiFilledFields = [];



    if (tableBasis) {

        basis = tableBasis;



        if (tableHasValues) {

            source = "table";

        }



        if (aiBasis === tableBasis && servingsCompatible(tableServing, aiServing)) {

            const candidate = { ...table };

            const filled = [];



            for (const key of NUTRIENT_KEYS) {

                if (candidate[key] !== null) {

                    continue;

                }



                const value = aiValue(key);



                if (value !== null) {

                    candidate[key] = value;

                    filled.push(key);

                }

            }



            const validated = validateNutrition(candidate);



            // Weak AI output must never destroy strong table evidence.

            const tableValueLost = NUTRIENT_KEYS.some(

                (key) => table[key] !== null && validated[key] === null

            );



            if (tableValueLost) {

                warnings.push(

                    "AI values conflicted with table values and were ignored"

                );

            } else {

                merged = validated;



                for (const key of filled) {

                    if (merged[key] !== null) {

                        aiFilledFields.push(key);

                    }

                }



                if (aiFilledFields.length > 0) {

                    source = tableHasValues ? "table+ai" : "ai";

                }

            }

        }

    } else if (aiBasis) {

        // The table parser found no usable column.

        const candidate = {};



        for (const key of NUTRIENT_KEYS) {

            candidate[key] = aiValue(key);

        }



        const validated = validateNutrition(candidate);



        const filled = NUTRIENT_KEYS.filter((key) => validated[key] !== null);



        if (filled.length > 0) {

            basis = aiBasis;

            merged = validated;

            serving = aiServing;

            source = "ai";

            aiFilledFields.push(...filled);

        }

    }



    // Serving size is a label fact, independent of the nutrition column.

    // Use the AI one only when the table parser did not find one.

    if (serving.value === null && aiServing.value !== null) {

        serving = aiServing;

    }



    // ----- 3. sodium / salt -----

    const saltG = merged.salt;



    let sodiumMg = merged.sodium;

    let sodiumSource = null;



    if (sodiumMg !== null) {

        sodiumSource = "label";

    } else if (saltG !== null) {

        sodiumMg = round2(saltG * SALT_TO_SODIUM_MG_PER_G);

        sodiumSource = "salt";

    }



    // ----- 4. final shape (same keys as nutrition_details) -----

    return {

        nutrition: {

            serving_size: formatServingSize(serving),

            calories: merged.calories,

            protein_g: merged.protein,

            carbohydrates_g: merged.carbohydrates,

            total_fat_g: merged.totalFat,

            saturated_fat_g: merged.saturatedFat,

            dietary_fiber_g: merged.fiber,

            total_sugars_g: merged.sugar,

            // Not extracted by any parser. Never invented.

            added_sugars_g: null,

            sodium_mg: sodiumMg,

        },



        // Stored in MongoDB (raw/unstructured side) next to the

        // other extraction details. salt_g is kept as printed.

        meta: {

            basis,

            serving_size: serving.value !== null ? serving : null,

            source,

            sodium_source: sodiumSource,

            salt_g: saltG,

            ai_filled_fields: aiFilledFields,

            parser_warnings: warnings.slice(0, 10),

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



const getMatchCategory = (code) => {

    const ruleCode = String(code);



    if (ruleCode === PERSONAL_RULE_CODES.BLOCKLIST) {

        return "blocklist";

    }



    if (ruleCode.startsWith("DIET\_")) {

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



// Same rule the engine uses for hiddenSugarDetected.

const isHiddenSugarCode = (code) => {

    const ruleCode = String(code);



    return (

        ruleCode.startsWith("SUGAR\_") &&

        !HIDDEN_SUGAR_EXCLUDED_CODES.includes(ruleCode)

    );

};



// Lookup of ingredient_rules by code (type + configured pattern).

// Failure only removes this extra detail, never the scan itself.

const loadRuleInfo = async (db) => {

    const info = new Map();



    try {

        const result = await db.query(

            `SELECT rule_code, rule_type, pattern FROM ingredient_rules;`

        );



        for (const row of result.rows) {

            info.set(row.rule_code, {

                rule_type: row.rule_type,

                pattern: row.pattern,

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

// DIETARY CONFLICT CHECK

// ============================================



const getDietaryConflict = (

    modeConfig,

    ingredientName,

    generalRulesMatched

) => {

    // Keto / Type-2 diabetic

    if (modeConfig.usesSugarRules) {

        const sugarRule = generalRulesMatched.find(

            (rule) =>

                rule.rule_type === "hidden_sugar" ||

                String(rule.rule_code).startsWith("SUGAR\_")

        );



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

        ingredientName,

        modeConfig.exceptions

    );



    const term = modeConfig.terms.find((item) =>

        containsTerm(cleanedName, item)

    );



    return term ? `contains ${term.toLowerCase()}` : null;

};



// ============================================

// GROUP RULE MATCHES

// ============================================



const categorizeMatches = (matches) => {

    const isPersonal = (code) => {

        return (

            code === PERSONAL_RULE_CODES.BLOCKLIST ||

            code === PERSONAL_RULE_CODES.CALORIE ||

            code === PERSONAL_RULE_CODES.SUGAR ||

            code === PERSONAL_RULE_CODES.SODIUM ||

            String(code).startsWith("DIET\_")

        );

    };



    return {

        generalIssues: matches.filter(

            (match) => !isPersonal(match.rule_code)

        ),



        blocklistIssues: matches.filter(

            (match) => match.rule_code === PERSONAL_RULE_CODES.BLOCKLIST

        ),



        calorieIssues: matches.filter(

            (match) => match.rule_code === PERSONAL_RULE_CODES.CALORIE

        ),



        sugarIssues: matches.filter(

            (match) => match.rule_code === PERSONAL_RULE_CODES.SUGAR

        ),



        sodiumIssues: matches.filter(

            (match) => match.rule_code === PERSONAL_RULE_CODES.SODIUM

        ),



        dietaryConflicts: matches.filter((match) =>

            String(match.rule_code).startsWith("DIET\_")

        ),

    };

};



// ============================================

// CALCULATE GRADE

// ============================================



const calculateGrade = (score) => {

    if (score >= 90) {

        return "A";

    }



    if (score >= 75) {

        return "B";

    }



    if (score >= 50) {

        return "C";

    }



    return "D";

};



// ============================================

// RECORD RULE MATCH

// ============================================



const recordRuleMatch = async (client, state, analysisId, match) => {

    const key = `${match.ingredientId ?? "none"}:${match.ruleCode}`;



    if (state.seenKeys.has(key)) {

        return;

    }



    state.seenKeys.add(key);



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

        match.ingredientId ?? null,

        match.ruleCode,

        match.ruleName,

        match.matchedValue,

        match.severity,

        match.explanation,

    ]);



    state.matches.push(matchResult.rows[0]);



    state.score -= Number(match.penalty) || 0;

};



// ============================================

// RUN INGREDIENT RULES

// ============================================



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



    const strictness = normalizeStrictness(

        healthProfile?.analysis_strictness

    );



    const penalties = PERSONAL_PENALTIES[strictness];



    const dietaryMode = normalizeDietaryMode(healthProfile?.dietary_mode);



    // 5. GET NUTRITION

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



    // 6. INITIALIZE RULE ENGINE STATE

    const state = {

        score: 100,

        matches: [],

        seenKeys: new Set(),

    };



    const generalRulesByIngredient = new Map();



    // 7. GENERAL INGREDIENT RULES

    for (const ingredient of ingredientResult.rows) {

        const matchedRules = [];



        for (const rule of ruleResult.rows) {

            if (!containsTerm(ingredient.name, rule.pattern)) {

                continue;

            }



            matchedRules.push(rule);



            await recordRuleMatch(client, state, analysisId, {

                ingredientId: ingredient.id,

                ruleCode: rule.rule_code,

                ruleName: rule.rule_name,

                matchedValue: ingredient.name,

                severity: rule.severity,

                explanation: rule.explanation,

                penalty: rule.score_penalty,

            });

        }



        generalRulesByIngredient.set(ingredient.id, matchedRules);

    }



    // 8. USER BLOCKLIST

    for (const ingredient of ingredientResult.rows) {

        for (const blocked of blocklistResult.rows) {

            const blockedName = String(blocked.ingredient_name || "")

                .trim()

                .toUpperCase();



            if (!blockedName) {

                continue;

            }



            const aliasKey = blockedName.endsWith("S")

                ? blockedName.slice(0, -1)

                : blockedName;



            const searchTerms = [

                blockedName,

                ...(BLOCKLIST_ALIASES[aliasKey] || []),

            ];



            const isBlocked = searchTerms.some((term) =>

                containsTerm(ingredient.name, term)

            );



            if (!isBlocked) {

                continue;

            }



            await recordRuleMatch(client, state, analysisId, {

                ingredientId: ingredient.id,

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



    // 9. NUTRITION LIMITS

    if (healthProfile) {

        // Calories

        const calories = toNumberOrNull(nutrition.calories);

        const calorieLimit = toNumberOrNull(healthProfile.calorie_limit);



        if (

            calories !== null &&

            calorieLimit !== null &&

            calories > calorieLimit

        ) {

            await recordRuleMatch(client, state, analysisId, {

                ingredientId: null,

                ruleCode: PERSONAL_RULE_CODES.CALORIE,

                ruleName: "Calorie Limit Exceeded",

                matchedValue: `${calories} kcal`,

                severity: getSeverity("medium", strictness),

                explanation: `Detected calories (${calories} kcal) exceed your calorie limit (${calorieLimit} kcal).`,

                penalty: penalties.CALORIE_LIMIT,

            });

        }



        // Sugar

        const sugar = toNumberOrNull(nutrition.total_sugars_g);

        const sugarLimit = toNumberOrNull(healthProfile.max_sugar_threshold);



        if (sugar !== null && sugarLimit !== null && sugar > sugarLimit) {

            await recordRuleMatch(client, state, analysisId, {

                ingredientId: null,

                ruleCode: PERSONAL_RULE_CODES.SUGAR,

                ruleName: "Sugar Limit Exceeded",

                matchedValue: `${sugar} g`,

                severity: "high",

                explanation: `Detected total sugars (${sugar} g) exceed your sugar threshold (${sugarLimit} g).`,

                penalty: penalties.SUGAR_LIMIT,

            });

        }



        // Sodium

        const sodium = toNumberOrNull(nutrition.sodium_mg);

        const sodiumLimit = toNumberOrNull(healthProfile.max_sodium_threshold);



        if (sodium !== null && sodiumLimit !== null && sodium > sodiumLimit) {

            await recordRuleMatch(client, state, analysisId, {

                ingredientId: null,

                ruleCode: PERSONAL_RULE_CODES.SODIUM,

                ruleName: "Sodium Limit Exceeded",

                matchedValue: `${sodium} mg`,

                severity: getSeverity("medium", strictness),

                explanation: `Detected sodium (${sodium} mg) exceeds your sodium threshold (${sodiumLimit} mg).`,

                penalty: penalties.SODIUM_LIMIT,

            });

        }

    }



    // 10. DIETARY MODE

    if (dietaryMode) {

        const modeConfig = DIETARY_MODES[dietaryMode];



        for (const ingredient of ingredientResult.rows) {

            const reason = getDietaryConflict(

                modeConfig,

                ingredient.name,

                generalRulesByIngredient.get(ingredient.id) || []

            );



            if (!reason) {

                continue;

            }



            await recordRuleMatch(client, state, analysisId, {

                ingredientId: ingredient.id,

                ruleCode: modeConfig.code,

                ruleName: `Dietary Mode Conflict (${modeConfig.label})`,

                matchedValue: ingredient.name,

                severity: getSeverity("medium", strictness),

                explanation: `Potential conflict with your selected dietary mode (${modeConfig.label}): "${ingredient.name}" ${reason}.`,

                penalty: penalties.DIETARY_CONFLICT,

            });

        }



        // Type-2 diabetic: added sugar > 0

        const addedSugar = toNumberOrNull(nutrition.added_sugars_g);



        if (

            dietaryMode === "type-2-diabetic" &&

            addedSugar !== null &&

            addedSugar > 0

        ) {

            await recordRuleMatch(client, state, analysisId, {

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



    // 11. FINAL SCORE

    const score = Math.max(state.score, 0);



    const grade = calculateGrade(score);



    // 12. HIDDEN SUGAR DETECTION

    const hiddenSugarDetected = state.matches.some((match) => {

        const ruleCode = String(match.rule_code);



        return (

            ruleCode.startsWith("SUGAR\_") &&

            !HIDDEN_SUGAR_EXCLUDED_CODES.includes(ruleCode)

        );

    });



    // 13. RETURN RULE ENGINE RESULT

    return {

        score,

        grade,

        matches: state.matches,

        healthProfile,

        hiddenSugarDetected,

        breakdown: categorizeMatches(state.matches),

        personalization: {

            profileApplied: Boolean(healthProfile),

            dietaryMode,

            analysisStrictness: strictness,

        },

    };

};



// ============================================

// ANALYZE IMAGE

// ============================================



const analyzeImage = async (file, userId) => {

    // ========================================

    // 1. RUN NODE AI PIPELINE

    // ========================================



    // Pipeline returns:

    // { ocr: { text }, ocrPasses, product, rag: { ingredients } }

    const pipelineResult = await analyzeAIImage(file.buffer);



    const product = pipelineResult?.product;



    if (!product) {

        throw new Error("AI analysis data not found");

    }



    // ========================================

    // 2. NUTRITION

    //    deterministic table parser first,

    //    validated Groq values only as fallback

    // ========================================



    const { nutrition, meta: nutritionMeta } = buildNutrition({

        ocrText: pipelineResult.ocr?.text || "",

        passes: pipelineResult.ocrPasses,

        extraction: product,

    });



    // ========================================

    // 3. BUILD aiData IN THE SHAPE THE REST OF

    //    THE FLOW (MongoDB, API response) EXPECTS

    // ========================================



    // Ingredients are cleaned ONCE here, so MongoDB, PostgreSQL and

    // the API response all contain exactly the same list and order.

    const ingredientList = cleanIngredientList(product.ingredients);



    // Product identity: product_name, brand, variant.

    // Pack information: pack_size, servings_per_container.

    // Every value comes from extraction only. Missing stays null.

    const aiAnalysis = {

        product_name: product.product_name || product.name || null,

        brand: cleanText(product.brand),

        variant: cleanText(product.variant),

        pack_size: buildPackSize(product.packSize),

        servings_per_container: toServingsPerContainer(

            product.servingsPerContainer

        ),

        ingredients: ingredientList,

        allergens: product.allergens || [],

        nutrition,



        // Nutrition basis, source and sodium/salt details.

        nutrition_meta: nutritionMeta,

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



    // ========================================

    // 4. START TRANSACTION

    // ========================================



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



        const ruleResult = await runIngredientRules(

            client,

            savedProduct.id,

            analysis.id,

            userId

        );



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



        // ====================================

        // 14. DERIVED (NOT STORED) GROUP 2 DATA

        // ====================================



        const ruleInfo = await loadRuleInfo(pool);



        const ingredientDetails = buildIngredientDetails({

            ingredients: savedIngredients,

            matches: ruleResult.matches,

            ruleInfo,

            ragIngredients: aiData.rag?.ingredients,

        });



        const nutritionConverted = convertNutritionBasis(

            nutrition,

            nutritionMeta.basis

        );



        // ====================================

        // 15. AI EXPLANATION (Groq) - GROUP 3

        // ====================================

        //

        // Groq only explains what the rule engine already decided.

        // It receives the final score / grade / rule matches as

        // read-only facts. It cannot change them. This call never

        // throws: on any failure it returns an empty ai_insights

        // and the scan result is returned normally.



        aiData.ai_insights = await generateAiInsights({

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

        });



        // ====================================

        // 16. SAVE RAW DATA TO MONGODB

        // ====================================

        //

        // Saved AFTER the explanation so ai_insights is stored and

        // GET /scan/:id returns the same text as the new scan.



        await saveRawScanData({

            scanId: savedProduct.id,

            userId,

            filename: file.originalname,

            aiData,

        });



        // ====================================

        // 17. RETURN FINAL RESULT

        // ====================================



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

    const matches = ruleMatchesResult.rows;



    const breakdown = categorizeMatches(matches);



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