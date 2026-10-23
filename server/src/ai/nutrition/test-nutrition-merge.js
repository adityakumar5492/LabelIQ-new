// server/src/ai/nutrition/test-nutrition-merge.js
//
// Run:  node server/src/ai/nutrition/test-nutrition-merge.js
//
// Group 2 verification (no production code is changed by this file).
//
// Exercises the REAL pipeline pieces, offline:
//   - parseNutritionMultiPass + validateNutrition  (nutrition.service.js)
//   - buildNutrition                               (scan.service.js)
// scan.service.js also imports the database, MongoDB and Groq modules.
// Those are replaced by empty stubs while it loads, so no database,
// Tesseract, network, API key or extra dependency is needed.

const assert = require("assert");
const Module = require("module");
const path = require("path");

const SCAN_SERVICE = path.resolve(__dirname, "../../services/scan.service.js");

const STUBS = {
    "../ai/pipeline/ai-pipeline.service": { analyzeImage: async () => ({}) },
    "../ai/rag/rag.service": { getIngredientEvidence: () => [] },
    "../ai/explanation/explanation.service": { generateAiInsights: async () => ({}) },
    "../models/scanRawData.model": {},
    "../config/db": { connect: async () => ({}) },
};

const originalLoad = Module._load;

Module._load = function (request, parent, isMain) {
    if (
        parent &&
        parent.filename === SCAN_SERVICE &&
        Object.prototype.hasOwnProperty.call(STUBS, request)
    ) {
        return STUBS[request];
    }

    return originalLoad.apply(this, arguments);
};

const { buildNutrition } = require(SCAN_SERVICE);
const { validateNutrition } = require("./nutrition.service");

Module._load = originalLoad;

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

// A generic per-serving table (reference values only for the test).
const TABLE = (lines) =>
    ["Nutrition Information", "Per 32g serving", ...lines].join("\n");

const FULL_LINES = [
    "Energy 140 kcal",
    "Protein 3.4 g",
    "Carbohydrate 16 g",
    "of which Sugars 13 g",
    "Total Fat 6.5 g",
    "of which Saturates 1.6 g",
    "Dietary Fibre 2.6 g",
    "Salt 0.06 g",
];

const withoutLine = (lines, word) =>
    lines.filter((line) => !new RegExp(word, "i").test(line));

// Runs the real deterministic parser inside buildNutrition.
const run = ({ tableText, ocrText, extraction }) =>
    buildNutrition({
        ocrText: ocrText !== undefined ? ocrText : tableText,
        passes: [{ name: "base", text: tableText, words: [] }],
        extraction,
    });

const groq = (nutrition, extra = {}) => ({
    nutritionBasis: "per-serving",
    servingSize: { value: 32, unit: "g" },
    nutrition,
    ...extra,
});

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

/* ------------------------------------------------------------------ */
/* Sanity: the deterministic parser itself                            */
/* ------------------------------------------------------------------ */

test("deterministic table alone fills every printed nutrient", () => {
    const { nutrition, meta } = run({
        tableText: TABLE(FULL_LINES),
        extraction: null,
    });

    assert.strictEqual(nutrition.calories, 140);
    assert.strictEqual(nutrition.protein_g, 3.4);
    assert.strictEqual(nutrition.carbohydrates_g, 16);
    assert.strictEqual(nutrition.total_fat_g, 6.5);
    assert.strictEqual(nutrition.saturated_fat_g, 1.6);
    assert.strictEqual(nutrition.total_sugars_g, 13);
    assert.strictEqual(nutrition.dietary_fiber_g, 2.6);
    assert.strictEqual(nutrition.sodium_mg, 24);
    assert.strictEqual(nutrition.serving_size, "32 g");
    assert.strictEqual(meta.basis, "per-serving");
    assert.strictEqual(meta.source, "table");
    assert.strictEqual(meta.salt_g, 0.06);
    assert.deepStrictEqual(meta.ai_filled_fields, []);
});

/* ------------------------------------------------------------------ */
/* 1. Deterministic beats Groq                                        */
/* ------------------------------------------------------------------ */

test("1. deterministic saturated fat 1.6 beats Groq 16", () => {
    const { nutrition, meta } = run({
        tableText: TABLE(FULL_LINES),
        extraction: groq({ saturatedFat: 16 }),
    });

    assert.strictEqual(nutrition.saturated_fat_g, 1.6);
    assert.ok(!meta.ai_filled_fields.includes("saturatedFat"));
});

/* ------------------------------------------------------------------ */
/* 2. Groq only fills missing values                                  */
/* ------------------------------------------------------------------ */

