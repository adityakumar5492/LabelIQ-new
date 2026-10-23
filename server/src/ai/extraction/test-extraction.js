// server/src/ai/extraction/test-extraction.js
//
// Run:  node server/src/ai/extraction/test-extraction.js
//
// Offline tests for Group 1 (product name, allergens, ingredients).
// No Tesseract, no network, no Groq SDK, no API key needed.

const assert = require("assert");

const {
    extractProductInfo,
    normalizeExtraction,
    normalizeAllergens,
    detectAllergens,
    normalizeIngredients,
    validateProductName,
    splitEvidence,
    setGroqClientForTests,
} = require("./extraction.service");

let passed = 0;
let failed = 0;

const pending = [];

function test(name, fn) {
    pending.push({ name, fn });
}

const allergensOf = (texts, model) =>
    normalizeAllergens(model || {}, texts);

/* ------------------------------------------------------------------ */
/* Allergens                                                          */
/* ------------------------------------------------------------------ */

test("Contains: statement -> confirmed; May contain -> may_contain", () => {
    const text = `Ingredients: Sugar, Cocoa Butter, Salt.
Contains: Milk, Soya.
May contain Peanuts.`;

    const a = allergensOf([text]);

    assert.deepStrictEqual(a.confirmed, ["milk", "soya"]);
    assert.deepStrictEqual(a.may_contain, ["peanuts"]);
});

test("wrapped May contain statement is joined across lines", () => {
    const text = `Ingredients: Sugar, Cocoa Mass, Salt.
May contain traces of
Peanuts and
Hazelnuts.
Store in a cool place.`;

    const a = allergensOf([text]);

    assert.deepStrictEqual(a.confirmed, []);
    assert.deepStrictEqual(a.may_contain, ["peanuts", "nuts"]);
});

test("statement after wrapped May contain does not leak into it", () => {
    const text = `Ingredients: Sugar, Wheat Flour, Salt.
May contain Peanuts.
Store in a cool dry place away from Sesame Street.`;

    const a = allergensOf([text]);

    assert.deepStrictEqual(a.confirmed, ["wheat"]);
    assert.deepStrictEqual(a.may_contain, ["peanuts"]);
});

test("'manufactured in a facility that also handles' -> may_contain", () => {
    const text = `Ingredients: Sugar, Salt.
Manufactured in a facility that also handles Peanuts and Sesame.`;

    const a = allergensOf([text]);

    assert.deepStrictEqual(a.confirmed, []);
    assert.deepStrictEqual(a.may_contain, ["peanuts", "sesame"]);
});

test("Lecithin alone is NOT soya", () => {
    const a = allergensOf([
        "Ingredients: Sugar, Emulsifier (Lecithin), Salt.",
        "Ingredients: Sugar, Emulsifier | Lecithin], Salt.",
    ]);

    assert.deepStrictEqual(a.confirmed, []);
    assert.deepStrictEqual(a.may_contain, []);
});

test("Sunflower lecithin is NOT soya", () => {
    const a = allergensOf([
        "Ingredients: Sugar, Emulsifier (Sunflower Lecithin), Salt.",
    ]);

    assert.deepStrictEqual(a.confirmed, []);
});

test("Soya found in another OCR pass counts (fragmented OCR)", () => {
    const a = allergensOf([
        "Ingredients: Sugar, Cocoa Butter, Emulsifier | Lecithin], Salt.",
        "Ingredients: Sugar, Cocoa Butter, Emulsifier [Soya Lecithin], Salt.",
    ]);

    assert.deepStrictEqual(a.confirmed, ["soya"]);
});

test("allergen only in may-contain is never confirmed", () => {
    const a = allergensOf([
        "Ingredients: Sugar, Salt. May contain Soya.",
    ]);

    assert.deepStrictEqual(a.confirmed, []);
    assert.deepStrictEqual(a.may_contain, ["soya"]);
});

