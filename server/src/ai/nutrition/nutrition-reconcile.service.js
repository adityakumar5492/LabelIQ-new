// server/src/ai/nutrition/nutrition-reconcile.service.js
//
// Cross-checks the nutrition values with the label's OWN second column.
//
// A typical Indian / UK / US table prints two columns of the same numbers:
//
//     NUTRIENTS            Per 100g     Per 32g     %RDA
//     Total Fat (g)        43.3         13.8        20.7%
//
// The per-serving value must equal  per-100g x serving / 100  (up to the
// label's rounding). OCR frequently drops a decimal point ("13.8" -> "138",
// "2.5" -> "25"); such a value cannot satisfy that relation, while the
// correct reading does. So the two columns validate each other:
//
//   - a pair of readings that agrees at the serving ratio is "verified"
//   - a lone value that contradicts the verified per-100g value is not used;
//     if moving ONE decimal point makes it agree, that reading is used
//   - Groq values are accepted only when they agree with OCR evidence
//
// It never invents a number: every value returned is a reading of a token
// that was printed on the label. When the evidence is not enough, the
// value stays null.
//
// The deterministic table parser (nutrition.service.js) is NOT replaced; its
// result is one more piece of evidence here (weight 2).

"use strict";

const KEYS = [
    "calories",
    "protein",
    "carbohydrates",
    "totalFat",
    "saturatedFat",
    "fiber",
    "sugar",
    "addedSugar",
    "sodium",
];

const PARENT = {
    saturatedFat: "totalFat",
    sugar: "carbohydrates",
    fiber: "carbohydrates",
    addedSugar: "sugar",
};

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

const lettersOnly = (text) =>
    String(text || "")
        .toLowerCase()
        .replace(/[^a-z]/g, "");

const levenshtein = (a, b) => {
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);

    for (let j = 1; j <= b.length; j++) dp[0][j] = j;

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
};

const fuzzyHas = (text, word, maxDistance) => {
    if (text.includes(word)) return true;
    if (maxDistance <= 0) return false;

    for (let len = word.length - 1; len <= word.length + 1; len++) {
        for (let i = 0; i + len <= text.length; i++) {
            if (levenshtein(text.slice(i, i + len), word) <= maxDistance) {
                return true;
            }
        }
    }

    return false;
};

const decimalStep = (value) => {
    if (Number.isInteger(value)) return 1;

    const decimals = (String(value).split(".")[1] || "").length;

    return Math.pow(10, -decimals);
};

const round3 = (value) => Math.round(value * 1000) / 1000;

/* ------------------------------------------------------------------ */
/* Labels                                                             */
/* ------------------------------------------------------------------ */

const classifyLabel = (lc) => {
    if (!lc) return null;

    if (/added/.test(lc) && fuzzyHas(lc, "sugar", 1)) return "addedSugar";
    if (/(mono|poly|un)sat|trans|omega|cholest|mufa|pufa|caloriesfrom/.test(lc)) {
        return "other";
    }
    if (fuzzyHas(lc, "saturat", 1)) return "saturatedFat";
    if (fuzzyHas(lc, "sugar", 1)) return "sugar";
    if (fuzzyHas(lc, "carbohydrate", 2) || /carb/.test(lc)) return "carbohydrates";
    if (fuzzyHas(lc, "protein", 1)) return "protein";
    if (fuzzyHas(lc, "fibre", 1) || fuzzyHas(lc, "fiber", 1)) return "fiber";
    if (fuzzyHas(lc, "sodium", 1)) return "sodium";
    if (/^salt/.test(lc)) return "other";
    if (/^(total)?fats?$/.test(lc) || /^totalfat/.test(lc)) return "totalFat";
    if (/^(energy|calorie|kcal)/.test(lc)) return "calories";

    return null;
};

/* ------------------------------------------------------------------ */
/* Rows of one OCR text                                               */
/* ------------------------------------------------------------------ */

