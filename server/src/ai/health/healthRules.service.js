"use strict";

/**
 * LabelIQ - deterministic health rule engine.
 *
 * AI/RAG explains and provides evidence.
 * Deterministic rules decide the health score.
 *
 * This module is PURE:
 * - no database
 * - no MongoDB
 * - no Groq
 * - no RAG
 * - no network
 *
 * Given the same input, it always returns the same:
 * - score
 * - grade
 * - penalties
 * - rule matches
 *
 * Score = 100 - sum(penalties)
 * Grade:
 *   90-100 = A
 *   75-89  = B
 *   50-74  = C
 *   0-49   = D
 */

// ============================================
// CONSTANTS
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

// SUGAR_LIMIT is a nutrition-limit rule.
// It is NOT hidden sugar.
const HIDDEN_SUGAR_EXCLUDED_CODES = [
    PERSONAL_RULE_CODES.SUGAR,
];

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

// ============================================
// INGREDIENT RULE ALIASES
// ============================================

/**
 * Different labels can represent the same ingredient.
 *
 * Example:
 * E621
 * INS 621
 * 621
 * MSG
 * Monosodium Glutamate
 *
 * All belong to the same logical rule.
 */
const INGREDIENT_RULE_ALIASES = {
    E621: [
        "E621",
        "INS 621",
        "621",
        "MSG",
        "MONOSODIUM GLUTAMATE",
        "MONOSODIUM GLUTAMATE (MSG)",
    ],

    E211: [
        "E211",
        "INS 211",
        "211",
        "SODIUM BENZOATE",
    ],

    E320: [
        "E320",
        "INS 320",
        "320",
        "BHA",
        "BUTYLATED HYDROXYANISOLE",
    ],

    SUGAR_GLUCOS_SYRUP: [
        "GLUCOSE SYRUP",
        "GLUCOSE",
        "DEXTROSE",
    ],

    SUGAR_MALTODEXTRIN: [
        "MALTODEXTRIN",
    ],

    SUGAR_HFCS: [
        "HIGH FRUCTOSE CORN SYRUP",
        "HFCS",
        "FRUCTOSE CORN SYRUP",
    ],
};

/**
 * Maps aliases/rule codes to one logical rule.
 *
 * This prevents:
 * E621 + MSG
 *
 * from being penalized twice for the same ingredient.
 */
const RULE_CODE_ALIAS_GROUPS = {
    E621: "E621",
    E211: "E211",
    E320: "E320",
    SUGAR_GLUCOS_SYRUP: "SUGAR_GLUCOS_SYRUP",
    SUGAR_MALTODEXTRIN: "SUGAR_MALTODEXTRIN",
    SUGAR_HFCS: "SUGAR_HFCS",
};

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
// SAFE NUMBER HELPERS
// ============================================

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

const toNonNegativeNumber = (value) => {
    const number = toFiniteNumber(value);

    return number !== null && number >= 0
        ? number
        : null;
};

const toPenalty = (value) => {
    return toNonNegativeNumber(value) ?? 0;
};

const round2 = (value) => {
    return Math.round(value * 100) / 100;
};

const hasOwn = (object, key) => {
    return Object.prototype.hasOwnProperty.call(
        object,
        key
    );
};

const isPlainObject = (value) => {
    return (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value)
    );
};

// ============================================
// TEXT HELPERS
// ============================================

const escapeRegex = (text) => {
    return String(text).replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
    );
};

/**
 * Case-insensitive whole-term matching.
 *
 * Prevents:
 * MILK matching "MILKSHAKE"
 * E621 matching "E6210"
 */
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
        `(?<![A-Za-z0-9])${escapeRegex(
            normalizedTerm
        )}s?(?![A-Za-z0-9])`,
        "i"
    );

    return regex.test(normalizedText);
};

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

const normalizeKey = (text) => {
    return String(text ?? "")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();
};

