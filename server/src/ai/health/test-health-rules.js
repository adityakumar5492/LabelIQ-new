// server/src/ai/health/test-health-rules.js
//
// Run:  node server/src/ai/health/test-health-rules.js
//
// Phase 3 verification - deterministic health analysis.
//
// Exercises the REAL code, offline:
//   - healthRules.service.js   (pure rule engine, score, grade)
//   - scan.service.js          (runIngredientRules / analyzeImage /
//                               getScanById persistence flow)
//   - healthProfile.service.js (partial profile saves)
//   - healthProfile.validator.js (needs zod; skipped if not installed)
//   - rag.service.js           (RAG failure isolation)
//
// Database, MongoDB, Groq, OCR and the AI pipeline are replaced by
// in-memory stubs while the modules load, so no database, network,
// API key or extra dependency is needed.

const assert = require("assert");
const Module = require("module");
const path = require("path");

const SERVICES = path.resolve(__dirname, "../../services");
const SCAN_SERVICE = path.join(SERVICES, "scan.service.js");
const PROFILE_SERVICE = path.join(SERVICES, "healthProfile.service.js");

/* ------------------------------------------------------------------ */
/* Stubs (shared, switchable per test)                                */
/* ------------------------------------------------------------------ */

let currentDb = null;

const pool = {
    connect: (...args) => currentDb.connect(...args),
    query: (...args) => currentDb.query(...args),
};

const hooks = {
    pipeline: async () => ({}),
    explanation: async () => ({}),
    rawDataCreate: async () => {},
};

const STUBS = {
    "../ai/pipeline/ai-pipeline.service": {
        analyzeImage: (...args) => hooks.pipeline(...args),
    },
    "../ai/rag/rag.service": { getIngredientEvidence: () => [] },
    "../ai/explanation/explanation.service": {
        generateAiInsights: (...args) => hooks.explanation(...args),
    },
    "../models/scanRawData.model": {
        create: (...args) => hooks.rawDataCreate(...args),
        findOne: () => ({ lean: async () => null }),
    },
    "../config/db": pool,
};

const originalLoad = Module._load;

Module._load = function (request, parent, isMain) {
    if (
        parent &&
        (parent.filename === SCAN_SERVICE ||
            parent.filename === PROFILE_SERVICE) &&
        Object.prototype.hasOwnProperty.call(STUBS, request)
    ) {
        return STUBS[request];
    }

    return originalLoad.apply(this, arguments);
};

const rules = require("./healthRules.service.js");
const scanService = require(SCAN_SERVICE);
const profileService = require(PROFILE_SERVICE);

Module._load = originalLoad;

const {
    evaluateHealthRules,
    attachStoredPenalties,
    calculateGrade,
    calculateScore,
    normalizeDietaryMode,
    normalizeStrictness,
    categorizeMatches,
    containsTerm,
    PERSONAL_PENALTIES,
} = rules;

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

const tests = [];

const test = (name, fn) => tests.push({ name, fn });

const ing = (...names) =>
    names.map((name, index) => ({ id: index + 1, name }));

const rule = (code, name, pattern, penalty, extra = {}) => ({
    id: extra.id ?? 1,
    rule_code: code,
    rule_name: name,
    rule_type: extra.rule_type ?? "additive",
    pattern,
    severity: extra.severity ?? "medium",
    score_penalty: penalty,
    explanation: extra.explanation ?? `${name} explanation`,
});

const run = (input) => evaluateHealthRules(input);

const codes = (result) => result.matches.map((m) => m.rule_code);

const sumPenalties = (result) =>
    result.matches.reduce((sum, m) => sum + m.penalty, 0);

const profile = (extra = {}) => ({
    calorie_limit: null,
    max_sugar_threshold: null,
    max_sodium_threshold: null,
    dietary_mode: null,
    analysis_strictness: "moderate",
    ...extra,
});

const dietaryConflicts = (mode, ...names) =>
    run({
        ingredients: ing(...names),
        healthProfile: profile({ dietary_mode: mode }),
    }).matches.map((m) => m.matched_value);

/* ------------------------------------------------------------------ */
/* In-memory fake database for the scan flow                          */
/* ------------------------------------------------------------------ */

const makeDb = (config = {}) => {
    const state = {
        ruleMatches: [],
        scanIngredients: [],
        ingredientNames: new Map(),
        analysis: null,
        product: null,
        committed: false,
        nextMatchId: 100,
    };

    const query = async (sql, params = []) => {
        const s = String(sql).replace(/\s+/g, " ").trim();

        if (/^BEGIN/.test(s) || /^ROLLBACK/.test(s)) {
            return { rows: [] };
        }

        if (/^COMMIT/.test(s)) {
            state.committed = true;
            return { rows: [] };
        }

        if (s.startsWith("INSERT INTO scanned_products")) {
            return { rows: [{ id: 1 }] };
        }

        // getScanById: main scan row
        if (s.includes("FROM scanned_products sp")) {
            if (!state.analysis) {
                return { rows: [] };
            }

            return {
                rows: [
                    {
                        scan_id: 1,
                        user_id: params[1],
                        product_name: "Test Snack",
                        safety_grade: state.analysis.safety_grade,
                        // pg returns NUMERIC columns as strings
                        safety_score: String(state.analysis.safety_score),
                        declared_sugar: null,
                        hidden_sugar_detected: state.product.hidden,
                        scan_status: "completed",
                        analysis_id: state.analysis.id,
                        assessment: state.analysis.assessment,
                        confidence: null,
                        nutrition_id: 1,
                        serving_size: null,
                        calories: null,
                        protein_g: null,
                        carbohydrates_g: null,
                        total_fat_g: null,
                        saturated_fat_g: null,
                        dietary_fiber_g: null,
                        total_sugars_g: null,
                        added_sugars_g: null,
                        sodium_mg: null,
                    },
                ],
            };
        }

        // getScanById: stored rule matches
        if (s.includes("FROM rule_matches")) {
            return { rows: state.ruleMatches.map((row) => ({ ...row })) };
        }

        if (s.startsWith("INSERT INTO nutrition_details")) {
            return { rows: [{ id: 1 }] };
        }

        if (s.startsWith("INSERT INTO ingredients")) {
            const name = params[0];

            if (!state.ingredientNames.has(name)) {
                state.ingredientNames.set(name, state.ingredientNames.size + 1);
            }

            return { rows: [{ id: state.ingredientNames.get(name) }] };
        }

        if (s.startsWith("INSERT INTO scan_ingredients")) {
            state.scanIngredients.push({
                ingredient_id: params[1],
                order: params[2],
            });
            return { rows: [] };
        }

        if (s.startsWith("INSERT INTO analysis_results")) {
            return { rows: [{ id: 10 }] };
        }

        if (s.includes("FROM scan_ingredients si")) {
            const byId = new Map(
                [...state.ingredientNames.entries()].map(([n, id]) => [id, n])
            );

            return {
                rows: state.scanIngredients
                    .slice()
                    .sort((a, b) => a.order - b.order)
                    .map((row) => ({
                        id: row.ingredient_id,
                        name: byId.get(row.ingredient_id),
                    })),
            };
        }

        if (s.includes("FROM ingredient_rules")) {
            return { rows: config.rules || [] };
        }

        if (s.includes("FROM ingredient_blocklist")) {
            return { rows: config.blocklist || [] };
        }

        if (s.includes("FROM health_profiles")) {
            return { rows: config.profile ? [config.profile] : [] };
        }

        if (s.includes("FROM nutrition_details")) {
            return { rows: config.nutritionRow ? [config.nutritionRow] : [] };
        }

        if (s.startsWith("INSERT INTO rule_matches")) {
            const row = {
                id: state.nextMatchId++,
                analysis_id: params[0],
                ingredient_id: params[1],
                rule_code: params[2],
                rule_name: params[3],
                matched_value: params[4],
                severity: params[5],
                explanation: params[6],
            };

            state.ruleMatches.push(row);

            return { rows: [row] };
        }

        if (s.startsWith("UPDATE analysis_results")) {
            state.analysis = {
                id: params[3],
                safety_grade: params[0],
                safety_score: params[1],
                assessment: params[2],
            };

            return { rows: [state.analysis] };
        }

        if (s.startsWith("UPDATE scanned_products")) {
            state.product = {
                grade: params[0],
                score: params[1],
                hidden: params[2],
            };

            return { rows: [] };
        }

        throw new Error(`Unexpected query in test: ${s.slice(0, 90)}`);
    };

    return {
        state,
        query,
        connect: async () => ({ query, release() {} }),
    };
};

const FILE = { buffer: Buffer.from("image"), originalname: "label.png" };

