// server/src/ai/nutrition/nutrition.service.js
//
// Deterministic, coordinate-aware nutrition parser.
//
// Inputs:
//   parseNutrition(text, words?)
//     text  - plain OCR text
//     words - [{ text, confidence, bbox:{x0,y0,x1,y1} }]  (optional)
//
// With words  -> rows are rebuilt from Y positions and every value is
//                assigned to the nearest header column by X position.
// Without     -> "text-order" mode: values are assigned to columns by
//                order, and ONLY when the count of values equals the
//                count of columns. Otherwise null.
//
// This parser does NOT: use an LLM, calculate a score, assign a grade,
// convert salt to sodium, or guess unreadable numbers.

"use strict";

const NUTRIENT_KEYS = [
    "calories",
    "protein",
    "carbohydrates",
    "totalFat",
    "saturatedFat",
    "sugar",
    "fiber",
    "sodium",
    "salt",
];

const MIN_NUMERIC_CONFIDENCE = 30;

/* ------------------------------------------------------------------ */
/* Basic helpers                                                      */
/* ------------------------------------------------------------------ */

function normalizeText(text) {
    return String(text || "")
        .replace(/\r/g, "\n")
        .replace(/[ \t]+/g, " ")
        .replace(/\n+/g, "\n")
        .trim();
}

function normalizeNumber(value) {
    if (value === null || value === undefined) {
        return null;
    }

    const cleaned = String(value)
        .replace(/,/g, ".")
        .replace(/[^\d.-]/g, "");

    if (!cleaned) {
        return null;
    }

    const number = Number(cleaned);

    return Number.isFinite(number) ? number : null;
}

function lettersOnly(text) {
    return String(text || "")
        .toLowerCase()
        .replace(/[^a-z]/g, "");
}

function median(values) {
    if (!values.length) {
        return null;
    }

    const sorted = [...values].sort((a, b) => a - b);

    return sorted[Math.floor(sorted.length / 2)];
}

function round3(value) {
    return Math.round(value * 1000) / 1000;
}

function levenshtein(a, b) {
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);

    for (let j = 1; j <= b.length; j++) {
        dp[0][j] = j;
    }

    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            dp[i][j] = Math.min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
            );
        }
    }

    return dp[a.length][b.length];
}

// True when `word` appears in `s`, allowing up to maxDist OCR errors.
function fuzzyHas(s, word, maxDist) {
    if (s.includes(word)) {
        return true;
    }

    if (maxDist <= 0) {
        return false;
    }

    for (let len = word.length - 1; len <= word.length + 1; len++) {
        for (let i = 0; i + len <= s.length; i++) {
            if (levenshtein(s.slice(i, i + len), word) <= maxDist) {
                return true;
            }
        }
    }

    return false;
}

/* ------------------------------------------------------------------ */
/* Serving size                                                       */
/* ------------------------------------------------------------------ */

function detectServingSize(text) {
    const normalized = normalizeText(text);

    const num = "(\\d+(?:[.,]\\d+)?)";

    const patterns = [
        new RegExp(`portion\\s*size\\s*[:\\-]?\\s*${num}\\s*(g|kg|ml|l)\\b`, "i"),
        new RegExp(`serving\\s*size\\s*[:\\-]?\\s*${num}\\s*(g|kg|ml|l)\\b`, "i"),
        new RegExp(`serving\\s*size[^\\n(]{0,30}\\(\\s*${num}\\s*(g|ml)\\s*\\)`, "i"),
        new RegExp(`per\\s*(?:serving|portion)\\s*\\(\\s*${num}\\s*(g|ml)\\s*\\)`, "i"),
        new RegExp(`(?:serving|portion)\\s*[:\\-]\\s*${num}\\s*(g|kg|ml|l)\\b`, "i"),
    ];

    for (const pattern of patterns) {
        const match = normalized.match(pattern);

        if (match) {
            let value = normalizeNumber(match[1]);
            let unit = match[2].toLowerCase();

            if (unit === "kg") {
                value *= 1000;
                unit = "g";
            } else if (unit === "l") {
                value *= 1000;
                unit = "ml";
            }

            return { value, unit };
        }
    }

    return { value: null, unit: null };
}

/* ------------------------------------------------------------------ */
/* Token parsing                                                      */
/* ------------------------------------------------------------------ */

function canonicalUnit(raw) {
    const s = String(raw || "")
        .toLowerCase()
        .replace(/[^a-zµμ1]/g, "");

    if (!s) {
        return "";
    }

    if (s === "g" || s === "gr" || s === "gm") return "g";
    if (s === "mg") return "mg";
    if (["µg", "μg", "ug", "mcg"].includes(s)) return "ug";
    if (s === "kj") return "kj";
    if (s === "ml") return "ml";
    if (s === "kcal" || s === "cal" || /^k[ce]{1,2}a[l1i]$/.test(s)) {
        return "kcal";
    }

    return null; // unknown unit
}

/**
 * Parse a token as a quantity.
 * Returns null when it is not numeric at all.
 * Reference-intake tokens such as "(7%)" are returned as { ri: true }.
 */
function parseQuantityToken(raw) {
    let t = String(raw || "").trim();

    if (!t) {
        return null;
    }

    if (t.includes("%") || t.startsWith("(")) {
        return { ri: true };
    }

    t = t
        .replace(/\(.*$/, "")
        .replace(/^[|~_:*\-–—¥•]+/, "")
        .replace(/[|~_:*,;\])]+$/, "");

    const m = t.match(/^(\d+(?:[.,]\d+)?)\s*([A-Za-zµμ1]{0,5})$/);

    if (!m) {
        return null;
    }

    let numText = m[1];
    let rawUnit = m[2];
    let unitRecovered = false;

    // OCR often reads the trailing "g" of "3.4g" / "0.06g" as "9"
    // ("3.49", "0.069"). A decimal number with NO unit that ends in 9
    // is read as "<number without the 9> g". Cross-column consistency
    // and plausibility checks still apply afterwards.
    if (
        !rawUnit &&
        /^\d+[.,]\d*9$/.test(numText) &&
        /^\d+[.,]\d+$/.test(numText.slice(0, -1))
    ) {
        numText = numText.slice(0, -1);
        rawUnit = "g";
        unitRecovered = true;
    }

    const intPart = numText.split(/[.,]/)[0];
    const unit = canonicalUnit(rawUnit);

    // "006", "020": a dropped decimal point, cannot be trusted.
    const leadingZero = /^0\d/.test(intPart);

    return {
        ri: false,
        number: Number(numText.replace(",", ".")),
        hasDecimal: /[.,]\d/.test(numText),
        unitRecovered,
        unit: unit || "",
        unitUnknown: unit === null,
        invalid: leadingZero || unit === null,
        invalidReason: leadingZero
            ? "leading-zero"
            : unit === null
            ? "unknown-unit"
            : null,
    };
}

