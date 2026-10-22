const Groq = require("groq-sdk");

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

// ============================================
// NORMALIZATION HELPERS
// Only clean values. Never invent or guess anything.
// ============================================

const NULL_LIKE_VALUES = new Set([
    "null",
    "none",
    "n/a",
    "na",
    "unknown",
    "not available",
    "not specified",
    "unspecified",
    "product name not available",
]);

// Returns a trimmed string, or null when empty / placeholder-like.
const cleanString = (value, maxLength = 255) => {
    if (typeof value !== "string") {
        return null;
    }

    const text = value.trim().replace(/\s+/g, " ");

    if (!text || NULL_LIKE_VALUES.has(text.toLowerCase())) {
        return null;
    }

    return text.slice(0, maxLength);
};

// Returns a positive finite number, or null.
const toPositiveNumberOrNull = (value) => {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    const number = Number(value);

    return Number.isFinite(number) && number > 0 ? number : null;
};

// Returns a finite number >= 0 (0 is allowed), or null.
// Strings are accepted ONLY when they are a plain number
// ("12.5"). "12 g" or "0.5 mg" are rejected, because a unit
// written by the model cannot be trusted to match the field.
const toNonNegativeNumberOrNull = (value) => {
    if (typeof value === "number") {
        return Number.isFinite(value) && value >= 0 ? value : null;
    }

    if (
        typeof value === "string" &&
        /^\d+(?:[.,]\d+)?$/.test(value.trim())
    ) {
        const number = Number(value.trim().replace(",", "."));

        return Number.isFinite(number) && number >= 0 ? number : null;
    }

    return null;
};

// Pack size = net content of the package (e.g. "Net Wt 200g").
// It is NOT the serving size.
const normalizePackSize = (packSize) => {
    const value = toPositiveNumberOrNull(packSize?.value);
    const unit = cleanString(packSize?.unit, 20);
    const raw = cleanString(packSize?.raw, 100);

    if (value === null && !raw) {
        return { value: null, unit: null, raw: null };
    }

    return {
        value,
        unit: value === null ? null : unit,
        raw,
    };
};

// ============================================
// NUTRITION / INGREDIENT NORMALIZATION (Group 2)
// ============================================

const NUTRITION_KEYS = [
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

// Maps wording variants to the four bases the system understands.
// Anything else becomes null. Nothing is guessed.
const normalizeNutritionBasis = (value) => {
    if (typeof value !== "string") {
        return null;
    }

    const text = value
        .trim()
        .toLowerCase()
        .replace(/[\s_]+/g, "-")
        .replace(/-+/g, "-");

    if (text === "per-portion") {
        return "per-serving";
    }

    if (text === "per-100-g") {
        return "per-100g";
    }

    if (text === "per-100-ml") {
        return "per-100ml";
    }

    return ALLOWED_BASES.has(text) ? text : null;
};

const normalizeServingSize = (servingSize) => {
    const value = toPositiveNumberOrNull(servingSize?.value);
    const unit = cleanString(servingSize?.unit, 10);

    if (value === null || !unit) {
        return { value: null, unit: null };
    }

    return { value, unit: unit.toLowerCase() };
};

// Every key is always present. Missing / invalid stays null,
// a real 0 stays 0.
const normalizeNutrition = (nutrition) => {
    const source =
        nutrition &&
        typeof nutrition === "object" &&
        !Array.isArray(nutrition)
            ? nutrition
            : {};

    const result = {};

    for (const key of NUTRITION_KEYS) {
        result[key] = toNonNegativeNumberOrNull(source[key]);
    }

    return result;
};

// Keeps the label's original order. Strings only.
const normalizeIngredients = (ingredients) => {
    if (!Array.isArray(ingredients)) {
        return [];
    }

    const result = [];

    for (const item of ingredients) {
        const rawName =
            typeof item === "string"
                ? item
                : item && typeof item.name === "string"
                ? item.name
                : null;

        if (rawName === null) {
            continue;
        }

        const name = cleanString(rawName.trim().replace(/[.;,]+$/, ""));

        if (name) {
            result.push(name);
        }
    }

    return result;
};

const normalizeUncertainFields = (fields) => {
    if (!Array.isArray(fields)) {
        return [];
    }

    return fields
        .map((field) => cleanString(field, 100))
        .filter(Boolean);
};

// Product identity / pack fields (Group 1) and nutrition /
// ingredient fields (Group 2) are all normalized here so the
// rest of the pipeline receives a predictable shape.
const normalizeExtraction = (parsed) => {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Groq extraction response was not a JSON object");
    }

    return {
        ...parsed,
        name: cleanString(parsed.name),
        brand: cleanString(parsed.brand),
        variant: cleanString(parsed.variant),
        packSize: normalizePackSize(parsed.packSize),
        servingsPerContainer: toPositiveNumberOrNull(
            parsed.servingsPerContainer
        ),

        // Group 2
        servingSize: normalizeServingSize(parsed.servingSize),
        nutritionBasis: normalizeNutritionBasis(parsed.nutritionBasis),
        nutrition: normalizeNutrition(parsed.nutrition),
        ingredients: normalizeIngredients(parsed.ingredients),
        uncertainFields: normalizeUncertainFields(parsed.uncertainFields),
    };
};

