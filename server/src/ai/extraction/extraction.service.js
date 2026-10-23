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
// NUTRITION / INGREDIENT NORMALIZATION
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

    return {
        value,
        unit: unit.toLowerCase(),
    };
};

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

// Keeps the label's original order.
// Strings only.
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

        const name = cleanString(
            rawName.trim().replace(/[.;,]+$/, "")
        );

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

// ============================================
// ALLERGEN NORMALIZATION / DETECTION
// ============================================

const ALLERGEN_ALIASES = {
    peanuts: ["peanut", "peanuts"],

    milk: [
        "milk",
        "skimmed milk",
        "whey",
        "lactose",
        "milk fat",
        "milk powder",
    ],

    soya: [
        "soya",
        "soy",
        "soybean",
    ],

    nuts: [
        "nuts",
        "almond",
        "almonds",
        "hazelnut",
        "hazelnuts",
        "walnut",
        "walnuts",
        "cashew",
        "cashews",
        "pistachio",
        "pistachios",
        "pecan",
        "pecans",
    ],

    wheat: ["wheat"],

    barley: ["barley"],

    oats: [
        "oat",
        "oats",
    ],

    sesame: ["sesame"],

    egg: [
        "egg",
        "eggs",
    ],

    fish: ["fish"],

    crustaceans: [
        "crustacean",
        "crustaceans",
        "shrimp",
        "prawn",
        "prawns",
    ],

    celery: ["celery"],

    mustard: ["mustard"],

    sulphites: [
        "sulphite",
        "sulphites",
        "sulfite",
        "sulfites",
    ],

    lupin: [
        "lupin",
        "lupine",
    ],

    molluscs: [
        "mollusc",
        "molluscs",
        "mussel",
        "mussels",
        "clam",
        "clams",
    ],
};

const uniqueStrings = (values) =>
    [
        ...new Set(
            values
                .filter(Boolean)
                .map((value) => String(value).trim())
        ),
    ];

const containsAlias = (text, alias) => {
    const escaped = alias.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
    );

    return new RegExp(
        `\\b${escaped.replace(/\\s+/g, "\\s+")}\\b`,
        "i"
    ).test(text);
};

// Deterministic evidence check.
//
// It never invents an allergen.
// A canonical allergen is returned only when an alias
// is actually present in OCR text.
//
// "may contain" lines are kept separate from confirmed evidence.
const detectAllergensFromOcr = (ocrText) => {
    const text = String(ocrText || "");

    const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    const confirmed = [];
    const mayContain = [];

    for (const [canonical, aliases] of Object.entries(
        ALLERGEN_ALIASES
    )) {
        const mayLines = lines.filter((line) =>
            /may\s+contain|traces?\s+of|manufactured\s+in/i.test(
                line
            )
        );

        const confirmedText = lines
            .filter(
                (line) =>
                    !/may\s+contain|traces?\s+of/i.test(line)
            )
            .join(" ");

        const mayText = mayLines.join(" ");

        const inMay = aliases.some((alias) =>
            containsAlias(mayText, alias)
        );

        const inConfirmed = aliases.some((alias) =>
            containsAlias(confirmedText, alias)
        );

        if (inMay) {
            mayContain.push(canonical);
        }

        if (inConfirmed && !inMay) {
            confirmed.push(canonical);
        }
    }

    return {
        confirmed: uniqueStrings(confirmed),
        may_contain: uniqueStrings(mayContain),
    };
};

const normalizeAllergens = (value, ocrText = "") => {
    const detected = detectAllergensFromOcr(ocrText);

    const source =
        value &&
        typeof value === "object" &&
        !Array.isArray(value)
            ? value
            : {};

    const cleanList = (items) =>
        Array.isArray(items)
            ? uniqueStrings(
                  items
                      .map((item) => cleanString(item, 80))
                      .filter(Boolean)
              )
            : [];

    const modelConfirmed = cleanList(source.confirmed);

    const modelMayContain = cleanList(
        source.may_contain || source.mayContain
    );

    // Model output is accepted only when the same canonical
    // allergen has textual OCR evidence.
    //
    // Deterministic OCR evidence is always retained.
    const evidenceText = String(ocrText || "");

    const evidenceFor = (name) => {
        const aliases =
            ALLERGEN_ALIASES[name] || [name];

        return aliases.some((alias) =>
            containsAlias(evidenceText, alias)
        );
    };

    const confirmed = uniqueStrings([
        ...detected.confirmed,
        ...modelConfirmed.filter(evidenceFor),
    ]);

    const may_contain = uniqueStrings([
        ...detected.may_contain,
        ...modelMayContain.filter(evidenceFor),
    ]).filter(
        (name) => !confirmed.includes(name)
    );

    return {
        confirmed,
        may_contain,
    };
};

// ============================================
// COMPLETE EXTRACTION NORMALIZATION
// ============================================

