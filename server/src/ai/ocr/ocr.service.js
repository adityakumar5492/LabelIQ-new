// server/src/ai/ocr/ocr.service.js
//
// OCR with word-level coordinates.
//
// WHY words WERE EMPTY:
//   tesseract.js v6 no longer returns data.words / data.lines at the top
//   level, and only returns plain text unless you ask for other outputs.
//   Words now live in data.blocks[].paragraphs[].lines[].words[] and only
//   exist when you call:  worker.recognize(image, {}, { blocks: true })
//   (v2-v5 returned data.words by default and take no 3rd argument.)
//
// This file works on v4/v5/v6. It tries, in order:
//   data.words -> data.blocks (nested) -> data.tsv -> data.hocr
// and reports which source worked in `meta.wordSource`.

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { createWorker } = require("tesseract.js");

/* ------------------------------------------------------------------ */
/* Version detection                                                  */
/* ------------------------------------------------------------------ */

function getTesseractVersion() {
    try {
        return require("tesseract.js/package.json").version;
    } catch (_) {
        // package.json may not be exported; walk up from the main file.
    }

    try {
        let dir = path.dirname(require.resolve("tesseract.js"));

        for (let i = 0; i < 5; i++) {
            const candidate = path.join(dir, "package.json");

            if (fs.existsSync(candidate)) {
                const json = JSON.parse(
                    fs.readFileSync(candidate, "utf8")
                );

                if (json.name === "tesseract.js") {
                    return json.version;
                }
            }

            dir = path.dirname(dir);
        }
    } catch (_) {
        // ignore
    }

    return null;
}

function getMajor(version) {
    const major = parseInt(String(version || "").split(".")[0], 10);

    return Number.isFinite(major) ? major : null;
}

/* ------------------------------------------------------------------ */
/* Word extraction (version tolerant)                                 */
/* ------------------------------------------------------------------ */

function toWord(raw) {
    if (!raw) {
        return null;
    }

    const text = String(raw.text ?? "").trim();
    const b = raw.bbox || raw;

    if (!text) {
        return null;
    }

    const x0 = Number(b.x0 ?? b.left);
    const y0 = Number(b.y0 ?? b.top);
    const x1 = Number(b.x1 ?? (Number(b.left) + Number(b.width)));
    const y1 = Number(b.y1 ?? (Number(b.top) + Number(b.height)));

    if (![x0, y0, x1, y1].every(Number.isFinite)) {
        return null;
    }

    const confidence = Number(raw.confidence ?? raw.conf);

    return {
        text,
        confidence: Number.isFinite(confidence) ? confidence : null,
        bbox: { x0, y0, x1, y1 },
    };
}

function wordsFromBlocks(blocks) {
    const words = [];

    for (const block of blocks || []) {
        for (const paragraph of block.paragraphs || []) {
            for (const line of paragraph.lines || []) {
                for (const word of line.words || []) {
                    const w = toWord(word);

                    if (w) {
                        words.push(w);
                    }
                }
            }
        }
    }

    return words;
}

function wordsFromTsv(tsv) {
    const words = [];

    for (const line of String(tsv || "").split(/\r?\n/)) {
        const cols = line.split("\t");

        // level page block par line word left top width height conf text
        if (cols.length < 12 || cols[0] !== "5") {
            continue;
        }

        const w = toWord({
            text: cols.slice(11).join("\t"),
            left: cols[6],
            top: cols[7],
            width: cols[8],
            height: cols[9],
            conf: cols[10],
        });

        if (w) {
            words.push(w);
        }
    }

    return words;
}