/* ------------------------------------------------------------------ */
/* Rows from words                                                    */
/* ------------------------------------------------------------------ */

function prepareWords(words) {
    const out = [];

    for (const w of words || []) {
        const text = String(w?.text ?? "").trim();
        const b = w?.bbox;

        if (!text || !b) {
            continue;
        }

        const x0 = Number(b.x0);
        const y0 = Number(b.y0);
        const x1 = Number(b.x1);
        const y1 = Number(b.y1);

        if (![x0, y0, x1, y1].every(Number.isFinite)) {
            continue;
        }

        out.push({
            text,
            conf: Number.isFinite(Number(w.confidence))
                ? Number(w.confidence)
                : null,
            x0,
            y0,
            x1,
            y1,
            xc: (x0 + x1) / 2,
            yc: (y0 + y1) / 2,
        });
    }

    return out;
}

// Plain text -> synthetic words (x = character offset, y = line index).
function wordsFromText(text) {
    const out = [];

    normalizeText(text)
        .split("\n")
        .forEach((line, index) => {
            const re = /\S+/g;
            let m;

            while ((m = re.exec(line)) !== null) {
                const x0 = m.index;
                const x1 = m.index + m[0].length;
                const y0 = index * 20;
                const y1 = y0 + 16;

                out.push({
                    text: m[0],
                    conf: null,
                    x0,
                    y0,
                    x1,
                    y1,
                    xc: (x0 + x1) / 2,
                    yc: (y0 + y1) / 2,
                });
            }
        });

    return out;
}

// "1822kJ/436kcal" -> two tokens
// "/100g/32g/(%**)"  -> "/100g", "/32g" (reference-intake part dropped)
function splitGlued(word) {
    if (!word.text.includes("/")) {
        return [word];
    }

    const rawParts = word.text.split("/");
    const isAmount = (p) =>
        /^\d+(?:[.,]\d+)?[A-Za-z1µμ]{1,5}$/.test(p.replace(/[()|]/g, ""));
    const isRi = (p) => /%/.test(p);

    const nonEmpty = rawParts.filter((p) => p !== "");
    const amounts = nonEmpty.filter(isAmount);
    const allKnown = nonEmpty.every((p) => isAmount(p) || isRi(p));
    const headerLike = rawParts[0] === "" || nonEmpty.some(isRi);

    if (!allKnown || amounts.length < 2 || nonEmpty.length < 2) {
        return [word];
    }

    const total = word.text.length;
    const width = word.x1 - word.x0;
    const out = [];
    let offset = 0;

    for (const p of rawParts) {
        const start = offset;

        offset += p.length + 1;

        if (!isAmount(p)) {
            continue;
        }

        const x0 = word.x0 + (start / total) * width;
        const x1 = word.x0 + ((start + p.length) / total) * width;

        out.push({
            ...word,
            text: headerLike ? "/" + p : p,
            x0,
            x1,
            xc: (x0 + x1) / 2,
        });
    }

    return out;
}

function mergeNumberUnit(tokens, H) {
    const out = [];

    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        const next = tokens[i + 1];

        if (
            next &&
            /^\d+(?:[.,]\d+)?$/.test(t.text) &&
            next.text.length <= 5 &&
            ["g", "mg", "ug", "kcal", "kj", "ml"].includes(
                canonicalUnit(next.text) || ""
            ) &&
            next.x0 - t.x1 < 2 * H
        ) {
            out.push({
                ...t,
                text: t.text + next.text,
                x1: next.x1,
                xc: (t.x0 + next.x1) / 2,
                conf:
                    t.conf !== null && next.conf !== null
                        ? Math.min(t.conf, next.conf)
                        : t.conf ?? next.conf,
            });

            i++;
        } else {
            out.push(t);
        }
    }

    return out;
}

function buildRows(words, H) {
    const sorted = [...words].sort((a, b) => a.yc - b.yc);
    const rows = [];

    for (const w of sorted) {
        const last = rows[rows.length - 1];

        if (last && Math.abs(w.yc - last.yc) <= 0.6 * H) {
            last.tokens.push(w);
            last.yc =
                last.tokens.reduce((s, t) => s + t.yc, 0) /
                last.tokens.length;
        } else {
            rows.push({ yc: w.yc, tokens: [w] });
        }
    }

    return rows.map((row, index) => {
        let tokens = row.tokens.sort((a, b) => a.x0 - b.x0);

        tokens = tokens.flatMap(splitGlued);
        tokens = mergeNumberUnit(tokens, H);

        tokens = tokens.map((t) => ({
            ...t,
            q: parseQuantityToken(t.text),
        }));

        return { index, yc: row.yc, tokens };
    });
}

/* ------------------------------------------------------------------ */
/* Labels                                                             */
/* ------------------------------------------------------------------ */

function classifyLabel(lc) {
    if (!lc) return null;

    if (/added/.test(lc)) return "other";
    if (/(mono|poly|un)sat|trans|omega|cholest/.test(lc)) return "other";
    if (/caloriesfrom/.test(lc)) return "other";

    if (fuzzyHas(lc, "saturat", 1)) return "saturatedFat";
    if (fuzzyHas(lc, "sugar", 1)) return "sugar";
    if (fuzzyHas(lc, "carbohydrate", 2) || /carb/.test(lc)) {
        return "carbohydrates";
    }
    if (fuzzyHas(lc, "protein", 1)) return "protein";
    if (fuzzyHas(lc, "fibre", 1) || fuzzyHas(lc, "fiber", 1)) return "fiber";
    if (fuzzyHas(lc, "sodium", 1)) return "sodium";
    if (/^salt/.test(lc)) return "salt";
    if (/^(total)?fats?$/.test(lc) || /^totalfat/.test(lc)) return "totalFat";
    if (/^(energy|calorie|kcal)/.test(lc)) return "energy";

    return null;
}

function annotateRow(row) {
    const tokens = row.tokens;

    let firstAlpha = false;
    let split = tokens.length;

    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];

        if (t.q && !t.q.ri) {
            // A stray unit-less number before any label text
            // (e.g. "3 Carbohydrate") is label noise, not a value.
            if (t.q.unit || firstAlpha || t.q.hasDecimal) {
                split = i;
                break;
            }

            continue;
        }

        if (t.text.replace(/[^A-Za-z]/g, "").length >= 3) {
            firstAlpha = true;
        }
    }

    const labelText = tokens
        .slice(0, split)
        .map((t) => t.text)
        .join(" ");

    const hintMatch =
        labelText.match(/\(\s*(g|mg|kcal)\s*\)/i) ||
        labelText.match(/\s(g|mg)\s*$/i);

    const lc = lettersOnly(
        labelText.replace(/\(\s*(?:g|mg|kcal|kj|ml)\s*\)/gi, "")
    );

    row.labelText = labelText;
    row.lc = lc;
    row.key = classifyLabel(lc);
    row.hintUnit = hintMatch ? canonicalUnit(hintMatch[1]) : null;

    if (/^calorie/.test(lc) && !row.hintUnit) {
        row.hintUnit = "kcal";
    }

    row.values = tokens.slice(split).filter((t) => t.q && !t.q.ri);
    row.kcalTokens = row.values.filter((t) => t.q.unit === "kcal");

    return row;
}