test("model cannot promote may-contain to confirmed", () => {
    const a = allergensOf(
        ["Ingredients: Sugar, Salt. May contain Peanuts and Soya."],
        { confirmed: ["peanuts", "soya"], may_contain: [] }
    );

    assert.deepStrictEqual(a.confirmed, []);
    assert.deepStrictEqual(a.may_contain, ["peanuts", "soya"]);
});

test("model cannot invent an allergen without OCR evidence", () => {
    const a = allergensOf(
        ["Ingredients: Sugar, Salt."],
        { confirmed: ["wheat", "milk"], may_contain: ["peanuts"] }
    );

    assert.deepStrictEqual(a.confirmed, []);
    assert.deepStrictEqual(a.may_contain, []);
});

test("model names are canonicalised (soy->soya, peanut->peanuts)", () => {
    const a = allergensOf(
        ["Sugar, Soy Flour, Salt"],
        { confirmed: ["soy"], may_contain: [] }
    );

    // No ingredient section: model fallback applies, evidence is printed.
    assert.deepStrictEqual(a.confirmed, ["soya"]);
});

test("allergen in ingredients AND may-contain stays confirmed (2 readings)", () => {
    const a = allergensOf([
        "Ingredients: Milk Chocolate (Sugar, Milk Solids). May contain Milk.",
        "Ingredients: Milk Chocolate (Sugar, Milk Solids), Salt. May contain Milk.",
    ]);

    assert.deepStrictEqual(a.confirmed, ["milk"]);
    assert.deepStrictEqual(a.may_contain, []);
});

test("confirmed and may_contain are always disjoint", () => {
    const a = allergensOf([
        "Ingredients: Wheat Flour, Milk Solids. Contains: Wheat, Milk. May contain Milk, Peanuts, Wheat.",
    ]);

    for (const name of a.may_contain) {
        assert.ok(!a.confirmed.includes(name), `${name} in both lists`);
    }

    assert.deepStrictEqual(a.confirmed, ["milk", "wheat"]);
    assert.deepStrictEqual(a.may_contain, ["peanuts"]);
});

test("'peanut free' / 'free from milk' are not allergens", () => {
    const a = allergensOf([
        "Ingredients: Sugar, Salt. Peanut free product. Free from milk.",
    ]);

    assert.deepStrictEqual(a.confirmed, []);
    assert.deepStrictEqual(a.may_contain, []);
});

test("plant milks are not dairy milk (almond milk -> nuts only)", () => {
    const a = allergensOf([
        "Ingredients: Water, Coconut Milk, Almond Milk, Salt.",
    ]);

    assert.deepStrictEqual(a.confirmed, ["nuts"]);
});

test("marketing text outside the ingredient list is not evidence", () => {
    const a = allergensOf([
        `Enjoy the rich milk and peanut taste!
Ingredients: Sugar, Cocoa Butter, Salt.
Nutrition Information per 32g: Protein 3.4g`,
    ]);

    assert.deepStrictEqual(a.confirmed, []);
});

test("garbled 'Nay contain' pass does not promote the allergen", () => {
    const a = allergensOf([
        "Ingredients: Sugar, Salt. May contain Peanuts.",
        "Ingredients: Sugar, Salt. Nay contain Peanuts.",
    ]);

    assert.deepStrictEqual(a.confirmed, []);
    assert.deepStrictEqual(a.may_contain, ["peanuts"]);
});

test("no ingredient section: model-confirmed needs printed evidence", () => {
    const a = allergensOf(
        ["Sugar, Milk Solids, Cocoa Butter"],
        { confirmed: ["milk", "wheat"], may_contain: [] }
    );

    assert.deepStrictEqual(a.confirmed, ["milk"]);
});

test("result shape is {confirmed:[], may_contain:[]} even for empty input", () => {
    assert.deepStrictEqual(allergensOf([""]), {
        confirmed: [],
        may_contain: [],
    });

    assert.deepStrictEqual(normalizeAllergens(null, ""), {
        confirmed: [],
        may_contain: [],
    });

    assert.deepStrictEqual(normalizeAllergens(["milk"], "milk"), {
        confirmed: [],
        may_contain: [],
    });
});

