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
//
// PERFORMANCE (staged OCR)
//   The old implementation ran 4 full-image passes (up to 3000 px wide,
//   i.e. 16+ megapixels for a portrait photo) and then 4 more crop passes,
//   always, one after another, with a brand-new Tesseract worker per scan.
//   On a small server that is minutes of CPU.
//
//   Now:
//     1. the photo is decoded / rotated ONCE (grayscale, capped size)
//     2. images are never upscaled more than MAX_UPSCALE x, and never above
//        MAX_PIXELS (upscaling past that adds time, not information)
//     3. passes run in stages and STOP as soon as the caller's
//        `isSufficient(passes)` says the evidence is good enough:
//          base -> nutrition-table crop -> (more crops) -> more full passes
//     4. every pass is skipped once the time budget is spent
//     5. the Tesseract worker is created once and reused (opt-in)
//   Nothing is removed: if the first passes are NOT sufficient, the same
//   extra passes as before still run (inside the time budget).

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
/* Tunables                                                           */
/* ------------------------------------------------------------------ */

const envInt = (name, fallback) => {
    const n = parseInt(process.env[name], 10);

    return Number.isFinite(n) && n > 0 ? n : fallback;
};

// Never upscale a source more than this (more adds time, not detail).
const MAX_UPSCALE = 3;
// Hard ceiling for any image given to Tesseract.
const MAX_PIXELS = envInt("OCR_MAX_PIXELS", 6_000_000);
// The decoded working copy of the photo is capped to this longest side.
const MAX_SOURCE_SIDE = 4000;
// Optional (extra) full-image passes stop after this much total OCR time
// when the evidence is already sufficient; insufficient evidence may
// continue until the hard budget.
const SOFT_BUDGET_MS = envInt("OCR_SOFT_BUDGET_MS", 20_000);
const HARD_BUDGET_MS = envInt("OCR_HARD_BUDGET_MS", 45_000);
// A single Tesseract run that exceeds this is abandoned (worker reset).
const PASS_TIMEOUT_MS = envInt("OCR_PASS_TIMEOUT_MS", 40_000);
// A reused worker is released after this much inactivity.
const WORKER_IDLE_MS = envInt("OCR_WORKER_IDLE_MS", 10 * 60 * 1000);

/* ------------------------------------------------------------------ */
/* Image preprocessing variants                                       */
/* ------------------------------------------------------------------ */

// Source = the photo, auto-rotated, grayscale, raw pixels, capped size.
// Decoding a 12 MP JPEG is the expensive part; it now happens once.
async function prepareSource(imageBuffer) {
    const { data, info } = await sharp(imageBuffer)
        .rotate()
        .resize({
            width: MAX_SOURCE_SIDE,
            height: MAX_SOURCE_SIDE,
            fit: "inside",
            withoutEnlargement: true,
        })
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

    return { data, width: info.width, height: info.height };
}

function sourceImage(source) {
    return sharp(source.data, {
        raw: { width: source.width, height: source.height, channels: 1 },
    });
}

// Final size for a target width: no more than MAX_UPSCALE x the source,
// and never more than MAX_PIXELS.
function fitSize(source, targetWidth) {
    let w = Math.min(targetWidth, Math.round(source.width * MAX_UPSCALE));
    let h = Math.round((source.height * w) / source.width);

    if (w * h > MAX_PIXELS) {
        const k = Math.sqrt(MAX_PIXELS / (w * h));

        w = Math.max(1, Math.round(w * k));
        h = Math.max(1, Math.round(h * k));
    }

    return { width: w, height: h };
}

// Fast PNG (these buffers are only handed to Tesseract once).
const toPng = (pipeline) => pipeline.png({ compressionLevel: 1 }).toBuffer();

// "base" is the previous preprocessing (kept for plain text).
async function preprocessImage(source, size) {
    return toPng(sourceImage(source).resize(size).normalize());
}

async function preprocessLarge(source, size) {
    return toPng(sourceImage(source).resize(size).normalize().sharpen());
}

async function preprocessContrast(source, size) {
    return toPng(
        sourceImage(source).resize(size).normalize().linear(1.3, -25).sharpen()
    );
}