const pipelineFor = (ingredients, extra = {}) => async () => ({
    ocr: { text: "" },
    ocrPasses: [],
    product: {
        product_name: "Test Snack",
        ingredients,
        allergens: { confirmed: [], may_contain: [] },
        ...extra,
    },
    rag: { ingredients: [] },
});

const scanWith = async (config, ingredients, pipelineExtra) => {
    currentDb = makeDb(config);
    hooks.pipeline = pipelineFor(ingredients, pipelineExtra);
    hooks.explanation = async () => ({ summary: "ok" });
    hooks.rawDataCreate = async () => {};

    const result = await scanService.analyzeImage(FILE, 7);

    return { result, db: currentDb };
};

/* ================================================================== */
/* GROUP 1 - score, grade, penalty safety                             */
/* ================================================================== */

for (const [score, grade] of [
    [100, "A"],
    [90, "A"],
    [89, "B"],
    [75, "B"],
    [74, "C"],
    [50, "C"],
    [49, "D"],
    [0, "D"],
]) {
    test(`grade boundary: ${score} -> ${grade}`, () => {
        assert.strictEqual(calculateGrade(score), grade);
    });
}

test("grade: decimals stay on the lower side of a boundary", () => {
    assert.strictEqual(calculateGrade(89.99), "B");
    assert.strictEqual(calculateGrade(74.99), "C");
    assert.strictEqual(calculateGrade(49.99), "D");
});

test("grade: out-of-range scores are clamped (-1, -20, -100 -> D, 150 -> A)", () => {
    assert.strictEqual(calculateGrade(-1), "D");
    assert.strictEqual(calculateGrade(-20), "D");
    assert.strictEqual(calculateGrade(-100), "D");
    assert.strictEqual(calculateGrade(150), "A");
});

test("grade: missing / invalid score has no grade (null), not D", () => {
    assert.strictEqual(calculateGrade(null), null);
    assert.strictEqual(calculateGrade(undefined), null);
    assert.strictEqual(calculateGrade(NaN), null);
    assert.strictEqual(calculateGrade("abc"), null);
    assert.strictEqual(calculateGrade(""), null);
});

test("calculateScore: no penalties = 100", () => {
    assert.strictEqual(calculateScore([]), 100);
    assert.strictEqual(calculateScore(undefined), 100);
});

test("calculateScore: never below 0 (-1, -20, -100 cases)", () => {
    assert.strictEqual(calculateScore([101]), 0);
    assert.strictEqual(calculateScore([120]), 0);
    assert.strictEqual(calculateScore([200]), 0);
    assert.strictEqual(calculateScore([50, 50, 50]), 0);
});

test("calculateScore: invalid or negative penalties can never raise the score", () => {
    assert.strictEqual(calculateScore([-50]), 100);
    assert.strictEqual(calculateScore([NaN, null, undefined, "abc", {}]), 100);
    assert.strictEqual(calculateScore([10, -50]), 90);
});

test("calculateScore: numeric strings (database NUMERIC) are summed as numbers", () => {
    assert.strictEqual(calculateScore(["10", "5.00"]), 85);
});

test("calculateScore: no floating point drift", () => {
    assert.strictEqual(calculateScore([0.1, 0.2]), 99.7);
});

test("engine: no input at all = 100 / A / no matches", () => {
    const result = run();
    assert.strictEqual(result.score, 100);
    assert.strictEqual(result.grade, "A");
    assert.deepStrictEqual(result.matches, []);
    assert.strictEqual(result.totalPenalty, 0);
});

test("engine: excessive penalties stop at 0 / D (never negative)", () => {
    const names = Array.from({ length: 12 }, (_, i) => `Skimmed Milk ${i}`);
    const result = run({
        ingredients: ing(...names),
        healthProfile: profile({
            dietary_mode: "vegan",
            analysis_strictness: "strict",
        }),
    });
    assert.strictEqual(result.matches.length, 12);
    assert.strictEqual(result.totalPenalty, 144);
    assert.strictEqual(result.score, 0);
    assert.strictEqual(result.grade, "D");
});

test("engine: score = 100 - sum of recorded penalties", () => {
    const result = run({
        ingredients: ing("Skimmed Milk", "Honey"),
        healthProfile: profile({ dietary_mode: "vegan" }),
    });
    assert.strictEqual(sumPenalties(result), 16);
    assert.strictEqual(result.totalPenalty, 16);
    assert.strictEqual(result.score, 84);
    assert.strictEqual(result.grade, "B");
});

test("engine: a rule row with a negative / invalid penalty cannot raise the score", () => {
    const result = run({
        ingredients: ing("Magic Powder"),
        generalRules: [rule("BAD_1", "Bad Rule", "Magic Powder", -40)],
    });
    assert.strictEqual(result.score, 100);
    assert.strictEqual(result.matches[0].penalty, 0);
});

test("engine: result is deterministic (same input, same output)", () => {
    const input = {
        ingredients: ing("Sugar", "Skimmed Milk"),
        healthProfile: profile({ dietary_mode: "keto", calorie_limit: 10 }),
        nutrition: { calories: 500 },
    };
    assert.deepStrictEqual(run(input), run(input));
});

test("engine: input objects are never mutated", () => {
    const input = {
        ingredients: ing("Sugar"),
        generalRules: [rule("SUGAR_ADDED", "Added Sugar", "Sugar", 5)],
        blocklist: [{ ingredient_name: "Sugar" }],
        healthProfile: profile({ dietary_mode: "keto" }),
        nutrition: { calories: 5 },
    };
    const before = JSON.stringify(input);
    run(input);
    assert.strictEqual(JSON.stringify(input), before);
});

/* ================================================================== */
/* GROUP 2 - nutrition rules + health profile thresholds              */
/* ================================================================== */

const nutritionRun = (nutrition, limits, extra = {}) =>
    run({
        ingredients: [],
        healthProfile: profile(limits),
        nutrition,
        ...extra,
    });

test("nutrition: no health profile = no nutrition rules, even for huge values", () => {
    const result = run({
        nutrition: { calories: 99999, total_sugars_g: 999, sodium_mg: 99999 },
    });
    assert.strictEqual(result.matches.length, 0);
    assert.strictEqual(result.score, 100);
    assert.strictEqual(result.personalization.profileApplied, false);
});

test("nutrition: profile without limits (all null) = no violations", () => {
    const result = nutritionRun(
        { calories: 99999, total_sugars_g: 999, sodium_mg: 99999 },
        {}
    );
    assert.strictEqual(result.matches.length, 0);
});

test("nutrition: missing values do NOT become zero and do NOT violate", () => {
    for (const nutrition of [
        {},
        undefined,
        null,
        { calories: null, total_sugars_g: null, sodium_mg: null },
        { calories: undefined, total_sugars_g: undefined, sodium_mg: undefined },
    ]) {
        const result = nutritionRun(nutrition, {
            calorie_limit: 0,
            max_sugar_threshold: 0,
            max_sodium_threshold: 0,
        });
        assert.strictEqual(result.matches.length, 0, JSON.stringify(nutrition));
    }
});

test("nutrition: valid zero stays zero (0 vs limit 10 and 0 vs limit 0 = no violation)", () => {
    const zero = { calories: 0, total_sugars_g: 0, sodium_mg: 0 };
    assert.strictEqual(
        nutritionRun(zero, {
            calorie_limit: 10,
            max_sugar_threshold: 10,
            max_sodium_threshold: 10,
        }).matches.length,
        0
    );
    assert.strictEqual(
        nutritionRun(zero, {
            calorie_limit: 0,
            max_sugar_threshold: 0,
            max_sodium_threshold: 0,
        }).matches.length,
        0
    );
});

test("nutrition: a limit of 0 is respected (not treated as 'no limit')", () => {
    const result = nutritionRun(
        { calories: 1, total_sugars_g: 0.1, sodium_mg: 1 },
        { calorie_limit: 0, max_sugar_threshold: 0, max_sodium_threshold: 0 }
    );
    assert.deepStrictEqual(codes(result).sort(), [
        "CALORIE_LIMIT",
        "SODIUM_LIMIT",
        "SUGAR_LIMIT",
    ]);
});

test("nutrition: boundary - equal to the limit is NOT a violation, just above is", () => {
    const limits = {
        calorie_limit: 200,
        max_sugar_threshold: 10,
        max_sodium_threshold: 500,
    };
    assert.strictEqual(
        nutritionRun(
            { calories: 200, total_sugars_g: 10, sodium_mg: 500 },
            limits
        ).matches.length,
        0
    );
    assert.deepStrictEqual(
        codes(
            nutritionRun(
                { calories: 200.01, total_sugars_g: 10.01, sodium_mg: 500.01 },
                limits
            )
        ).sort(),
        ["CALORIE_LIMIT", "SODIUM_LIMIT", "SUGAR_LIMIT"]
    );
});