/* ------------------------------------------------------------------ */
/* Columns                                                            */
/* ------------------------------------------------------------------ */

const HEADER_VOCAB = new Set([
    "nutrition",
    "nutritional",
    "information",
    "info",
    "facts",
    "typical",
    "values",
    "average",
    "avg",
    "per",
    "serving",
    "portion",
    "amount",
    "each",
    "composition",
    "analysis",
]);

const AMOUNT_HEADER =
    /^[\/~|\-\s]*(per)?[\/~\-\s]*\(?(\d+(?:[.,]\d+)?)\s*(g|ml|gr)\)?[^\w]*$/i;

/**
 * Corrupted header recovery.
 *
 * OCR can turn "/100g" into "11009" and "/32g" into "[329/(%*)]":
 * the "/" becomes "1" or "[", and the "g" becomes "9" (or "q").
 *
 * Only these exact targets are recognised, so nothing is guessed:
 *   - 100 (g or ml), and
 *   - the serving size explicitly detected elsewhere in the text.
 * Returns { amount, unit, matchedLength } or null.
 */
function matchCorruptedAmount(text, servingSize) {
    const targets = [
        { amount: 100, units: ["g", "ml"] },
    ];

    if (servingSize && servingSize.value !== null) {
        targets.push({
            amount: servingSize.value,
            units: [servingSize.unit],
        });
    }

    for (const target of targets) {
        const digits = String(target.amount).replace(/\./g, "[.,]");

        for (const unit of target.units) {
            const unitPattern = unit === "g" ? "[gq9]" : "(?:ml|m1|mi)";

            const re = new RegExp(
                `^[^\\w]*[1lI|!]?\\s*(${digits})\\s*${unitPattern}(?![0-9])`,
                "i"
            );

            const m = text.match(re);

            if (m) {
                return {
                    amount: target.amount,
                    unit,
                    matchedLength: m[0].length,
                };
            }
        }
    }

    return null;
}

/**
 * Pick the one header row (plus rows directly beside it) that really is
 * the nutrition table header. False-positive protection:
 *  - corrupted tokens such as "11009" / "[329/(%*)]" are only accepted in
 *    a row that contains a header word (Nutrition, Information, Typical)
 *    or that has at least two column candidates;
 *  - a header must have keyed nutrient rows with values below it.
 */
function chooseHeaderGroup(columns, rows, rowVocab, H) {
    const byRow = new Map();

    for (const c of columns) {
        if (!byRow.has(c.rowIndex)) byRow.set(c.rowIndex, []);
        byRow.get(c.rowIndex).push(c);
    }

    const groups = [];

    for (const [r, cols] of byRow) {
        const kept = cols.filter(
            (c) => !c.corrupted || rowVocab.get(r) || cols.length >= 2
        );

        if (!kept.length) continue;

        let dataBelow = 0;

        for (let i = r + 1; i < Math.min(rows.length, r + 15); i++) {
            if (rows[i].key && rows[i].key !== "other" && rows[i].values.length) {
                dataBelow++;
            }
        }

        if (!dataBelow) continue;

        const distinct = new Set(kept.map((c) => `${c.kind}:${c.amount}:${c.basis}`));

        groups.push({
            r,
            cols: kept,
            score: distinct.size * 2 + (rowVocab.get(r) ? 1 : 0) + Math.min(dataBelow, 3),
        });
    }

    if (!groups.length) {
        return [];
    }

    groups.sort((a, b) => b.score - a.score || a.r - b.r);

    const best = groups[0];

    return groups
        .filter((g) => Math.abs(rows[g.r].yc - rows[best.r].yc) <= 2 * H)
        .flatMap((g) => g.cols);
}