// Light text on a dark panel (very common for nutrition tables on
// chocolate / snack boxes) is read much better after inversion.
async function preprocessInverted(source, size) {
    return toPng(
        sourceImage(source).resize(size).negate().normalize().sharpen()
    );
}

const PASSES = [
    { name: "base", psm: "3", width: 2000, prepare: preprocessImage },
    { name: "large-uniform", psm: "6", width: 3000, prepare: preprocessLarge },
    { name: "contrast-columns", psm: "4", width: 2600, prepare: preprocessContrast },
    { name: "inverted-columns", psm: "4", width: 3000, prepare: preprocessInverted },
];

// Table crop attempts, in the order they are tried. psm 6 reads a table
// block best; the others are only tried when the evidence is not yet
// sufficient. (Same four combinations as before, cheapest/best first.)
const CROP_ATTEMPTS = [
    { width: 1800, psm: "6" },
    { width: 1000, psm: "6" },
    { width: 1800, psm: "4" },
    { width: 1000, psm: "4" },
];

/* ------------------------------------------------------------------ */
/* Nutrition-table crop (second stage)                                */
/* ------------------------------------------------------------------ */

// Finds the "Nutrition Information" header in an already-recognised
// pass, and returns the table region in SOURCE coordinates.
// Returns null when no header is found.
function findTableRegion(pass, passWidth, sourceWidth, sourceHeight) {
    const words = (pass.words || []).filter((w) => w && w.bbox && w.text);

    const header = words.find((w) => {
        const l = String(w.text).toLowerCase().replace(/[^a-z]/g, "");

        return l.length >= 8 && /^nutrit/.test(l);
    });

    if (!header) {
        return null;
    }

    const scale = sourceWidth / passWidth;
    const hh = Math.max(8, header.bbox.y1 - header.bbox.y0);

    const sameRow = words.filter(
        (w) =>
            Math.abs((w.bbox.y0 + w.bbox.y1) / 2 - (header.bbox.y0 + header.bbox.y1) / 2) <= hh * 0.7 &&
            w.bbox.x0 >= header.bbox.x0 - hh &&
            w.bbox.x0 <= header.bbox.x0 + passWidth * 0.4
    );

    const right = Math.max(header.bbox.x1, ...sameRow.map((w) => w.bbox.x1));

    const reference = words.find((w) => {
        const l = String(w.text).toLowerCase().replace(/[^a-z]/g, "");

        return (
            /^refer/.test(l) &&
            w.bbox.y0 > header.bbox.y1 &&
            w.bbox.y0 < header.bbox.y1 + hh * 30
        );
    });

    const bottom = reference
        ? reference.bbox.y0
        : header.bbox.y1 + hh * 14;

    const left = Math.max(0, (header.bbox.x0 - hh * 1.2) * scale);
    const top = Math.max(0, (header.bbox.y0 - hh * 0.8) * scale);
    const width = Math.min(sourceWidth - left, (right - header.bbox.x0 + hh * 2.4) * scale);
    const height = Math.min(sourceHeight - top, (bottom - header.bbox.y0 + hh * 0.8) * scale);

    if (width < 80 || height < 60) {
        return null;
    }

    return {
        left: Math.round(left),
        top: Math.round(top),
        width: Math.round(width),
        height: Math.round(height),
    };
}

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

/* ------------------------------------------------------------------ */
/* Worker management                                                  */
/* ------------------------------------------------------------------ */

async function newWorker() {
    const worker = await createWorker("eng");

    await worker.setParameters({
        preserve_interword_spaces: "1",
        user_defined_dpi: "300",
    });

    return worker;
}

let sharedWorkerPromise = null;
let idleTimer = null;
// Tesseract workers are stateful (page-segmentation mode), so two scans
// must never use the shared worker at the same time.
let queue = Promise.resolve();

function runExclusive(task) {
    const run = queue.then(task);

    queue = run.catch(() => {});

    return run;
}

function getSharedWorker() {
    if (!sharedWorkerPromise) {
        sharedWorkerPromise = newWorker().catch((error) => {
            sharedWorkerPromise = null;

            throw error;
        });
    }

    return sharedWorkerPromise;
}

