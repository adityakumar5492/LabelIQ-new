"use strict";



/**

 * AI explanation service (Groq).

 *

 * Responsibility: turn an ALREADY COMPUTED analysis into

 * human-readable text. Nothing else.

 *

 * Groq never:

 *   - calculates the score or grade

 *   - decides whether an ingredient is flagged

 *   - applies penalties or creates / removes rule matches

 *   - changes personalized warnings

 *

 * Output shape (top-level `ai_insights` of the scan response,

 * also stored in MongoDB scan_raw_data.ai_insights):

 *

 *   {

 *     summary: string | null,

 *     key_findings: string[],

 *     ingredient_explanations: [

 *       { ingredient, explanation, source_name }

 *     ]

 *   }

 *

 * generateAiInsights() NEVER throws. Any failure (no API key,

 * timeout, 429, malformed JSON, invalid shape) returns the empty

 * representation, so the deterministic scan is never affected.

 *

 * Exactly ONE Groq call per scan, with SDK retries disabled

 * (a retry on 429 would only make rate limiting worse).

 */



const MODEL = "openai/gpt-oss-20b";

const TIMEOUT_MS = 20000;

const MAX_COMPLETION_TOKENS = 3000;



// Limits keep the prompt (and the 429 risk) small.

const MAX_FLAGGED_INGREDIENTS = 10;

const MAX_EVIDENCE_INGREDIENTS = 5;

const MAX_RULE_MATCHES = 25;



const MAX_SUMMARY_LENGTH = 900;

const MAX_FINDINGS = 6;

const MAX_FINDING_LENGTH = 400;

const MAX_EXPLANATION_LENGTH = 700;



// ============================================

// EMPTY REPRESENTATION

// ============================================



const emptyInsights = () => ({

    summary: null,

    key_findings: [],

    ingredient_explanations: [],

});



// ============================================

// SMALL HELPERS

// ============================================



const nameKey = (name) =>

    String(name || "")

        .trim()

        .replace(/\s+/g, " ")

        .toLowerCase();



const cleanText = (value, maxLength) => {

    if (typeof value !== "string") {

        return null;

    }



    const text = value.trim().replace(/\s+/g, " ");



    return text ? text.slice(0, maxLength) : null;

};



const toNumberOrNull = (value) => {

    if (value === null || value === undefined || value === "") {

        return null;

    }



    const number = Number(value);



    return Number.isFinite(number) ? number : null;

};



// Models sometimes wrap JSON in ```json fences.

const stripJsonFences = (content) =>

    String(content)

        .trim()

        .replace(/^```(?:json)?\s*/i, "")

        .replace(/\s*```$/, "")

        .trim();



let groqClient = null;



// Created lazily so a missing key / package only disables

// explanations instead of breaking the server at start-up.

const getClient = () => {

    if (groqClient) {

        return groqClient;

    }



    if (!process.env.GROQ_API_KEY) {

        return null;

    }



    const Groq = require("groq-sdk");



    groqClient = new Groq({

        apiKey: process.env.GROQ_API_KEY,

    });



    return groqClient;

};



// ============================================

// BUILD INPUT (data only, already decided elsewhere)

// ============================================



/**

 * Selects what Groq is allowed to explain.

 *

 * Inputs are the objects scan.service.js already has:

 *   product            -> { product_name, brand, variant }

 *   nutrition          -> nutrition_details-shaped values

 *   nutritionBasis     -> "per-serving" | "per-100g" | ... | null

 *   analysis           -> { score, grade, assessment }   (rule engine)

 *   ruleMatches        -> rows of rule_matches            (rule engine)

 *   personalization    -> { profileApplied, dietaryMode, analysisStrictness }

 *   ingredientDetails  -> buildIngredientDetails() output (flags + RAG evidence)

 */