// A value token: "13.8", "5", "0.0", "17mg", "187.8kcal", "32¢" ...
const VALUE_TOKEN = /^[~|]?(\d+(?:[.,]\d+)?)([a-z¢]{0,4})[|)]*$/i;

const parseValueToken = (raw) => {
    if (raw.includes("%")) return null;

    const match = raw.match(VALUE_TOKEN);

    if (!match) return null;

    const digits = match[1].replace(",", ".");
    const unit = match[2].toLowerCase();

    if (digits.replace(".", "").length > 6) return null;
    if (unit === "kj") return null;
    if (unit && !["g", "mg", "kcal", "¢", "gm", "q", "9"].includes(unit)) return null;

    return { digits, unit };
};

const hasWord = (line) =>
    (line.match(/[A-Za-z]{3,}/g) || []).length > 0;

/**
 * [{ key, tokens: [{digits, unit}] }] for one OCR text.
 * Handles a label whose numbers wrapped onto the next line(s).
 */
const extractRows = (text) => {
    const lines = String(text || "")
        .replace(/\r/g, "\n")
        .split("\n")
        .map((line) => line.replace(/[|¦]/g, " ").trim());

    const rows = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (!line) continue;

        const parts = line.split(/\s+/).flatMap((part) =>
            part.includes("/") && /\d/.test(part) ? part.split("/") : [part]
        );

        let labelEnd = parts.length;
        let sawLetters = false;

        for (let t = 0; t < parts.length; t++) {
            const parsed = parseValueToken(parts[t]);

            if (parsed && sawLetters) {
                labelEnd = t;
                break;
            }

            if (/[A-Za-z]{3,}/.test(parts[t])) sawLetters = true;
        }

        const label = parts.slice(0, labelEnd).join(" ");
        const lc = lettersOnly(label.replace(/\(\s*(?:g|mg|kcal|kj|ml)\s*\)/gi, ""));
        const key = classifyLabel(lc);

        if (!key || key === "other") continue;

        const tokens = parts
            .slice(labelEnd)
            .map(parseValueToken)
            .filter(Boolean);

        // Numbers wrapped onto the following value-only lines.
        if (tokens.length < 2) {
            let looked = 0;

            for (let n = i + 1; n < lines.length && looked < 3; n++) {
                if (!lines[n]) continue;

                looked++;

                if (hasWord(lines[n])) break;

                for (const part of lines[n].split(/\s+/)) {
                    const parsed = parseValueToken(part);

                    if (parsed) tokens.push(parsed);
                }

                if (tokens.length >= 2) break;
            }
        }

        if (tokens.length) {
            rows.push({ key, tokens });
        }
    }

    return rows;
};

/* ------------------------------------------------------------------ */
/* Readings of a token                                                */
/* ------------------------------------------------------------------ */

/**
 * Every plausible value of an OCR token with a cost
 * (0 = as printed, higher = more OCR damage assumed).
 *   "13.8" -> 13.8
 *   "138"  -> 138, 13.8 (lost point), 1.38
 *   "006"  -> 0.06
 */
const readingsOf = (token, max) => {
    const byValue = new Map();

    const add = (value, cost) => {
        if (!Number.isFinite(value) || value < 0 || value > max) return;

        const previous = byValue.get(value);

        if (previous === undefined || cost < previous) {
            byValue.set(value, cost);
        }
    };

    const expand = (digits, baseCost) => {
        if (digits.includes(".")) {
            add(Number(digits), baseCost);
            return;
        }

        if (digits.length > 1 && digits[0] === "0") {
            add(Number("0." + digits.slice(1)), baseCost);
            return;
        }

        add(Number(digits), baseCost);

        if (digits.length >= 2) {
            add(Number(digits.slice(0, -1) + "." + digits.slice(-1)), baseCost + 1);
        }

        if (digits.length >= 3) {
            add(Number(digits.slice(0, -2) + "." + digits.slice(-2)), baseCost + 2);
        }
    };

    expand(token.digits, 0);

    // A trailing "g" misread as "9": "3.49" -> 3.4, "349" -> 34 / 3.4.
    if (!token.unit && /9$/.test(token.digits) && token.digits.replace(".", "").length >= 3) {
        const stripped = token.digits.slice(0, -1);

        if (!stripped.endsWith(".")) {
            expand(stripped, 1);
        }
    }

    return [...byValue.entries()].map(([value, cost]) => ({ value, cost }));
};