test("nutrition: extremely high values create each violation exactly once", () => {
    const result = nutritionRun(
        { calories: 1e9, total_sugars_g: 1e9, sodium_mg: 1e9 },
        { calorie_limit: 2000, max_sugar_threshold: 10, max_sodium_threshold: 500 }
    );
    assert.strictEqual(result.matches.length, 3);
    assert.strictEqual(result.score, 100 - 5 - 10 - 8);
    assert.strictEqual(result.grade, "B");
});

test("nutrition: database strings are compared as numbers ('9' vs '10' is not a violation)", () => {
    const below = nutritionRun(
        { calories: "9", total_sugars_g: "9.5", sodium_mg: "9" },
        {
            calorie_limit: "10",
            max_sugar_threshold: "10.00",
            max_sodium_threshold: "10",
        }
    );
    assert.strictEqual(below.matches.length, 0);

    const above = nutritionRun(
        { calories: "10.5", total_sugars_g: "13.90", sodium_mg: "11" },
        {
            calorie_limit: "10",
            max_sugar_threshold: "10.00",
            max_sodium_threshold: "10",
        }
    );
    assert.strictEqual(above.matches.length, 3);
});

test("nutrition: invalid values are treated as missing, never as violations", () => {
    for (const bad of ["abc", NaN, Infinity, -Infinity, -5, "   ", true, {}, []]) {
        const result = nutritionRun(
            { calories: bad, total_sugars_g: bad, sodium_mg: bad },
            { calorie_limit: 0, max_sugar_threshold: 0, max_sodium_threshold: 0 }
        );
        assert.strictEqual(result.matches.length, 0, String(bad));
    }
});

test("nutrition: invalid limits are ignored (no limit)", () => {
    for (const bad of ["abc", NaN, -10, "", "   ", false]) {
        const result = nutritionRun(
            { calories: 5000, total_sugars_g: 500, sodium_mg: 5000 },
            {
                calorie_limit: bad,
                max_sugar_threshold: bad,
                max_sodium_threshold: bad,
            }
        );
        assert.strictEqual(result.matches.length, 0, String(bad));
    }
});

test("nutrition: each rule uses its own field and its own limit", () => {
    // sugar high, calories/sodium low -> only SUGAR_LIMIT
    const result = nutritionRun(
        { calories: 10, total_sugars_g: 50, sodium_mg: 10 },
        { calorie_limit: 100, max_sugar_threshold: 10, max_sodium_threshold: 100 }
    );
    assert.deepStrictEqual(codes(result), ["SUGAR_LIMIT"]);

    // sodium limit must not be compared with sugar value
    const other = nutritionRun(
        { calories: 10, total_sugars_g: 50, sodium_mg: 10 },
        { calorie_limit: 100, max_sugar_threshold: 100, max_sodium_threshold: 5 }
    );
    assert.deepStrictEqual(codes(other), ["SODIUM_LIMIT"]);
});

test("profile: camelCase property names reach the engine too", () => {
    const result = run({
        nutrition: { calories: 500, total_sugars_g: 20, sodium_mg: 900 },
        healthProfile: {
            calorieLimit: 100,
            maxSugarThreshold: 5,
            maxSodiumThreshold: 100,
            dietaryMode: "vegan",
            analysisStrictness: "strict",
        },
        ingredients: ing("Honey"),
    });
    assert.deepStrictEqual(codes(result).sort(), [
        "CALORIE_LIMIT",
        "DIET_VEGAN",
        "SODIUM_LIMIT",
        "SUGAR_LIMIT",
    ]);
    assert.strictEqual(result.personalization.analysisStrictness, "strict");
    assert.strictEqual(result.personalization.dietaryMode, "vegan");
});

test("profile: snake_case value 0 is not replaced by a camelCase default", () => {
    const result = run({
        nutrition: { total_sugars_g: 1 },
        healthProfile: { max_sugar_threshold: 0, maxSugarThreshold: 99 },
    });
    assert.deepStrictEqual(codes(result), ["SUGAR_LIMIT"]);
});

test("profile: non-object profile (string / array / number) = no profile", () => {
    for (const bad of ["strict", [], 5, true]) {
        const result = run({
            healthProfile: bad,
            nutrition: { calories: 1e6 },
        });
        assert.strictEqual(result.personalization.profileApplied, false);
        assert.strictEqual(result.matches.length, 0);
    }
});

test("profile: partial profile applies only what it contains", () => {
    const result = run({
        nutrition: { calories: 1e6, total_sugars_g: 1e6, sodium_mg: 1e6 },
        healthProfile: { max_sodium_threshold: 100 },
    });
    assert.deepStrictEqual(codes(result), ["SODIUM_LIMIT"]);
    assert.strictEqual(result.personalization.analysisStrictness, "moderate");
});

/* ================================================================== */
/* GROUP 3 - ingredient rules + dietary conflicts                     */
/* ================================================================== */

test("rules: whole-term matching (E621 does not match E6211, BHA does not match BHAT)", () => {
    assert.ok(containsTerm("Flavour Enhancer (E621)", "E621"));
    assert.ok(!containsTerm("E6211", "E621"));
    assert.ok(containsTerm("BHA", "bha"));
    assert.ok(!containsTerm("BHAT", "BHA"));
    assert.ok(containsTerm("Maltodextrins", "Maltodextrin"));
    assert.ok(!containsTerm("", "E621"));
    assert.ok(!containsTerm("Salt", ""));
    assert.ok(!containsTerm("Salt", null));
});

test("rules: alias rows of one rule (same code) create ONE match / ONE penalty", () => {
    const generalRules = [
        rule("ADD_MSG", "Monosodium Glutamate", "E621", 10, { id: 1 }),
        rule("ADD_MSG", "Monosodium Glutamate", "MSG", 10, { id: 2 }),
        rule("ADD_MSG", "Monosodium Glutamate", "Monosodium Glutamate", 10, { id: 3 }),
        rule("ADD_MSG", "Monosodium Glutamate", "621", 10, { id: 4 }),
    ];
    const result = run({
        ingredients: ing("Flavour Enhancer (Monosodium Glutamate, E621, 621)"),
        generalRules,
    });
    assert.strictEqual(result.matches.length, 1);
    assert.strictEqual(result.score, 90);
});

test("rules: alias rows stored under different codes but one rule name do not stack", () => {
    const generalRules = [
        rule("ADD_E621", "Monosodium Glutamate", "E621", 10, { id: 1 }),
        rule("ADD_MSG", "Monosodium Glutamate", "MSG", 10, { id: 2 }),
        rule("ADD_MSG2", "monosodium  glutamate", "Monosodium Glutamate", 10, { id: 3 }),
    ];
    const result = run({
        ingredients: ing("Flavour Enhancer (E621, MSG, Monosodium Glutamate)"),
        generalRules,
    });
    assert.strictEqual(result.matches.length, 1);
    assert.strictEqual(result.score, 90);
});

test("rules: different rules on one ingredient are still all applied", () => {
    const generalRules = [
        rule("ADD_E211", "Sodium Benzoate", "E211", 8, { id: 1 }),
        rule("ADD_BHA", "BHA", "BHA", 12, { id: 2 }),
    ];
    const result = run({
        ingredients: ing("Preservatives (E211, BHA)"),
        generalRules,
    });
    assert.strictEqual(result.matches.length, 2);
    assert.strictEqual(result.score, 80);
});

test("rules: one rule on two different ingredients applies to each ingredient", () => {
    const result = run({
        ingredients: ing("Maltodextrin", "Maltodextrin (Corn)"),
        generalRules: [rule("SUGAR_MALTO", "Maltodextrin", "Maltodextrin", 5)],
    });
    assert.strictEqual(result.matches.length, 2);
});

test("rules: duplicate ingredients (any letter case) are evaluated once", () => {
    const result = run({
        ingredients: [
            { id: 1, name: "Sugar" },
            { id: 2, name: "sugar" },
            { id: 3, name: "  SUGAR " },
        ],
        generalRules: [rule("SUGAR_ADDED", "Added Sugar", "Sugar", 7)],
    });
    assert.strictEqual(result.matches.length, 1);
    assert.strictEqual(result.score, 93);
});