function detectColumns(rows, dataStart, H, mode, servingSize) {
    let columns = [];

    // Coordinate mode scans the WHOLE page for header rows. A photo can
    // contain ingredient text above the table, so "first row that looks
    // like data" is not a reliable place to start looking for the header.
    // Text-order mode keeps the original "rows just above the data" window.
    const global = mode === "coordinates";

    if (!global && dataStart <= 0) {
        return columns;
    }

    const from = global ? 0 : Math.max(0, dataStart - 5);
    const to = global ? rows.length : dataStart;
    const rowVocab = new Map();

    for (let r = from; r < to; r++) {
        const row = rows[r];

        rowVocab.set(
            r,
            row.tokens.some((t) => {
                const l = lettersOnly(t.text);

                return (
                    l.length >= 6 &&
                    (fuzzyHas(l, "nutrition", 2) ||
                        fuzzyHas(l, "information", 2) ||
                        fuzzyHas(l, "typical", 1))
                );
            })
        );

        const vocabOnly = row.tokens.every((t) => {
            const letters = lettersOnly(t.text);

            if (!letters) return true;
            if (AMOUNT_HEADER.test(t.text)) return true;

            return HEADER_VOCAB.has(letters);
        });

        row.tokens.forEach((t, i) => {
            const prev = row.tokens[i - 1];
            const prevLetters = prev ? lettersOnly(prev.text) : "";

            let m = t.text.match(AMOUNT_HEADER);
            let slashMisread = false;

            // OCR often reads the "/" of "/32g" as "1", "l", "I" or "|"
            // ("132g", "l32g"). Only repaired when the label itself states
            // that exact serving size, so nothing is guessed.
            if (servingSize && servingSize.value !== null) {
                const sv = String(servingSize.value);
                const loose = t.text.match(
                    /^([1lI|!])\s*(\d+(?:[.,]\d+)?)\s*(g|ml)\b[^\w]*$/i
                );

                if (
                    loose &&
                    normalizeNumber(loose[2]) === servingSize.value &&
                    loose[3].toLowerCase() === servingSize.unit
                ) {
                    m = [t.text, undefined, loose[2], loose[3]];
                    slashMisread = true;
                } else if (
                    m &&
                    normalizeNumber(m[2]) !== servingSize.value &&
                    /^1/.test(m[2]) &&
                    m[2].slice(1) === sv &&
                    m[3].toLowerCase().startsWith(servingSize.unit)
                ) {
                    m = [t.text, m[1], sv, m[3]];
                    slashMisread = true;
                }
            }

            // Heavily corrupted header such as "11009" or "[329/(%*)]".
            // Only the explicitly detected serving size (or 100) is accepted.
            if (!m && prevLetters !== "size") {
                const corrupted = matchCorruptedAmount(t.text, servingSize);

                if (corrupted) {
                    // Use only the matched part of the token for X, so a
                    // glued "/(%*)]" suffix does not shift the column.
                    const width = t.x1 - t.x0;
                    const x1 =
                        t.x0 +
                        width * (corrupted.matchedLength / t.text.length);

                    columns.push({
                        kind: "amount",
                        amount: corrupted.amount,
                        unit: corrupted.unit,
                        raw: t.text,
                        corrupted: true,
                        rowIndex: r,
                        x0: t.x0,
                        x1,
                        xc: (t.x0 + x1) / 2,
                    });

                    return;
                }
            }

            if (m) {
                const beforeDigits = t.text.slice(0, t.text.search(/\d/));
                const attached = /\//.test(beforeDigits) || !!m[1];
                const afterPer = prevLetters === "per" || (prev && /^\/$/.test(prev.text));
                const afterServing =
                    (prevLetters === "serving" || prevLetters === "portion") &&
                    t.text.includes("(");

                if (attached || afterPer || afterServing || vocabOnly || slashMisread) {
                    columns.push({
                        kind: "amount",
                        amount: normalizeNumber(m[2]),
                        unit: m[3].toLowerCase().startsWith("g") ? "g" : "ml",
                        raw: t.text,
                        slashMisread,
                        rowIndex: r,
                        x0: t.x0,
                        x1: t.x1,
                        xc: t.xc,
                    });
                }

                return;
            }

            if (prevLetters === "per") {
                const w = lettersOnly(t.text).replace(/s$/, "");

                let word = null;

                if (w === "serving" || w === "portion") word = "per-serving";
                else if (
                    ["piece", "slice", "bar", "biscuit", "cookie"].includes(w)
                ) {
                    word = "per-piece";
                }

                if (word) {
                    columns.push({
                        kind: "word",
                        basis: word,
                        raw: `per ${t.text}`,
                        rowIndex: r,
                        x0: t.x0,
                        x1: t.x1,
                        xc: t.xc,
                    });
                }
            }
        });
    }

    if (global) {
        columns = chooseHeaderGroup(columns, rows, rowVocab, H);
    }

    // "Per serving (32g)": merge the word column into the amount column.
    const merged = columns.filter((c) => {
        if (c.kind !== "word") return true;

        const partner = columns.find(
            (a) =>
                a.kind === "amount" &&
                a.amount !== 100 &&
                a.rowIndex === c.rowIndex &&
                a.x0 >= c.x0 &&
                a.x0 - c.x1 < 4 * H
        );

        if (partner) {
            partner.word = c.basis;
            return false;
        }

        return true;
    });

    // Remove duplicates (same label at nearly the same position).
    const unique = [];

    for (const c of merged) {
        const dup = unique.find(
            (u) =>
                u.kind === c.kind &&
                u.amount === c.amount &&
                u.basis === c.basis &&
                (mode === "coordinates"
                    ? Math.abs(u.xc - c.xc) < 2 * H
                    : u.rowIndex === c.rowIndex && Math.abs(u.xc - c.xc) < 2)
        );

        if (!dup) {
            unique.push(c);
        }
    }

    unique.sort((a, b) =>
        mode === "coordinates"
            ? a.xc - b.xc
            : a.rowIndex - b.rowIndex || a.xc - b.xc
    );

    return unique;
}

// No usable layout: accept a single basis stated in the text.
function columnsFromTextOnly(text) {
    const found = [];

    if (/\b(?:per\s*)?\/?\s*100\s*g\b/i.test(text)) {
        found.push({ kind: "amount", amount: 100, unit: "g", raw: "100g", xc: null });
    }

    if (/\b(?:per\s*)?\/?\s*100\s*ml\b/i.test(text)) {
        found.push({ kind: "amount", amount: 100, unit: "ml", raw: "100ml", xc: null });
    }

    if (/\bper\s*(serving|portion)\b/i.test(text)) {
        found.push({ kind: "word", basis: "per-serving", raw: "per serving", xc: null });
    }

    if (/\bper\s*(piece|slice|bar|biscuit|cookie)\b/i.test(text)) {
        found.push({ kind: "word", basis: "per-piece", raw: "per piece", xc: null });
    }

    return found.length === 1 ? found : [];
}

function selectColumn(columns, servingSize) {
    if (!columns.length) {
        return null;
    }

    const isPer100 = (c) => c.kind === "amount" && c.amount === 100;

    // 1. Amount column equal to the stated serving size.
    if (servingSize.value !== null) {
        const match = columns.find(
            (c) =>
                c.kind === "amount" &&
                !isPer100(c) &&
                c.amount === servingSize.value &&
                c.unit === servingSize.unit
        );

        if (match) {
            return {
                column: match,
                basis: "per-serving",
                amount: match.amount,
                unit: match.unit,
                reason: "amount column equals serving size",
            };
        }
    }

    // 2. A "per serving / per portion / per piece" column.
    const words = columns.filter(
        (c) => c.kind === "word" || (c.kind === "amount" && c.word)
    );

    if (words.length === 1) {
        const c = words[0];
        const basis = c.kind === "word" ? c.basis : c.word;

        return {
            column: c,
            basis,
            amount: c.kind === "amount" ? c.amount : servingSize.value,
            unit: c.kind === "amount" ? c.unit : servingSize.unit,
            reason: "serving-word column",
        };
    }

    // 3. A single non-100 amount column and no stated serving size.
    const others = columns.filter((c) => c.kind === "amount" && !isPer100(c));

    if (others.length === 1 && servingSize.value === null) {
        return {
            column: others[0],
            basis: "per-serving",
            amount: others[0].amount,
            unit: others[0].unit,
            reason: "single explicit amount column",
        };
    }

    // 4. Per 100g / 100ml.
    const per100 = columns.find(isPer100);

    if (per100) {
        return {
            column: per100,
            basis: per100.unit === "ml" ? "per-100ml" : "per-100g",
            amount: 100,
            unit: per100.unit,
            reason: "per-100 column",
        };
    }

    return null;
}

/* ------------------------------------------------------------------ */
/* Assigning values to columns                                        */
/* ------------------------------------------------------------------ */

const CONFLICT = Symbol("conflict");

function assignToColumns(tokens, columns, mode, H) {
    const result = new Array(columns.length).fill(null);

    if (!tokens.length || !columns.length) {
        return result;
    }

    // Columns without coordinates: single column, single value only.
    if (columns.every((c) => c.xc === null || c.xc === undefined)) {
        if (columns.length === 1 && tokens.length === 1) {
            result[0] = tokens[0];
        }

        return result;
    }

    if (mode === "text-order") {
        if (tokens.length === columns.length) {
            tokens.forEach((t, i) => {
                result[i] = t;
            });
        }

        return result;
    }

    // coordinates
    let tol;

    if (columns.length > 1) {
        let spacing = Infinity;

        for (let i = 1; i < columns.length; i++) {
            spacing = Math.min(spacing, columns[i].xc - columns[i - 1].xc);
        }

        tol = 0.6 * spacing;
    } else {
        tol = Math.max(3 * H, columns[0].x1 - columns[0].x0);
    }

    for (const t of tokens) {
        const dists = columns
            .map((c, i) => ({ i, d: Math.abs(t.xc - c.xc) }))
            .sort((a, b) => a.d - b.d);

        const best = dists[0];
        const second = dists[1];

        if (best.d > tol) continue;
        if (second && best.d / (second.d || 1) > 0.8) continue;

        result[best.i] =
            result[best.i] === null ? t : CONFLICT;
    }

    return result.map((r) => (r === CONFLICT ? null : r));
}