const limitsFor = (key, amount) => {
    const scale = amount / 100;

    if (key === "calories") {
        return { max100: 900, maxServing: 900 * scale + 5 };
    }

    if (key === "sodium") {
        return { max100: 40000, maxServing: 40000 * scale };
    }

    return { max100: 100, maxServing: 100 * scale + 0.5 };
};

const consistent = (p100, serving, ratio) => {
    const expected = p100 * ratio;
    const tolerance =
        0.07 * expected +
        0.5 * decimalStep(serving) +
        0.5 * decimalStep(p100) * ratio +
        0.011;

    return Math.abs(serving - expected) <= tolerance;
};

/**
 * Best (per-100, per-serving) pair of readings that agrees at the serving
 * ratio. Returns null when none exists or when two different serving values
 * tie at the lowest cost (ambiguous).
 */
const resolvePair = (key, tok100, tokServing, amount) => {
    const ratio = amount / 100;
    const limits = limitsFor(key, amount);
    const options = [];

    for (const a of readingsOf(tok100, limits.max100)) {
        for (const b of readingsOf(tokServing, limits.maxServing)) {
            if (consistent(a.value, b.value, ratio)) {
                options.push({
                    p100: a.value,
                    serving: b.value,
                    cost: a.cost + b.cost,
                });
            }
        }
    }

    if (!options.length) return null;

    const min = Math.min(...options.map((o) => o.cost));
    const best = options.filter((o) => o.cost === min);
    const distinct = new Set(best.map((o) => o.serving));

    return distinct.size === 1 ? best[0] : null;
};

/* ------------------------------------------------------------------ */
/* Serving selection                                                  */
/* ------------------------------------------------------------------ */

// Orientation of a pass: is the first number the per-100 column (A) or
// the per-serving column (B)? Decided by how many rows agree.
const analysePass = (rows, amount) => {
    const result = { orientation: null, pairs: new Map(), rows };

    const score = { A: new Map(), B: new Map() };

    for (const row of rows) {
        if (row.tokens.length < 2) continue;

        const [t0, t1] = row.tokens;
        const a = resolvePair(row.key, t0, t1, amount);
        const b = resolvePair(row.key, t1, t0, amount);

        if (a && !score.A.has(row.key)) score.A.set(row.key, a);
        if (b && !score.B.has(row.key)) score.B.set(row.key, b);
    }

    if (score.A.size === 0 && score.B.size === 0) return result;

    result.orientation = score.A.size >= score.B.size ? "A" : "B";
    result.pairs = score[result.orientation];

    return result;
};

const chooseServing = (candidates, passRows, notes) => {
    const scored = candidates.map((candidate) => {
        const analyses = passRows.map((rows) => analysePass(rows, candidate.value));

        return {
            ...candidate,
            consistent: analyses.reduce((sum, a) => sum + a.pairs.size, 0),
        };
    });

    const byStrength = (a, b) =>
        b.count - a.count || b.consistent - a.consistent;

    const explicit = scored.filter((c) => c.source === "explicit").sort(byStrength);
    const others = scored
        .filter((c) => c.source !== "explicit")
        .sort((a, b) => b.consistent - a.consistent || b.count - a.count);

    let pick = null;

    if (explicit.length) {
        pick = explicit[0];

        const rival = others[0];

        // A printed serving size wins, unless it matches NO row while another
        // amount from the table header matches several.
        if (pick.consistent === 0 && rival && rival.consistent >= 3) {
            notes.push(
                `serving size ${pick.value}${pick.unit} contradicts the table; using ${rival.value}${rival.unit} from the table header`
            );
            pick = rival;
        }
    } else if (others.length && others[0].consistent >= 2) {
        pick = others[0];
    }

    return pick;
};