test("detectAllergens exposes no mutation of inputs", () => {
    const texts = ["Ingredients: Milk, Sugar."];
    const copy = [...texts];

    detectAllergens(texts);

    assert.deepStrictEqual(texts, copy);
});

/* ------------------------------------------------------------------ */
/* Ingredients                                                        */
/* ------------------------------------------------------------------ */

test("nested ingredients, percentages, [from Milk] are preserved verbatim", () => {
    const input = [
        "Milk Chocolate (Sugar, Cocoa Butter, Milk Solids, Cocoa Mass)",
        "Caramel (Glucose Syrup, Sugar, Milk Solids)",
        "Peanuts (12%)",
        "Whey Powder [from Milk]",
        "Cocoa Solids (min. 30%)",
        "Emulsifier [Soya Lecithin]",
    ];

    assert.deepStrictEqual(normalizeIngredients(input), input);
});

test("label order is preserved", () => {
    const input = ["Sugar", "Palm Oil", "Cocoa", "Salt", "Vanillin"];

    assert.deepStrictEqual(normalizeIngredients(input), input);
});

test("OCR noise: stray |, spacing, trailing punctuation, % spacing", () => {
    const out = normalizeIngredients([
        "Emulsifier | Lecithin]",
        "Sugar 12 %",
        "  Salt  ;",
        "Milk Solids ( Dried ) .",
    ]);

    assert.deepStrictEqual(out, [
        "Emulsifier Lecithin",
        "Sugar 12%",
        "Salt",
        "Milk Solids (Dried)",
    ]);
});

test("unbalanced / mismatched brackets are repaired without adding words", () => {
    const out = normalizeIngredients([
        "Caramel (Glucose Syrup, Sugar",
        "Emulsifier [Soya Lecithin)",
        "Salt)",
        "Flavour ()",
    ]);

    assert.deepStrictEqual(out, [
        "Caramel (Glucose Syrup, Sugar)",
        "Emulsifier [Soya Lecithin]",
        "Salt",
        "Flavour",
    ]);
});

test("one item holding several top-level ingredients is split; nesting is not", () => {
    const out = normalizeIngredients([
        "Sugar, Salt",
        "Milk Chocolate (Sugar, Cocoa Butter)",
        "Colour (12,5%)",
    ]);

    assert.deepStrictEqual(out, [
        "Sugar",
        "Salt",
        "Milk Chocolate (Sugar, Cocoa Butter)",
        "Colour (12,5%)",
    ]);
});

test("bare fragment next to its fuller version is removed", () => {
    assert.deepStrictEqual(
        normalizeIngredients([
            "Milk Chocolate",
            "Milk Chocolate (Sugar, Cocoa Butter)",
            "Salt",
        ]),
        ["Milk Chocolate (Sugar, Cocoa Butter)", "Salt"]
    );

    assert.deepStrictEqual(
        normalizeIngredients([
            "Sugar",
            "Emulsifier Lecithin",
            "Emulsifier [Soya Lecithin]",
        ]),
        ["Sugar", "Emulsifier [Soya Lecithin]"]
    );
});

test("distinct ingredients that share a first word are both kept", () => {
    const input = ["Sugar", "Sugar Syrup (Liquid)", "Salt"];

    assert.deepStrictEqual(normalizeIngredients(input), input);
});

test("whole list read twice by OCR is de-duplicated", () => {
    const out = normalizeIngredients([
        "Sugar",
        "Cocoa Butter",
        "Milk Solids",
        "Sugar",
        "Cocoa Butter",
        "Milk Solids",
    ]);

    assert.deepStrictEqual(out, ["Sugar", "Cocoa Butter", "Milk Solids"]);
});

test("repeated nested group is removed; adjacent exact duplicate is removed", () => {
    const out = normalizeIngredients([
        "Caramel (Glucose Syrup, Sugar)",
        "Salt",
        "Salt",
        "Caramel (Glucose Syrup, Sugar)",
    ]);

    assert.deepStrictEqual(out, ["Caramel (Glucose Syrup, Sugar)", "Salt"]);
});

