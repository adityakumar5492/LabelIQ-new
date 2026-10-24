"use strict";

const fs = require("fs");
const path = require("path");

const knowledgePath = path.join(
    __dirname,
    "ingredient-knowledge.json"
);

// ============================================================
// RAG = EVIDENCE ONLY
// ============================================================
//
// IMPORTANT:
// RAG NEVER calculates health score.
// RAG NEVER applies penalties.
// RAG only finds supporting ingredient information.
//
// Health score is calculated ONLY by healthRules.service.js.
//

let knowledge = [];

try {
    const parsed = JSON.parse(
        fs.readFileSync(
            knowledgePath,
            "utf-8"
        )
    );

    knowledge = Array.isArray(parsed)
        ? parsed
        : [];

    console.log(
        `RAG knowledge base loaded: ${knowledge.length} entries`
    );
} catch (error) {
    console.error(
        "RAG knowledge base could not be loaded:",
        error.message
    );
}

// ============================================================
// CONFIG
// ============================================================

const MIN_PARTIAL_COVERAGE = 0.6;

const DEFAULT_TOP_K = 3;

// ============================================================
// INGREDIENT ALIASES
// ============================================================
//
// Aliases help OCR variations map to the same
// canonical ingredient.
//
// These aliases DO NOT create health penalties.
//

const INGREDIENT_ALIASES = {
    "sodium benzoate": [
        "sodium benzoate",
        "e211",
        "ins 211",
        "211",
    ],

    maltodextrin: [
        "maltodextrin",
    ],

    "citric acid": [
        "citric acid",
        "e330",
        "ins 330",
        "330",
    ],

    lecithin: [
        "lecithin",
        "soy lecithin",
        "soya lecithin",
        "sunflower lecithin",
        "e322",
        "ins 322",
        "322",
    ],

    "ascorbic acid": [
        "ascorbic acid",
        "vitamin c",
        "e300",
        "ins 300",
        "300",
    ],

    "monosodium glutamate": [
        "monosodium glutamate",
        "msg",
        "e621",
        "ins 621",
        "621",
    ],

    bha: [
        "bha",
        "butylated hydroxyanisole",
        "e320",
        "ins 320",
        "320",
    ],
};

// ============================================================
// NORMALIZATION
// ============================================================

function normalize(text) {
    if (
        typeof text !== "string"
    ) {
        return "";
    }

    return text
        .toLowerCase()
        .replace(
            /[()[\],.:;|/]/g,
            " "
        )
        .replace(
            /\s+/g,
            " "
        )
        .trim();
}

/**
 * Removes percentage information from
 * ingredient text.
 *
 * Example:
 *
 * "peanuts 78%"
 * ->
 * "peanuts"
 */
function cleanIngredient(
    ingredient
) {
    return normalize(
        ingredient
    )
        .replace(
            /\b\d+(?:\.\d+)?\s*%\b/g,
            ""
        )
        .replace(
            /\s+/g,
            " "
        )
        .trim();
}

// ============================================================
// REGEX HELPERS
// ============================================================

function escapeRegex(text) {
    return String(text).replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
    );
}

/**
 * Whole phrase matching.
 *
 * Prevents:
 *
 * "milk" -> "milkshake"
 *
 * from being treated as a match.
 */
function containsPhrase(
    text,
    phrase
) {
    if (
        !text ||
        !phrase
    ) {
        return false;
    }

    const normalizedText =
        normalize(text);

    const normalizedPhrase =
        normalize(phrase);

    if (
        !normalizedText ||
        !normalizedPhrase
    ) {
        return false;
    }

    return new RegExp(
        `(?:^| )${escapeRegex(
            normalizedPhrase
        )}s?(?: |$)`,
        "i"
    ).test(
        normalizedText
    );
}

// ============================================================
// ALIAS HELPERS
// ============================================================

function getAliasesForKnowledgeName(
    name
) {
    const normalizedName =
        normalize(name);

    return (
        INGREDIENT_ALIASES[
            normalizedName
        ] || [
            normalizedName,
        ]
    );
}