function resolveValue(key, token, hintUnit) {
    const q = token?.q;

    if (!q || q.ri || q.invalid) {
        return null;
    }

    if (
        token.conf !== null &&
        token.conf !== undefined &&
        token.conf < MIN_NUMERIC_CONFIDENCE
    ) {
        return null;
    }

    let unit = q.unit || hintUnit || null;

    // Protein, fat, saturates, carbohydrate, sugars, fibre and salt are
    // always printed in grams. A bare decimal ("6.5") whose "g" was lost
    // to OCR is therefore read as grams. Calories and sodium never are.
    if (
        !unit &&
        q.hasDecimal &&
        ["protein", "carbohydrates", "totalFat", "saturatedFat", "sugar", "fiber", "salt"].includes(key)
    ) {
        unit = "g";
    }

    if (!unit) {
        return null;
    }

    const n = q.number;

    switch (key) {
        case "calories":
            return unit === "kcal" ? n : null;

        case "sodium":
            if (unit === "mg") return n;
            if (unit === "g") return round3(n * 1000);
            return null;

        case "salt":
            if (unit === "g") return n;
            if (unit === "mg") return round3(n / 1000);
            return null;

        default:
            return unit === "g" ? n : null;
    }
}

function plausible(key, value, amount, unit) {
    if (value === null) return false;
    if (!Number.isFinite(value) || value < 0) return false;

    const hasAmount = amount !== null && amount !== undefined &&
        (unit === "g" || unit === "ml");

    const scale = hasAmount ? amount / 100 : null;

    switch (key) {
        case "calories":
            return value <= (scale ? 1000 * scale + 5 : 5000);

        case "sodium":
            return value <= (scale ? 40000 * scale : 40000);

        case "salt":
            return value <= (scale ? 100 * scale + 0.5 : 100);

        default:
            return value <= (scale ? 100 * scale + 0.5 : 1000);
    }
}

function decimalStep(v) {
    if (Number.isInteger(v)) return 1;

    const decimals = (String(v).split(".")[1] || "").length;

    return Math.pow(10, -decimals);
}

/* ------------------------------------------------------------------ */
/* Dropped-decimal repair (serving value paired with its per-100 value) */
/* ------------------------------------------------------------------ */

const GRAM_KEYS = [
    "protein",
    "carbohydrates",
    "totalFat",
    "saturatedFat",
    "sugar",
    "fiber",
    "salt",
];

/**
 * OCR frequently drops the decimal point and misreads "g":
 *   "3.4g" -> "34g" / "349",  "0.06g" -> "006g",  "5.0g" -> "50g".
 * Returns every plausible numeric reading of a token with a cost
 * (0 = most literal reading, higher = more OCR damage assumed).
 */
function readingCandidates(tok) {
    const raw = String(tok?.text || "")
        .replace(/\(.*$/, "")
        .replace(/^[|~_:*\-–—¥•]+/, "")
        .replace(/[|~_:*,;\])]+$/, "");

    const m = raw.match(/^(\d+(?:[.,]\d+)?)\s*([A-Za-z1µμ]{0,3})$/);

    if (!m) {
        return [];
    }

    const num = m[1].replace(",", ".");
    const unit = m[2].toLowerCase();

    if (unit && !["g", "q", "gr"].includes(unit)) {
        return [];
    }

    const bases = [];

    if (unit) {
        bases.push({ s: num, c: 0 });
    } else if (num.includes(".")) {
        bases.push({ s: num, c: 0 });

        if (num.endsWith("9") && /^\d+\.\d+$/.test(num.slice(0, -1))) {
            bases.push({ s: num.slice(0, -1), c: 0 });
        }
    } else {
        // Unit-less integer: only readable when its last digit is the
        // "g" misread as "9" ("349" -> 34g). Anything else is a guess.
        if (num.length >= 3 && num.endsWith("9")) {
            bases.push({ s: num.slice(0, -1), c: 1 });
        }
    }

    const byValue = new Map();

    const add = (value, cost) => {
        if (!Number.isFinite(value) || value < 0) return;

        const prev = byValue.get(value);

        if (prev === undefined || cost < prev) {
            byValue.set(value, cost);
        }
    };

    for (const { s: base, c } of bases) {
        if (base.includes(".")) {
            add(Number(base), c);
        } else if (base.length > 1 && base[0] === "0") {
            // "006" / "020": always a dropped point after the leading 0.
            add(Number("0." + base.slice(1)), c);
        } else {
            add(Number(base), c);

            for (let p = 1; p < base.length; p++) {
                add(Number(base.slice(0, p) + "." + base.slice(p)), c + 1);
            }
        }
    }

    return [...byValue.entries()].map(([value, cost]) => ({ value, cost }));
}

/**
 * Pick the target reading that agrees with the per-100 reading at the
 * serving ratio. Returns null unless exactly one cheapest pair exists.
 */
function repairWithReference(targetTok, refTok, ratio, maxTarget, maxRef) {
    if (!targetTok || !refTok || !ratio) {
        return null;
    }

    for (const t of [targetTok, refTok]) {
        if (t.conf !== null && t.conf !== undefined && t.conf < MIN_NUMERIC_CONFIDENCE) {
            return null;
        }
    }

    const targets = readingCandidates(targetTok);
    const refs = readingCandidates(refTok);
    const pairs = [];

    for (const r of refs) {
        if (r.value > maxRef) continue;

        for (const t of targets) {
            if (t.value > maxTarget) continue;

            const expected = r.value * ratio;
            const tolerance = 0.15 * expected + 0.06;

            if (Math.abs(t.value - expected) <= tolerance) {
                pairs.push({ value: t.value, cost: t.cost + r.cost });
            }
        }
    }

    if (!pairs.length) {
        return null;
    }

    const min = Math.min(...pairs.map((p) => p.cost));
    const best = new Set(pairs.filter((p) => p.cost === min).map((p) => p.value));

    return best.size === 1 ? [...best][0] : null;
}

/* ------------------------------------------------------------------ */
/* Validation                                                         */
/* ------------------------------------------------------------------ */

