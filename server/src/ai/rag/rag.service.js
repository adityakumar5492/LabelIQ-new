const fs = require("fs");
const path = require("path");

const knowledgePath = path.join(
    __dirname,
    "ingredient-knowledge.json"
);

// RAG is an evidence layer only. A missing or corrupt knowledge file
// must never stop the app or a scan, and never affects the health
// score, so it degrades to "no evidence".
let knowledge = [];

try {
    const parsed = JSON.parse(fs.readFileSync(knowledgePath, "utf-8"));

    knowledge = Array.isArray(parsed) ? parsed : [];
} catch (error) {
    console.error("RAG knowledge base could not be loaded:", error.message);
}

// A partial query (e.g. "sodium") may only match a longer knowledge
// name (e.g. "sodium benzoate") when it covers most of that name.
// Below this ratio the match is treated as a different ingredient.
const MIN_PARTIAL_COVERAGE = 0.6;

function normalize(text) {
    if (typeof text !== "string") {
        return "";
    }

    return text
        .toLowerCase()
        .replace(/[()[\],.:;|/]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function cleanIngredient(ingredient) {
    return normalize(ingredient)
        .replace(/\b\d+(?:\.\d+)?\s*%\b/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// True when `phrase` appears in `text` as whole words
// (an optional plural "s" is allowed).
function containsPhrase(text, phrase) {
    if (!text || !phrase) {
        return false;
    }

    return new RegExp(
        `(?:^| )${escapeRegex(phrase)}s?(?: |$)`
    ).test(text);
}

function searchKnowledge(query, topK = 3) {
    const normalizedQuery = cleanIngredient(query);

    if (!normalizedQuery) {
        return [];
    }

    const results = knowledge
        .map((item) => {
            const normalizedName = normalize(item.name);

            let score = 0;

            // Exact match
            if (normalizedQuery === normalizedName) {
                score = 100;
            }

            // Query contains complete knowledge name (whole words)
            else if (containsPhrase(normalizedQuery, normalizedName)) {
                score = 80;
            }

            // Knowledge name contains the complete query (whole words),
            // only when the query covers most of the name.
            else if (
                containsPhrase(normalizedName, normalizedQuery) &&
                normalizedQuery.length / normalizedName.length >=
                    MIN_PARTIAL_COVERAGE
            ) {
                score = 70;
            }

            return {
                ...item,
                score,
            };
        })
        // IMPORTANT:
        // Never return weak/random matches.
        .filter((item) => item.score >= 70)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);

    return results;
}

function getIngredientEvidence(ingredient) {
    try {
        const results = searchKnowledge(ingredient, 3);

        return results.map((item) => ({
            ingredient: item.name,
            description: item.description,
            purpose: item.purpose,
            source: item.source,
            score: item.score,
        }));
    } catch (error) {
        // RAG failure = no evidence. Never an error for the scan.
        console.error("RAG evidence lookup failed:", error.message);

        return [];
    }
}

module.exports = {
    searchKnowledge,
    getIngredientEvidence,
};