test("2a. wrong Groq values never overwrite reliable table values", () => {
    const lines = [
        "Energy 140 kcal",
        "Protein 2.6 g",
        "Carbohydrate 16 g",
        "Total Fat 6.5 g",
        "of which Saturates 1.6 g",
    ];

    const { nutrition, meta } = run({
        tableText: TABLE(lines),
        extraction: groq({
            calories: 999,
            protein: 99,
            carbohydrates: 99,
            totalFat: 99,
            saturatedFat: 16,
            fiber: 1,
        }),
    });

    assert.strictEqual(nutrition.calories, 140);
    assert.strictEqual(nutrition.protein_g, 2.6);
    assert.strictEqual(nutrition.carbohydrates_g, 16);
    assert.strictEqual(nutrition.total_fat_g, 6.5);
    assert.strictEqual(nutrition.saturated_fat_g, 1.6);

    // The label never printed fibre, so Groq's 1 is not accepted either.
    assert.strictEqual(nutrition.dietary_fiber_g, null);
    assert.deepStrictEqual(meta.ai_filled_fields, []);
});

test("2b. Groq fills a genuinely missing field when OCR has evidence for it", () => {
    // The table parser sees no sugars row, but the OCR text does mention
    // sugars, so a validated Groq value may fill that one gap.
    const lines = withoutLine(FULL_LINES, "Sugars");

    const { nutrition, meta } = run({
        tableText: TABLE(lines),
        ocrText: TABLE(FULL_LINES),
        extraction: groq({ sugar: 13, calories: 999 }),
    });

    assert.strictEqual(nutrition.total_sugars_g, 13);
    assert.strictEqual(nutrition.calories, 140);
    assert.deepStrictEqual(meta.ai_filled_fields, ["sugar"]);
    assert.strictEqual(meta.source, "table+ai");
});

test("2c. Groq value for a nutrient the OCR never mentions is rejected", () => {
    const lines = withoutLine(FULL_LINES, "Sugars");

    const { nutrition, meta } = run({
        tableText: TABLE(lines),
        extraction: groq({ sugar: 13 }),
    });

    assert.strictEqual(nutrition.total_sugars_g, null);
    assert.deepStrictEqual(meta.ai_filled_fields, []);
});

test("2d. Groq value that breaks a validation rule is not accepted", () => {
    // Fat 6.5 is a table value. Groq proposes saturated fat 16 for a
    // missing field: 16 > 6.5, so it is discarded and stays null.
    const lines = withoutLine(FULL_LINES, "Saturates");

    const { nutrition } = run({
        tableText: TABLE(lines),
        ocrText: TABLE(FULL_LINES),
        extraction: groq({ saturatedFat: 16 }),
    });

    assert.strictEqual(nutrition.total_fat_g, 6.5);
    assert.strictEqual(nutrition.saturated_fat_g, null);
});

test("2e. Groq cannot destroy a table value through a validation conflict", () => {
    // Table has sugars 13 but no carbohydrate row. Groq offers carbs 5,
    // which would make sugars > carbs and wipe the table's sugars.
    const lines = withoutLine(FULL_LINES, "Carbohydrate");

    const { nutrition, meta } = run({
        tableText: TABLE(lines),
        ocrText: TABLE(FULL_LINES),
        extraction: groq({ carbohydrates: 5 }),
    });

    assert.strictEqual(nutrition.total_sugars_g, 13);
    assert.strictEqual(nutrition.carbohydrates_g, null);
    assert.ok(
        meta.parser_warnings.some((w) => /conflicted/.test(w)),
        "expected a conflict warning"
    );
});

/* ------------------------------------------------------------------ */
/* 3. Salt -> sodium                                                  */
/* ------------------------------------------------------------------ */

test("3a. salt 0.06 g -> sodium 24 mg", () => {
    const { nutrition, meta } = run({
        tableText: TABLE(FULL_LINES),
        extraction: null,
    });

    assert.strictEqual(meta.salt_g, 0.06);
    assert.strictEqual(nutrition.sodium_mg, 24);
    assert.strictEqual(meta.sodium_source, "salt");
});

test("3b. Groq sodium is ignored when the label prints only salt", () => {
    const { nutrition, meta } = run({
        tableText: TABLE(FULL_LINES),
        extraction: groq({ sodium: 999 }),
    });

    assert.strictEqual(nutrition.sodium_mg, 24);
    assert.strictEqual(meta.sodium_source, "salt");
});

test("3c. no salt and no sodium on the label -> sodium stays null", () => {
    const lines = withoutLine(FULL_LINES, "Salt");

    const { nutrition, meta } = run({
        tableText: TABLE(lines),
        extraction: groq({ sodium: 500, salt: 1.2 }),
    });

    assert.strictEqual(nutrition.sodium_mg, null);
    assert.strictEqual(meta.sodium_source, null);
    assert.strictEqual(meta.salt_g, null);
});