test("rules: unknown ingredients, empty list and junk entries create nothing", () => {
    const generalRules = [rule("ADD_E211", "Sodium Benzoate", "E211", 8)];
    assert.strictEqual(
        run({ ingredients: ing("Water", "Rice Flour", "Salt"), generalRules })
            .matches.length,
        0
    );
    assert.strictEqual(run({ ingredients: [], generalRules }).matches.length, 0);
    assert.strictEqual(
        run({
            ingredients: [null, undefined, 5, {}, { id: 1 }, { id: 2, name: "" }],
            generalRules: [null, "x", { pattern: null }],
            blocklist: [null, {}],
        }).matches.length,
        0
    );
});

test("rules: rule rows with empty / null pattern never match everything", () => {
    const result = run({
        ingredients: ing("Water"),
        generalRules: [
            rule("X_1", "Empty", "", 50),
            rule("X_2", "Null", null, 50),
            rule("X_3", "Blank", "   ", 50),
        ],
    });
    assert.strictEqual(result.matches.length, 0);
});

test("rules: hiddenSugarDetected - SUGAR_ code, hidden_sugar type, and not SUGAR_LIMIT", () => {
    const byCode = run({
        ingredients: ing("Invert Sugar"),
        generalRules: [rule("SUGAR_INVERT", "Invert Sugar", "Invert Sugar", 5)],
    });
    assert.strictEqual(byCode.hiddenSugarDetected, true);

    const byType = run({
        ingredients: ing("Jaggery"),
        generalRules: [
            rule("ADD_JAGGERY", "Jaggery", "Jaggery", 5, { rule_type: "hidden_sugar" }),
        ],
    });
    assert.strictEqual(byType.hiddenSugarDetected, true);

    const limitOnly = nutritionRun(
        { total_sugars_g: 50 },
        { max_sugar_threshold: 10 }
    );
    assert.deepStrictEqual(codes(limitOnly), ["SUGAR_LIMIT"]);
    assert.strictEqual(limitOnly.hiddenSugarDetected, false);

    const additive = run({
        ingredients: ing("BHA"),
        generalRules: [rule("ADD_BHA", "BHA", "BHA", 5)],
    });
    assert.strictEqual(additive.hiddenSugarDetected, false);
});

// ---- dietary mode normalization ----

test("diet: mode normalization (case, spaces, underscores, none, unknown)", () => {
    assert.strictEqual(normalizeDietaryMode("vegan"), "vegan");
    assert.strictEqual(normalizeDietaryMode("  VEGAN "), "vegan");
    assert.strictEqual(normalizeDietaryMode("Gluten Free"), "gluten-free");
    assert.strictEqual(normalizeDietaryMode("gluten_free"), "gluten-free");
    assert.strictEqual(normalizeDietaryMode("KETO"), "keto");
    assert.strictEqual(normalizeDietaryMode("Type 2 Diabetic"), "type-2-diabetic");
    assert.strictEqual(normalizeDietaryMode("type_2_diabetic"), "type-2-diabetic");
    for (const unknown of ["none", "", "  ", "vegetarian", "paleo", null, undefined, 5, {}]) {
        assert.strictEqual(normalizeDietaryMode(unknown), null, String(unknown));
    }
});

test("diet: Object.prototype names are NOT dietary modes (no crash)", () => {
    for (const name of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
        assert.strictEqual(normalizeDietaryMode(name), null, name);
        const result = run({
            ingredients: ing("Skimmed Milk"),
            healthProfile: profile({ dietary_mode: name }),
        });
        assert.strictEqual(result.matches.length, 0);
        assert.strictEqual(result.personalization.dietaryMode, null);
    }
});

test("diet: unknown mode still produces a valid score (no dietary rules)", () => {
    const result = run({
        ingredients: ing("Skimmed Milk"),
        healthProfile: profile({ dietary_mode: "vegetarian" }),
    });
    assert.strictEqual(result.score, 100);
    assert.strictEqual(result.personalization.profileApplied, true);
});

// ---- vegan ----

test("vegan: real animal ingredients are flagged", () => {
    for (const name of [
        "Skimmed Milk Powder",
        "Whey Protein",
        "Egg",
        "Eggs",
        "Honey",
        "Gelatin",
        "Butter",
        "Cream",
        "Ghee",
        "Casein",
        "Lactose",
        "Carmine",
        "Fish Oil",
        "Cheese Powder",
        "Natural Flavour [from Milk]",
    ]) {
        assert.deepStrictEqual(dietaryConflicts("vegan", name), [name], name);
    }
});

test("vegan: legitimate plant ingredients are NOT flagged", () => {
    for (const name of [
        "Coconut Milk",
        "Coconut Milk Powder",
        "Almond Milk",
        "Oat Milk",
        "Soy Milk",
        "Cocoa Butter",
        "Shea Butter",
        "Peanut Butter",
        "Coconut Cream",
        "Cream of Tartar",
        "Eggplant",
        "Soya Lecithin",
        "Lecithin",
        "Sunflower Oil",
        "Wheat Flour",
        "Salt",
        "Buttercup Extract",
    ]) {
        assert.deepStrictEqual(dietaryConflicts("vegan", name), [], name);
    }
});

test("vegan: one conflict per ingredient even with several animal words", () => {
    const result = run({
        ingredients: ing("Milk Chocolate (Milk, Butter, Cream)"),
        healthProfile: profile({ dietary_mode: "vegan" }),
    });
    assert.strictEqual(result.matches.length, 1);
    assert.strictEqual(result.score, 92);
});

// ---- gluten-free ----

test("gluten-free: gluten ingredients are flagged", () => {
    for (const name of [
        "Wheat Flour",
        "Barley Malt Extract",
        "Malt Extract",
        "Rye Flour",
        "Semolina",
        "Wheat Gluten",
        "Spelt",
        "Couscous",
        "Malted Barley",
    ]) {
        assert.deepStrictEqual(dietaryConflicts("gluten-free", name), [name], name);
    }
});

test("gluten-free: legitimate ingredients are NOT flagged", () => {
    for (const name of [
        "Maltodextrin",
        "Maltitol",
        "Buckwheat Flour",
        "Rice Flour",
        "Corn Starch",
        "Gluten Free Oats",
        "Gluten-Free Flour Blend",
        "Salt",
        "Sugar",
    ]) {
        assert.deepStrictEqual(dietaryConflicts("gluten-free", name), [], name);
    }
});

// ---- keto + type-2-diabetic ----

for (const mode of ["keto", "type-2-diabetic"]) {
    test(`${mode}: sugar-type ingredients are flagged`, () => {
        for (const name of [
            "Sugar",
            "Brown Sugar",
            "Dextrose",
            "Fructose",
            "Glucose Syrup",
            "High Fructose Corn Syrup",
            "Corn Syrup",
            "Invert Sugar Syrup",
            "Molasses",
            "Honey",
            "Maltodextrin",
        ]) {
            assert.deepStrictEqual(dietaryConflicts(mode, name), [name], name);
        }
    });

    test(`${mode}: non-sugar ingredients are NOT flagged`, () => {
        for (const name of [
            "Almond Flour",
            "Salt",
            "Wheat Flour",
            "Skimmed Milk",
            "Sunflower Oil",
            "Sugarcane Fibre",
            "Maltitol",
            "Water",
        ]) {
            assert.deepStrictEqual(dietaryConflicts(mode, name), [], name);
        }
    });

    test(`${mode}: a configured hidden-sugar rule also creates the conflict (once)`, () => {
        const result = run({
            ingredients: ing("Jaggery"),
            generalRules: [
                rule("SUGAR_JAGGERY", "Jaggery", "Jaggery", 5, {
                    rule_type: "hidden_sugar",
                }),
            ],
            healthProfile: profile({ dietary_mode: mode }),
        });
        assert.deepStrictEqual(codes(result).sort(), [
            mode === "keto" ? "DIET_KETO" : "DIET_TYPE_2_DIABETIC",
            "SUGAR_JAGGERY",
        ]);
        assert.ok(
            result.matches
                .find((m) => m.rule_code.startsWith("DIET_"))
                .explanation.includes('matches the "Jaggery" rule')
        );
    });
}

test("diet: missing information never creates a conflict", () => {
    for (const mode of ["vegan", "gluten-free", "keto", "type-2-diabetic"]) {
        for (const ingredients of [undefined, null, [], [{ id: 1 }], [{ id: 1, name: "" }]]) {
            const result = run({
                ingredients,
                healthProfile: profile({ dietary_mode: mode }),
                nutrition: {},
            });
            assert.strictEqual(result.matches.length, 0, mode);
            assert.strictEqual(result.score, 100);
        }
    }
});

test("diet: dietary conflicts of one mode never come from another mode's rules", () => {
    assert.deepStrictEqual(dietaryConflicts("vegan", "Wheat Flour", "Sugar"), []);
    assert.deepStrictEqual(dietaryConflicts("gluten-free", "Milk", "Honey"), []);
    assert.deepStrictEqual(dietaryConflicts("keto", "Milk", "Wheat Flour"), []);
});