const buildExplanationInput = ({

    product,

    nutrition,

    nutritionBasis,

    analysis,

    ruleMatches,

    personalization,

    ingredientDetails,

}) => {

    const details = Array.isArray(ingredientDetails)

        ? ingredientDetails

        : [];



    const nameById = new Map(

        details.map((item) => [String(item.id), item.name])

    );



    const flagged = details

        .filter((item) => item.flagged)

        .slice(0, MAX_FLAGGED_INGREDIENTS);



    const withEvidence = details

        .filter(

            (item) =>

                !item.flagged &&

                Array.isArray(item.evidence) &&

                item.evidence.length > 0

        )

        .slice(0, MAX_EVIDENCE_INGREDIENTS);



    const toIngredientInput = (item) => ({

        name: item.name,

        flagged: item.flagged === true,

        rule_flags: (item.flags || []).map((flag) => ({

            rule_code: flag.rule_code,

            rule_name: flag.rule_name,

            severity: flag.severity,

            explanation: flag.explanation,

        })),

        evidence: (item.evidence || []).slice(0, 2).map((entry) => ({

            description: entry.description,

            purpose: entry.purpose,

            source: entry.source,

        })),

    });



    const matches = (Array.isArray(ruleMatches) ? ruleMatches : [])

        .slice(0, MAX_RULE_MATCHES)

        .map((match) => ({

            rule_code: match.rule_code,

            rule_name: match.rule_name,

            severity: match.severity,

            matched_value: match.matched_value,

            explanation: match.explanation,

            ingredient:

                match.ingredient_id !== null &&

                match.ingredient_id !== undefined

                    ? nameById.get(String(match.ingredient_id)) || null

                    : null,

        }));



    const explainable = [...flagged, ...withEvidence];



    return {

        // Names Groq may explain. Anything else is discarded

        // when the response is validated.

        explainable,

        payload: {

            product: {

                name: product?.product_name || null,

                brand: product?.brand || null,

                variant: product?.variant || null,

            },

            nutrition: {

                basis: nutritionBasis || null,

                serving_size: nutrition?.serving_size ?? null,

                calories: toNumberOrNull(nutrition?.calories),

                protein_g: toNumberOrNull(nutrition?.protein_g),

                carbohydrates_g: toNumberOrNull(nutrition?.carbohydrates_g),

                total_fat_g: toNumberOrNull(nutrition?.total_fat_g),

                saturated_fat_g: toNumberOrNull(nutrition?.saturated_fat_g),

                dietary_fiber_g: toNumberOrNull(nutrition?.dietary_fiber_g),

                total_sugars_g: toNumberOrNull(nutrition?.total_sugars_g),

                sodium_mg: toNumberOrNull(nutrition?.sodium_mg),

            },

            health_score: toNumberOrNull(analysis?.score),

            grade: analysis?.grade ?? null,

            assessment: analysis?.assessment ?? null,

            user_profile: {

                applied: Boolean(personalization?.profileApplied),

                dietary_mode: personalization?.dietaryMode ?? null,

                analysis_strictness:

                    personalization?.analysisStrictness ?? null,

            },

            ingredient_count: details.length,

            rule_matches: matches,

            ingredients_to_explain: explainable.map(toIngredientInput),

        },

    };

};



// ============================================

// PROMPT

// ============================================



const buildPrompt = (payload) => `

You are the explanation writer for LabelIQ, a food label analysis app.



The rule results below were produced by a deterministic rule engine.

They are AUTHORITATIVE. Explain them; do not create, remove, or modify decisions.



YOU MUST NOT:

\- calculate, change, or question the health score or grade

\- decide whether any ingredient is harmful, safe, or flagged

\- add, remove, or reinterpret rule matches or severities

\- invent warnings, penalties, rule codes, nutrition values, or sources

\- give medical advice or diagnoses



YOU MUST:

\- base every statement only on the data provided

\- for ingredients with "flagged": true, explain which rule matched and why it matters for the user's configured profile, using the rule explanation provided

\- for ingredients with "flagged": false, use ONLY the provided "evidence" to describe what the ingredient is and why it is used; do not say it is good or bad

\- if nutrition values are null, say nothing about them

\- if there are no rule matches, say plainly that no rules were triggered

\- write in plain, calm, non-alarming language



OUTPUT: return ONLY valid JSON (no markdown, no commentary) in exactly this structure:



{

  "summary": "2 to 4 sentences describing the product's overall result",

  "key_findings": ["3 to 5 short, specific observations drawn from the rule results"],

  "ingredient_explanations": [

    { "ingredient": "exact name from ingredients_to_explain", "explanation": "1 to 3 sentences" }

  ]

}



Rules for ingredient_explanations:

\- Include only ingredients listed in ingredients_to_explain.

\- Copy the ingredient name EXACTLY as given.

\- At most one entry per ingredient.



DATA:



${JSON.stringify(payload)}

`;



