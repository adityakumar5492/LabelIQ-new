const axios = require("axios");
const FormData = require("form-data");
const mongoose = require("mongoose");

const pool = require("../config/db");


// ============================================
// CONSTANTS
// ============================================

// Personalized penalties.
// General ingredient-rule penalties still come
// from the ingredient_rules table.
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


// ============================================
// PERSONALIZED RULE CODES
// ============================================

const PERSONAL_RULE_CODES = {
    BLOCKLIST: "USER_BLOCKLIST",
    CALORIE: "CALORIE_LIMIT",
    SUGAR: "SUGAR_LIMIT",
    SODIUM: "SODIUM_LIMIT",
};


// SUGAR_LIMIT means declared nutrition exceeded
// the user's limit. It is NOT hidden sugar.
const HIDDEN_SUGAR_EXCLUDED_CODES = [
    PERSONAL_RULE_CODES.SUGAR,
];


// ============================================
// BLOCKLIST ALIASES
// ============================================

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


// ============================================
// HIGH SUGAR TERMS
// ============================================

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


// ============================================
// DIETARY MODES
// ============================================

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

        exceptions: [
            "GLUTEN FREE",
            "GLUTEN-FREE",
        ],
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
// HELPERS
// ============================================


// Convert database / AI value to number.
// Keeps null as null.
// Keeps 0 as 0.
const toNumberOrNull = (value) => {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return null;
    }

    const number = Number(value);

    return Number.isFinite(number)
        ? number
        : null;
};


// Escape regex characters.
const escapeRegex = (text) => {

    return String(text).replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
    );
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


// Normalize dietary mode.
const normalizeDietaryMode = (mode) => {

    if (
        !mode ||
        typeof mode !== "string"
    ) {
        return null;
    }

    const normalized = mode
        .trim()
        .toLowerCase()
        .replace(/[\s_]+/g, "-");

    return DIETARY_MODES[normalized]
        ? normalized
        : null;
};


// Only strict is treated as strict.
// Everything else defaults to moderate.
const normalizeStrictness = (strictness) => {

    return strictness === "strict"
        ? "strict"
        : "moderate";
};


// In strict mode, medium personalized issues
// become high severity.
const getSeverity = (
    baseSeverity,
    strictness
) => {

    if (
        strictness === "strict" &&
        baseSeverity === "medium"
    ) {
        return "high";
    }

    return baseSeverity;
};


// Remove phrases that should not trigger
// dietary keyword matching.
const stripExceptions = (
    text,
    exceptions = []
) => {

    let result = text;

    for (const phrase of exceptions) {

        result = result.replace(
            new RegExp(
                escapeRegex(phrase),
                "gi"
            ),
            " "
        );
    }

    return result;
};