// ---- user blocklist ----

test("blocklist: matches the ingredient, uses the user's reason, one penalty", () => {
    const result = run({
        ingredients: ing("Palm Oil (Refined)"),
        blocklist: [{ ingredient_name: "palm oil", reason: "Environmental concerns" }],
    });
    assert.strictEqual(result.matches.length, 1);
    assert.strictEqual(result.matches[0].rule_code, "USER_BLOCKLIST");
    assert.strictEqual(result.matches[0].explanation, "Environmental concerns");
    assert.strictEqual(result.matches[0].penalty, 20);
    assert.strictEqual(result.score, 80);
});

test("blocklist: two entries matching one ingredient = one penalty", () => {
    const result = run({
        ingredients: ing("Aspartame (E951)"),
        blocklist: [
            { ingredient_name: "Aspartame", reason: "first" },
            { ingredient_name: "Artificial Sweetener", reason: "second" },
            { ingredient_name: "E951" },
        ],
    });
    assert.strictEqual(result.matches.length, 1);
    assert.strictEqual(result.score, 80);
});

test("blocklist: 'Artificial Sweetener(s)' alias expands to the sweetener names", () => {
    for (const entry of ["Artificial Sweetener", "Artificial Sweeteners", "ARTIFICIAL SWEETENERS"]) {
        for (const ingredient of ["Sucralose", "Acesulfame Potassium (E950)", "Saccharin"]) {
            const result = run({
                ingredients: ing(ingredient),
                blocklist: [{ ingredient_name: entry }],
            });
            assert.strictEqual(result.matches.length, 1, `${entry} / ${ingredient}`);
        }
    }
});

test("blocklist: empty / whitespace / null names are ignored", () => {
    const result = run({
        ingredients: ing("Water", "Salt"),
        blocklist: [
            { ingredient_name: "" },
            { ingredient_name: "   " },
            { ingredient_name: null },
            {},
        ],
    });
    assert.strictEqual(result.matches.length, 0);
});

test("blocklist: no partial-word false positives ('oil' does not block 'boiled')", () => {
    const result = run({
        ingredients: ing("Boiled Rice", "Foil Wrap"),
        blocklist: [{ ingredient_name: "oil" }],
    });
    assert.strictEqual(result.matches.length, 0);
});

test("blocklist: prototype-like names do not crash the alias lookup", () => {
    const result = run({
        ingredients: ing("Water"),
        blocklist: [{ ingredient_name: "constructor" }, { ingredient_name: "__proto__" }],
    });
    assert.strictEqual(result.matches.length, 0);
});

/* ================================================================== */
/* GROUP 4 - strictness + type-2 diabetic                             */
/* ================================================================== */

test("strictness: only 'strict' is strict (case/space tolerant); anything else is moderate", () => {
    assert.strictEqual(normalizeStrictness("strict"), "strict");
    assert.strictEqual(normalizeStrictness("STRICT"), "strict");
    assert.strictEqual(normalizeStrictness("  Strict  "), "strict");
    for (const other of ["moderate", "low", "high", "strictest", "", null, undefined, 1, {}]) {
        assert.strictEqual(normalizeStrictness(other), "moderate", String(other));
    }
});

test("strictness: unknown strictness behaves exactly like moderate", () => {
    const input = {
        ingredients: ing("Skimmed Milk"),
        nutrition: { calories: 900 },
    };
    const moderate = run({
        ...input,
        healthProfile: profile({ dietary_mode: "vegan", calorie_limit: 100 }),
    });
    const unknown = run({
        ...input,
        healthProfile: profile({
            dietary_mode: "vegan",
            calorie_limit: 100,
            analysis_strictness: "extreme",
        }),
    });
    assert.deepStrictEqual(unknown.matches, moderate.matches);
    assert.strictEqual(unknown.score, moderate.score);
});

const singleRuleCases = {
    CALORIE_LIMIT: {
        profile: { calorie_limit: 1 },
        nutrition: { calories: 10 },
        ingredients: [],
        code: "CALORIE_LIMIT",
    },
    SUGAR_LIMIT: {
        profile: { max_sugar_threshold: 1 },
        nutrition: { total_sugars_g: 10 },
        ingredients: [],
        code: "SUGAR_LIMIT",
    },
    SODIUM_LIMIT: {
        profile: { max_sodium_threshold: 1 },
        nutrition: { sodium_mg: 10 },
        ingredients: [],
        code: "SODIUM_LIMIT",
    },
    DIETARY_CONFLICT: {
        profile: { dietary_mode: "vegan" },
        nutrition: {},
        ingredients: ing("Honey"),
        code: "DIET_VEGAN",
    },
    USER_BLOCKLIST: {
        profile: {},
        nutrition: {},
        ingredients: ing("Palm Oil"),
        blocklist: [{ ingredient_name: "Palm Oil" }],
        code: "USER_BLOCKLIST",
    },
};

for (const [key, c] of Object.entries(singleRuleCases)) {
    for (const strictness of ["moderate", "strict"]) {
        test(`strictness: ${key} penalty in ${strictness} = configured ${PERSONAL_PENALTIES[strictness][key]}`, () => {
            const result = run({
                ingredients: c.ingredients,
                blocklist: c.blocklist,
                nutrition: c.nutrition,
                healthProfile: profile({ ...c.profile, analysis_strictness: strictness }),
            });
            assert.deepStrictEqual(codes(result), [c.code]);
            assert.strictEqual(result.matches[0].penalty, PERSONAL_PENALTIES[strictness][key]);
            assert.strictEqual(result.score, 100 - PERSONAL_PENALTIES[strictness][key]);
        });
    }

    test(`strictness: ${key} is penalized harder in strict than in moderate`, () => {
        assert.ok(PERSONAL_PENALTIES.strict[key] > PERSONAL_PENALTIES.moderate[key]);
    });
}

test("strictness: medium personal severities become high only in strict mode", () => {
    const build = (analysis_strictness) =>
        run({
            ingredients: ing("Honey"),
            nutrition: { calories: 9, sodium_mg: 9, total_sugars_g: 9 },
            healthProfile: profile({
                dietary_mode: "vegan",
                calorie_limit: 1,
                max_sodium_threshold: 1,
                max_sugar_threshold: 1,
                analysis_strictness,
            }),
        });
    const sev = (result) =>
        Object.fromEntries(result.matches.map((m) => [m.rule_code, m.severity]));

    assert.deepStrictEqual(sev(build("moderate")), {
        CALORIE_LIMIT: "medium",
        SUGAR_LIMIT: "high",
        SODIUM_LIMIT: "medium",
        DIET_VEGAN: "medium",
    });
    assert.deepStrictEqual(sev(build("strict")), {
        CALORIE_LIMIT: "high",
        SUGAR_LIMIT: "high",
        SODIUM_LIMIT: "high",
        DIET_VEGAN: "high",
    });
});

test("strictness: configured general ingredient rule penalties are not altered", () => {
    const generalRules = [rule("ADD_BHA", "BHA", "BHA", 12)];
    const moderate = run({
        ingredients: ing("BHA"),
        generalRules,
        healthProfile: profile({ analysis_strictness: "moderate" }),
    });
    const strict = run({
        ingredients: ing("BHA"),
        generalRules,
        healthProfile: profile({ analysis_strictness: "strict" }),
    });
    assert.strictEqual(moderate.score, 88);
    assert.strictEqual(strict.score, 88);
});

test("type-2-diabetic: sugar limit and ingredient conflict are separate, counted once each", () => {
    const result = run({
        ingredients: ing("Sugar", "Wheat Flour"),
        nutrition: { total_sugars_g: 30, added_sugars_g: null },
        healthProfile: profile({
            dietary_mode: "type-2-diabetic",
            max_sugar_threshold: 10,
        }),
    });
    assert.deepStrictEqual(codes(result).sort(), ["DIET_TYPE_2_DIABETIC", "SUGAR_LIMIT"]);
    assert.strictEqual(result.score, 100 - 10 - 8);
});

test("type-2-diabetic: missing added sugar (null / undefined / '') is NOT zero and NOT a conflict", () => {
    for (const added of [null, undefined, "", "   "]) {
        const result = run({
            ingredients: [],
            nutrition: { added_sugars_g: added },
            healthProfile: profile({ dietary_mode: "type-2-diabetic" }),
        });
        assert.strictEqual(result.matches.length, 0, String(added));
    }
});