function validateNutrition(nutrition) {
    const result = {};

    for (const key of NUTRIENT_KEYS) {
        const v = nutrition?.[key];

        result[key] =
            v === null || v === undefined || !Number.isFinite(v) || v < 0
                ? null
                : v;
    }

    if (
        result.saturatedFat !== null &&
        result.totalFat !== null &&
        result.saturatedFat > result.totalFat
    ) {
        result.saturatedFat = null;
    }

    if (
        result.sugar !== null &&
        result.carbohydrates !== null &&
        result.sugar > result.carbohydrates
    ) {
        result.sugar = null;
    }

    return result;
}

/**
 * Physical sanity check. Fat + carbohydrate + protein + fibre + salt
 * can never weigh more than the amount they were measured in (a 32g bar
 * cannot hold 52g of them). When the set is impossible and removing
 * exactly ONE nutrient makes it possible, that nutrient (a value whose
 * decimal point was lost, e.g. "2.6g" read as "26g") is set to null.
 * If no single removal resolves it, nothing is changed.
 */
function enforceMassBudget(nutrition, amount, unit, warnings) {
    if (!nutrition || unit !== "g" || !Number.isFinite(amount) || amount <= 0) {
        return nutrition;
    }

    const keys = ["totalFat", "carbohydrates", "protein", "fiber", "salt"];
    const present = keys.filter((k) => nutrition[k] !== null && nutrition[k] !== undefined);
    const total = present.reduce((sum, k) => sum + nutrition[k], 0);
    const limit = amount * 1.03 + 0.5;

    if (total <= limit) {
        return nutrition;
    }

    const fixers = present.filter((k) => total - nutrition[k] <= limit);

    if (fixers.length !== 1) {
        return nutrition;
    }

    if (Array.isArray(warnings)) {
        warnings.push(
            `${fixers[0]} (${nutrition[fixers[0]]}g) exceeds what ${amount}g can hold; value discarded`
        );
    }

    return { ...nutrition, [fixers[0]]: null };
}

/* ------------------------------------------------------------------ */
/* Core analysis                                                      */
/* ------------------------------------------------------------------ */

function emptyNutrition() {
    const n = {};

    for (const key of NUTRIENT_KEYS) {
        n[key] = null;
    }

    return n;
}

