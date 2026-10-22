"use strict";

const { extractOCR } = require("../ocr/ocr.service");
const { extractProductInfo } = require("../extraction/extraction.service");
const { getIngredientEvidence } = require("../rag/rag.service");

/**
 * Normalize OCR output so the rest of the pipeline always receives:
 *
 * {
 *   text: "...",
 *   passes: [
 *     {
 *       name,
 *       text,
 *       words
 *     }
 *   ]
 * }
 *
 * The OCR service already provides multi-pass OCR and word-level
 * coordinates. We preserve that information because the deterministic
 * nutrition parser depends on it.
 */
function normalizeOcrOutput(ocrOutput) {
    if (typeof ocrOutput === "string") {
        return {
            text: ocrOutput,
            passes: [],
        };
    }

    if (!ocrOutput || typeof ocrOutput !== "object") {
        return {
            text: "",
            passes: [],
        };
    }

    let text =
        typeof ocrOutput.text === "string"
            ? ocrOutput.text
            : "";

    const passes = [];

    if (Array.isArray(ocrOutput.passes)) {
        for (const pass of ocrOutput.passes) {
            if (!pass || typeof pass.text !== "string") {
                continue;
            }

            passes.push({
                name:
                    pass.name ||
                    `pass-${passes.length + 1}`,

                text: pass.text,

                words: Array.isArray(pass.words)
                    ? pass.words
                    : [],
            });
        }
    }

    /*
     * Backward compatibility:
     *
     * If the OCR service returns a single words array but no
     * multi-pass structure, preserve it as one OCR pass.
     */
    if (
        !passes.length &&
        Array.isArray(ocrOutput.words)
    ) {
        passes.push({
            name: "ocr",
            text,
            words: ocrOutput.words,
        });
    }

    if (!text.trim() && passes.length) {
        text = passes[0].text;
    }

    return {
        text,
        passes,
    };
}

/**
 * Main Node.js AI pipeline.
 *
 * Flow:
 *
 * Image Buffer
 *     ↓
 * Multi-pass OCR
 *     ↓
 * Product / Ingredient Extraction using Groq
 *     ↓
 * RAG ingredient evidence
 *     ↓
 * Return AI pipeline result
 *
 * Important:
 *
 * - OCR is responsible for extracting text and coordinates.
 * - Product extraction uses OCR text.
 * - Nutrition parsing is performed later by scan.service.js.
 * - Deterministic health rules remain outside this pipeline.
 * - AI does NOT determine the health score or grade.
 */
async function analyzeImage(imageBuffer) {
    if (!imageBuffer) {
        throw new Error("Image buffer is required");
    }

    // --------------------------------------------------
    // 1. MULTI-PASS OCR
    // --------------------------------------------------
    //
    // IMPORTANT:
    //
    // Do NOT use extractText() here.
    //
    // extractText() intentionally performs only one OCR pass
    // and returns plain text.
    //
    // The nutrition parser needs:
    // - multiple OCR passes
    // - word coordinates
    // - bounding boxes
    //
    // Therefore we use extractOCR() directly.
    //
    const rawOcr = await extractOCR(imageBuffer, {
        multiPass: true,
    });

    const ocr = normalizeOcrOutput(rawOcr);

    const ocrText = ocr.text;

    if (!ocrText || !ocrText.trim()) {
        throw new Error("OCR failed: no text detected");
    }

    // --------------------------------------------------
    // 2. PRODUCT / INGREDIENT EXTRACTION
    // --------------------------------------------------
    //
    // Groq receives the combined/primary OCR text.
    //
    // It is used for:
    // - product name
    // - brand
    // - serving information
    // - ingredients
    // - nutrition fallback
    //
    // It does NOT determine the final health score.
    //
    const product = await extractProductInfo(ocrText);

    if (!product || typeof product !== "object") {
        throw new Error("Product extraction failed");
    }

    // --------------------------------------------------
    // 3. RAG INGREDIENT EVIDENCE
    // --------------------------------------------------
    //
    // RAG is used only for ingredient evidence.
    //
    // It does NOT determine:
    // - health score
    // - grade
    // - personalized penalties
    // - dietary safety
    //
    const ingredientEvidence = [];

    for (const ingredient of product.ingredients || []) {
        if (
            typeof ingredient !== "string" ||
            !ingredient.trim()
        ) {
            continue;
        }

        const cleanIngredient = ingredient
            .trim()
            .replace(/\s+/g, " ");

        const evidence =
            getIngredientEvidence(cleanIngredient);

        ingredientEvidence.push({
            ingredient: cleanIngredient,
            evidence,
        });
    }

    // --------------------------------------------------
    // 4. FINAL PIPELINE RESULT
    // --------------------------------------------------
    //
    // ocrPasses is intentionally preserved.
    //
    // scan.service.js consumes this data through:
    //
    // parseNutritionMultiPass(ocrPasses)
    //
    // This allows the deterministic nutrition parser to use
    // coordinates and multiple OCR passes.
    //
    return {
        ocr: {
            text: ocrText,
        },

        ocrPasses: ocr.passes,

        product,

        rag: {
            ingredients: ingredientEvidence,
        },
    };
}

module.exports = {
    analyzeImage,
};