/**
 * Normalize ingredient text for rule matching.
 */
const normalizeIngredientText = (value) => {
    return String(value ?? "")
        .toUpperCase()
        .replace(/[()[\],.:;|/]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
};

// ============================================
// INGREDIENT RULE MATCHING
// ============================================

const getRuleAliases = (rule) => {
    const ruleCode = String(
        rule?.rule_code ?? ""
    ).trim();

    const aliases = [];

    // Always include the DB pattern.
    if (rule?.pattern) {
        aliases.push(
            String(rule.pattern)
        );
    }

    // Add aliases for known logical rules.
    if (
        ruleCode &&
        INGREDIENT_RULE_ALIASES[ruleCode]
    ) {
        aliases.push(
            ...INGREDIENT_RULE_ALIASES[ruleCode]
        );
    }

    const logicalGroup =
        RULE_CODE_ALIAS_GROUPS[ruleCode];

    if (
        logicalGroup &&
        INGREDIENT_RULE_ALIASES[
            logicalGroup
        ]
    ) {
        aliases.push(
            ...INGREDIENT_RULE_ALIASES[
                logicalGroup
            ]
        );
    }

    return [
        ...new Set(
            aliases
                .map(normalizeIngredientText)
                .filter(Boolean)
        ),
    ];
};

/**
 * Checks whether an ingredient matches
 * a database rule or one of its known aliases.
 */
const matchesIngredientRule = (
    ingredientName,
    rule
) => {
    const ingredient =
        normalizeIngredientText(
            ingredientName
        );

    if (!ingredient) {
        return false;
    }

    const aliases =
        getRuleAliases(rule);

    return aliases.some((alias) =>
        containsTerm(
            ingredient,
            alias
        )
    );
};

/**
 * Convert aliases to one logical rule code.
 */
const getLogicalRuleCode = (
    ruleCode
) => {
    const code = String(
        ruleCode ?? ""
    ).trim();

    return (
        RULE_CODE_ALIAS_GROUPS[code] ||
        code
    );
};

// ============================================
// PROFILE NORMALIZERS
// ============================================

const normalizeDietaryMode = (
    mode
) => {
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

    return hasOwn(
        DIETARY_MODES,
        normalized
    )
        ? normalized
        : null;
};

const normalizeStrictness = (
    strictness
) => {
    if (
        typeof strictness ===
            "string" &&
        strictness
            .trim()
            .toLowerCase() ===
            "strict"
    ) {
        return "strict";
    }

    return "moderate";
};

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

/**
 * Reads both DB snake_case and
 * application camelCase fields.
 */
const readHealthProfile = (
    profile
) => {
    if (!isPlainObject(profile)) {
        return null;
    }

    return {
        calorieLimit:
            toNonNegativeNumber(
                profile.calorie_limit ??
                    profile.calorieLimit
            ),

        sugarLimit:
            toNonNegativeNumber(
                profile.max_sugar_threshold ??
                    profile.maxSugarThreshold
            ),

        sodiumLimit:
            toNonNegativeNumber(
                profile.max_sodium_threshold ??
                    profile.maxSodiumThreshold
            ),

        dietaryMode:
            normalizeDietaryMode(
                profile.dietary_mode ??
                    profile.dietaryMode
            ),

        strictness:
            normalizeStrictness(
                profile.analysis_strictness ??
                    profile.analysisStrictness
            ),
    };
};

// ============================================
// RULE CATEGORIES
// ============================================

const getMatchCategory = (
    code
) => {
    const ruleCode = String(code);

    if (
        ruleCode ===
        PERSONAL_RULE_CODES.BLOCKLIST
    ) {
        return "blocklist";
    }

    if (ruleCode.startsWith("DIET_")) {
        return "dietary";
    }

    if (
        ruleCode ===
            PERSONAL_RULE_CODES.CALORIE ||
        ruleCode ===
            PERSONAL_RULE_CODES.SUGAR ||
        ruleCode ===
            PERSONAL_RULE_CODES.SODIUM
    ) {
        return "nutrition_limit";
    }

    return "general";
};

const isHiddenSugarCode = (
    code
) => {
    const ruleCode = String(code);

    return (
        ruleCode.startsWith("SUGAR_") &&
        !HIDDEN_SUGAR_EXCLUDED_CODES.includes(
            ruleCode
        )
    );
};

const isHiddenSugarRule = (
    rule
) => {
    return (
        Boolean(rule) &&
        (
            rule.rule_type ===
                "hidden_sugar" ||
            isHiddenSugarCode(
                rule.rule_code
            )
        )
    );
};

const categorizeMatches = (
    matches
) => {
    const list = Array.isArray(matches)
        ? matches
        : [];

    const categoryOf = (match) =>
        getMatchCategory(
            match.rule_code
        );

    return {
        generalIssues: list.filter(
            (match) =>
                categoryOf(match) ===
                "general"
        ),

        blocklistIssues: list.filter(
            (match) =>
                categoryOf(match) ===
                "blocklist"
        ),

        calorieIssues: list.filter(
            (match) =>
                match.rule_code ===
                PERSONAL_RULE_CODES.CALORIE
        ),

        sugarIssues: list.filter(
            (match) =>
                match.rule_code ===
                PERSONAL_RULE_CODES.SUGAR
        ),

        sodiumIssues: list.filter(
            (match) =>
                match.rule_code ===
                PERSONAL_RULE_CODES.SODIUM
        ),

        dietaryConflicts: list.filter(
            (match) =>
                categoryOf(match) ===
                "dietary"
        ),
    };
};

// ============================================
// SCORE + GRADE
// ============================================

const clampScore = (
    value
) => {
    const number =
        toFiniteNumber(value);

    if (number === null) {
        return null;
    }

    return Math.min(
        MAX_SCORE,
        Math.max(
            MIN_SCORE,
            number
        )
    );
};

const calculateGrade = (
    score
) => {
    const value =
        clampScore(score);

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

const calculateScore = (
    penalties
) => {
    const list = Array.isArray(
        penalties
    )
        ? penalties
        : [];

    let total = 0;

    for (const penalty of list) {
        total += toPenalty(
            penalty
        );
    }

    return clampScore(
        round2(
            MAX_SCORE - total
        )
    );
};

// ============================================
// DIETARY CONFLICT
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
        const sugarRule =
            (
                generalRulesMatched ||
                []
            ).find(
                isHiddenSugarRule
            );

        if (sugarRule) {
            return `matches the "${sugarRule.rule_name}" rule`;
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
            return `contains ${term.toLowerCase()}`;
        }

        return null;
    }

    // Vegan / Gluten-free
    const cleanedName =
        stripExceptions(
            String(
                ingredientName ?? ""
            ),
            modeConfig.exceptions
        );

    const term =
        (
            modeConfig.terms ||
            []
        ).find((item) =>
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
// RULE ENGINE
// ============================================

/**
 * @param {object} input
 *
 * @param {Array} input.ingredients
 *   [{ id, name }]
 *
 * @param {Array} input.generalRules
 *   ingredient_rules rows
 *
 * @param {Array} input.blocklist
 *   [{ ingredient_name, reason }]
 *
 * @param {object} input.healthProfile
 *   health_profiles row or null
 *
 * @param {object} input.nutrition
 *   {
 *      calories,
 *      total_sugars_g,
 *      added_sugars_g,
 *      sodium_mg
 *   }
 *
 * @returns {{
 *   score: number,
 *   grade: string,
 *   matches: Array,
 *   totalPenalty: number,
 *   hiddenSugarDetected: boolean,
 *   breakdown: object,
 *   healthProfile: object|null,
 *   personalization: object
 * }}
 */
const evaluateHealthRules = (
    input = {}
) => {
    const rawProfile =
        isPlainObject(
            input.healthProfile
        )
            ? input.healthProfile
            : null;

    const profile =
        readHealthProfile(
            rawProfile
        );

    const strictness = profile
        ? profile.strictness
        : "moderate";

    const dietaryMode = profile
        ? profile.dietaryMode
        : null;

    const penalties =
        PERSONAL_PENALTIES[
            strictness
        ];

    const nutrition =
        isPlainObject(
            input.nutrition
        )
            ? input.nutrition
            : {};

    const generalRules =
        Array.isArray(
            input.generalRules
        )
            ? input.generalRules.filter(
                  isPlainObject
              )
            : [];

    const blocklist =
        Array.isArray(
            input.blocklist
        )
            ? input.blocklist.filter(
                  isPlainObject
              )
            : [];

    // ========================================
    // UNIQUE INGREDIENTS
    // ========================================

    const ingredients = [];

    const seenIngredientNames =
        new Set();

    for (const item of Array.isArray(
        input.ingredients
    )
        ? input.ingredients
        : []) {
        if (
            !isPlainObject(item) ||
            typeof item.name !==
                "string"
        ) {
            continue;
        }

        const key =
            normalizeKey(
                item.name
            );

        if (
            !key ||
            seenIngredientNames.has(
                key
            )
        ) {
            continue;
        }

        seenIngredientNames.add(
            key
        );

        ingredients.push({
            id: item.id ?? null,
            name: item.name,
            key,
        });
    }

    // ========================================
    // MATCH BOOKKEEPING
    // ========================================

    const matches = [];

    const seenRuleKeys =
        new Set();

    let hiddenSugarDetected =
        false;

    /**
     * Returns true if a match was
     * actually recorded.
     */
    const addMatch = (
        match
    ) => {
        const scope =
            match.ingredientKey ??
            "none";

        /**
         * Logical rule code prevents
         * aliases from stacking.
         *
         * Example:
         * ingredient = MSG
         *
         * DB rule 1 = E621
         * DB rule 2 = MSG
         *
         * Only one penalty.
         */
        const logicalRuleCode =
            getLogicalRuleCode(
                match.ruleCode
            );

        const codeKey =
            `${scope}:${logicalRuleCode}`;

        if (
            seenRuleKeys.has(
                codeKey
            )
        ) {
            return false;
        }

        const nameKey =
            match.dedupeByName
                ? `${scope}:name:${normalizeKey(
                      match.ruleName
                  )}`
                : null;

        if (
            nameKey &&
            seenRuleKeys.has(
                nameKey
            )
        ) {
            return false;
        }

        seenRuleKeys.add(
            codeKey
        );

        if (nameKey) {
            seenRuleKeys.add(
                nameKey
            );
        }

        matches.push({
            ingredient_id:
                match.ingredientId ??
                null,

            rule_code:
                match.ruleCode,

            rule_name:
                match.ruleName,

            matched_value:
                match.matchedValue,

            severity:
                match.severity,

            explanation:
                match.explanation,

            penalty:
                toPenalty(
                    match.penalty
                ),
        });

        return true;
    };

    const generalRulesByIngredient =
        new Map();

    // ========================================
    // 1. GENERAL INGREDIENT RULES
    // ========================================

    for (const ingredient of ingredients) {
        const matchedRules = [];

        for (const rule of generalRules) {
            /**
             * IMPORTANT:
             *
             * Do not use RAG here.
             *
             * Only DB health rules and their
             * explicit aliases can create
             * a health penalty.
             */
            if (
                !matchesIngredientRule(
                    ingredient.name,
                    rule
                )
            ) {
                continue;
            }

            matchedRules.push(
                rule
            );

            const recorded =
                addMatch({
                    ingredientId:
                        ingredient.id,

                    ingredientKey:
                        ingredient.key,

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

                    dedupeByName:
                        true,
                });

            if (
                recorded &&
                isHiddenSugarRule(
                    rule
                )
            ) {
                hiddenSugarDetected =
                    true;
            }
        }

        generalRulesByIngredient.set(
            ingredient.key,
            matchedRules
        );
    }

    // ========================================
    // 2. USER BLOCKLIST
    // ========================================

    for (const ingredient of ingredients) {
        for (const blocked of blocklist) {
            const blockedName =
                String(
                    blocked.ingredient_name ??
                        ""
                )
                    .trim()
                    .toUpperCase();

            if (!blockedName) {
                continue;
            }

            const singular =
                blockedName.endsWith(
                    "S"
                )
                    ? blockedName.slice(
                          0,
                          -1
                      )
                    : blockedName;

            const aliases =
                hasOwn(
                    BLOCKLIST_ALIASES,
                    singular
                )
                    ? BLOCKLIST_ALIASES[
                          singular
                      ]
                    : hasOwn(
                          BLOCKLIST_ALIASES,
                          blockedName
                      )
                    ? BLOCKLIST_ALIASES[
                          blockedName
                      ]
                    : [];

            const searchTerms = [
                blockedName,
                ...aliases,
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

            addMatch({
                ingredientId:
                    ingredient.id,

                ingredientKey:
                    ingredient.key,

                ruleCode:
                    PERSONAL_RULE_CODES.BLOCKLIST,

                ruleName:
                    "User Blocklist",

                matchedValue:
                    ingredient.name,

                severity: "high",

                explanation:
                    blocked.reason ||
                    "Ingredient is present in your personal blocklist.",

                penalty:
                    penalties.USER_BLOCKLIST,
            });
        }
    }

    // ========================================
    // 3. NUTRITION LIMITS
    // ========================================

    /**
     * Nutrition limits are applied only
     * when:
     *
     * - profile exists
     * - nutrition value exists
     * - corresponding limit exists
     *
     * Missing values never create
     * false violations.
     */

    if (profile) {
        // ------------------------------------
        // CALORIES
        // ------------------------------------

        const calories =
            toNonNegativeNumber(
                nutrition.calories
            );

        if (
            calories !== null &&
            profile.calorieLimit !==
                null &&
            calories >
                profile.calorieLimit
        ) {
            addMatch({
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
                    `Detected calories (${calories} kcal) exceed your calorie limit (${profile.calorieLimit} kcal).`,

                penalty:
                    penalties.CALORIE_LIMIT,
            });
        }

        // ------------------------------------
        // SUGAR
        // ------------------------------------

        const sugar =
            toNonNegativeNumber(
                nutrition.total_sugars_g
            );

        if (
            sugar !== null &&
            profile.sugarLimit !==
                null &&
            sugar >
                profile.sugarLimit
        ) {
            addMatch({
                ingredientId: null,

                ruleCode:
                    PERSONAL_RULE_CODES.SUGAR,

                ruleName:
                    "Sugar Limit Exceeded",

                matchedValue:
                    `${sugar} g`,

                severity: "high",

                explanation:
                    `Detected total sugars (${sugar} g) exceed your sugar threshold (${profile.sugarLimit} g).`,

                penalty:
                    penalties.SUGAR_LIMIT,
            });
        }

        // ------------------------------------
        // SODIUM
        // ------------------------------------

        const sodium =
            toNonNegativeNumber(
                nutrition.sodium_mg
            );

        if (
            sodium !== null &&
            profile.sodiumLimit !==
                null &&
            sodium >
                profile.sodiumLimit
        ) {
            addMatch({
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
                    `Detected sodium (${sodium} mg) exceeds your sodium threshold (${profile.sodiumLimit} mg).`,

                penalty:
                    penalties.SODIUM_LIMIT,
            });
        }
    }

    // ========================================
    // 4. DIETARY MODE
    // ========================================

    if (dietaryMode) {
        const modeConfig =
            DIETARY_MODES[
                dietaryMode
            ];

        for (const ingredient of ingredients) {
            const reason =
                getDietaryConflict(
                    modeConfig,
                    ingredient.name,
                    generalRulesByIngredient.get(
                        ingredient.key
                    ) || []
                );

            if (!reason) {
                continue;
            }

            addMatch({
                ingredientId:
                    ingredient.id,

                ingredientKey:
                    ingredient.key,

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
            });
        }

        // ------------------------------------
        // TYPE-2 DIABETIC
        // ------------------------------------

        /**
         * Added sugar > 0 creates one
         * product-level conflict.
         *
         * null is NOT treated as 0.
         */
        const addedSugar =
            toNonNegativeNumber(
                nutrition.added_sugars_g
            );

        if (
            dietaryMode ===
                "type-2-diabetic" &&
            addedSugar !== null &&
            addedSugar > 0
        ) {
            addMatch({
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
            });
        }
    }

    // ========================================
    // 5. FINAL SCORE
    // ========================================

    /**
     * SINGLE SOURCE OF TRUTH
     *
     * Score = 100 - total penalties
     */
    const score =
        calculateScore(
            matches.map(
                (match) =>
                    match.penalty
            )
        );

    const grade =
        calculateGrade(score);

    const totalPenalty =
        round2(
            matches.reduce(
                (sum, match) =>
                    sum +
                    match.penalty,
                0
            )
        );

    return {
        score,
        grade,
        matches,
        totalPenalty,

        hiddenSugarDetected,

        breakdown:
            categorizeMatches(
                matches
            ),

        healthProfile:
            rawProfile,

        personalization: {
            profileApplied:
                Boolean(profile),

            dietaryMode,

            analysisStrictness:
                strictness,
        },
    };
};

// ============================================
// STORED MATCH PENALTIES
// ============================================

/**
 * rule_matches has no penalty column.
 *
 * Therefore penalties are re-derived
 * from the current configuration.
 *
 * This does NOT modify the database.
 */
const getPersonalPenaltyKey = (
    ruleCode
) => {
    const code =
        String(ruleCode);

    if (
        code ===
        PERSONAL_RULE_CODES.BLOCKLIST
    ) {
        return "USER_BLOCKLIST";
    }

    if (
        code ===
        PERSONAL_RULE_CODES.CALORIE
    ) {
        return "CALORIE_LIMIT";
    }

    if (
        code ===
        PERSONAL_RULE_CODES.SUGAR
    ) {
        return "SUGAR_LIMIT";
    }

    if (
        code ===
        PERSONAL_RULE_CODES.SODIUM
    ) {
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
    const list =
        Array.isArray(matches)
            ? matches
            : [];

    const personal =
        PERSONAL_PENALTIES[
            normalizeStrictness(
                strictness
            )
        ];

    const derived =
        list.map((match) => {
            const key =
                getPersonalPenaltyKey(
                    match.rule_code
                );

            if (key) {
                return personal[key];
            }

            const info =
                ruleInfo &&
                typeof ruleInfo.get ===
                    "function"
                    ? ruleInfo.get(
                          match.rule_code
                      )
                    : null;

            if (!info) {
                return null;
            }

            return toFiniteNumber(
                info.score_penalty
            ) === null
                ? null
                : toPenalty(
                      info.score_penalty
                  );
        });

    const stored =
        toFiniteNumber(
            storedScore
        );

    const complete =
        derived.every(
            (penalty) =>
                penalty !== null
        );

    const consistent =
        complete &&
        stored !== null &&
        Math.abs(
            calculateScore(
                derived
            ) - stored
        ) < 0.01;

    return list.map(
        (match, index) => ({
            ...match,

            penalty: consistent
                ? derived[index]
                : null,
        })
    );
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

    // ingredient aliases
    INGREDIENT_RULE_ALIASES,
    RULE_CODE_ALIAS_GROUPS,
    matchesIngredientRule,

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