function analyze(rawWords, mode, servingSizeDetected, fullText) {
    const warnings = [];
    const rejected = [];
    const matchedRows = {};

    const heights = rawWords
        .filter((w) => w.text.replace(/[^A-Za-z0-9]/g, "").length >= 2)
        .map((w) => w.y1 - w.y0);

    const H = median(heights) || 16;

    const rows = buildRows(rawWords, H).map(annotateRow);

    // A label with no values followed by a value-only row (OCR split).
    for (let i = 0; i < rows.length - 1; i++) {
        const row = rows[i];
        const next = rows[i + 1];

        if (
            row.key &&
            row.key !== "other" &&
            row.values.length === 0 &&
            !next.key &&
            next.values.length > 0 &&
            next.yc - row.yc <= 2.5 * H
        ) {
            row.values = next.values;
            row.kcalTokens = next.kcalTokens;
            next.values = [];
            next.kcalTokens = [];
        }
    }

    // Fat / saturates labels sit on the dark part of many tables and are
    // often unreadable while their numbers are fine. Regulated EU/UK
    // tables always list: Energy, Fat, of which saturates, Carbohydrate.
    // When exactly two (or one, directly above a keyed saturates row)
    // UNLABELLED value rows sit between the kcal row and the first
    // Carbohydrate/sugars row, they are Fat / Saturates. Every inferred
    // value still passes column, plausibility and sat <= fat checks.
    const inferredRows = [];

    // Positional templates for the standard UK/EU order. Applied only
    // when the number of table rows matches a template exactly AND every
    // row whose label WAS read agrees with the template position (at
    // least two must agree). Only unlabelled rows are filled.
    {
        const TEMPLATES = [
            ["totalFat", "saturatedFat", "carbohydrates", "sugar", "fiber", "protein", "salt"],
            ["totalFat", "saturatedFat", "carbohydrates", "sugar", "protein", "salt"],
        ];

        const isEnergy = (r) =>
            r.kcalTokens.length > 0 ||
            r.key === "energy" ||
            r.tokens.some((t) => t.q && !t.q.ri && t.q.unit === "kj");

        const first = rows.findIndex(isEnergy);

        if (first >= 0) {
            let start = first;

            while (start + 1 < rows.length && isEnergy(rows[start + 1])) {
                start++;
            }

            const block = [];
            let prev = rows[start];

            for (let i = start + 1; i < rows.length; i++) {
                const r = rows[i];
                const keyed = r.key && r.key !== "other";
                const sentence = !keyed && r.lc.length >= 8;

                if (sentence || r.yc - prev.yc > 3.2 * H) {
                    break;
                }

                // OCR noise rows ("a", "|") carry no label and no value.
                if (!keyed && r.values.length === 0) {
                    continue;
                }

                block.push(r);
                prev = r;
            }

            // Regulation (EU) 1169/2011 Annex XV fixes the order
            // Energy -> Fat -> of which saturates -> Carbohydrate ...
            // so the first unlabelled value row directly below the
            // energy rows is Fat, provided later rows confirm the table
            // (some other nutrient label was read) and no row was
            // skipped between them.
            if (
                block.length > 1 &&
                !block.some((r) => r.key === "totalFat") &&
                !rows.some((r) => r.key === "totalFat" && r.values.length > 0) &&
                (!block[0].key || block[0].key === "other") &&
                block[0].yc - rows[start].yc <= 2.0 * H &&
                block.slice(1).some((r) => r.key && r.key !== "other")
            ) {
                block[0].key = "totalFat";
                block[0].inferred = true;
                inferredRows.push("totalFat");
            }

            const template = TEMPLATES.find((t) => t.length === block.length);

            if (template) {
                const labelled = block.filter((r) => r.key && r.key !== "other" && !r.inferred);
                const agree = labelled.filter((r) => r.key === template[block.indexOf(r)]);

                if (labelled.length >= 2 && agree.length === labelled.length) {
                    block.forEach((r, i) => {
                        if (!r.key || r.key === "other" || r.inferred) {
                            r.key = template[i];
                            r.inferred = true;
                            inferredRows.push(template[i]);
                        }
                    });
                }
            }
        }
    }

    {
        const kcalIdx = rows.findIndex((r) => r.kcalTokens.length > 0);
        const carbIdx = rows.findIndex(
            (r, i) => i > kcalIdx && r.key === "carbohydrates" && r.values.length > 0
        );

        if (kcalIdx >= 0 && carbIdx > kcalIdx) {
            const between = [];

            for (let i = kcalIdx + 1; i < carbIdx; i++) {
                const r = rows[i];

                if (r.values.length > 0 && (!r.key || r.key === "other")) {
                    between.push(r);
                }
            }

            const hasFat = rows.some((r) => r.key === "totalFat" && r.values.length > 0);
            const satRow = rows.find(
                (r, i) => i > kcalIdx && i < carbIdx && r.key === "saturatedFat" && r.values.length > 0
            );

            if (between.length === 2 && !hasFat && !satRow) {
                between[0].key = "totalFat";
                between[1].key = "saturatedFat";
                inferredRows.push("totalFat", "saturatedFat");
            } else if (between.length === 1 && !hasFat && satRow && rows.indexOf(between[0]) < rows.indexOf(satRow)) {
                between[0].key = "totalFat";
                inferredRows.push("totalFat");
            } else if (between.length === 1 && hasFat && !satRow && rows.indexOf(between[0]) > rows.findIndex((r) => r.key === "totalFat")) {
                between[0].key = "saturatedFat";
                inferredRows.push("saturatedFat");
            }
        }
    }

    let dataStart = rows.findIndex(
        (r) => (r.key && r.key !== "other") || r.kcalTokens.length > 0
    );

    if (dataStart < 0) {
        dataStart = 0;
    }

    let columns = detectColumns(rows, dataStart, H, mode, servingSizeDetected);

    if (!columns.length) {
        columns = columnsFromTextOnly(fullText);

        if (columns.length) {
            warnings.push("no header layout found; using single basis from text");
        }
    }

    const selection = selectColumn(columns, servingSizeDetected);

    const servingSize = { ...servingSizeDetected };

    const result = {
        nutritionBasis: null,
        servingSize,
        nutrition: emptyNutrition(),
        metadata: {
            mode,
            columns: columns.map((c) => ({
                kind: c.kind,
                raw: c.raw,
                amount: c.amount ?? null,
                unit: c.unit ?? null,
                xc: c.xc === undefined ? null : c.xc,
            })),
            selected: null,
            matchedRows,
            inferredRows,
            rejected,
            warnings,
            detectedColumns: columns.map((c) => ({
                basis:
                    c.basis ||
                    (c.amount === 100
                        ? c.unit === "ml" ? "per-100ml" : "per-100g"
                        : `per-${c.amount}${c.unit}`),
                raw: c.raw,
            })),
            basisSource: selection ? selection.reason : null,
        },
    };

    if (!selection) {
        warnings.push("no nutrition column could be identified");
        return result;
    }

    if (servingSize.value === null && selection.basis === "per-serving" &&
        selection.amount) {
        servingSize.value = selection.amount;
        servingSize.unit = selection.unit;
    }

    if (
        servingSizeDetected.value !== null &&
        selection.basis !== "per-serving"
    ) {
        warnings.push(
            `serving size ${servingSizeDetected.value}${servingSizeDetected.unit} ` +
            `was found but no matching column was detected; using ${selection.basis}`
        );
    }

    result.nutritionBasis = selection.basis;
    result.metadata.selected = {
        reason: selection.reason,
        basis: selection.basis,
        amount: selection.amount ?? null,
        unit: selection.unit ?? null,
    };

    const selIndex = columns.indexOf(selection.column);

    // Amount of each column, for plausibility and ratio checks.
    const columnAmount = columns.map((c, i) => {
        if (i === selIndex) {
            return { amount: selection.amount, unit: selection.unit };
        }

        if (c.kind === "amount") {
            return { amount: c.amount, unit: c.unit };
        }

        return { amount: null, unit: null };
    });

    const metadata_repaired = [];
    const columnValues = {};

    for (const key of NUTRIENT_KEYS) {
        let row = null;
        let tokens = [];

        if (key === "calories") {
            row = rows.find((r) => r.kcalTokens.length > 0);

            if (row) {
                tokens = row.kcalTokens;
            } else {
                row = rows.find(
                    (r) => /^calorie/.test(r.lc) && r.values.length > 0
                );

                tokens = row ? row.values : [];
            }
        } else {
            row = rows.find(
                (r) => r.key === key && r.values.length > 0
            );

            tokens = row ? row.values : [];
        }

        if (!row) {
            continue;
        }

        matchedRows[key] = row.labelText || "(no label, kcal unit)";

        const assigned = assignToColumns(tokens, columns, mode, H);

        const values = assigned.map((t, i) => {
            if (!t) return null;

            const v = resolveValue(key, t, row.hintUnit);

            if (v === null) {
                rejected.push({
                    key,
                    column: columns[i].raw,
                    token: t.text,
                    reason: t.q?.invalidReason || "no-unit-or-low-confidence",
                });
            }

            return v;
        });

        columnValues[key] = values;

        let target = values[selIndex] ?? null;

        if (
            target !== null &&
            !plausible(
                key,
                target,
                columnAmount[selIndex].amount,
                columnAmount[selIndex].unit
            )
        ) {
            rejected.push({
                key,
                column: columns[selIndex].raw,
                token: String(target),
                reason: "implausible",
            });

            target = null;
        }

        // Cross-column consistency: serving value ~= per100 value * ratio.
        if (target !== null) {
            const a = columnAmount[selIndex];

            for (let i = 0; i < columns.length; i++) {
                const o = columnAmount[i];

                if (
                    i === selIndex ||
                    values[i] === null ||
                    !a.amount ||
                    !o.amount ||
                    a.unit !== o.unit
                ) {
                    continue;
                }

                const ratio = a.amount / o.amount;
                const expected = values[i] * ratio;

                const tolerance =
                    0.2 * expected +
                    0.5 * decimalStep(target) +
                    0.5 * decimalStep(values[i]) * ratio;

                if (Math.abs(target - expected) > tolerance) {
                    rejected.push({
                        key,
                        column: columns[selIndex].raw,
                        token: String(target),
                        reason:
                            `inconsistent with ${columns[i].raw} ` +
                            `(${values[i]} x ${round3(ratio)} = ${round3(expected)})`,
                    });

                    target = null;
                    break;
                }
            }
        }

        // Decimal point lost to OCR ("34g", "006g", "50g"): resolve it
        // against the per-100 neighbour of the same row, never alone.
        if (target === null && GRAM_KEYS.includes(key) && assigned[selIndex]) {
            const sel = columnAmount[selIndex];
            const refIdx = columns.findIndex(
                (c, i) =>
                    i !== selIndex &&
                    c.kind === "amount" &&
                    c.amount === 100 &&
                    c.unit === sel.unit
            );

            if (refIdx >= 0 && assigned[refIdx] && sel.amount && sel.unit === "g") {
                const ratio = sel.amount / 100;

                // A sub-nutrient can never exceed its parent: saturates
                // <= fat, sugars <= carbohydrate. This stops "50g | 16"
                // (impossible) beating "5.0g | 1.6" when the decimal
                // point was lost. Parent bounds come from the same
                // columns when they were read.
                const parentKey = { saturatedFat: "totalFat", sugar: "carbohydrates" }[key];
                let maxTarget = 100 * ratio + 0.5;
                let maxRef = 100;

                if (parentKey) {
                    const parentRef = columnValues[parentKey]?.[refIdx];
                    const parentTarget = result.nutrition[parentKey];

                    if (parentRef !== null && parentRef !== undefined) {
                        maxRef = Math.min(maxRef, parentRef);
                    }

                    if (parentTarget !== null && parentTarget !== undefined) {
                        maxTarget = Math.min(maxTarget, parentTarget);
                    }
                }

                const fixed = repairWithReference(
                    assigned[selIndex],
                    assigned[refIdx],
                    ratio,
                    maxTarget,
                    maxRef
                );

                if (fixed !== null) {
                    target = fixed;
                    metadata_repaired.push(key);
                }
            }
        }

        result.nutrition[key] = target;
    }

    result.metadata.repairedDecimals = metadata_repaired;

    result.nutrition = enforceMassBudget(
        validateNutrition(result.nutrition),
        selection.amount,
        selection.unit,
        warnings
    );

    return result;
}

