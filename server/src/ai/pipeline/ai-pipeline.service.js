"use strict";

const { extractOCR } = require("../ocr/ocr.service");
const { extractProductInfo } = require("../extraction/extraction.service");
const { getIngredientEvidence } = require("../rag/rag.service");
const { parseNutritionMultiPass } = require("../nutrition/nutrition.service");
const { createScanTimer, throwIfAborted } = require("../../utils/scanTimer");

// Groq only needs a couple of distinct full-image views, not every OCR
// pass (the old prompt contained ~9 copies of the label text).
const MAX_PROMPT_EXTRA_PASSES = 2;
const MAX_PROMPT_EXTRA_CHARS = 6000;

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
 * Decides when OCR has produced enough evidence to stop running passes.
 *
 * It does NOT judge accuracy; it detects convergence: OCR stops once
 *   - a nutrition basis and at least 3 nutrients were parsed,
 *   - the passes do not disagree (no voting conflicts),
 *   - the label has an ingredient section in the OCR text, and
 *   - the LAST pass changed nothing in the merged nutrition result.
 * When that never happens (poor photo), every pass still runs, inside the
 * OCR time budget, exactly as before.
 *
 * Returns a stateful function: create one per scan.
 */
function createOcrSufficiencyCheck() {
    let lastSignature = null;

    return function isSufficient(passes) {
        const usable = (passes || []).filter(
            (p) => p && typeof p.text === "string" && p.text.trim()
        );

        if (!usable.length) {
            return false;
        }

        const parsed = parseNutritionMultiPass(
            usable.map((p) => ({
                name: p.name,
                text: p.text,
                words: Array.isArray(p.words) ? p.words : [],
            }))
        );

        const signature = JSON.stringify([
            parsed.nutritionBasis,
            parsed.servingSize,
            parsed.nutrition,
        ]);

        const stable = signature === lastSignature;

        lastSignature = signature;

        const filled = Object.values(parsed.nutrition || {}).filter(
            (v) => v !== null && v !== undefined
        ).length;

        const conflicts = (parsed.metadata && parsed.metadata.conflicts) || [];
        const hasIngredients = usable.some((p) => /ingredient/i.test(p.text));

        return Boolean(
            parsed.nutritionBasis &&
                filled >= 3 &&
                conflicts.length === 0 &&
                hasIngredients &&
                stable
        );
    };
}

function normalizeForCompare(text) {
    return String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Evidence text that is sent to Groq.
 *
 * The full evidence (every pass) is still used locally to validate what
 * Groq returns; only the PROMPT is trimmed:
 *   - the primary pass is already sent as the main OCR text
 *   - table-crop passes only contain the nutrition table, which is parsed
 *     deterministically, so they are not sent
 *   - identical / near-identical passes are sent once
 */
function buildPromptEvidence(passes, primaryText) {
    const seen = new Set([normalizeForCompare(primaryText)]);
    const chosen = [];

    for (const pass of passes || []) {
        if (chosen.length >= MAX_PROMPT_EXTRA_PASSES) {
            break;
        }

        const name = typeof pass.name === "string" ? pass.name : "";
        const text = typeof pass.text === "string" ? pass.text.trim() : "";

        if (!text || name.startsWith("table-crop")) {
            continue;
        }

        const key = normalizeForCompare(text);

        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        chosen.push(`--- OCR PASS: ${name || "pass"} ---\n${text}`);
    }

    return chosen.join("\n\n").slice(0, MAX_PROMPT_EXTRA_CHARS);
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
async function analyzeImage(imageBuffer, options = {}) {
    if (!imageBuffer) {
        throw new Error("Image buffer is required");
    }

    const signal = options.signal;
    const timer = options.timer || createScanTimer();

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
    throwIfAborted(signal);

    const ocrDone = timer.stage("OCR");

    const rawOcr = await extractOCR(imageBuffer, {
        multiPass: true,
        // Stop running extra passes once the result has converged.
        isSufficient: createOcrSufficiencyCheck(),
        // One Tesseract worker for the whole server (no per-scan startup).
        reuseWorker: true,
        signal,
        log: timer.log,
    });

    const ocr = normalizeOcrOutput(rawOcr);

    ocrDone(`${ocr.passes.length} passes`);

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

    // Smaller text for the Groq prompt only (see buildPromptEvidence).
    const promptEvidence = buildPromptEvidence(ocr.passes, ocrText);

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
    throwIfAborted(signal);

    const extractionDone = timer.stage("Groq extraction");

    const product = await extractProductInfo(
        ocrText,
        additionalOcrText,
        {
            promptEvidence,
            signal,
            log: timer.log,
        }
    );

    extractionDone();

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
    const ragDone = timer.stage("RAG");
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

        // RAG evidence is optional. If it fails, this ingredient simply
        // has no evidence; the scan and the deterministic score continue.
        let evidence = [];

        try {
            evidence = getIngredientEvidence(cleanIngredient);
        } catch (error) {
            console.error("RAG evidence failed:", error.message);
        }

        ingredientEvidence.push({
            ingredient: cleanIngredient,
            evidence,
        });
    }

    ragDone(`${ingredientEvidence.length} ingredients`);

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

    // Exported for tests.
    createOcrSufficiencyCheck,
    buildPromptEvidence,
};