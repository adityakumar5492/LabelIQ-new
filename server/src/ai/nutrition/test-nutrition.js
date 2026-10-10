// server/src/ai/nutrition/test-nutrition.js
//
// Run:  node server/src/ai/nutrition/test-nutrition.js
// (optional) node server/src/ai/nutrition/test-nutrition.js path/to/image.jpg
//
// Part 1: offline self-tests (no OCR, no image) - proves the parser logic.
// Part 2: real OCR on the test image - shows words, coordinates, result.

const fs = require("fs");
const path = require("path");

const {
    parseNutrition,
    parseNutritionMultiPass,
} = require("./nutrition.service");

/* ------------------------------------------------------------------ */
/* Part 1: self-tests                                                 */
/* ------------------------------------------------------------------ */

// Build words from a compact layout: [y, [[text, x, width], ...]]
function layout(rows) {
    const words = [];

    for (const [y, tokens] of rows) {
        for (const [text, x, w] of tokens) {
            words.push({
                text,
                confidence: 90,
                bbox: { x0: x, y0: y, x1: x + (w || text.length * 14), y1: y + 28 },
            });
        }
    }

    return words;
}

function check(name, actual, expected) {
    const keys = Object.keys(expected);
    const bad = keys.filter((k) => actual[k] !== expected[k]);

    console.log(
        bad.length ? `FAIL  ${name}` : `PASS  ${name}`
    );

    if (bad.length) {
        for (const k of bad) {
            console.log(`        ${k}: got ${actual[k]}, expected ${expected[k]}`);
        }
    }

    return bad.length === 0;
}