/* ------------------------------------------------------------------ */
/* Public API                                                         */
/* ------------------------------------------------------------------ */

function countFilled(result) {
    return NUTRIENT_KEYS.filter(
        (k) => result.nutrition[k] !== null
    ).length;
}

function parseNutrition(text, words, servingHint) {
    const normalizedText = normalizeText(text);
    let servingSize = detectServingSize(normalizedText);

    // A cropped table has no "Portion size: 32g" line of its own; the
    // serving size printed elsewhere on the pack (other OCR passes) is
    // used so corrupted headers such as "132g" resolve to "/32g".
    if (
        servingSize.value === null &&
        servingHint &&
        servingHint.value !== null &&
        servingHint.value !== undefined
    ) {
        servingSize = { value: servingHint.value, unit: servingHint.unit };
    }

    const coordWords = prepareWords(words);

    if (coordWords.length >= 8) {
        const withCoords = analyze(
            coordWords,
            "coordinates",
            servingSize,
            normalizedText
        );

        if (withCoords.nutritionBasis) {
            return withCoords;
        }

        const fallback = analyze(
            wordsFromText(normalizedText),
            "text-order",
            servingSize,
            normalizedText
        );

        fallback.metadata.warnings.push(
            "coordinate parsing found no column; used text-order fallback"
        );

        return fallback.nutritionBasis ? fallback : withCoords;
    }

    return analyze(
        wordsFromText(normalizedText),
        "text-order",
        servingSize,
        normalizedText
    );
}

function sameServing(a, b) {
    return a.value === b.value && a.unit === b.unit;
}

/**
 * Parse several OCR passes and merge them by voting.
 * passes = [{ name, text, words }]
 *
 * - Only passes that selected the same basis AND serving size are compared.
 * - Per nutrient the strictly most common value wins.
 * - A tie (e.g. two passes disagree) -> null. Never guess.
 */
function parseNutritionMultiPass(passes) {
    let servingHint = null;

    for (const p of passes || []) {
        const found = detectServingSize(normalizeText(p.text));

        if (found.value !== null) {
            servingHint = found;
            break;
        }
    }

    const results = (passes || []).map((p) => ({
        name: p.name || "pass",
        result: parseNutrition(p.text, p.words, servingHint),
    }));

    if (!results.length) {
        return parseNutrition("", []);
    }

    const primary = results
        .slice()
        .sort((a, b) => {
            const servingPrinted = results.some(
                (r) => r.result.servingSize && r.result.servingSize.value !== null
            );
            const isServing = (r) =>
                r.result.nutritionBasis === "per-serving" ? 1 : 0;

            return (
                (b.result.nutritionBasis ? 1 : 0) -
                    (a.result.nutritionBasis ? 1 : 0) ||
                (servingPrinted ? isServing(b) - isServing(a) : 0) ||
                countFilled(b.result) - countFilled(a.result)
            );
        })[0];

    const compatible = results.filter(
        (r) =>
            r.result.nutritionBasis &&
            r.result.nutritionBasis === primary.result.nutritionBasis &&
            sameServing(r.result.servingSize, primary.result.servingSize)
    );

    const merged = { ...primary.result, nutrition: emptyNutrition() };
    const votes = {};
    const conflicts = [];

    for (const key of NUTRIENT_KEYS) {
        const tally = new Map();

        for (const r of compatible) {
            const v = r.result.nutrition[key];

            if (v !== null) {
                const entry = tally.get(v) || { count: 0, passes: [] };

                entry.count++;
                entry.passes.push(r.name);
                tally.set(v, entry);
            }
        }

        if (!tally.size) {
            continue;
        }

        const ranked = [...tally.entries()].sort(
            (a, b) => b[1].count - a[1].count
        );

        if (ranked.length > 1 && ranked[0][1].count === ranked[1][1].count) {
            conflicts.push({
                key,
                values: ranked.map(([value, e]) => ({
                    value,
                    passes: e.passes,
                })),
            });

            continue;
        }

        merged.nutrition[key] = ranked[0][0];
        votes[key] = ranked[0][1].passes;
    }

    merged.nutrition = validateNutrition(merged.nutrition);

    {
        const amount =
            merged.nutritionBasis === "per-serving"
                ? merged.servingSize && merged.servingSize.value
                : merged.nutritionBasis === "per-100g"
                ? 100
                : null;
        const unit =
            merged.nutritionBasis === "per-serving"
                ? merged.servingSize && merged.servingSize.unit
                : merged.nutritionBasis === "per-100g"
                ? "g"
                : null;
        const budgetWarnings = [];

        merged.nutrition = validateNutrition(
            enforceMassBudget(merged.nutrition, amount, unit, budgetWarnings)
        );

        merged.budgetWarnings = budgetWarnings;
    }

    merged.metadata = {
        ...primary.result.metadata,
        warnings: [
            ...((primary.result.metadata && primary.result.metadata.warnings) || []),
            ...(merged.budgetWarnings || []),
        ],
        primaryPass: primary.name,
        comparedPasses: compatible.map((r) => r.name),
        votes,
        conflicts,
        perPass: results.map((r) => ({
            name: r.name,
            mode: r.result.metadata.mode,
            basis: r.result.nutritionBasis,
            filled: countFilled(r.result),
        })),
    };

    delete merged.budgetWarnings;

    return merged;
}

// Backward compatible helpers (text only).
function detectNutritionColumns(text) {
    return parseNutrition(text).metadata.detectedColumns;
}

function detectNutritionBasis(text) {
    const r = parseNutrition(text);

    return {
        basis: r.nutritionBasis,
        servingSize: r.servingSize,
        source: r.metadata.basisSource,
    };
}

module.exports = {
    normalizeText,
    detectServingSize,
    detectNutritionColumns,
    detectNutritionBasis,
    parseNutrition,
    parseNutritionMultiPass,
    validateNutrition,
};