test("3d. sodium is never derived from other nutrients / numbers", () => {
    const lines = [
        "Energy 140 kcal",
        "Protein 3.4 g",
        "Carbohydrate 16 g",
        "Total Fat 6.5 g",
    ];

    const { nutrition } = run({
        tableText: TABLE(lines),
        extraction: null,
    });

    assert.strictEqual(nutrition.sodium_mg, null);
});

test("3e. an explicit sodium value on the label wins over salt", () => {
    const lines = [...withoutLine(FULL_LINES, "Salt"), "Sodium 120 mg"];

    const { nutrition, meta } = run({
        tableText: TABLE(lines),
        extraction: null,
    });

    assert.strictEqual(nutrition.sodium_mg, 120);
    assert.strictEqual(meta.sodium_source, "label");
});

test("3f. salt multiplier is exactly 400 mg per gram", () => {
    for (const [salt, sodium] of [
        [1, 400],
        [0.5, 200],
        [1.25, 500],
    ]) {
        const lines = [...withoutLine(FULL_LINES, "Salt"), `Salt ${salt} g`];

        const { nutrition } = run({
            tableText: TABLE(lines),
            extraction: null,
        });

        assert.strictEqual(nutrition.sodium_mg, sodium, `salt ${salt}`);
    }
});

/* ------------------------------------------------------------------ */
/* 4. Fiber                                                           */
/* ------------------------------------------------------------------ */

test("4a. fiber not printed on the label -> null", () => {
    const { nutrition } = run({
        tableText: TABLE(withoutLine(FULL_LINES, "Fibre")),
        extraction: null,
    });

    assert.strictEqual(nutrition.dietary_fiber_g, null);
});

test("4b. Groq cannot supply fiber the OCR never mentions", () => {
    const { nutrition } = run({
        tableText: TABLE(withoutLine(FULL_LINES, "Fibre")),
        extraction: groq({ fiber: 2.6 }),
    });

    assert.strictEqual(nutrition.dietary_fiber_g, null);
});

test("4c. added sugars is never invented", () => {
    const { nutrition } = run({
        tableText: TABLE(FULL_LINES),
        extraction: groq({ sugar: 13 }),
    });

    assert.strictEqual(nutrition.added_sugars_g, null);
});

/* ------------------------------------------------------------------ */
/* 5. Validation                                                      */
/* ------------------------------------------------------------------ */

test("5a. negative values are rejected", () => {
    const v = validateNutrition({
        calories: -140,
        protein: -1,
        carbohydrates: 16,
        totalFat: 6.5,
        saturatedFat: 1.6,
        sugar: 13,
        fiber: -0.1,
        sodium: -5,
        salt: -0.06,
    });

    assert.strictEqual(v.calories, null);
    assert.strictEqual(v.protein, null);
    assert.strictEqual(v.fiber, null);
    assert.strictEqual(v.sodium, null);
    assert.strictEqual(v.salt, null);

    // Valid neighbours are untouched.
    assert.strictEqual(v.carbohydrates, 16);
    assert.strictEqual(v.totalFat, 6.5);
});

test("5b. saturated fat > total fat is rejected", () => {
    const v = validateNutrition({ totalFat: 6.5, saturatedFat: 16 });

    assert.strictEqual(v.saturatedFat, null);
    assert.strictEqual(v.totalFat, 6.5);
});

test("5c. sugars > carbohydrates is rejected", () => {
    const v = validateNutrition({ carbohydrates: 16, sugar: 40 });

    assert.strictEqual(v.sugar, null);
    assert.strictEqual(v.carbohydrates, 16);
});

test("5d. valid values (including equality and zero) stay unchanged", () => {
    const input = {
        calories: 140,
        protein: 0,
        carbohydrates: 16,
        totalFat: 6.5,
        saturatedFat: 6.5,
        sugar: 16,
        fiber: 2.6,
        sodium: 24,
        salt: 0.06,
    };

    assert.deepStrictEqual(validateNutrition(input), input);
});

test("5e. malformed values become null, missing values stay null", () => {
    const v = validateNutrition({
        calories: "140",
        protein: NaN,
        carbohydrates: Infinity,
        totalFat: undefined,
        saturatedFat: {},
        sugar: null,
    });

    for (const key of [
        "calories",
        "protein",
        "carbohydrates",
        "totalFat",
        "saturatedFat",
        "sugar",
        "fiber",
        "sodium",
        "salt",
    ]) {
        assert.strictEqual(v[key], null, key);
    }

    assert.deepStrictEqual(validateNutrition(null), validateNutrition({}));
});