test("type-2-diabetic: added sugar 0 = no conflict, > 0 = exactly one product conflict", () => {
    const build = (added) =>
        run({
            ingredients: [],
            nutrition: { added_sugars_g: added },
            healthProfile: profile({ dietary_mode: "type-2-diabetic" }),
        });
    assert.strictEqual(build(0).matches.length, 0);
    assert.strictEqual(build("0.00").matches.length, 0);

    const result = build("2.50");
    assert.strictEqual(result.matches.length, 1);
    assert.strictEqual(result.matches[0].ingredient_id, null);
    assert.strictEqual(result.matches[0].matched_value, "2.5 g added sugars");
    assert.strictEqual(result.score, 92);
});

test("type-2-diabetic: added sugar conflict + ingredient conflict are separate matches (no overwrite)", () => {
    const result = run({
        ingredients: ing("Glucose Syrup"),
        nutrition: { added_sugars_g: 5 },
        healthProfile: profile({ dietary_mode: "type-2-diabetic" }),
    });
    assert.strictEqual(result.matches.length, 2);
    assert.strictEqual(result.score, 100 - 8 - 8);
});

test("type-2-diabetic: added sugar rule applies ONLY to type-2-diabetic", () => {
    for (const mode of ["keto", "vegan", "gluten-free", null]) {
        const result = run({
            ingredients: [],
            nutrition: { added_sugars_g: 50 },
            healthProfile: profile({ dietary_mode: mode }),
        });
        assert.strictEqual(result.matches.length, 0, String(mode));
    }
});

test("type-2-diabetic: strict mode uses the configured strict dietary penalty", () => {
    const result = run({
        ingredients: ing("Sugar"),
        healthProfile: profile({
            dietary_mode: "type-2-diabetic",
            analysis_strictness: "strict",
        }),
    });
    assert.strictEqual(result.matches[0].penalty, PERSONAL_PENALTIES.strict.DIETARY_CONFLICT);
});

/* ================================================================== */
/* GROUP 5 - rule matches + persistence / API consistency             */
/* ================================================================== */

const bigScenario = () =>
    run({
        ingredients: ing("Sugar", "Skimmed Milk", "BHA", "Palm Oil", "Water"),
        generalRules: [
            rule("SUGAR_ADDED", "Added Sugar", "Sugar", 6, { id: 1 }),
            rule("ADD_BHA", "BHA", "BHA", 10, { id: 2 }),
        ],
        blocklist: [{ ingredient_name: "Palm Oil", reason: "No palm oil" }],
        healthProfile: profile({
            dietary_mode: "vegan",
            calorie_limit: 100,
            max_sugar_threshold: 5,
            max_sodium_threshold: 50,
        }),
        nutrition: { calories: 300, total_sugars_g: 20, sodium_mg: 400 },
    });

test("matches: every match has rule, reason, evidence and a positive penalty", () => {
    const result = bigScenario();
    assert.ok(result.matches.length >= 6);
    for (const match of result.matches) {
        assert.ok(match.rule_code, "rule_code");
        assert.ok(match.rule_name, "rule_name");
        assert.ok(match.explanation, "explanation (reason)");
        assert.ok(match.matched_value, "matched_value (evidence)");
        assert.ok(match.severity, "severity");
        assert.ok(match.penalty > 0, "penalty");
    }
});

test("matches: sum of penalties = totalPenalty = 100 - score (no hidden penalty)", () => {
    const result = bigScenario();
    assert.strictEqual(sumPenalties(result), result.totalPenalty);
    assert.strictEqual(result.score, Math.max(0, 100 - result.totalPenalty));
});

test("matches: no duplicate (ingredient, rule) pairs", () => {
    const result = bigScenario();
    const keys = result.matches.map((m) => `${m.ingredient_id}:${m.rule_code}`);
    assert.strictEqual(new Set(keys).size, keys.length);
});

test("matches: nothing without a real violation (clean product has none)", () => {
    const result = run({
        ingredients: ing("Water", "Rice Flour", "Salt"),
        generalRules: [rule("ADD_BHA", "BHA", "BHA", 10)],
        blocklist: [{ ingredient_name: "Palm Oil" }],
        healthProfile: profile({
            dietary_mode: "vegan",
            calorie_limit: 500,
            max_sugar_threshold: 20,
            max_sodium_threshold: 900,
        }),
        nutrition: { calories: 120, total_sugars_g: 2, sodium_mg: 100 },
    });
    assert.strictEqual(result.matches.length, 0);
    assert.strictEqual(result.score, 100);
    assert.strictEqual(result.grade, "A");
});

test("matches: breakdown buckets partition the matches exactly", () => {
    const result = bigScenario();
    const b = result.breakdown;
    const total =
        b.generalIssues.length +
        b.blocklistIssues.length +
        b.calorieIssues.length +
        b.sugarIssues.length +
        b.sodiumIssues.length +
        b.dietaryConflicts.length;
    assert.strictEqual(total, result.matches.length);
    assert.strictEqual(b.blocklistIssues.length, 1);
    assert.strictEqual(b.calorieIssues.length, 1);
    assert.strictEqual(b.sugarIssues.length, 1);
    assert.strictEqual(b.sodiumIssues.length, 1);
});

test("matches: categorizeMatches tolerates junk input", () => {
    assert.deepStrictEqual(categorizeMatches(null).generalIssues, []);
    assert.deepStrictEqual(categorizeMatches(undefined).dietaryConflicts, []);
});

test("persistence: runIngredientRules stores exactly the penalized matches and returns the engine score", async () => {
    const { result, db } = await scanWith(
        {
            rules: [rule("ADD_BHA", "BHA", "BHA", 10)],
            blocklist: [{ ingredient_name: "Palm Oil", reason: "No palm oil" }],
            profile: profile({ dietary_mode: "vegan", max_sugar_threshold: 5 }),
            nutritionRow: { calories: 100, total_sugars_g: "20.00", added_sugars_g: null, sodium_mg: 10 },
        },
        ["Skimmed Milk", "BHA", "Palm Oil", "Water"]
    );

    // engine, run on the same data, is the reference
    const reference = run({
        ingredients: ing("Skimmed Milk", "BHA", "Palm Oil", "Water"),
        generalRules: [rule("ADD_BHA", "BHA", "BHA", 10)],
        blocklist: [{ ingredient_name: "Palm Oil", reason: "No palm oil" }],
        healthProfile: profile({ dietary_mode: "vegan", max_sugar_threshold: 5 }),
        nutrition: { calories: 100, total_sugars_g: "20.00", added_sugars_g: null, sodium_mg: 10 },
    });

    assert.strictEqual(db.state.ruleMatches.length, reference.matches.length);
    assert.strictEqual(result.analysis.ruleMatches.length, reference.matches.length);
    assert.strictEqual(db.state.analysis.safety_score, reference.score);
    assert.strictEqual(db.state.analysis.safety_grade, reference.grade);
    assert.strictEqual(db.state.product.score, reference.score);
    assert.strictEqual(db.state.product.grade, reference.grade);
    assert.strictEqual(result.analysis.safetyScore, reference.score);
    assert.strictEqual(result.analysis.safetyGrade, reference.grade);
    assert.ok(db.state.committed);
});

test("persistence: API matches carry ids and penalties that add up to the score", async () => {
    const { result } = await scanWith(
        {
            rules: [rule("ADD_BHA", "BHA", "BHA", 10)],
            blocklist: [],
            profile: profile({ dietary_mode: "vegan", analysis_strictness: "strict" }),
            nutritionRow: {},
        },
        ["Skimmed Milk", "BHA"]
    );
    const matches = result.analysis.ruleMatches;
    assert.strictEqual(matches.length, 2);
    for (const match of matches) {
        assert.ok(match.id, "id");
        assert.ok(match.penalty > 0, "penalty");
    }
    const total = matches.reduce((sum, m) => sum + m.penalty, 0);
    assert.strictEqual(result.analysis.safetyScore, 100 - total);
    assert.strictEqual(total, 12 + 10);
    // breakdown is built from the same persisted matches
    assert.strictEqual(result.analysis.breakdown.dietaryConflicts.length, 1);
    assert.strictEqual(result.analysis.breakdown.generalIssues.length, 1);
    assert.strictEqual(result.analysis.assessment, "Issues detected");
});

test("persistence: no profile = score from general rules only, nutrition ignored", async () => {
    const { result } = await scanWith(
        {
            rules: [rule("ADD_BHA", "BHA", "BHA", 10)],
            blocklist: [],
            profile: null,
            nutritionRow: { calories: 99999, total_sugars_g: 999, sodium_mg: 99999 },
        },
        ["BHA", "Water"]
    );
    assert.strictEqual(result.analysis.safetyScore, 90);
    assert.strictEqual(result.analysis.safetyGrade, "A");
    assert.strictEqual(result.analysis.personalization.profileApplied, false);
});