function selfTests() {
    let ok = true;

    // 1. Clean text, two columns, serving 32g
    {
        const r = parseNutrition(
            `Portion size: 32g\nNutrition Information\n/100g\n/32g\n` +
            `Energy 1822kJ 583kJ\n436kcal 140kcal\nFat 16g 5.0g\n` +
            `of which saturates 5.0g 1.6g\nCarbohydrate 49g 16g\n` +
            `of which sugars 42g 13g\nProtein 8g 2.6g\nFibre 3.4g\nSalt 0.20g 0.06g`
        );

        ok = check("clean text, per 100g | per 32g", { b: r.nutritionBasis, ...r.nutrition }, {
            b: "per-serving", calories: 140, protein: 2.6, carbohydrates: 16,
            totalFat: 5, saturatedFat: 1.6, sugar: 13, fiber: null,
            sodium: null, salt: 0.06,
        }) && ok;
    }

    // 2. Coordinates, SAME table but serving 40g (nothing hardcoded)
    {
        const words = layout([
            [50, [["Portion", 40], ["size:", 160], ["40g", 260]]],
            [100, [["Nutrition", 40], ["Information", 180], ["/100g", 640], ["/40g", 840], ["/(%)", 960]]],
            [150, [["Energy", 40], ["1500kJ", 640], ["600kJ", 840]]],
            [190, [["375kcal", 640], ["150kcal", 840], ["(7%)", 960]]],
            [230, [["Fat", 40], ["20g", 640], ["8.0g", 840]]],
            [270, [["of", 40], ["which", 100], ["saturates", 180], ["5.0g", 640], ["2.0g", 840]]],
            [310, [["Carbohydrate", 40], ["50g", 640], ["20g", 840]]],
            [350, [["of", 40], ["which", 100], ["sugars", 180], ["10g", 640], ["4.0g", 840]]],
            [390, [["Protein", 40], ["5.0g", 640], ["2.0g", 840]]],
            [430, [["Sodium", 40], ["400mg", 640], ["160mg", 840]]],
        ]);

        const r = parseNutrition("Portion size: 40g", words);

        ok = check("coords, per 100g | per 40g (serving 40g)", { b: r.nutritionBasis, ...r.nutrition }, {
            b: "per-serving", calories: 150, protein: 2, carbohydrates: 20,
            totalFat: 8, saturatedFat: 2, sugar: 4, sodium: 160, salt: null,
        }) && ok;
    }

    // 3. Coordinates, per 100ml only
    {
        const words = layout([
            [100, [["Nutrition", 40], ["per", 560], ["100ml", 640]]],
            [150, [["Energy", 40], ["180kJ/43kcal", 640, 110]]],
            [190, [["Fat", 40], ["0.5g", 640]]],
            [230, [["Carbohydrate", 40], ["10g", 640]]],
            [270, [["of", 40], ["which", 100], ["sugars", 180], ["10g", 640]]],
            [310, [["Protein", 40], ["0.3g", 640]]],
            [350, [["Salt", 40], ["0.02g", 640]]],
        ]);

        const r = parseNutrition("", words);

        ok = check("coords, per 100ml only", { b: r.nutritionBasis, ...r.nutrition }, {
            b: "per-100ml", calories: 43, totalFat: 0.5, carbohydrates: 10,
            sugar: 10, protein: 0.3, salt: 0.02, sodium: null,
        }) && ok;
    }

    // 4. Noisy OCR resembling the real label (corrupted labels/values)
    {
        const text =
            `Portions per pack: 4 Portion size: 32g\n` +
            `FRUIT. NUT Nutrition Information ~~ /100g ~~ /32g /(%")`;

        const words = layout([
            [50, [["Portions", 40], ["per", 200], ["pack:", 280], ["4", 380], ["Portion", 420], ["size:", 540], ["32g", 640]]],
            [100, [["FRUIT.", 40], ["NUT", 160], ["Nutrition", 260], ["Information", 400], ["~~", 560], ["/100g", 640], ["~~", 760], ["/32g", 840], ['/(%")', 960]]],
            [150, [["¥", 40], ["1822kJ", 640], ["|", 740], ["583k)", 840], ["(7%)", 960]]],
            [190, [["436kecal", 640], ["|", 740], ["140kcal", 840], ["(7%)", 960]]],
            [230, [["FA", 40], ["pi]", 100], ["7", 640], ["[1", 840]]],
            [270, [[":", 40], ["H0fWichsaturates", 80], ["509", 640], ["|", 740], ["160", 840], ["(8%)", 960]]],
            [310, [["ol.", 40], ["3", 100], ["Carbohydrate", 150], ["49g", 640], ["16g", 840], ["(6%)", 960]]],
            [350, [["|", 40], ["2,", 60], ["of", 100], ["which", 160], ["sugars", 260], ["429", 640], ["13g", 840], ["(15%)", 960]]],
            [390, [["g", 100], ["80g", 640], ["|", 740], ["26g", 840]]],
            [430, [["=", 40], ["fg", 100], ["|", 740], ["349", 840], ["(7%)", 960]]],
            [470, [["As", 40], [":", 100], ["Sato", 150], ["|", 560], ["0209", 640], ["|", 740], ["006g", 840], ["(1%)", 960]]],
        ]);

        const r = parseNutrition(text, words);

        // Must pick the 32g column; must NOT guess unreadable rows.
        ok = check("noisy real-like OCR (no guessing)", { b: r.nutritionBasis, ...r.nutrition }, {
            b: "per-serving", calories: 140, carbohydrates: 16, sugar: 13,
            protein: null, totalFat: null, saturatedFat: null,
            sodium: null, salt: null,
        }) && ok;
    }

    // 5. Digit error in one column is caught by cross-column check
    {
        const words = layout([
            [100, [["Nutrition", 40], ["/100g", 640], ["/30g", 840]]],
            [150, [["Fat", 40], ["20g", 640], ["16g", 840]]], // should be ~6g
            [190, [["Protein", 40], ["10g", 640], ["3.0g", 840]]],
        ]);

        const r = parseNutrition("Serving size: 30g", words);

        ok = check("inconsistent column value -> null", { b: r.nutritionBasis, ...r.nutrition }, {
            b: "per-serving", totalFat: null, protein: 3,
        }) && ok;
    }

    // 6. Single per-100g column, salt only (sodium must stay null)
    {
        const r = parseNutrition(
            `Nutrition per 100g\nEnergy 1500kJ/360kcal\nFat 10g\nSalt 1.2g\nProtein 7g`
        );

        ok = check("single per-100g column, salt != sodium", { b: r.nutritionBasis, ...r.nutrition }, {
            b: "per-100g", calories: 360, totalFat: 10, salt: 1.2,
            sodium: null, protein: 7,
        }) && ok;
    }

    // 7. Two OCR passes disagree -> null (never guess)
    {
        const mk = (fat) => layout([
            [100, [["Nutrition", 40], ["/100g", 640]]],
            [150, [["Fat", 40], [fat, 640]]],
            [190, [["Protein", 40], ["7g", 640]]],
            [230, [["Carbohydrate", 40], ["30g", 640]]],
            [270, [["Salt", 40], ["0.5g", 640]]],
        ]);

        const r = parseNutritionMultiPass([
            { name: "a", text: "", words: mk("10g") },
            { name: "b", text: "", words: mk("18g") },
        ]);

        ok = check("two passes disagree -> null", r.nutrition, {
            totalFat: null, protein: 7,
        }) && ok;
    }

    // 8. "/32g" misread as "132g" is repaired only because the label
    //    itself states a 32g serving size.
    {
        const words = layout([
            [50, [["Portion", 40], ["size:", 160], ["32g", 260]]],
            [100, [["Nutrition", 40], ["/100g", 640], ["132g", 840]]],
            [150, [["Fat", 40], ["16g", 640], ["5.0g", 840]]],
            [190, [["Protein", 40], ["8g", 640], ["2.6g", 840]]],
            [230, [["Carbohydrate", 40], ["49g", 640], ["16g", 840]]],
        ]);

        const r = parseNutrition("Portion size: 32g", words);

        ok = check("header '/32g' misread as '132g'", { b: r.nutritionBasis, ...r.nutrition }, {
            b: "per-serving", totalFat: 5, protein: 2.6, carbohydrates: 16,
        }) && ok;
    }

    return ok;
}

/* ------------------------------------------------------------------ */
/* Part 2: real image                                                 */
/* ------------------------------------------------------------------ */

async function imageTest() {
    const { extractOCR } = require("../ocr/ocr.service");

    const imagePath = process.argv[2]
        ? path.resolve(process.argv[2])
        : path.join(__dirname, "../../../../test-image.jpg");

    if (!fs.existsSync(imagePath)) {
        console.log(`\nImage not found: ${imagePath}`);
        return;
    }

    console.log("\nRunning OCR (3 passes)...\n");

    const ocr = await extractOCR(fs.readFileSync(imagePath));

    console.log("========== OCR META ==========");
    console.log(JSON.stringify(ocr.meta, null, 2));

    console.log("\n========== OCR TEXT (pass 1) ==========\n");
    console.log(ocr.text);

    console.log("\n========== FIRST 15 WORDS (pass 1) ==========\n");
    console.log(JSON.stringify(ocr.words.slice(0, 15), null, 2));

    const result = parseNutritionMultiPass(ocr.passes);

    console.log("\n========== NUTRITION (merged) ==========\n");
    console.log(JSON.stringify(result, null, 2));
}

async function main() {
    console.log("========== SELF-TESTS ==========\n");

    const ok = selfTests();

    console.log(ok ? "\nAll self-tests passed." : "\nSOME SELF-TESTS FAILED.");

    if (process.argv.includes("--selftest-only")) {
        return;
    }

    await imageTest();
}

main().catch((error) => {
    console.error("Nutrition test failed:");
    console.error(error);
});