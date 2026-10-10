const fs = require("fs");
const path = require("path");

const knowledgePath = path.join(
    __dirname,
    "ingredient-knowledge.json"
);

const knowledge = JSON.parse(
    fs.readFileSync(knowledgePath, "utf-8")
);

function normalize(text) {
    return text
        .toLowerCase()
        .replace(/[()[\],.:;|/]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function cleanIngredient(ingredient) {
    return normalize(ingredient)
        .replace(/\b\d+(?:\.\d+)?\s*%\b/g, "")
        .trim();
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

            // Query contains complete knowledge name
            else if (
                normalizedQuery.includes(normalizedName)
            ) {
                score = 80;
            }

            // Knowledge name contains complete query
            else if (
                normalizedName.includes(normalizedQuery)
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
    const results = searchKnowledge(ingredient, 3);

    return results.map((item) => ({
        ingredient: item.name,
        description: item.description,
        purpose: item.purpose,
        source: item.source,
        score: item.score,
    }));
}

module.exports = {
    searchKnowledge,
    getIngredientEvidence,
};