async function resetSharedWorker() {
    const pending = sharedWorkerPromise;

    sharedWorkerPromise = null;

    if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
    }

    if (pending) {
        try {
            const worker = await pending;

            await worker.terminate();
        } catch (_) {
            // already gone
        }
    }
}

function scheduleIdleRelease() {
    if (idleTimer) {
        clearTimeout(idleTimer);
    }

    idleTimer = setTimeout(() => {
        idleTimer = null;
        resetSharedWorker();
    }, WORKER_IDLE_MS);

    if (typeof idleTimer.unref === "function") {
        idleTimer.unref();
    }
}

// Starts the shared worker in the background (call at server start so the
// first scan does not pay for WASM + language data loading).
async function warmUpOcr() {
    await runExclusive(async () => {
        await getSharedWorker();
        scheduleIdleRelease();
    });
}

function withTimeout(promise, ms, label) {
    let timer;

    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
            const error = new Error(`${label} timed out after ${ms} ms`);

            error.code = "OCR_PASS_TIMEOUT";
            reject(error);
        }, ms);
    });

    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/* ------------------------------------------------------------------ */
/* Main entry                                                         */
/* ------------------------------------------------------------------ */

const noop = () => {};

function abortError() {
    const error = new Error("Scan cancelled: client disconnected");

    error.code = "SCAN_ABORTED";

    return error;
}

/**
 * extractOCR(imageBuffer, options)
 *
 *   multiPass     (default true)  false = one plain pass (extractText)
 *   isSufficient  (passes) => bool  stage-stop test supplied by the caller.
 *                 Without it every pass runs (old behaviour, but capped
 *                 by the time budget and the size limits).
 *   reuseWorker   (default false) reuse one Tesseract worker across scans.
 *   signal        AbortSignal, checked between passes.
 *   log           (message) => void, lightweight stage timings.
 */
async function extractOCR(imageBuffer, options = {}) {
    if (!imageBuffer) {
        throw new Error("Image buffer is required");
    }

    const multiPass = options.multiPass !== false;
    const reuseWorker = options.reuseWorker === true;
    const log = typeof options.log === "function" ? options.log : noop;

    const session = (worker) =>
        runSession(imageBuffer, worker, {
            multiPass,
            isSufficient:
                typeof options.isSufficient === "function"
                    ? options.isSufficient
                    : null,
            signal: options.signal,
            log,
        });

    if (!reuseWorker) {
        const worker = await newWorker();

        try {
            return await session(worker);
        } finally {
            await worker.terminate();
        }
    }

    return runExclusive(async () => {
        if (options.signal?.aborted) {
            throw abortError();
        }

        if (idleTimer) {
            clearTimeout(idleTimer);
            idleTimer = null;
        }

        const worker = await getSharedWorker();

        try {
            return await session(worker);
        } catch (error) {
            // A timed-out / crashed worker may still be busy: never reuse it.
            if (error?.code !== "SCAN_ABORTED") {
                await resetSharedWorker();
            }

            throw error;
        } finally {
            if (sharedWorkerPromise) {
                scheduleIdleRelease();
            }
        }
    });
}