test("persistence: clean product scores 100 / A with 'No rule violations detected'", async () => {
    const { result } = await scanWith(
        { rules: [], blocklist: [], profile: null, nutritionRow: {} },
        ["Water", "Salt"]
    );
    assert.strictEqual(result.analysis.safetyScore, 100);
    assert.strictEqual(result.analysis.safetyGrade, "A");
    assert.strictEqual(result.analysis.assessment, "No rule violations detected");
    assert.deepStrictEqual(result.analysis.ruleMatches, []);
});

test("persistence: heavy penalties stored as 0 / D (never negative)", async () => {
    const rulesRows = Array.from({ length: 10 }, (_, i) =>
        rule(`ADD_${i}`, `Additive ${i}`, `Additive ${i}`, 30, { id: i + 1 })
    );
    const { result, db } = await scanWith(
        { rules: rulesRows, blocklist: [], profile: null, nutritionRow: {} },
        Array.from({ length: 10 }, (_, i) => `Additive ${i}`)
    );
    assert.strictEqual(result.analysis.safetyScore, 0);
    assert.strictEqual(result.analysis.safetyGrade, "D");
    assert.strictEqual(db.state.analysis.safety_score, 0);
    assert.strictEqual(db.state.ruleMatches.length, 10);
});

// ---- stored penalties (GET /scan/:id) ----

const ruleInfoOf = (rows) =>
    new Map(rows.map((r) => [r.rule_code, { rule_type: r.rule_type, pattern: r.pattern, score_penalty: r.score_penalty }]));

test("stored penalties: re-derived penalties are attached when they reproduce the stored score", () => {
    const rulesRows = [rule("ADD_BHA", "BHA", "BHA", 10)];
    const stored = [
        { id: 1, rule_code: "ADD_BHA", ingredient_id: 2 },
        { id: 2, rule_code: "DIET_VEGAN", ingredient_id: 1 },
    ];
    const out = attachStoredPenalties({
        matches: stored,
        ruleInfo: ruleInfoOf(rulesRows),
        strictness: "strict",
        storedScore: "78.00",
    });
    assert.deepStrictEqual(out.map((m) => m.penalty), [10, 12]);
    assert.strictEqual(stored[0].penalty, undefined, "input not mutated");
});

test("stored penalties: null (never a wrong number) when strictness changed since the scan", () => {
    const stored = [{ id: 2, rule_code: "DIET_VEGAN" }];
    const out = attachStoredPenalties({
        matches: stored,
        ruleInfo: new Map(),
        strictness: "moderate", // scan was made in strict: 100 - 12 = 88
        storedScore: 88,
    });
    assert.strictEqual(out[0].penalty, null);
});

test("stored penalties: null when a rule no longer exists or the score is unknown", () => {
    assert.strictEqual(
        attachStoredPenalties({
            matches: [{ rule_code: "ADD_GONE" }],
            ruleInfo: new Map(),
            strictness: "moderate",
            storedScore: 90,
        })[0].penalty,
        null
    );
    assert.strictEqual(
        attachStoredPenalties({
            matches: [{ rule_code: "DIET_VEGAN" }],
            ruleInfo: new Map(),
            strictness: "moderate",
            storedScore: null,
        })[0].penalty,
        null
    );
});

test("stored penalties: clamped score (0) is still verified", () => {
    const stored = Array.from({ length: 13 }, (_, i) => ({ id: i, rule_code: "DIET_VEGAN", ingredient_id: i }));
    const out = attachStoredPenalties({
        matches: stored,
        ruleInfo: new Map(),
        strictness: "moderate",
        storedScore: 0,
    });
    assert.ok(out.every((m) => m.penalty === 8));
});

test("stored penalties: a stored scan reads back the same penalties the scan response had", async () => {
    const rulesRows = [rule("ADD_BHA", "BHA", "BHA", 10)];
    const config = {
        rules: rulesRows,
        blocklist: [],
        profile: profile({ dietary_mode: "vegan" }),
        nutritionRow: {},
    };
    const { result } = await scanWith(config, ["Skimmed Milk", "BHA"]);
    const stored = currentDb.state.ruleMatches.map(({ ...row }) => row);
    const replay = attachStoredPenalties({
        matches: stored,
        ruleInfo: ruleInfoOf(rulesRows),
        strictness: config.profile.analysis_strictness,
        storedScore: currentDb.state.analysis.safety_score,
    });
    assert.deepStrictEqual(
        replay.map((m) => [m.rule_code, m.penalty]),
        result.analysis.ruleMatches.map((m) => [m.rule_code, m.penalty])
    );
});

test("GET scan: stored scan returns the same score, grade and penalties as the scan response", async () => {
    const config = {
        rules: [rule("ADD_BHA", "BHA", "BHA", 10)],
        blocklist: [],
        profile: profile({ dietary_mode: "vegan", analysis_strictness: "strict" }),
        nutritionRow: {},
    };
    const { result } = await scanWith(config, ["Skimmed Milk", "BHA"]);
    const stored = await scanService.getScanById(7, 1);

    assert.strictEqual(Number(stored.analysis.safetyScore), result.analysis.safetyScore);
    assert.strictEqual(stored.analysis.safetyGrade, result.analysis.safetyGrade);
    assert.deepStrictEqual(
        stored.analysis.ruleMatches.map((m) => [m.rule_code, m.penalty]),
        result.analysis.ruleMatches.map((m) => [m.rule_code, m.penalty])
    );
    assert.strictEqual(stored.analysis.breakdown.dietaryConflicts.length, 1);
    assert.strictEqual(stored.analysis.breakdown.generalIssues.length, 1);
    assert.strictEqual(stored.analysis.personalization.analysisStrictness, "strict");
});

test("GET scan: if the profile changed since the scan, penalty is null but score/grade are untouched", async () => {
    const { result } = await scanWith(
        {
            rules: [],
            blocklist: [],
            profile: profile({ dietary_mode: "vegan", analysis_strictness: "strict" }),
            nutritionRow: {},
        },
        ["Skimmed Milk"]
    );
    // user switches to moderate afterwards
    currentDb.config = null;
    const originalQuery = currentDb.query;
    currentDb.query = async (sql, params) => {
        if (String(sql).includes("FROM health_profiles")) {
            return { rows: [profile({ dietary_mode: "vegan", analysis_strictness: "moderate" })] };
        }
        return originalQuery(sql, params);
    };
    const stored = await scanService.getScanById(7, 1);
    assert.strictEqual(Number(stored.analysis.safetyScore), result.analysis.safetyScore);
    assert.strictEqual(stored.analysis.safetyGrade, result.analysis.safetyGrade);
    assert.strictEqual(stored.analysis.ruleMatches[0].penalty, null);
});

test("GET scan: unknown scan returns null", async () => {
    currentDb = makeDb({ rules: [], blocklist: [], profile: null, nutritionRow: {} });
    assert.strictEqual(await scanService.getScanById(7, 999), null);
});

/* ================================================================== */
/* GROUP 6 - AI / RAG isolation                                       */
/* ================================================================== */

const isolationConfig = () => ({
    rules: [rule("ADD_BHA", "BHA", "BHA", 10)],
    blocklist: [{ ingredient_name: "Palm Oil" }],
    profile: profile({ dietary_mode: "vegan", analysis_strictness: "strict" }),
    nutritionRow: {},
});

const baselineScan = async () => {
    const { result } = await scanWith(isolationConfig(), ["Skimmed Milk", "BHA", "Palm Oil"]);
    return result;
};

const summary = (result) => ({
    score: result.analysis.safetyScore,
    grade: result.analysis.safetyGrade,
    assessment: result.analysis.assessment,
    matches: result.analysis.ruleMatches.map((m) => [m.rule_code, m.penalty, m.severity]),
});

test("isolation: Groq explanation throwing does not change score, grade or matches", async () => {
    const baseline = summary(await baselineScan());

    currentDb = makeDb(isolationConfig());
    hooks.pipeline = pipelineFor(["Skimmed Milk", "BHA", "Palm Oil"]);
    hooks.explanation = async () => {
        throw new Error("Groq 429 rate limit");
    };
    const result = await scanService.analyzeImage(FILE, 7);

    assert.deepStrictEqual(summary(result), baseline);
    assert.deepStrictEqual(result.ai_insights, {});
});

test("isolation: Groq returning garbage does not change the deterministic result", async () => {
    const baseline = summary(await baselineScan());

    for (const garbage of [null, undefined, 42, "text", [], { score: 0, grade: "A" }]) {
        currentDb = makeDb(isolationConfig());
        hooks.pipeline = pipelineFor(["Skimmed Milk", "BHA", "Palm Oil"]);
        hooks.explanation = async () => garbage;
        const result = await scanService.analyzeImage(FILE, 7);
        assert.deepStrictEqual(summary(result), baseline, JSON.stringify(garbage));
    }
});