// ============================================

// VALIDATE / NORMALIZE GROQ OUTPUT

// ============================================



/**

 * Accepts a parsed JSON value and returns the safe shape.

 * Missing / invalid fields become null / []. Ingredient entries

 * are kept only for ingredients Groq was allowed to explain, and

 * use OUR ingredient name. source_name is taken from the stored

 * RAG evidence, never from the model, so a source cannot be

 * invented.

 */

const normalizeInsights = (parsed, explainable) => {

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {

        return emptyInsights();

    }



    const allowed = new Map(

        (Array.isArray(explainable) ? explainable : []).map((item) => [

            nameKey(item.name),

            item,

        ])

    );



    const summary = cleanText(parsed.summary, MAX_SUMMARY_LENGTH);



    const keyFindings = (

        Array.isArray(parsed.key_findings) ? parsed.key_findings : []

    )

        .map((item) => cleanText(item, MAX_FINDING_LENGTH))

        .filter(Boolean)

        .slice(0, MAX_FINDINGS);



    const seen = new Set();

    const ingredientExplanations = [];



    for (const item of Array.isArray(parsed.ingredient_explanations)

        ? parsed.ingredient_explanations

        : []) {

        if (!item || typeof item !== "object") {

            continue;

        }



        const key = nameKey(item.ingredient);

        const source = allowed.get(key);



        if (!source || seen.has(key)) {

            continue;

        }



        const explanation = cleanText(

            item.explanation,

            MAX_EXPLANATION_LENGTH

        );



        if (!explanation) {

            continue;

        }



        seen.add(key);



        const evidenceSource = Array.isArray(source.evidence)

            ? source.evidence.find((entry) => entry && entry.source)

            : null;



        ingredientExplanations.push({

            ingredient: source.name,

            explanation,

            source_name: evidenceSource ? evidenceSource.source : null,

        });

    }



    return {

        summary,

        key_findings: keyFindings,

        ingredient_explanations: ingredientExplanations,

    };

};



// ============================================

// MAIN

// ============================================



const generateAiInsights = async (input) => {

    try {

        const client = getClient();



        if (!client) {

            console.warn(

                "AI insights skipped: GROQ_API_KEY is not configured"

            );



            return emptyInsights();

        }



        const { explainable, payload } = buildExplanationInput(input);



        // Nothing to explain.

        if (

            payload.rule_matches.length === 0 &&

            payload.ingredient_count === 0

        ) {

            return emptyInsights();

        }



        const completion = await client.chat.completions.create(

            {

                model: MODEL,

                temperature: 0.2,

                max_completion_tokens: MAX_COMPLETION_TOKENS,

                reasoning_effort: "low",

                messages: [

                    {

                        role: "user",

                        content: buildPrompt(payload),

                    },

                ],

            },

            {

                // One attempt only: no automatic retry on 429 / 5xx.

                maxRetries: 0,

                timeout: TIMEOUT_MS,

            }

        );



        const content = completion?.choices?.[0]?.message?.content;



        if (!content) {

            console.warn("AI insights: Groq returned an empty response");



            return emptyInsights();

        }



        let parsed;



        try {

            parsed = JSON.parse(stripJsonFences(content));

        } catch (error) {

            // Malformed JSON is not retried.

            console.warn("AI insights: Groq response was not valid JSON");



            return emptyInsights();

        }



        return normalizeInsights(parsed, explainable);

    } catch (error) {

        console.error(

            "AI insights generation failed (scan is unaffected):",

            error?.status || "",

            error?.message || error

        );



        return emptyInsights();

    }

};



module.exports = {

    generateAiInsights,



    // Pure helpers (exported so they can be unit tested).

    buildExplanationInput,

    normalizeInsights,

    emptyInsights,

};