async function runSession(imageBuffer, worker, opts) {
    const { multiPass, isSufficient, signal, log } = opts;

    const version = getTesseractVersion();
    const major = getMajor(version);
    const started = Date.now();
    const elapsed = () => Date.now() - started;

    const checkAbort = () => {
        if (signal?.aborted) {
            throw abortError();
        }
    };

    checkAbort();

    const tPrep = Date.now();
    const source = await prepareSource(imageBuffer);

    log(`OCR source prepared: ${source.width}x${source.height} in ${Date.now() - tPrep} ms`);

    const results = [];

    // One recognition (prepare + Tesseract), fully timed and error-tolerant.
    const runOne = async ({ name, psm, prepare, extra }) => {
        checkAbort();

        const t0 = Date.now();

        try {
            const image = await prepare();
            const tRec = Date.now();

            await worker.setParameters({ tessedit_pageseg_mode: psm });

            const r = await withTimeout(
                recognizeOnce(worker, image, major),
                PASS_TIMEOUT_MS,
                `OCR pass ${name}`
            );

            results.push({
                name,
                psm,
                text: r.text,
                words: r.words,
                meta: {
                    wordSource: r.wordSource,
                    wordCount: r.words.length,
                    dataKeys: r.dataKeys,
                    ...(extra || {}),
                },
            });

            log(
                `OCR pass ${name} (psm ${psm}): ${Date.now() - t0} ms ` +
                    `(prep ${tRec - t0} ms), ${r.words.length} words`
            );
        } catch (error) {
            if (error?.code === "OCR_PASS_TIMEOUT" || error?.code === "SCAN_ABORTED") {
                throw error;
            }

            results.push({
                name,
                psm,
                text: "",
                words: [],
                meta: {
                    error: error.message,
                    wordSource: "none",
                    wordCount: 0,
                    ...(extra || {}),
                },
            });

            log(`OCR pass ${name} failed: ${error.message}`);
        }
    };

    const sufficient = () => {
        if (!isSufficient) {
            return false;
        }

        try {
            return Boolean(isSufficient(results));
        } catch (_) {
            return false;
        }
    };

    const runFull = (def) =>
        runOne({
            name: def.name,
            psm: def.psm,
            prepare: () => def.prepare(source, fitSize(source, def.width)),
        });

    // Table region from any full-image pass that already saw the header.
    const findRegion = () => {
        for (const def of PASSES) {
            const pass = results.find((r) => r.name === def.name);

            if (pass && pass.words && pass.words.length) {
                const passWidth = fitSize(source, def.width).width;
                const region = findTableRegion(pass, passWidth, source.width, source.height);

                if (region) {
                    return region;
                }
            }
        }

        return null;
    };

    let nextFull = 0;
    let nextCrop = 0;
    let extraEvidencePasses = 0;

    // ---- stage 1: base pass (always) ----
    await runFull(PASSES[nextFull++]);

    if (multiPass) {
        // ---- stage 2..n: crop first, then more full passes, until sufficient ----
        // eslint-disable-next-line no-constant-condition
        while (true) {
            checkAbort();

            if (sufficient()) {
                // Evidence is good. One additional full-image view is still
                // collected (cheap insurance for ingredient / allergen text)
                // but only while the soft budget allows it.
                if (
                    extraEvidencePasses < 1 &&
                    nextFull < PASSES.length &&
                    elapsed() < SOFT_BUDGET_MS
                ) {
                    extraEvidencePasses++;
                    await runFull(PASSES[nextFull++]);
                    continue;
                }

                break;
            }

            if (elapsed() >= HARD_BUDGET_MS) {
                log(`OCR hard budget reached (${elapsed()} ms), stopping with ${results.length} passes`);
                break;
            }

            const region = nextCrop < CROP_ATTEMPTS.length ? findRegion() : null;

            if (region) {
                const attempt = CROP_ATTEMPTS[nextCrop++];

                await runOne({
                    name: `table-crop-${attempt.width}-psm${attempt.psm}`,
                    psm: attempt.psm,
                    extra: { region },
                    prepare: () => {
                        const size = fitSize(
                            { width: region.width, height: region.height },
                            attempt.width
                        );

                        return toPng(
                            sourceImage(source)
                                .extract(region)
                                .resize(size)
                                .normalize()
                                .sharpen()
                        );
                    },
                });

                continue;
            }

            if (nextFull < PASSES.length) {
                await runFull(PASSES[nextFull++]);
                continue;
            }

            break;
        }
    }

    const primary = results[0];

    log(`OCR finished: ${results.length} passes in ${elapsed()} ms`);

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
            totalMs: elapsed(),
            passSummary: results.map((r) => ({
                name: r.name,
                psm: r.psm,
                words: r.meta.wordCount,
                source: r.meta.wordSource,
                error: r.meta.error || null,
            })),
        },
    };
}

// Plain text only: single pass, same behaviour as before.
async function extractText(imageBuffer) {
    const result = await extractOCR(imageBuffer, { multiPass: false });

    return result.text;
}

module.exports = {
    extractText,
    extractOCR,
    warmUpOcr,
    resetSharedWorker,
    // exported for tests
    extractWords,
};