test("isolation: an explanation that MUTATES its inputs cannot alter score / grade / matches", async () => {
    const baseline = summary(await baselineScan());

    currentDb = makeDb(isolationConfig());
    hooks.pipeline = pipelineFor(["Skimmed Milk", "BHA", "Palm Oil"]);
    hooks.explanation = async (input) => {
        input.analysis.score = 0;
        input.analysis.grade = "D";
        input.analysis.assessment = "hacked";
        input.ruleMatches.length = 0;
        input.nutrition.calories = 99999;
        return { summary: "mutated" };
    };
    const result = await scanService.analyzeImage(FILE, 7);

    assert.deepStrictEqual(summary(result), baseline);
    assert.strictEqual(currentDb.state.analysis.safety_score, baseline.score);
    assert.strictEqual(currentDb.state.ruleMatches.length, baseline.matches.length);
    assert.strictEqual(result.ai_insights.summary, "mutated");
});

test("isolation: Groq receives the final score as read-only facts", async () => {
    let seen = null;
    currentDb = makeDb(isolationConfig());
    hooks.pipeline = pipelineFor(["Skimmed Milk", "BHA", "Palm Oil"]);
    hooks.explanation = async (input) => {
        seen = JSON.parse(JSON.stringify(input.analysis));
        return {};
    };
    const result = await scanService.analyzeImage(FILE, 7);
    assert.strictEqual(seen.score, result.analysis.safetyScore);
    assert.strictEqual(seen.grade, result.analysis.safetyGrade);
});

test("isolation: Groq is called only AFTER the score is stored", async () => {
    let storedAtCall = null;
    currentDb = makeDb(isolationConfig());
    hooks.pipeline = pipelineFor(["Skimmed Milk"]);
    hooks.explanation = async () => {
        storedAtCall = currentDb.state.analysis && currentDb.state.committed;
        return {};
    };
    await scanService.analyzeImage(FILE, 7);
    assert.ok(storedAtCall, "score must be committed before Groq runs");
});

test("isolation: MongoDB failure does not change or fail the scan", async () => {
    const baseline = summary(await baselineScan());

    currentDb = makeDb(isolationConfig());
    hooks.pipeline = pipelineFor(["Skimmed Milk", "BHA", "Palm Oil"]);
    hooks.rawDataCreate = async () => {
        throw new Error("Mongo down");
    };
    const result = await scanService.analyzeImage(FILE, 7);
    assert.deepStrictEqual(summary(result), baseline);
});

test("isolation: malformed / failing RAG data does not change or fail the scan", async () => {
    const baseline = summary(await baselineScan());

    for (const badRag of [
        { ingredients: "garbage" },
        { ingredients: [null, 5, { ingredient: 7 }, { ingredient: "BHA", evidence: "x" }] },
        {},
        null,
    ]) {
        currentDb = makeDb(isolationConfig());
        hooks.pipeline = async () => ({
            ocr: { text: "" },
            ocrPasses: [],
            product: {
                product_name: "Test Snack",
                ingredients: ["Skimmed Milk", "BHA", "Palm Oil"],
                allergens: { confirmed: [], may_contain: [] },
            },
            rag: badRag,
        });
        hooks.explanation = async () => ({});
        const result = await scanService.analyzeImage(FILE, 7);
        assert.deepStrictEqual(summary(result), baseline, JSON.stringify(badRag));
    }
});

test("isolation: rag.service never throws (bad input returns no evidence)", () => {
    const rag = require("../rag/rag.service");
    for (const bad of [null, undefined, 42, {}, [], "", "   "]) {
        assert.deepStrictEqual(rag.getIngredientEvidence(bad), []);
    }
});

test("isolation: the health rule engine imports no AI / RAG / database module", () => {
    const source = require("fs").readFileSync(
        path.join(SERVICES, "healthRules.service.js"),
        "utf8"
    );
    assert.ok(!/require\(/.test(source), "healthRules.service.js must stay dependency-free");
});

/* ================================================================== */
/* Health profile service + validator                                 */
/* ================================================================== */

test("profile service: partial update only sets the properties that were sent", async () => {
    const calls = [];
    currentDb = {
        query: async (sql, values) => {
            calls.push({ sql: sql.replace(/\s+/g, " "), values });
            return { rows: [{ ok: true }] };
        },
    };

    await profileService.createOrUpdateProfile({
        userId: 5,
        dietaryMode: "keto",
    });

    const { sql, values } = calls[0];
    assert.deepStrictEqual(values, [5, "keto"]);
    assert.ok(sql.includes("dietary_mode = EXCLUDED.dietary_mode"));
    assert.ok(!sql.includes("calorie_limit"), "unsent limits must be left alone");
    assert.ok(!sql.includes("max_sugar_threshold"));
    assert.ok(!sql.includes("analysis_strictness"));
    assert.ok(sql.includes("updated_at = NOW()"));
});

test("profile service: explicit null clears a limit, 0 is stored as 0", async () => {
    const calls = [];
    currentDb = {
        query: async (sql, values) => {
            calls.push({ sql: sql.replace(/\s+/g, " "), values });
            return { rows: [{}] };
        },
    };

    await profileService.createOrUpdateProfile({
        userId: 5,
        calorieLimit: null,
        maxSugarThreshold: 0,
        maxSodiumThreshold: 500,
        dietaryMode: "none",
        analysisStrictness: "strict",
    });

    assert.deepStrictEqual(calls[0].values, [5, null, 0, 500, "none", "strict"]);
    assert.ok(calls[0].sql.includes("calorie_limit = EXCLUDED.calorie_limit"));
});

let healthProfileSchema = null;
try {
    ({ healthProfileSchema } = require("../../validators/healthProfile.validator"));
} catch (error) {
    console.log(`SKIP  validator tests (${error.message.split("\n")[0]})`);
}

if (healthProfileSchema) {
    const ok = (body) => healthProfileSchema.safeParse(body).success;

    test("validator: every supported dietary mode and strictness is accepted", () => {
        for (const mode of ["none", "vegan", "gluten-free", "keto", "type-2-diabetic"]) {
            assert.ok(ok({ dietaryMode: mode }), mode);
        }
        for (const s of ["strict", "moderate"]) {
            assert.ok(ok({ analysisStrictness: s }), s);
        }
    });

    test("validator: unsupported modes / strictness are rejected", () => {
        for (const mode of ["vegetarian", "paleo", "", "Keto", "constructor"]) {
            assert.ok(!ok({ dietaryMode: mode }), mode);
        }
        for (const s of ["low", "high", "", "STRICT"]) {
            assert.ok(!ok({ analysisStrictness: s }), s);
        }
    });

    test("validator: the form's empty limits (null) are accepted, 0 sugar / sodium allowed", () => {
        assert.ok(
            ok({
                calorieLimit: null,
                maxSugarThreshold: null,
                maxSodiumThreshold: null,
                dietaryMode: "none",
                analysisStrictness: "moderate",
            })
        );
        assert.ok(ok({ maxSugarThreshold: 0, maxSodiumThreshold: 0 }));
        assert.ok(ok({}));
    });

    test("validator: invalid limits are rejected", () => {
        assert.ok(!ok({ calorieLimit: 0 }));
        assert.ok(!ok({ calorieLimit: -5 }));
        assert.ok(!ok({ calorieLimit: 1999.5 }));
        assert.ok(!ok({ maxSugarThreshold: -1 }));
        assert.ok(!ok({ maxSodiumThreshold: "abc" }));
        assert.ok(!ok({ maxSodiumThreshold: NaN }));
    });
}

/* ------------------------------------------------------------------ */
/* Runner                                                             */
/* ------------------------------------------------------------------ */

(async () => {
    let passed = 0;
    let failed = 0;

    const originalError = console.error;
    const originalLog = console.log;

    for (const { name, fn } of tests) {
        // The services log to the console; keep the test output clean.
        console.error = () => {};
        console.log = () => {};
        try {
            await fn();
            console.error = originalError;
            console.log = originalLog;
            passed++;
            originalLog(`PASS  ${name}`);
        } catch (error) {
            console.error = originalError;
            console.log = originalLog;
            failed++;
            originalLog(`FAIL  ${name}`);
            originalLog(
                `      ${String(error.message).split("\n").join("\n      ")}`
            );
        }
    }

    originalLog(`\n${passed} passed, ${failed} failed`);

    process.exit(failed ? 1 : 0);
})();