"use strict";

const { extractText } = require("../ocr/ocr.service");
const { extractProductInfo } = require("../extraction/extraction.service");
const { getIngredientEvidence } = require("../rag/rag.service");

/**
 * Main Node.js AI pipeline.
 *
 * Flow:
 * Image Buffer
 *     ↓
 * OCR
 *     ↓
 * Product / Ingredient Extraction using Groq
 *     ↓
 * RAG ingredient evidence
 *     ↓
 * Return AI pipeline result
 *
 * Nutrition is intentionally NOT handled here.
 * Nutrition is handled separately by nutrition.service.js
 * from scan.service.js.
 */
async function analyzeImage(imageBuffer) {
    if (!imageBuffer) {
        throw new Error("Image buffer is required");
    }

    // --------------------------------------------------
    // 1. OCR
    // --------------------------------------------------
    const ocrText = await extractText(imageBuffer);

    if (!ocrText || !ocrText.trim()) {
        throw new Error("OCR failed: no text detected");
    }

    // --------------------------------------------------
    // 2. Product / Ingredient Extraction
    // --------------------------------------------------
    const product = await extractProductInfo(ocrText);

    if (!product) {
        throw new Error("Product extraction failed");
    }

    // --------------------------------------------------
    // 3. RAG Ingredient Evidence
    // --------------------------------------------------
    const ingredientEvidence = [];

    for (const ingredient of product.ingredients || []) {
        if (!ingredient || typeof ingredient !== "string") {
            continue;
        }

        const evidence = getIngredientEvidence(ingredient);

        ingredientEvidence.push({
            ingredient,
            evidence,
        });
    }

    // --------------------------------------------------
    // 4. Final Pipeline Result
    // --------------------------------------------------
    return {
        ocr: {
            text: ocrText,
        },

        product,

        rag: {
            ingredients: ingredientEvidence,
        },
    };
}

module.exports = {
    analyzeImage,
};