/**
 * Calculates how strongly an alias
 * matches the query.
 *
 * 100 = exact
 * 90  = query contains alias
 * 80  = alias contains query
 * 0   = no match
 */
function scoreAliasMatch(
    query,
    alias
) {
    if (
        !query ||
        !alias
    ) {
        return 0;
    }

    const normalizedQuery =
        normalize(query);

    const normalizedAlias =
        normalize(alias);

    if (
        !normalizedQuery ||
        !normalizedAlias
    ) {
        return 0;
    }

    // Exact match
    if (
        normalizedQuery ===
        normalizedAlias
    ) {
        return 100;
    }

    // Query contains alias
    if (
        containsPhrase(
            normalizedQuery,
            normalizedAlias
        )
    ) {
        return 90;
    }

    // Alias contains query.
    //
    // Only allow this when the query
    // is sufficiently specific.
    if (
        containsPhrase(
            normalizedAlias,
            normalizedQuery
        ) &&
        normalizedQuery.length /
            normalizedAlias.length >=
            MIN_PARTIAL_COVERAGE
    ) {
        return 80;
    }

    return 0;
}

// ============================================================
// KNOWLEDGE SEARCH
// ============================================================

function searchKnowledge(
    query,
    topK = DEFAULT_TOP_K
) {
    const normalizedQuery =
        cleanIngredient(query);

    if (
        !normalizedQuery
    ) {
        return [];
    }

    const limit =
        Number.isInteger(topK) &&
        topK > 0
            ? topK
            : DEFAULT_TOP_K;

    return knowledge
        .map((item) => {
            if (
                !item ||
                typeof item.name !==
                    "string"
            ) {
                return null;
            }

            const normalizedName =
                normalize(
                    item.name
                );

            const aliases =
                getAliasesForKnowledgeName(
                    normalizedName
                );

            let score = 0;

            // ------------------------------------
            // Alias matching
            // ------------------------------------

            for (
                const alias of aliases
            ) {
                score = Math.max(
                    score,
                    scoreAliasMatch(
                        normalizedQuery,
                        alias
                    )
                );
            }

            // ------------------------------------
            // Direct canonical name matching
            // ------------------------------------

            if (
                normalizedQuery ===
                normalizedName
            ) {
                score = Math.max(
                    score,
                    100
                );
            }

            // Query contains canonical name
            else if (
                containsPhrase(
                    normalizedQuery,
                    normalizedName
                )
            ) {
                score = Math.max(
                    score,
                    90
                );
            }

            // Canonical name contains query
            else if (
                containsPhrase(
                    normalizedName,
                    normalizedQuery
                ) &&
                normalizedQuery.length /
                    normalizedName.length >=
                    MIN_PARTIAL_COVERAGE
            ) {
                score = Math.max(
                    score,
                    80
                );
            }

            if (
                score < 70
            ) {
                return null;
            }

            return {
                ...item,

                // Keep original name.
                ingredient:
                    item.name,

                // Canonical name used
                // by downstream services.
                canonical_name:
                    item.name,

                score,
            };
        })
        .filter(Boolean)
        .sort(
            (a, b) =>
                b.score -
                a.score
        )
        .slice(
            0,
            limit
        );
}

// ============================================================
// INGREDIENT EVIDENCE
// ============================================================

function getIngredientEvidence(
    ingredient
) {
    try {
        const results =
            searchKnowledge(
                ingredient,
                DEFAULT_TOP_K
            );

        return results.map(
            (item) => ({
                ingredient:
                    item.name,

                canonical_name:
                    item.canonical_name ||
                    item.name,

                description:
                    item.description ||
                    null,

                purpose:
                    item.purpose ||
                    null,

                source:
                    item.source ||
                    null,

                score:
                    item.score,
            })
        );
    } catch (error) {
        console.error(
            "RAG evidence lookup failed:",
            error.message
        );

        return [];
    }
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    searchKnowledge,
    getIngredientEvidence,

    normalize,
    cleanIngredient,

    containsPhrase,

    INGREDIENT_ALIASES,
};