function wordsFromHocr(hocr) {
    const words = [];
    const re =
        /<span[^>]*class=['"]ocrx_word['"][^>]*title=['"]bbox (\d+) (\d+) (\d+) (\d+)(?:;\s*x_wconf (\d+))?[^'"]*['"][^>]*>([\s\S]*?)<\/span>/g;

    let m;

    while ((m = re.exec(String(hocr || ""))) !== null) {
        const w = toWord({
            text: m[6].replace(/<[^>]+>/g, ""),
            bbox: {
                x0: m[1],
                y0: m[2],
                x1: m[3],
                y1: m[4],
            },
            confidence: m[5],
        });

        if (w) {
            words.push(w);
        }
    }

    return words;
}

function extractWords(data) {
    if (!data) {
        return { words: [], source: "none" };
    }

    if (Array.isArray(data.words) && data.words.length) {
        return {
            words: data.words.map(toWord).filter(Boolean),
            source: "data.words",
        };
    }

    const fromBlocks = wordsFromBlocks(data.blocks);

    if (fromBlocks.length) {
        return { words: fromBlocks, source: "data.blocks" };
    }

    const fromTsv = wordsFromTsv(data.tsv);

    if (fromTsv.length) {
        return { words: fromTsv, source: "data.tsv" };
    }

    const fromHocr = wordsFromHocr(data.hocr);

    if (fromHocr.length) {
        return { words: fromHocr, source: "data.hocr" };
    }

    return { words: [], source: "none" };
}

/* ------------------------------------------------------------------ */
/* Image preprocessing variants                                       */
/* ------------------------------------------------------------------ */

// "base" is exactly your previous preprocessing (kept for plain text).
async function preprocessImage(imageBuffer) {
    return await sharp(imageBuffer)
        .rotate()
        .resize({ width: 2000, withoutEnlargement: false })
        .grayscale()
        .normalize()
        .png()
        .toBuffer();
}

async function preprocessLarge(imageBuffer) {
    return await sharp(imageBuffer)
        .rotate()
        .resize({ width: 3000, withoutEnlargement: false })
        .grayscale()
        .normalize()
        .sharpen()
        .png()
        .toBuffer();
}

async function preprocessContrast(imageBuffer) {
    return await sharp(imageBuffer)
        .rotate()
        .resize({ width: 2600, withoutEnlargement: false })
        .grayscale()
        .normalize()
        .linear(1.3, -25)
        .sharpen()
        .png()
        .toBuffer();
}

const PASSES = [
    { name: "base", psm: "3", prepare: preprocessImage },
    { name: "large-uniform", psm: "6", prepare: preprocessLarge },
    { name: "contrast-columns", psm: "4", prepare: preprocessContrast },
];

/* ------------------------------------------------------------------ */
/* Recognition                                                        */
/* ------------------------------------------------------------------ */

async function recognizeOnce(worker, image, major) {
    // v6+: outputs other than text must be requested explicitly.
    // v5-: recognize(image, options, jobId) -> do NOT pass an output object.
    const outputs = { text: true, blocks: true, tsv: true };

    let result =
        major !== null && major >= 6
            ? await worker.recognize(image, {}, outputs)
            : await worker.recognize(image);

    let extracted = extractWords(result?.data);

    // Unknown version and nothing found: retry asking for outputs.
    if (!extracted.words.length && major === null) {
        try {
            result = await worker.recognize(image, {}, outputs);
            extracted = extractWords(result?.data);
        } catch (_) {
            // keep the first result
        }
    }

    return {
        text: String(result?.data?.text || "").trim(),
        words: extracted.words,
        wordSource: extracted.source,
        dataKeys: Object.keys(result?.data || {}),
    };
}

async function extractOCR(imageBuffer, options = {}) {
    if (!imageBuffer) {
        throw new Error("Image buffer is required");
    }

    const multiPass = options.multiPass !== false;
    const passes = multiPass ? PASSES : PASSES.slice(0, 1);

    const version = getTesseractVersion();
    const major = getMajor(version);

    const worker = await createWorker("eng");

    try {
        await worker.setParameters({
            preserve_interword_spaces: "1",
            user_defined_dpi: "300",
        });

        const results = [];

        for (const pass of passes) {
            try {
                const image = await pass.prepare(imageBuffer);

                await worker.setParameters({
                    tessedit_pageseg_mode: pass.psm,
                });

                const r = await recognizeOnce(worker, image, major);

                results.push({
                    name: pass.name,
                    psm: pass.psm,
                    text: r.text,
                    words: r.words,
                    meta: {
                        wordSource: r.wordSource,
                        wordCount: r.words.length,
                        dataKeys: r.dataKeys,
                    },
                });
            } catch (error) {
                results.push({
                    name: pass.name,
                    psm: pass.psm,
                    text: "",
                    words: [],
                    meta: {
                        error: error.message,
                        wordSource: "none",
                        wordCount: 0,
                    },
                });
            }
        }

        const primary = results[0];

        return {
            // Backward compatible fields (same as before)
            text: primary.text,
            words: primary.words,

            // New
            passes: results,
            meta: {
                tesseractVersion: version,
                tesseractMajor: major,
                wordSource: primary.meta.wordSource,
                passSummary: results.map((r) => ({
                    name: r.name,
                    psm: r.psm,
                    words: r.meta.wordCount,
                    source: r.meta.wordSource,
                    error: r.meta.error || null,
                })),
            },
        };
    } finally {
        await worker.terminate();
    }
}

// Plain text only: single pass, same behaviour as before.
async function extractText(imageBuffer) {
    const result = await extractOCR(imageBuffer, { multiPass: false });

    return result.text;
}

module.exports = {
    extractText,
    extractOCR,
    // exported for tests
    extractWords,
};