/* ------------------------------------------------------------------ */
/* Main                                                               */
/* ------------------------------------------------------------------ */

const nullValues = () => Object.fromEntries(KEYS.map((key) => [key, null]));

/**
 * options:
 *   texts              OCR text of every pass
 *   servingCandidates  from label-facts.service.js (collectServingCandidates)
 *   table              { values, basis, serving }  deterministic parser result
 *   ai                 { values, serving }          Groq values (already
 *                      checked for a printed nutrient word)
 *
 * Returns { active, serving, values, sources, verifiedPer100, notes }.
 * active=false means "not enough evidence": the caller keeps its own logic.
 */
const reconcileNutrition = ({
    texts = [],
    servingCandidates = [],
    table = null,
    ai = null,
} = {}) => {
    const notes = [];
    const inactive = {
        active: false,
        serving: null,
        values: nullValues(),
        sources: {},
        verifiedPer100: {},
        notes,
    };

    const passRows = (texts || []).map(extractRows).filter((rows) => rows.length);

    if (!passRows.length) return inactive;

    // Candidates also include what the deterministic parser / Groq found,
    // when the OCR text itself shows that number next to a unit.
    const allText = (texts || []).join("\n");
    const candidates = servingCandidates.map((c) => ({ ...c }));

    const extra = (serving, source) => {
        if (
            serving &&
            serving.value &&
            (serving.unit === "g" || serving.unit === "ml") &&
            new RegExp(`(?:^|[^\\d.])${serving.value}\\s*(?:g|ml|¢)`, "i").test(allText) &&
            !candidates.some((c) => c.value === serving.value && c.unit === serving.unit)
        ) {
            candidates.push({ value: serving.value, unit: serving.unit, source, count: 1 });
        }
    };

    extra(table?.serving, "table");
    extra(ai?.serving, "ai");

    const pick = chooseServing(candidates, passRows, notes);

    if (!pick) return inactive;

    const amount = pick.value;
    const unit = pick.unit;

    if (unit !== "g" && unit !== "ml") return inactive;

    const analyses = passRows.map((rows) => analysePass(rows, amount));

    if (analyses.every((a) => a.pairs.size === 0)) {
        notes.push("no row of the table matches the serving size; reconciliation skipped");
        return inactive;
    }

    /* ---- hypotheses per nutrient ---- */
    const hypotheses = Object.fromEntries(KEYS.map((key) => [key, new Map()]));
    const per100Votes = Object.fromEntries(KEYS.map((key) => [key, new Map()]));

    const vote = (key, value, weight, source) => {
        const entry = hypotheses[key].get(value) || { weight: 0, sources: new Set() };

        entry.weight += weight;
        entry.sources.add(source);
        hypotheses[key].set(value, entry);
    };

    analyses.forEach((analysis) => {
        if (!analysis.orientation) return;

        const servingIndex = analysis.orientation === "A" ? 1 : 0;
        const seen = new Set();

        for (const [key, pair] of analysis.pairs) {
            vote(key, pair.serving, 2, "ocr");
            per100Votes[key].set(pair.p100, (per100Votes[key].get(pair.p100) || 0) + 1);
            seen.add(key);
        }

        // Rows that did not form a verified pair: the serving token read as
        // printed, accepted only when it fits the physical limits.
        for (const row of analysis.rows) {
            if (seen.has(row.key) || row.tokens.length < 2) continue;

            const token = row.tokens[servingIndex];
            const limits = limitsFor(row.key, amount);
            const options = readingsOf(token, limits.maxServing).sort(
                (a, b) => a.cost - b.cost
            );

            if (!options.length) continue;

            const cheapest = options.filter((o) => o.cost === options[0].cost);

            if (cheapest.length === 1) {
                vote(row.key, cheapest[0].value, 1, "ocr");
                seen.add(row.key);
            }
        }
    });

    const verifiedPer100 = {};

    for (const key of KEYS) {
        const ranked = [...per100Votes[key].entries()].sort((a, b) => b[1] - a[1]);

        if (ranked.length && (ranked.length === 1 || ranked[0][1] > ranked[1][1])) {
            verifiedPer100[key] = ranked[0][0];
        }
    }

    const ratio = amount / 100;

    // Evidence from the deterministic table parser.
    if (table && table.values) {
        for (const key of KEYS) {
            const value = table.values[key];

            if (value === null || value === undefined) continue;

            if (table.basis === "per-serving") {
                vote(key, value, 2, "table");
            } else if (
                table.basis === "per-100g" &&
                verifiedPer100[key] === undefined &&
                key !== "addedSugar"
            ) {
                verifiedPer100[key] = value;
            }
        }
    }

    // Groq: used only when its value agrees with the label's own evidence,
    // or becomes agreeable by moving one decimal point.
    const aiUsed = new Set();

    if (ai && ai.values) {
        for (const key of KEYS) {
            const value = ai.values[key];

            if (value === null || value === undefined) continue;

            const ref = verifiedPer100[key];

            if (ref !== undefined) {
                if (consistent(ref, value, ratio)) {
                    vote(key, value, 1, "ai");
                    aiUsed.add(key);
                    continue;
                }

                const repaired = readingsOf(
                    { digits: String(value), unit: "" },
                    limitsFor(key, amount).maxServing
                )
                    .filter((r) => consistent(ref, r.value, ratio))
                    .sort((a, b) => a.cost - b.cost);

                if (repaired.length) {
                    vote(key, repaired[0].value, 1, "ai");
                    aiUsed.add(key);
                }
            } else if (hypotheses[key].has(value)) {
                vote(key, value, 1, "ai");
                aiUsed.add(key);
            }
        }
    }

    /* ---- choose ---- */
    const values = nullValues();
    const sources = {};

    for (const key of KEYS) {
        const ranked = [...hypotheses[key].entries()].sort(
            (a, b) => b[1].weight - a[1].weight
        );

        if (!ranked.length) continue;

        const [value, info] = ranked[0];
        const rival = ranked[1];

        if (info.weight < 2) continue;
        if (rival && rival[1].weight === info.weight) continue;

        values[key] = value;
        sources[key] = info.sources.has("ai") && info.sources.size === 1 ? "ai" : "table";

        if (info.sources.has("ai") && info.sources.size > 1) {
            sources[key] = "table";
        }
    }

    /* ---- physical checks (a child never exceeds its parent) ---- */
    for (const key of ["saturatedFat", "fiber", "sugar", "addedSugar"]) {
        const parent = values[PARENT[key]];

        if (values[key] !== null && parent !== null && values[key] > parent + 1e-9) {
            notes.push(`${key} (${values[key]}) exceeds ${PARENT[key]} (${parent}); discarded`);
            values[key] = null;
            delete sources[key];
        }
    }

    const budget = ["totalFat", "carbohydrates", "protein"]
        .map((key) => values[key])
        .filter((v) => v !== null)
        .reduce((sum, v) => sum + v, 0);

    if (unit === "g" && budget > amount * 1.03 + 0.5) {
        notes.push("fat + carbohydrate + protein exceed the serving weight");
    }

    return {
        active: true,
        serving: { value: amount, unit, source: pick.source },
        values,
        sources,
        verifiedPer100: Object.fromEntries(
            Object.entries(verifiedPer100).map(([k, v]) => [k, round3(v)])
        ),
        notes,
        // Lets the caller vet a value it holds against the label's own columns.
        agrees: (key, value) =>
            verifiedPer100[key] === undefined ||
            consistent(verifiedPer100[key], value, ratio),
        aiUsed: [...aiUsed],
    };
};

module.exports = {
    reconcileNutrition,

    // Exported for tests.
    extractRows,
    readingsOf,
    resolvePair,
};