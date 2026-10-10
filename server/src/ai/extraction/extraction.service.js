const Groq = require("groq-sdk");

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

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
  "category": null,

  "servingSize": {
    "value": null,
    "unit": null
  },

  "nutritionBasis": null,

  "nutrition": {
    "calories": null,
    "protein": null,
    "carbohydrates": null,
    "totalFat": null,
    "saturatedFat": null,
    "sugar": null,
    "fiber": null,
    "sodium": null
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

    try {
        return JSON.parse(content);
    } catch (error) {
        console.error("Groq raw content:", content);

        throw new Error(
            "Failed to parse Groq extraction response"
        );
    }
}

module.exports = {
    extractProductInfo,
};