test("legitimate repeats in a flattened list are NOT destroyed", () => {
    const input = [
        "Sugar",
        "Cocoa Butter",
        "Milk Solids",
        "Glucose Syrup",
        "Sugar",
        "Milk Solids",
    ];

    assert.deepStrictEqual(normalizeIngredients(input), input);
});

test("non-ingredient statements and junk are dropped", () => {
    const out = normalizeIngredients([
        "Sugar",
        "May contain traces of nuts",
        "Contains: Milk",
        "---",
        "|",
        "x",
        "Salt",
    ]);

    assert.deepStrictEqual(out, ["Sugar", "Salt"]);
});

test("accepts {name} objects and ignores non-arrays / non-strings", () => {
    assert.deepStrictEqual(
        normalizeIngredients([{ name: "Sugar." }, 5, null, { x: 1 }, "Salt"]),
        ["Sugar", "Salt"]
    );

    assert.deepStrictEqual(normalizeIngredients(null), []);
    assert.deepStrictEqual(normalizeIngredients("Sugar"), []);
});

/* ------------------------------------------------------------------ */
/* Product name                                                       */
/* ------------------------------------------------------------------ */

test("name found in OCR evidence is kept", () => {
    const v = validateProductName("Choco Crunch Cereal", [
        "Ingredients: Sugar",
        "CHOCO CRUNCH CEREAL\nNet Wt 300g",
    ]);

    assert.strictEqual(v.value, "Choco Crunch Cereal");
});

test("name NOT in OCR evidence -> null (hallucination blocked)", () => {
    const v = validateProductName("Triple Treat Bar", [
        "Delicious crunchy chocolate with caramel\nNutrition Information per 32g",
    ]);

    assert.strictEqual(v.value, null);
    assert.ok(/not-in-ocr-evidence/.test(v.reason));
});

test("partially evidenced name -> null, not a partial name", () => {
    const v = validateProductName("Triple Treat Bar", [
        "TRIPLE TREAT\nNet Wt 100g",
    ]);

    assert.strictEqual(v.value, null);
});

test("OCR character error in the name is tolerated", () => {
    const v = validateProductName("Crunchy Bites", ["CRUNCHY BLTES 200g"]);

    assert.strictEqual(v.value, "Crunchy Bites");
});

test("glued words from stylised logos are tolerated", () => {
    const v = validateProductName("Triple Treat", ["TripleTreat 100g"]);

    assert.strictEqual(v.value, "Triple Treat");
});

test("headings, pack sizes, long sentences and placeholders are not names", () => {
    const evidence = [
        "Nutrition Information 200g Net Wt Best before Serving size",
    ];

    for (const bad of [
        "Nutrition Information",
        "200g",
        "Net Wt 200g",
        "Best Before",
        "null",
        "N/A",
        "",
        null,
        undefined,
        "A very long marketing slogan that goes on and on and on and on",
    ]) {
        assert.strictEqual(
            validateProductName(bad, evidence).value,
            null,
            `should reject ${JSON.stringify(bad)}`
        );
    }
});

test("no OCR text -> null", () => {
    assert.strictEqual(validateProductName("Choco Crunch", []).value, null);
});

test("stray product_name from the model cannot bypass validation", () => {
    const out = normalizeExtraction(
        { name: null, product_name: "Invented Name", ingredients: [] },
        ["Sugar, Salt"]
    );

    assert.strictEqual(out.name, null);
    assert.ok(!("product_name" in out));
    assert.ok(out.uncertainFields.includes("name"));
});

