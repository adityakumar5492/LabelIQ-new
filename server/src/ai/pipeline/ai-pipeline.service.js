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
 * The OCR service provides multiple OCR passes and word-level
 * coordinates. We preserve all of that information because:
 *
 * 1. The deterministic nutrition parser needs coordinates.
 * 2. Product extraction benefits from seeing multiple OCR passes.
 * 3. Allergen extraction needs evidence from all available OCR.
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
                    typeof pass.name === "string" &&
                    pass.name.trim()
                        ? pass.name
                        : `pass-${passes.length + 1}`,

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
     * Some older OCR implementations may return:
     *
     * {
     *   text: "...",
     *   words: [...]
     * }
     *
     * but no passes array.
     *
     * Preserve that information as one OCR pass.
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

    /*
     * If the top-level OCR text is empty but passes exist,
     * use the first pass as the primary OCR text.
     */
    if (!text.trim() && passes.length) {
        text = passes[0].text;
    }

    return {
        text,
        passes,
    };
}

/**
 * Build a combined OCR text string from every OCR pass.
 *
 * This is important for Step 2.
 *
 * Example:
 *
 * Pass 1:
 *   Emulsifier Lecithin
 *
 * Pass 2:
 *   Emulsifier [Soya Lecithin]
 *
 * The extraction service should see BOTH.
 *
 * We deliberately do not remove duplicate text here.
 * Different OCR passes may contain slightly different
 * evidence and the extraction service can decide what
 * information is reliable.
 */
function buildAdditionalOcrText(passes) {
    if (!Array.isArray(passes) || !passes.length) {
        return "";
    }

    return passes
        .map((pass, index) => {
            const name =
                typeof pass.name === "string" &&
                pass.name.trim()
                    ? pass.name.trim()
                    : `pass-${index + 1}`;

            const text =
                typeof pass.text === "string"
                    ? pass.text.trim()
                    : "";

            if (!text) {
                return "";
            }

            return `--- OCR PASS: ${name} ---\n${text}`;
        })
        .filter(Boolean)
        .join("\n\n");
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
 * Product / Ingredient Extraction
 *     ↓
 * RAG ingredient evidence
 *     ↓
 * Return AI pipeline result
 *
 * Important:
 *
 * - OCR extracts text and coordinates.
 * - Product extraction uses all useful OCR evidence.
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
    // Do NOT replace this with a simple OCR text function.
    //
    // scan.service.js needs:
    // - multiple OCR passes
    // - word coordinates
    // - bounding boxes
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
    // 2. BUILD COMPLETE OCR EVIDENCE
    // --------------------------------------------------
    //
    // Previously only the primary OCR text was sent to
    // extractProductInfo().
    //
    // That caused a real information-loss problem:
    //
    // OCR PASS 1:
    //   Emulsifier Lecithin
    //
    // OCR PASS 2:
    //   Emulsifier [Soya Lecithin]
    //
    // If only PASS 1 was sent to Groq, the model had no
    // reliable evidence for "soya".
    //
    // We now preserve the primary OCR text separately and
    // send all additional passes as additional evidence.
    //
    const additionalOcrText =
        buildAdditionalOcrText(ocr.passes);

    // --------------------------------------------------
    // 3. PRODUCT / INGREDIENT EXTRACTION
    // --------------------------------------------------
    //
    // Groq is used for structured extraction.
    //
    // It can extract:
    // - product name
    // - brand
    // - variant
    // - pack information
    // - serving information
    // - ingredients
    // - allergen evidence
    //
    // Nutrition parsing is still handled deterministically
    // by scan.service.js.
    //
    // Groq must NOT determine the final health score.
    //
    const product = await extractProductInfo(
        ocrText,
        additionalOcrText
    );

    if (!product || typeof product !== "object") {
        throw new Error("Product extraction failed");
    }

    // --------------------------------------------------
    // 4. RAG INGREDIENT EVIDENCE
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
    // 5. FINAL PIPELINE RESULT
    // --------------------------------------------------
    //
    // Keep ALL OCR passes.
    //
    // scan.service.js consumes this data through:
    //
    // parseNutritionMultiPass(ocrPasses)
    //
    // Therefore we must not simplify the OCR result here.
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