// Models sometimes wrap JSON in ```json fences.
const stripJsonFences = (content) => {
    return String(content)
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "")
        .trim();
};

async function extractProductInfo(ocrText) {
    if (!ocrText || !ocrText.trim()) {
        throw new Error("OCR text is required");
    }

    const prompt = `
You are a food-label data extraction system.

Your job is to extract structured product information from OCR text.

IMPORTANT:
The OCR may contain nutrition information in different formats, for example:
- per 100g
- per 100ml
- per serving
- per portion
- per piece
- multiple columns such as per 100g AND per serving

You MUST determine the nutrition basis from the actual OCR text.
Never assume that the nutrition basis is 100g.
Never assume that the serving size is a particular value.

GENERAL RULES:

1. Extract ONLY information explicitly present in the OCR text.
2. Do not invent missing information.
3. Do not guess unclear numbers.
4. Do not give health opinions.
5. Do not calculate a health score or grade.
6. Do not use % Daily Value / Reference Intake percentages as nutrient quantities.
7. If a nutrient cannot be confidently identified, return null.
8. Preserve ingredient order.
9. Preserve ingredient wording as accurately as possible.
10. Identify the nutrition columns before extracting nutrition values.
11. If multiple nutrition columns exist, select the column corresponding to the explicitly stated serving/portion size when that serving size is available.
12. If there is no serving/portion column, use the clearly identified available basis.
13. NEVER mix values from different nutrition columns.
14. If the label says "salt", extract it as salt-related information. Do NOT convert salt to sodium.
15. Do not assume salt and sodium are the same thing.
16. Do not calculate values from another column unless explicitly required by the available information.
17. The nutritionBasis must describe the actual column used for the extracted nutrition values.
18. If the nutrition table is ambiguous, return uncertain fields as null rather than guessing.
19. Nutrition values must be plain numbers only (for example 13.9), never text with units.
20. A nutrient that is not printed on the label must be null. Never return 0 for a nutrient that is not printed.

PRODUCT IDENTITY vs PACK INFORMATION:

Product identity fields are: name, brand, variant.
Pack information fields are: packSize, servingSize, servingsPerContainer.
Never mix these two groups.

name:
The product's own name exactly as printed on the pack (for example "Choco Crunch Cereal").
Return null if the product name is not clearly printed in the OCR text.
Do NOT use the brand alone, a slogan, a marketing claim, the manufacturer address, an ingredient, or a nutrition heading as the product name.
Do NOT infer a product name from the ingredients or the product category.

brand:
The brand or manufacturer name only when it is explicitly printed. Otherwise null.

variant:
The flavour or variety only when it is explicitly printed (for example "Chocolate", "Salted", "Sugar Free"). Otherwise null.

packSize:
The total net content of the package, only when explicitly printed, for example:
Net Wt 200g, Net Weight 1kg, Net Content 500ml, Net Qty 6 pieces, 6 x 30g.
- value: the number (for example 200)
- unit: the unit exactly as printed in simple form (for example "g", "kg", "ml", "l", "pieces")
- raw: the exact printed text (for example "Net Wt 200g" or "6 x 30g")
For multipacks such as "6 x 30g" set raw to the printed text and set value and unit to null.
packSize is NOT the serving size. Never copy the serving size into packSize.
Return value, unit and raw as null if no pack size is printed.

servingsPerContainer:
The number of servings in the pack, only when explicitly printed (for example "Servings per container: 8" or "About 8 servings").
Return the number only. Do not calculate it from packSize and servingSize.
Return null if it is not printed.

NUTRITION BASIS EXAMPLES:

If the OCR says:

Per 100g | Per 30g
400 kcal | 120 kcal

and the serving/portion is 30g, use:

nutritionBasis = "per-serving"

calories = 120

NOT 400.

If the OCR says:

Per 100ml

use:

nutritionBasis = "per-100ml"

If only:

Per 100g

is available:

nutritionBasis = "per-100g"

If the label says:

Per serving

and no numeric serving size is available:

nutritionBasis = "per-serving"

If the label says:

Per portion

use:

nutritionBasis = "per-serving"

SERVING SIZE:

Extract an explicitly stated serving/portion size such as:

Serving size: 32g
Portion size: 40ml
One bar: 25g

Do not calculate serving size.

INGREDIENTS:

Extract the ingredient list in the original order.

Do not merge unrelated ingredients.

Return ONLY valid JSON.

Use exactly this structure:

{
  "name": null,
  "brand": null,
  "variant": null,
  "category": null,

  "packSize": {
    "value": null,
    "unit": null,
    "raw": null
  },

  "servingSize": {
    "value": null,
    "unit": null
  },

  "servingsPerContainer": null,

  "nutritionBasis": null,

  "nutrition": {
    "calories": null,
    "protein": null,
    "carbohydrates": null,
    "totalFat": null,
    "saturatedFat": null,
    "sugar": null,
    "fiber": null,
    "sodium": null,
    "salt": null
  },

  "ingredients": [],

  "confidence": null,

  "uncertainFields": []
}

IMPORTANT NUTRITION FIELD RULES:

calories:
Extract kcal/calories from the selected nutrition column.

protein:
Extract protein from the selected nutrition column.

carbohydrates:
Extract carbohydrate/carbs from the selected nutrition column.

totalFat:
Extract total fat/fat from the selected nutrition column.

saturatedFat:
Extract saturated fat from the selected nutrition column.

sugar:
Extract sugars/from which sugars from the selected nutrition column.

fiber:
Extract fibre/fiber only when explicitly present.

sodium:
Extract sodium ONLY when the label explicitly provides sodium.
If the label provides only salt, return sodium as null.

salt:
Extract salt (in grams) ONLY when the label explicitly provides salt.
Do NOT convert salt to sodium and do NOT convert sodium to salt.

Do not confuse:
- salt with sodium
- energy kJ with calories
- %RI with grams
- per 100g values with serving values

OCR TEXT:

${ocrText}
`;

    const completion = await groq.chat.completions.create({
        model: "openai/gpt-oss-20b",
        temperature: 0,
        max_completion_tokens: 4096,
        reasoning_effort: "low",
        messages: [
            {
                role: "user",
                content: prompt,
            },
        ],
    });

    const content = completion.choices?.[0]?.message?.content;

    if (!content) {
        console.log(
            "FULL GROQ RESPONSE:",
            JSON.stringify(completion, null, 2)
        );

        throw new Error("Groq returned an empty response");
    }

    let parsed;

    try {
        parsed = JSON.parse(stripJsonFences(content));
    } catch (error) {
        console.error("Groq raw content:", content);

        throw new Error(
            "Failed to parse Groq extraction response"
        );
    }

    return normalizeExtraction(parsed);
}

module.exports = {
    extractProductInfo,
};