test("brand / variant / pack / serving fields are unchanged by Group 1", () => {
    const out = normalizeExtraction(
        {
            name: "Choco Crunch",
            brand: " Acme ",
            variant: "Dark",
            packSize: { value: 300, unit: "g", raw: "Net Wt 300g" },
            servingSize: { value: 30, unit: "G" },
            servingsPerContainer: 10,
            nutritionBasis: "per_serving",
            nutrition: {
                calories: 140,
                protein: "3.4",
                totalFat: "abc",
                saturatedFat: -1,
                sugar: "13 g",
                fiber: null,
            },
        },
        ["Choco Crunch Net Wt 300g"]
    );

    assert.strictEqual(out.name, "Choco Crunch");
    assert.strictEqual(out.brand, "Acme");
    assert.strictEqual(out.variant, "Dark");
    assert.deepStrictEqual(out.packSize, {
        value: 300,
        unit: "g",
        raw: "Net Wt 300g",
    });
    assert.deepStrictEqual(out.servingSize, { value: 30, unit: "g" });
    assert.strictEqual(out.servingsPerContainer, 10);
    assert.strictEqual(out.nutritionBasis, "per-serving");

    // Nutrition normalisation is untouched: plain numbers only,
    // everything else null, nothing invented.
    assert.deepStrictEqual(out.nutrition, {
        calories: 140,
        protein: 3.4,
        carbohydrates: null,
        totalFat: null,
        saturatedFat: null,
        sugar: null,
        fiber: null,
        sodium: null,
        salt: null,
    });
});

/* ------------------------------------------------------------------ */
/* Evidence splitting + end-to-end with a mocked Groq                 */
/* ------------------------------------------------------------------ */

test("splitEvidence splits pass markers and de-duplicates texts", () => {
    const texts = splitEvidence(
        "primary text\n--- OCR PASS: base ---\nprimary   text\n\n--- OCR PASS: crop ---\nother text"
    );

    assert.deepStrictEqual(texts, ["primary text", "other text"]);
});

test("extractProductInfo end-to-end (mock Groq, multi-pass evidence)", async () => {
    let seenPrompt = "";

    setGroqClientForTests({
        chat: {
            completions: {
                create: async ({ messages }) => {
                    seenPrompt = messages[0].content;

                    return {
                        choices: [
                            {
                                message: {
                                    content:
                                        "```json\n" +
                                        JSON.stringify({
                                            name: "Choco Crunch Bar",
                                            brand: "Acme",
                                            allergens: {
                                                confirmed: ["milk", "soya", "peanuts"],
                                                may_contain: [],
                                            },
                                            ingredients: [
                                                "Milk Chocolate",
                                                "Milk Chocolate (Sugar, Milk Solids)",
                                                "Emulsifier | Lecithin]",
                                                "Emulsifier [Soya Lecithin]",
                                                "Salt",
                                            ],
                                            nutrition: { calories: 140 },
                                        }) +
                                        "\n```",
                                },
                            },
                        ],
                    };
                },
            },
        },
    });

    const primary = "Ingredients: Milk Chocolate (Sugar, Milk Solids), Emulsifier | Lecithin], Salt.\nMay contain Peanuts.";

    const additional =
        "--- OCR PASS: large-uniform ---\nCHOCO CRUNCH BAR\nIngredients: Milk Chocolate (Sugar, Milk Solids), Emulsifier [Soya Lecithin], Salt.\nMay contain Peanuts.";

    const out = await extractProductInfo(primary, additional);

    assert.ok(seenPrompt.includes("OCR TEXT:"));
    assert.ok(seenPrompt.includes("--- OCR PASS: large-uniform ---"));

    assert.strictEqual(out.name, "Choco Crunch Bar");

    assert.deepStrictEqual(out.allergens, {
        confirmed: ["milk", "soya"],
        may_contain: ["peanuts"],
    });

    assert.deepStrictEqual(out.ingredients, [
        "Milk Chocolate (Sugar, Milk Solids)",
        "Emulsifier [Soya Lecithin]",
        "Salt",
    ]);

    assert.strictEqual(out.nutrition.calories, 140);

    setGroqClientForTests(null);
});

/* ------------------------------------------------------------------ */
/* Runner                                                             */
/* ------------------------------------------------------------------ */

(async () => {
    for (const { name, fn } of pending) {
        try {
            await fn();
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
})();