const normalizeExtraction = (
    parsed,
    ocrText = ""
) => {
    if (
        !parsed ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
    ) {
        throw new Error(
            "Groq extraction response was not a JSON object"
        );
    }

    return {
        ...parsed,

        name: cleanString(parsed.name),

        brand: cleanString(parsed.brand),

        variant: cleanString(parsed.variant),

        allergens: normalizeAllergens(
            parsed.allergens,
            ocrText
        ),

        packSize: normalizePackSize(
            parsed.packSize
        ),

        servingsPerContainer:
            toPositiveNumberOrNull(
                parsed.servingsPerContainer
            ),

        servingSize: normalizeServingSize(
            parsed.servingSize
        ),

        nutritionBasis:
            normalizeNutritionBasis(
                parsed.nutritionBasis
            ),

        nutrition: normalizeNutrition(
            parsed.nutrition
        ),

        ingredients:
            normalizeIngredients(
                parsed.ingredients
            ),

        uncertainFields:
            normalizeUncertainFields(
                parsed.uncertainFields
            ),
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

// ============================================
// GROQ EXTRACTION
// ============================================

async function extractProductInfo(
    ocrText,
    additionalOcrText = ""
) {
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

Product identity fields are:
name, brand, variant.

Pack information fields are:
packSize, servingSize, servingsPerContainer.

Never mix these two groups.

name:
The product's own name exactly as printed on the pack.

For example:
"Choco Crunch Cereal"

Return null if the product name is not clearly printed in the OCR text.

Do NOT use:
- the brand alone
- a slogan
- a marketing claim
- manufacturer address
- an ingredient
- a nutrition heading

as the product name.

Do NOT infer a product name from ingredients or product category.

brand:
The brand or manufacturer name only when explicitly printed.
Otherwise null.

variant:
The flavour or variety only when explicitly printed.

Examples:
- Chocolate
- Salted
- Sugar Free

Otherwise null.

packSize:
The total net content of the package, only when explicitly printed.

Examples:
- Net Wt 200g
- Net Weight 1kg
- Net Content 500ml
- Net Qty 6 pieces
- 6 x 30g

For multipacks such as "6 x 30g":
set raw to the printed text
and set value and unit to null.

packSize is NOT the serving size.

Never copy the serving size into packSize.

Return value, unit and raw as null if no pack size is printed.

servingsPerContainer:
The number of servings in the pack, only when explicitly printed.

Examples:
- Servings per container: 8
- About 8 servings

Return the number only.

Do not calculate it from packSize and servingSize.

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

Extract an explicitly stated serving/portion size.

Examples:

Serving size: 32g
Portion size: 40ml
One bar: 25g

Do not calculate serving size.

INGREDIENTS:

Extract the ingredient list in the original order.

Do not merge unrelated ingredients.

Preserve nested ingredient declarations such as:
- parentheses
- [from ...]
- nested ingredient groups

Only normalize obvious OCR spacing.

Do not invent missing words.

ALLERGENS:

Identify allergens only when the OCR provides textual evidence.

Use both:
1. ingredient text
2. explicit allergen / contains statements
3. may-contain / traces statements
4. additional OCR passes

Keep confirmed allergens separate from may-contain allergens.

Never turn a may-contain allergen into a confirmed allergen.

Do not infer soya from the word "lecithin" alone.

Require supporting OCR evidence such as:
- soya
- soy
- soybean
- soya lecithin

Return canonical names such as:
- peanuts
- milk
- soya
- nuts
- wheat
- barley
- oats

Return ONLY valid JSON.

Use exactly this structure:

{
  "name": null,
  "brand": null,
  "variant": null,
  "category": null,

  "allergens": {
    "confirmed": [],
    "may_contain": []
  },

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

IMPORTANT ALLERGEN FIELD RULES:

allergens.confirmed:
Allergens supported by ingredient text or an explicit contains/allergen statement.

allergens.may_contain:
Allergens supported only by a may-contain / traces-of style statement.

Do not place the same allergen in both arrays.

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

If the label provides only salt:
return sodium as null.

salt:
Extract salt in grams ONLY when the label explicitly provides salt.

Do NOT convert salt to sodium.

Do NOT convert sodium to salt.

Do not confuse:
- salt with sodium
- energy kJ with calories
- %RI with grams
- per 100g values with serving values

OCR TEXT:

${ocrText}

ADDITIONAL OCR PASSES / VIEWS:

${additionalOcrText}
`;

    const completion =
        await groq.chat.completions.create({
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

    const content =
        completion.choices?.[0]?.message?.content;

    if (!content) {
        console.log(
            "FULL GROQ RESPONSE:",
            JSON.stringify(
                completion,
                null,
                2
            )
        );

        throw new Error(
            "Groq returned an empty response"
        );
    }

    let parsed;

    try {
        parsed = JSON.parse(
            stripJsonFences(content)
        );
    } catch (error) {
        console.error(
            "Groq raw content:",
            content
        );

        throw new Error(
            "Failed to parse Groq extraction response"
        );
    }

    return normalizeExtraction(
        parsed,
        `${ocrText}\n${additionalOcrText}`
    );
}

module.exports = {
    extractProductInfo,
};