// Clean and normalize AI ingredient list.
const cleanIngredientList = (
    rawIngredients
) => {

    const seen = new Set();
    const cleaned = [];

    if (!Array.isArray(rawIngredients)) {
        return cleaned;
    }

    for (const item of rawIngredients) {

        if (
            typeof item !== "string"
        ) {
            continue;
        }

        const name = item
            .trim()
            .replace(/\s+/g, " ")
            .slice(0, 255);

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
// MONGODB RAW SCAN STORAGE
// ============================================

const saveRawScanData = async ({
    scanId,
    userId,
    filename,
    aiData,
}) => {

    try {

        if (
            !mongoose.connection ||
            mongoose.connection.readyState !== 1
        ) {
            console.warn(
                "MongoDB is not connected. Raw scan data was not saved."
            );

            return;
        }


        const collection =
            mongoose.connection.collection(
                "scan_raw_data"
            );


        await collection.insertOne({

            scan_id:
                scanId,

            user_id:
                userId,

            filename:
                filename || null,

            ocr:
                aiData?.ocr || {},

            ai_analysis:
                aiData?.ai_analysis || {},

            rag:
                aiData?.rag || {
                    sources: [],
                },

            ai_insights:
                aiData?.ai_insights || {},

            created_at:
                new Date(),
        });


        console.log(
            `Raw scan data saved to MongoDB for scan ${scanId}`
        );

    } catch (error) {

        // MongoDB is used for raw/unstructured data.
        // Failure here must not invalidate a successful
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

    // --------------------------------
    // Keto / Type-2 diabetic
    // --------------------------------

    if (modeConfig.usesSugarRules) {

        const sugarRule =
            generalRulesMatched.find(
                (rule) =>
                    rule.rule_type === "hidden_sugar" ||
                    String(rule.rule_code)
                        .startsWith("SUGAR_")
            );

        if (sugarRule) {

            return (
                `matches the "${sugarRule.rule_name}" rule`
            );
        }


        const term =
            HIGH_SUGAR_TERMS.find(
                (item) =>
                    containsTerm(
                        ingredientName,
                        item
                    )
            );


        if (term) {

            return (
                `contains ${term.toLowerCase()}`
            );
        }


        return null;
    }


    // --------------------------------
    // Vegan / Gluten-free
    // --------------------------------

    const cleanedName =
        stripExceptions(
            ingredientName,
            modeConfig.exceptions
        );


    const term =
        modeConfig.terms.find(
            (item) =>
                containsTerm(
                    cleanedName,
                    item
                )
        );


    return term
        ? `contains ${term.toLowerCase()}`
        : null;
};


// ============================================
// GROUP RULE MATCHES
// ============================================

const categorizeMatches = (
    matches
) => {

    const isPersonal = (
        code
    ) => {

        return (
            code === PERSONAL_RULE_CODES.BLOCKLIST ||
            code === PERSONAL_RULE_CODES.CALORIE ||
            code === PERSONAL_RULE_CODES.SUGAR ||
            code === PERSONAL_RULE_CODES.SODIUM ||
            String(code).startsWith("DIET_")
        );
    };


    return {

        generalIssues: matches.filter(
            (match) =>
                !isPersonal(match.rule_code)
        ),

        blocklistIssues: matches.filter(
            (match) =>
                match.rule_code ===
                PERSONAL_RULE_CODES.BLOCKLIST
        ),

        calorieIssues: matches.filter(
            (match) =>
                match.rule_code ===
                PERSONAL_RULE_CODES.CALORIE
        ),

        sugarIssues: matches.filter(
            (match) =>
                match.rule_code ===
                PERSONAL_RULE_CODES.SUGAR
        ),

        sodiumIssues: matches.filter(
            (match) =>
                match.rule_code ===
                PERSONAL_RULE_CODES.SODIUM
        ),

        dietaryConflicts: matches.filter(
            (match) =>
                String(match.rule_code)
                    .startsWith("DIET_")
        ),
    };
};


// ============================================
// CALCULATE GRADE
// ============================================

const calculateGrade = (
    score
) => {

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

const recordRuleMatch = async (
    client,
    state,
    analysisId,
    match
) => {

    const key =
        `${match.ingredientId ?? "none"}:${match.ruleCode}`;


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


    const matchResult =
        await client.query(
            matchQuery,
            [
                analysisId,
                match.ingredientId ?? null,
                match.ruleCode,
                match.ruleName,
                match.matchedValue,
                match.severity,
                match.explanation,
            ]
        );


    state.matches.push(
        matchResult.rows[0]
    );


    state.score -=
        Number(match.penalty) || 0;
};


// ============================================
// RUN INGREDIENT RULES
// ============================================

const runIngredientRules = async (
    client,
    scanId,
    analysisId,
    userId
) => {

    // ========================================
    // 1. GET SCANNED INGREDIENTS
    // ========================================

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


    const ingredientResult =
        await client.query(
            ingredientQuery,
            [scanId]
        );


    // ========================================
    // 2. GET GENERAL INGREDIENT RULES
    // ========================================

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


    const ruleResult =
        await client.query(
            ruleQuery
        );


    // ========================================
    // 3. GET USER BLOCKLIST
    // ========================================

    const blocklistQuery = `
        SELECT
            id,
            ingredient_name,
            reason
        FROM ingredient_blocklist
        WHERE user_id = $1
        ORDER BY id;
    `;


    const blocklistResult =
        await client.query(
            blocklistQuery,
            [userId]
        );


    // ========================================
    // 4. GET USER HEALTH PROFILE
    // ========================================

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


    const healthProfileResult =
        await client.query(
            healthProfileQuery,
            [userId]
        );


    const healthProfile =
        healthProfileResult.rows[0] || null;


    const strictness =
        normalizeStrictness(
            healthProfile?.analysis_strictness
        );


    const penalties =
        PERSONAL_PENALTIES[strictness];


    const dietaryMode =
        normalizeDietaryMode(
            healthProfile?.dietary_mode
        );


    // ========================================
    // 5. GET NUTRITION
    // ========================================

    const nutritionQuery = `
        SELECT
            calories,
            total_sugars_g,
            added_sugars_g,
            sodium_mg
        FROM nutrition_details
        WHERE scan_id = $1;
    `;


    const nutritionResult =
        await client.query(
            nutritionQuery,
            [scanId]
        );


    const nutrition =
        nutritionResult.rows[0] || {};


    // ========================================
    // 6. INITIALIZE RULE ENGINE STATE
    // ========================================

    const state = {

        score: 100,

        matches: [],

        seenKeys: new Set(),
    };


    const generalRulesByIngredient =
        new Map();


    // ========================================
    // 7. GENERAL INGREDIENT RULES
    // ========================================

    for (
        const ingredient
        of ingredientResult.rows
    ) {

        const matchedRules = [];


        for (
            const rule
            of ruleResult.rows
        ) {

            if (
                !containsTerm(
                    ingredient.name,
                    rule.pattern
                )
            ) {
                continue;
            }


            matchedRules.push(rule);


            await recordRuleMatch(
                client,
                state,
                analysisId,
                {
                    ingredientId:
                        ingredient.id,

                    ruleCode:
                        rule.rule_code,

                    ruleName:
                        rule.rule_name,

                    matchedValue:
                        ingredient.name,

                    severity:
                        rule.severity,

                    explanation:
                        rule.explanation,

                    penalty:
                        rule.score_penalty,
                }
            );
        }


        generalRulesByIngredient.set(
            ingredient.id,
            matchedRules
        );
    }


    // ========================================
    // 8. USER BLOCKLIST
    // ========================================

    for (
        const ingredient
        of ingredientResult.rows
    ) {

        for (
            const blocked
            of blocklistResult.rows
        ) {

            const blockedName =
                String(
                    blocked.ingredient_name || ""
                )
                    .trim()
                    .toUpperCase();


            if (!blockedName) {
                continue;
            }


            const aliasKey =
                blockedName.endsWith("S")
                    ? blockedName.slice(0, -1)
                    : blockedName;


            const searchTerms = [
                blockedName,
                ...(BLOCKLIST_ALIASES[
                    aliasKey
                ] || []),
            ];


            const isBlocked =
                searchTerms.some(
                    (term) =>
                        containsTerm(
                            ingredient.name,
                            term
                        )
                );


            if (!isBlocked) {
                continue;
            }


            await recordRuleMatch(
                client,
                state,
                analysisId,
                {
                    ingredientId:
                        ingredient.id,

                    ruleCode:
                        PERSONAL_RULE_CODES.BLOCKLIST,

                    ruleName:
                        "User Blocklist",

                    matchedValue:
                        ingredient.name,

                    severity:
                        "high",

                    explanation:
                        blocked.reason ||
                        "Ingredient is present in your personal blocklist.",

                    penalty:
                        penalties.USER_BLOCKLIST,
                }
            );
        }
    }


    // ========================================
    // 9. NUTRITION LIMITS
    // ========================================

    if (healthProfile) {

        // ------------------------------------
        // Calories
        // ------------------------------------

        const calories =
            toNumberOrNull(
                nutrition.calories
            );


        const calorieLimit =
            toNumberOrNull(
                healthProfile.calorie_limit
            );


        if (
            calories !== null &&
            calorieLimit !== null &&
            calories > calorieLimit
        ) {

            await recordRuleMatch(
                client,
                state,
                analysisId,
                {
                    ingredientId: null,

                    ruleCode:
                        PERSONAL_RULE_CODES.CALORIE,

                    ruleName:
                        "Calorie Limit Exceeded",

                    matchedValue:
                        `${calories} kcal`,

                    severity:
                        getSeverity(
                            "medium",
                            strictness
                        ),

                    explanation:
                        `Detected calories (${calories} kcal) exceed your calorie limit (${calorieLimit} kcal).`,

                    penalty:
                        penalties.CALORIE_LIMIT,
                }
            );
        }


        // ------------------------------------
        // Sugar
        // ------------------------------------

        const sugar =
            toNumberOrNull(
                nutrition.total_sugars_g
            );


        const sugarLimit =
            toNumberOrNull(
                healthProfile.max_sugar_threshold
            );


        if (
            sugar !== null &&
            sugarLimit !== null &&
            sugar > sugarLimit
        ) {

            await recordRuleMatch(
                client,
                state,
                analysisId,
                {
                    ingredientId: null,

                    ruleCode:
                        PERSONAL_RULE_CODES.SUGAR,

                    ruleName:
                        "Sugar Limit Exceeded",

                    matchedValue:
                        `${sugar} g`,

                    severity:
                        "high",

                    explanation:
                        `Detected total sugars (${sugar} g) exceed your sugar threshold (${sugarLimit} g).`,

                    penalty:
                        penalties.SUGAR_LIMIT,
                }
            );
        }


        // ------------------------------------
        // Sodium
        // ------------------------------------

        const sodium =
            toNumberOrNull(
                nutrition.sodium_mg
            );


        const sodiumLimit =
            toNumberOrNull(
                healthProfile.max_sodium_threshold
            );


        if (
            sodium !== null &&
            sodiumLimit !== null &&
            sodium > sodiumLimit
        ) {

            await recordRuleMatch(
                client,
                state,
                analysisId,
                {
                    ingredientId: null,

                    ruleCode:
                        PERSONAL_RULE_CODES.SODIUM,

                    ruleName:
                        "Sodium Limit Exceeded",

                    matchedValue:
                        `${sodium} mg`,

                    severity:
                        getSeverity(
                            "medium",
                            strictness
                        ),

                    explanation:
                        `Detected sodium (${sodium} mg) exceeds your sodium threshold (${sodiumLimit} mg).`,

                    penalty:
                        penalties.SODIUM_LIMIT,
                }
            );
        }
    }


    // ========================================
    // 10. DIETARY MODE
    // ========================================

    if (dietaryMode) {

        const modeConfig =
            DIETARY_MODES[dietaryMode];


        for (
            const ingredient
            of ingredientResult.rows
        ) {

            const reason =
                getDietaryConflict(
                    modeConfig,
                    ingredient.name,
                    generalRulesByIngredient.get(
                        ingredient.id
                    ) || []
                );


            if (!reason) {
                continue;
            }


            await recordRuleMatch(
                client,
                state,
                analysisId,
                {
                    ingredientId:
                        ingredient.id,

                    ruleCode:
                        modeConfig.code,

                    ruleName:
                        `Dietary Mode Conflict (${modeConfig.label})`,

                    matchedValue:
                        ingredient.name,

                    severity:
                        getSeverity(
                            "medium",
                            strictness
                        ),

                    explanation:
                        `Potential conflict with your selected dietary mode (${modeConfig.label}): "${ingredient.name}" ${reason}.`,

                    penalty:
                        penalties.DIETARY_CONFLICT,
                }
            );
        }


        // ------------------------------------
        // Type-2 diabetic:
        // added sugar > 0
        // ------------------------------------

        const addedSugar =
            toNumberOrNull(
                nutrition.added_sugars_g
            );


        if (
            dietaryMode === "type-2-diabetic" &&
            addedSugar !== null &&
            addedSugar > 0
        ) {

            await recordRuleMatch(
                client,
                state,
                analysisId,
                {
                    ingredientId: null,

                    ruleCode:
                        modeConfig.code,

                    ruleName:
                        `Dietary Mode Conflict (${modeConfig.label})`,

                    matchedValue:
                        `${addedSugar} g added sugars`,

                    severity:
                        getSeverity(
                            "medium",
                            strictness
                        ),

                    explanation:
                        `Potential conflict with your selected dietary mode (${modeConfig.label}): the product contains ${addedSugar} g of added sugars.`,

                    penalty:
                        penalties.DIETARY_CONFLICT,
                }
            );
        }
    }


    // ========================================
    // 11. FINAL SCORE
    // ========================================

    const score =
        Math.max(
            state.score,
            0
        );


    const grade =
        calculateGrade(score);


    // ========================================
    // 12. HIDDEN SUGAR DETECTION
    // ========================================

    const hiddenSugarDetected =
        state.matches.some(
            (match) => {

                const ruleCode =
                    String(
                        match.rule_code
                    );


                return (
                    ruleCode.startsWith("SUGAR_") &&
                    !HIDDEN_SUGAR_EXCLUDED_CODES.includes(
                        ruleCode
                    )
                );
            }
        );


    // ========================================
    // 13. RETURN RULE ENGINE RESULT
    // ========================================

    return {

        score,

        grade,

        matches:
            state.matches,

        healthProfile,

        hiddenSugarDetected,

        breakdown:
            categorizeMatches(
                state.matches
            ),

        personalization: {

            profileApplied:
                Boolean(healthProfile),

            dietaryMode,

            analysisStrictness:
                strictness,
        },
    };
};


// ============================================
// ANALYZE IMAGE
// ============================================

const analyzeImage = async (
    file,
    userId
) => {

    // ========================================
    // 1. SEND IMAGE TO AI SERVICE
    // ========================================

    const formData =
        new FormData();


    formData.append(
        "file",
        file.buffer,
        {
            filename:
                file.originalname,

            contentType:
                file.mimetype,
        }
    );


    const response =
        await axios.post(
            `${process.env.AI_SERVICE_URL}/scan`,
            formData,
            {
                headers: {
                    ...formData.getHeaders(),
                },

                maxContentLength:
                    Infinity,

                maxBodyLength:
                    Infinity,
            }
        );


    const aiData =
        response.data;


    // FastAPI returns ai_analysis directly.
    const aiAnalysis =
        aiData.ai_analysis;


    if (!aiAnalysis) {

        throw new Error(
            "AI analysis data not found"
        );
    }


    // ========================================
    // 2. PREPARE NUTRITION
    // ========================================

    const nutrition =
        aiAnalysis.nutrition || {};


    const nutritionValue = (
        key
    ) => {

        return toNumberOrNull(
            nutrition[key]
        );
    };


    // ========================================
    // 3. START TRANSACTION
    // ========================================

    const client =
        await pool.connect();


    try {

        await client.query(
            "BEGIN"
        );


        // ====================================
        // 4. CREATE SCANNED PRODUCT
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
                ? String(
                    aiAnalysis.product_name
                ).slice(0, 255)
                : null,

            null,

            null,

            nutritionValue(
                "total_sugars_g"
            ),

            false,

            "completed",
        ];


        const productResult =
            await client.query(
                productQuery,
                productValues
            );


        const product =
            productResult.rows[0];


        // ====================================
        // 5. SAVE NUTRITION
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


        const servingSize =
            nutrition.serving_size === null ||
            nutrition.serving_size === undefined ||
            nutrition.serving_size === ""
                ? null
                : String(
                    nutrition.serving_size
                ).slice(0, 100);


        const nutritionValues = [

            product.id,

            servingSize,

            nutritionValue(
                "calories"
            ),

            nutritionValue(
                "protein_g"
            ),

            nutritionValue(
                "carbohydrates_g"
            ),

            nutritionValue(
                "total_fat_g"
            ),

            nutritionValue(
                "saturated_fat_g"
            ),

            nutritionValue(
                "dietary_fiber_g"
            ),

            nutritionValue(
                "total_sugars_g"
            ),

            nutritionValue(
                "added_sugars_g"
            ),

            nutritionValue(
                "sodium_mg"
            ),
        ];


        const nutritionResult =
            await client.query(
                nutritionQuery,
                nutritionValues
            );


        // ====================================
        // 6. SAVE INGREDIENTS
        // ====================================

        const ingredients =
            cleanIngredientList(
                aiAnalysis.ingredients
            );


        for (
            let i = 0;
            i < ingredients.length;
            i++
        ) {

            const ingredientName =
                ingredients[i];


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


            const ingredientResult =
                await client.query(
                    ingredientQuery,
                    [ingredientName]
                );


            const ingredientId =
                ingredientResult
                    .rows[0]
                    .id;


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


            await client.query(
                scanIngredientQuery,
                [
                    product.id,
                    ingredientId,
                    i + 1,
                    "ai",
                ]
            );
        }


        // ====================================
        // 7. CREATE ANALYSIS RESULT
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


        const analysisResult =
            await client.query(
                analysisQuery,
                [product.id]
            );


        const analysis =
            analysisResult.rows[0];


        // ====================================
        // 8. RUN RULE ENGINE
        // ====================================

        const ruleResult =
            await runIngredientRules(
                client,
                product.id,
                analysis.id,
                userId
            );


        // ====================================
        // 9. CREATE ASSESSMENT
        // ====================================

        const assessment =
            ruleResult.matches.length > 0
                ? "Issues detected"
                : "No rule violations detected";


        // ====================================
        // 10. UPDATE ANALYSIS RESULT
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


        const updatedAnalysisResult =
            await client.query(
                updateAnalysisQuery,
                [
                    ruleResult.grade,

                    ruleResult.score,

                    assessment,

                    analysis.id,
                ]
            );


        const finalAnalysis =
            updatedAnalysisResult.rows[0];


        // ====================================
        // 11. UPDATE SCANNED PRODUCT
        // ====================================

        const updateProductQuery = `
            UPDATE scanned_products
            SET
                safety_grade = $1,
                safety_score = $2,
                hidden_sugar_detected = $3
            WHERE id = $4;
        `;


        await client.query(
            updateProductQuery,
            [
                ruleResult.grade,

                ruleResult.score,

                ruleResult.hiddenSugarDetected,

                product.id,
            ]
        );


        // ====================================
        // 12. COMMIT POSTGRESQL
        // ====================================

        await client.query(
            "COMMIT"
        );


        // ====================================
        // 13. SAVE RAW DATA TO MONGODB
        // ====================================

        await saveRawScanData({

            scanId:
                product.id,

            userId,

            filename:
                file.originalname,

            aiData,
        });


        // ====================================
        // 14. RETURN FINAL RESULT
        // ====================================

        return {

            ...aiData,

            analysis: {

                id:
                    finalAnalysis.id,

                safetyGrade:
                    finalAnalysis.safety_grade,

                safetyScore:
                    finalAnalysis.safety_score,

                assessment:
                    finalAnalysis.assessment,

                hiddenSugarDetected:
                    ruleResult.hiddenSugarDetected,

                ruleMatches:
                    ruleResult.matches,

                breakdown:
                    ruleResult.breakdown,

                personalization:
                    ruleResult.personalization,
            },


            database: {

                scanId:
                    product.id,

                nutritionId:
                    nutritionResult.rows[0].id,

                ingredientsSaved:
                    ingredients.length,
            },
        };


    } catch (error) {

        // ====================================
        // ROLLBACK
        // ====================================

        try {

            await client.query(
                "ROLLBACK"
            );

        } catch (rollbackError) {

            console.error(
                "Rollback failed:",
                rollbackError.message
            );
        }


        console.error(
            "Failed to save scan data:",
            error
        );


        throw error;


    } finally {

        // ====================================
        // RELEASE CONNECTION
        // ====================================

        client.release();
    }
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


    const result =
        await pool.query(
            query,
            [userId]
        );


    return result.rows;
};


// ============================================
// GET SINGLE SCAN
// ============================================

const getScanById = async (
    userId,
    scanId
) => {

    // ========================================
    // 1. GET MAIN SCAN DATA
    // ========================================

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


    const scanResult =
        await pool.query(
            scanQuery,
            [scanId, userId]
        );


    if (scanResult.rows.length === 0) {
        return null;
    }


    const scan =
        scanResult.rows[0];


    // ========================================
    // 2. GET INGREDIENTS
    // ========================================

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

        ORDER BY si.ingredient_order ASC;
    `;


    const ingredientsResult =
        await pool.query(
            ingredientsQuery,
            [scanId]
        );


    // ========================================
    // 3. GET RULE MATCHES
    // ========================================

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


    const ruleMatchesResult =
        await pool.query(
            ruleMatchesQuery,
            [scan.analysis_id]
        );


    // ========================================
    // 4. BUILD RULE BREAKDOWN
    // ========================================

    const matches =
        ruleMatchesResult.rows;


    const isPersonalRule = (code) => {

        return (
            code === PERSONAL_RULE_CODES.BLOCKLIST ||
            code === PERSONAL_RULE_CODES.CALORIE ||
            code === PERSONAL_RULE_CODES.SUGAR ||
            code === PERSONAL_RULE_CODES.SODIUM ||
            String(code).startsWith("DIET_")
        );
    };


    const breakdown = {

        generalIssues: matches.filter(
            (match) =>
                !isPersonalRule(
                    match.rule_code
                )
        ),

        blocklistIssues: matches.filter(
            (match) =>
                match.rule_code ===
                PERSONAL_RULE_CODES.BLOCKLIST
        ),

        calorieIssues: matches.filter(
            (match) =>
                match.rule_code ===
                PERSONAL_RULE_CODES.CALORIE
        ),

        sugarIssues: matches.filter(
            (match) =>
                match.rule_code ===
                PERSONAL_RULE_CODES.SUGAR
        ),

        sodiumIssues: matches.filter(
            (match) =>
                match.rule_code ===
                PERSONAL_RULE_CODES.SODIUM
        ),

        dietaryConflicts: matches.filter(
            (match) =>
                String(match.rule_code)
                    .startsWith("DIET_")
        ),
    };


    // ========================================
    // 5. GET USER HEALTH PROFILE
    // ========================================

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


    const profileResult =
        await pool.query(
            profileQuery,
            [userId]
        );


    const profile =
        profileResult.rows[0] || null;


    // ========================================
    // 6. GET RAW SCAN DATA FROM MONGODB
    // ========================================

    let rawScanData = null;


    try {

        if (
            mongoose.connection &&
            mongoose.connection.readyState === 1
        ) {

            const collection =
                mongoose.connection.collection(
                    "scan_raw_data"
                );


            rawScanData =
                await collection.findOne({
                    scan_id:
                        scan.scan_id,

                    user_id:
                        userId,
                });
        }

    } catch (error) {

        console.error(
            "Failed to read raw scan data from MongoDB:",
            error.message
        );
    }


    // ========================================
    // 7. RETURN NORMALIZED RESULT
    // ========================================

    return {

        filename:
            rawScanData?.filename ||
            "Food label",


        // ====================================
        // OCR
        // ====================================

        ocr:
            rawScanData?.ocr || {},


        // ====================================
        // AI ANALYSIS
        // ====================================

        ai_analysis: {

            product_name:
                scan.product_name,

            ingredients:
                ingredientsResult.rows.map(
                    (ingredient) =>
                        ingredient.name
                ),

            allergens:
                rawScanData?.ai_analysis?.allergens ||
                [],

            nutrition: {

                serving_size:
                    scan.serving_size,

                calories:
                    scan.calories,

                protein_g:
                    scan.protein_g,

                carbohydrates_g:
                    scan.carbohydrates_g,

                total_fat_g:
                    scan.total_fat_g,

                saturated_fat_g:
                    scan.saturated_fat_g,

                dietary_fiber_g:
                    scan.dietary_fiber_g,

                total_sugars_g:
                    scan.total_sugars_g,

                added_sugars_g:
                    scan.added_sugars_g,

                sodium_mg:
                    scan.sodium_mg,
            },
        },


        // ====================================
        // RAG
        // ====================================

        rag:
            rawScanData?.rag || {
                sources: [],
            },


        // ====================================
        // AI INSIGHTS
        // ====================================

        ai_insights:
            rawScanData?.ai_insights || {},


        // ====================================
        // DETERMINISTIC ANALYSIS
        // ====================================

        analysis: {

            id:
                scan.analysis_id,

            safetyGrade:
                scan.safety_grade,

            safetyScore:
                scan.safety_score,

            assessment:
                scan.assessment,

            hiddenSugarDetected:
                scan.hidden_sugar_detected,

            ruleMatches:
                matches,

            breakdown,

            personalization: {

                profileApplied:
                    Boolean(profile),

                dietaryMode:
                    normalizeDietaryMode(
                        profile?.dietary_mode
                    ),

                analysisStrictness:
                    normalizeStrictness(
                        profile?.analysis_strictness
                    ),
            },
        },


        // ====================================
        // DATABASE
        // ====================================

        database: {

            scanId:
                scan.scan_id,

            nutritionId:
                scan.nutrition_id,

            ingredientsSaved:
                ingredientsResult.rows.length,
        },
    };
};


// ============================================
// EXPORTS
// ============================================

module.exports = {
    analyzeImage,
    runIngredientRules,
    getScanHistory,
    getScanById,
};