test("5f. Groq-only path applies the same validation", () => {
    // No usable table at all: Groq is the last resort, but still validated.
    const { nutrition, meta } = buildNutrition({
        ocrText: "Energy Protein Fat Saturates Carbohydrate Sugars",
        passes: [{ name: "base", text: "no table here", words: [] }],
        extraction: groq({
            calories: -5,
            protein: 3,
            totalFat: 3,
            saturatedFat: 7,
            carbohydrates: 10,
            sugar: 20,
        }),
    });

    assert.strictEqual(nutrition.calories, null);
    assert.strictEqual(nutrition.protein_g, 3);
    assert.strictEqual(nutrition.total_fat_g, 3);
    assert.strictEqual(nutrition.saturated_fat_g, null);
    assert.strictEqual(nutrition.carbohydrates_g, 10);
    assert.strictEqual(nutrition.total_sugars_g, null);
    assert.strictEqual(meta.source, "ai");
});

test("5g. a corrupted OCR saturated fat can never end up larger than total fat", () => {
    const lines = FULL_LINES.map((line) =>
        /Saturates/.test(line) ? "of which Saturates 16 g" : line
    );

    const { nutrition } = run({
        tableText: TABLE(lines),
        extraction: groq({ saturatedFat: 16 }),
    });

    assert.notStrictEqual(nutrition.saturated_fat_g, 16);
    assert.ok(
        nutrition.saturated_fat_g === null ||
            nutrition.saturated_fat_g <= nutrition.total_fat_g
    );
});

/* ------------------------------------------------------------------ */
/* 6. Serving / basis matching                                        */
/* ------------------------------------------------------------------ */

const PER_100G = (lines) =>
    ["Nutrition Information", "Per 100g", ...lines].join("\n");

const LINES_100G = [
    "Energy 450 kcal",
    "Protein 5 g",
    "Carbohydrate 60 g",
    "Total Fat 20 g",
    "of which Saturates 8 g",
    "Salt 0.5 g",
];

test("6a. table per-100g + Groq per-serving values are NOT merged", () => {
    const { nutrition, meta } = run({
        tableText: PER_100G(LINES_100G),
        ocrText: PER_100G([...LINES_100G, "Sugars 30 g"]),
        extraction: groq(
            { sugar: 9.6, calories: 144 },
            { nutritionBasis: "per-serving" }
        ),
    });

    assert.strictEqual(meta.basis, "per-100g");
    assert.strictEqual(nutrition.calories, 450);
    assert.strictEqual(nutrition.total_sugars_g, null);
    assert.deepStrictEqual(meta.ai_filled_fields, []);
});

test("6b. table per-serving + Groq per-100g values are NOT merged", () => {
    const lines = withoutLine(FULL_LINES, "Sugars");

    const { nutrition, meta } = run({
        tableText: TABLE(lines),
        ocrText: TABLE(FULL_LINES),
        extraction: groq({ sugar: 40 }, { nutritionBasis: "per-100g" }),
    });

    assert.strictEqual(meta.basis, "per-serving");
    assert.strictEqual(nutrition.total_sugars_g, null);
    assert.deepStrictEqual(meta.ai_filled_fields, []);
});

test("6c. same basis but a different serving size is NOT merged", () => {
    const lines = withoutLine(FULL_LINES, "Sugars");

    const { nutrition } = run({
        tableText: TABLE(lines),
        ocrText: TABLE(FULL_LINES),
        extraction: groq(
            { sugar: 13 },
            { servingSize: { value: 30, unit: "g" } }
        ),
    });

    assert.strictEqual(nutrition.total_sugars_g, null);
});

test("6d. same basis, serving size unknown on one side -> may fill", () => {
    const lines = withoutLine(FULL_LINES, "Sugars");

    const { nutrition } = run({
        tableText: TABLE(lines),
        ocrText: TABLE(FULL_LINES),
        extraction: groq(
            { sugar: 13 },
            { servingSize: { value: null, unit: null } }
        ),
    });

    assert.strictEqual(nutrition.total_sugars_g, 13);
});

test("6e. Groq serving size is used only when the table has none", () => {
    const withTable = run({
        tableText: TABLE(FULL_LINES),
        extraction: groq({}, { servingSize: { value: 99, unit: "g" } }),
    });

    assert.strictEqual(withTable.nutrition.serving_size, "32 g");

    const noServing = run({
        tableText: PER_100G(LINES_100G),
        extraction: groq({}, {
            nutritionBasis: "per-100g",
            servingSize: { value: 45, unit: "g" },
        }),
    });

    assert.strictEqual(noServing.nutrition.serving_size, "45 g");
});

/* ------------------------------------------------------------------ */
/* Runner                                                             */
/* ------------------------------------------------------------------ */

let passed = 0;
let failed = 0;

for (const { name, fn } of tests) {
    try {
        fn();
        passed++;
        console.log(`PASS  ${name}`);
    } catch (error) {
        failed++;
        console.log(`FAIL  ${name}`);
        console.log(`      ${String(error.message).split("\n").join("\n      ")}`);
    }
}

console.log(`\n${passed} passed, ${failed} failed`);

process.exit(failed ? 1 : 0);