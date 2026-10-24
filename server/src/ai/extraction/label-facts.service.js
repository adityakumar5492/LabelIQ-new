// server/src/ai/extraction/label-facts.service.js
//
// Deterministic reader for facts printed on a food label.
//
// It works on the plain text of EVERY OCR pass (no coordinates, no network,
// no extra OCR work) and answers one question per fact: "what does the
// label actually say?". Groq is only a second opinion here:
//
//   serving size candidates  explicit "Serving Size: 32g" and table-header
//                            amounts ("Per 32g"); the final choice is made
//                            in nutrition-reconcile.service.js
//   servings per pack        "No. of Serves: 31", "Servings per container: 8"
//   pack size                "Net Weight 1kg" and similar
//   allergens                "Contains ..." and "May contain ..." statements
//                            kept apart; a garbled "May Cone" still counts
//   ingredients              nested brackets parsed properly, label order
//                            kept, OCR noise removed, Groq used only to
//                            confirm spelling or to add evidenced items
//
// Nothing here calculates a score, and nothing is invented: when the label
// cannot be read reliably the answer is null.

"use strict";

const fs = require("fs");
const path = require("path");

/* ------------------------------------------------------------------ */
/* Small helpers                                                      */
/* ------------------------------------------------------------------ */

const NUM = "(\\d+(?:[.,]\\d+)?)";

const toNumber = (text) => {
    const value = Number(String(text).replace(",", "."));

    return Number.isFinite(value) ? value : null;
};

const lettersOnly = (text) =>
    String(text || "")
        .toLowerCase()
        .replace(/[^a-z]/g, "");

const levenshtein = (a, b) => {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;

    let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

    for (let i = 1; i <= a.length; i++) {
        const current = [i];

        for (let j = 1; j <= b.length; j++) {
            current[j] = Math.min(
                previous[j] + 1,
                current[j - 1] + 1,
                previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
            );
        }

        previous = current;
    }

    return previous[b.length];
};

// How many OCR character errors a word of this length may contain and
// still count as "the same word".
const allowedDistance = (length) => (length >= 8 ? 2 : length >= 5 ? 1 : 0);

const uniqueTexts = (texts) => {
    const seen = new Set();
    const out = [];

    for (const raw of texts || []) {
        const text = String(raw || "").replace(/\r/g, "\n").trim();
        const key = text.toLowerCase().replace(/\s+/g, " ");

        if (!text || seen.has(key)) {
            continue;
        }

        seen.add(key);
        out.push(text);
    }

    return out;
};

// Most common value; null on a tie so nothing is guessed.
const strictMajority = (values) => {
    const tally = new Map();

    for (const value of values) {
        tally.set(value, (tally.get(value) || 0) + 1);
    }

    const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1]);

    if (!ranked.length) return null;
    if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) return null;

    return ranked[0][0];
};

/* ------------------------------------------------------------------ */
/* Serving size candidates                                            */
/* ------------------------------------------------------------------ */

const normalizeUnit = (raw) => {
    const unit = String(raw || "").toLowerCase();

    if (unit === "ml") return "ml";

    // "¢" is a very common OCR reading of a trailing "g".
    return "g";
};

const EXPLICIT_SERVING_PATTERNS = [
    new RegExp(
        `serv[il1]ng\\s*s[il1]ze\\s*[:;\\-]?\\s*${NUM}\\s*(g|gm|gr|ml|¢)(?![a-z])`,
        "gi"
    ),
    new RegExp(
        `portion\\s*size\\s*[:;\\-]?\\s*${NUM}\\s*(g|gm|gr|ml|¢)(?![a-z])`,
        "gi"
    ),
    new RegExp(
        `serv(?:ing|e)?\\s*size[^\\n(\\d]{0,20}\\(\\s*${NUM}\\s*(g|ml)\\s*\\)`,
        "gi"
    ),
    new RegExp(
        `per\\s*(?:serving|serve|portion)\\s*\\(\\s*${NUM}\\s*(g|ml)\\s*\\)`,
        "gi"
    ),
];

// Amounts printed in the table header ("NUTRIENTS  100g  32g  %RDA").
const HEADER_LINE = /nutrient|per\s*100|\b1?00\s*g\b|\b100\s*ml\b/i;
const HEADER_AMOUNT = new RegExp(
    `(?:^|[\\s/(\\[|])${NUM}\\s*(g|ml)(?![a-zA-Z])`,
    "gi"
);

/**
 * Serving-size candidates from every OCR text.
 * source "explicit"  -> the label states "Serving Size: <n>g"
 * source "header"    -> an amount in the nutrition-table header
 * Returns [{ value, unit, source, count }]  (count = OCR passes that agree)
 */
const collectServingCandidates = (texts) => {
    const tally = new Map();

    const add = (value, unit, source, passIndex) => {
        if (value === null || value <= 0 || value > 1000) return;

        const key = `${source}|${value}|${unit}`;
        const entry = tally.get(key) || {
            value,
            unit,
            source,
            passes: new Set(),
        };

        entry.passes.add(passIndex);
        tally.set(key, entry);
    };

    uniqueTexts(texts).forEach((text, passIndex) => {
        for (const pattern of EXPLICIT_SERVING_PATTERNS) {
            const re = new RegExp(pattern.source, pattern.flags);
            let match;

            while ((match = re.exec(text)) !== null) {
                add(
                    toNumber(match[1]),
                    normalizeUnit(match[2]),
                    "explicit",
                    passIndex
                );
            }
        }

        for (const line of text.split("\n")) {
            if (!HEADER_LINE.test(line)) continue;

            const re = new RegExp(HEADER_AMOUNT.source, HEADER_AMOUNT.flags);
            let match;

            while ((match = re.exec(line)) !== null) {
                const value = toNumber(match[1]);

                // 100 g / 100 ml is the reference column, not a serving.
                if (value === 100) continue;

                add(value, normalizeUnit(match[2]), "header", passIndex);
            }
        }
    });

    return [...tally.values()].map((entry) => ({
        value: entry.value,
        unit: entry.unit,
        source: entry.source,
        count: entry.passes.size,
    }));
};

/* ------------------------------------------------------------------ */
/* Servings per pack                                                  */
/* ------------------------------------------------------------------ */

const SERVINGS_PATTERNS = [
    /(?:no\.?|number)\s*of\s*serv\w*\s*[:;\-]?\s*(\d{1,3})(?![\d.])/gi,
    /serv\w*\s*per\s*(?:pack|container|package|bottle|jar|box|tub)\s*[:;\-]?\s*(\d{1,3})(?![\d.])/gi,
    /\babout\s+(\d{1,3})\s+servings?\b/gi,
];

const readServingsPerPack = (texts) => {
    const found = [];

    for (const text of uniqueTexts(texts)) {
        const seenInPass = new Set();

        for (const pattern of SERVINGS_PATTERNS) {
            const re = new RegExp(pattern.source, pattern.flags);
            let match;

            while ((match = re.exec(text)) !== null) {
                const value = Number(match[1]);

                if (value > 0 && value <= 500) {
                    seenInPass.add(value);
                }
            }
        }

        found.push(...seenInPass);
    }

    return strictMajority(found);
};

/* ------------------------------------------------------------------ */
/* Pack size                                                          */
/* ------------------------------------------------------------------ */

const PACK_PATTERNS = [
    new RegExp(
        `\\bnet\\s*(?:wt|weight|qty|quantity|content|contents|volume)s?\\.?\\s*[:;\\-]?\\s*${NUM}\\s*(kg|g|ml|l|ltr)(?![a-z])`,
        "gi"
    ),
    // "Weight 1kg" / a pack whose "Net" was cut off ("...ight 1kg").
    new RegExp(
        `\\b(?:[a-z]{0,3}ight|wt\\.?)\\s*[:;\\-]?\\s*${NUM}\\s*(kg|g|ml|l|ltr)(?![a-z])`,
        "gi"
    ),
];

// A line that holds nothing but "1kg" / "500 ml" (kg and litres only:
// a bare "g" is too easily a nutrient or serving amount).
const PACK_STANDALONE = new RegExp(
    `^\\W{0,3}${NUM}\\s*(kg|l|ltr|ml)\\W{0,3}$`,
    "i"
);

const readPackSize = (texts) => {
    const found = [];

    for (const text of uniqueTexts(texts)) {
        const inPass = new Map();

        for (const pattern of PACK_PATTERNS) {
            const re = new RegExp(pattern.source, pattern.flags);
            let match;

            while ((match = re.exec(text)) !== null) {
                const value = toNumber(match[1]);
                const unit = match[2].toLowerCase() === "ltr" ? "l" : match[2].toLowerCase();

                if (value !== null && value > 0) {
                    inPass.set(`${value}|${unit}`, { value, unit });
                }
            }
        }

        for (const line of text.split("\n")) {
            const match = line.trim().match(PACK_STANDALONE);

            if (match) {
                const value = toNumber(match[1]);
                const unit = match[2].toLowerCase() === "ltr" ? "l" : match[2].toLowerCase();

                if (value !== null && value > 0) {
                    inPass.set(`${value}|${unit}`, { value, unit });
                }
            }
        }

        found.push(...inPass.keys());
    }

    const best = strictMajority(found);

    if (!best) {
        return null;
    }

    const [value, unit] = best.split("|");

    return {
        value: Number(value),
        unit,
        raw: `${value}${unit}`,
    };
};

/* ------------------------------------------------------------------ */
/* Allergen statements                                                */
/* ------------------------------------------------------------------ */

// Canonical names follow the existing taxonomy used by
// extraction.service.js ("soya", "nuts", "peanuts" ...).
const ALLERGEN_PATTERNS = {
    peanuts: /\b(?:peanuts?|groundnuts?)\b/i,
    milk: /\b(?:milk|whey|lactose|casein|caseinate|buttermilk)\b/i,
    soya: /\b(?:soya|soy|soybeans?|soyabeans?)\b/i,
    nuts: /\b(?:nuts?|almonds?|hazelnuts?|walnuts?|cashews?|pistachios?|pecans?)\b/i,
    wheat: /\bwheat\b/i,
    barley: /\bbarley\b/i,
    oats: /\boats?\b/i,
    sesame: /\bsesame\b/i,
    egg: /\beggs?\b/i,
    fish: /\bfish\b/i,
    crustaceans: /\b(?:crustaceans?|shrimps?|prawns?)\b/i,
    celery: /\bcelery\b/i,
    mustard: /\bmustard\b/i,
    sulphites: /\b(?:sulphites?|sulfites?)\b/i,
    lupin: /\blupin(?:e)?\b/i,
    molluscs: /\b(?:molluscs?|mussels?|clams?)\b/i,
};

// Only inside an allergen STATEMENT, OCR readings such as "50Y" / "S0Y"
// are accepted for soy. Never used on ingredient text.
const STATEMENT_ONLY_PATTERNS = {
    soya: /\b[s5][o0]y\b/i,
};

const ALLERGEN_EXCLUDES = {
    milk: /\b(?:coconut|almond|soy|soya|oat|rice|cashew|hazelnut|nut)\s+milk\b/gi,
};

const NEGATED_BEFORE =
    /\b(?:free\s+(?:from|of)|without|no|non|nor|not\s+contain(?:s|ing)?)\s+(?:(?:added|any|artificial)\s+)?$/i;
const NEGATED_AFTER = /^[\s\-–]*free\b/i;

const ALLERGEN_ORDER = Object.keys(ALLERGEN_PATTERNS);

const orderAllergens = (names) =>
    [...new Set(names)].sort(
        (a, b) => ALLERGEN_ORDER.indexOf(a) - ALLERGEN_ORDER.indexOf(b)
    );

const findAllergens = (text, { statement = false } = {}) => {
    const found = [];

    for (const name of ALLERGEN_ORDER) {
        const exclude = ALLERGEN_EXCLUDES[name];
        const source = exclude ? text.replace(exclude, " ") : text;
        const patterns = [ALLERGEN_PATTERNS[name]];

        if (statement && STATEMENT_ONLY_PATTERNS[name]) {
            patterns.push(STATEMENT_ONLY_PATTERNS[name]);
        }

        for (const pattern of patterns) {
            const re = new RegExp(pattern.source, "gi");
            let match;
            let hit = false;

            while ((match = re.exec(source)) !== null) {
                const before = source.slice(Math.max(0, match.index - 30), match.index);
                const after = source.slice(
                    match.index + match[0].length,
                    match.index + match[0].length + 8
                );

                if (NEGATED_BEFORE.test(before) || NEGATED_AFTER.test(after)) {
                    continue;
                }

                hit = true;
                break;
            }

            if (hit) {
                found.push(name);
                break;
            }
        }
    }

    return found;
};

// "Contains ..." but not "may contain", "does not contain", ...
const CONTAINS_RE =
    /(?<![A-Za-z])(?<!\b[mn][aeo4][yv]\s)(?<!\bnot\s)(?<!\bdoes\s)(?<!\balso\s)contains?\b(?!\s+no\b)/gi;

// "May contain" even when OCR damaged it ("May Cone", "May Cong",
// "Mey Coal"), plus "traces of" and "manufactured in a facility that
// handles ...".
const MAY_RE =
    /\b[mn][aeo4][yvx]\s*(?:also\s+)?c[o0a]\w{0,5}\b|\btraces?\s+of\b|\b(?:manufactured|produced|processed|packed|made)\s+(?:in|on)\s+[^.\n]{0,80}?\b(?:handles?|processes?|uses?)\b/gi;

const STATEMENT_STOP =
    /\b(?:storage|store|keep|nutrition(?:al)?|serving|ingredients?|net\s*(?:wt|weight)|best\s+before|use\s+by|manufactured|marketed|mrp|batch|mfg|refrigerate|fssai)\b|&\s*usage/i;

const STATEMENT_MAX = 160;

/**
 * One OCR text -> { confirmed: Set, may: Set, anchors }.
 * Every allergen word is attributed to the closest preceding marker:
 *   "Contains"      -> confirmed
 *   "May contain"   -> may contain
 * A statement ends at a full stop, a section word, the next marker, or
 * STATEMENT_MAX characters. Line breaks inside a statement are allowed
 * (OCR often wraps it).
 */
const readStatementsFromText = (text) => {
    const anchors = [];

    for (const [re, type] of [
        [CONTAINS_RE, "contains"],
        [MAY_RE, "may"],
    ]) {
        const pattern = new RegExp(re.source, re.flags);
        let match;

        while ((match = pattern.exec(text)) !== null) {
            anchors.push({
                type,
                start: match.index,
                end: match.index + match[0].length,
            });
        }
    }

    anchors.sort((a, b) => a.start - b.start);

    // A "May contain" marker swallows a "contain" marker inside it.
    const clean = anchors.filter(
        (anchor, i) =>
            !(
                anchor.type === "contains" &&
                anchors.some(
                    (other, j) =>
                        j !== i &&
                        other.type === "may" &&
                        other.start <= anchor.start &&
                        other.end >= anchor.end
                )
            )
    );

    const confirmed = new Set();
    const may = new Set();

    clean.forEach((anchor, i) => {
        const next = clean[i + 1];
        const limit = Math.min(
            anchor.end + STATEMENT_MAX,
            next ? next.start : Infinity,
            text.length
        );

        let body = text.slice(anchor.end, limit);

        const cuts = [
            body.search(STATEMENT_STOP),
            body.search(/(?<!\d)\.(?!\d)/),
        ].filter((position) => position >= 0);

        if (cuts.length) {
            body = body.slice(0, Math.min(...cuts));
        }

        body = body.replace(/\s+/g, " ");

        for (const name of findAllergens(body, { statement: true })) {
            (anchor.type === "may" ? may : confirmed).add(name);
        }
    });

    return { confirmed, may, anchors: clean.length };
};

/**
 * Allergen statements across all OCR texts.
 * An allergen named as "may contain" in at least as many passes as it is
 * named as "contains" stays may-contain: precaution never becomes
 * confirmed because one pass was damaged.
 * Returns { confirmed: [], may_contain: [], anchors } .
 */
const readAllergenStatements = (texts) => {
    const perPass = uniqueTexts(texts).map(readStatementsFromText);
    const confirmed = [];
    const mayContain = [];

    for (const name of ALLERGEN_ORDER) {
        const asConfirmed = perPass.filter((p) => p.confirmed.has(name)).length;
        const asMay = perPass.filter((p) => p.may.has(name)).length;

        if (asMay > 0 && asMay >= asConfirmed) {
            mayContain.push(name);
        } else if (asConfirmed > 0) {
            confirmed.push(name);
        }
    }

    return {
        confirmed,
        may_contain: mayContain,
        anchors: perPass.reduce((sum, p) => sum + p.anchors, 0),
    };
};

/* ------------------------------------------------------------------ */
/* Ingredients                                                        */
/* ------------------------------------------------------------------ */

const OPENERS = "([{";
const CLOSERS = ")]}";

const KNOWLEDGE_PATH = path.join(__dirname, "..", "rag", "ingredient-knowledge.json");

let knowledgeWords = null;

// Words of the local knowledge base. Used only to confirm the SPELLING of
// a word OCR damaged; it never adds an ingredient.
const getKnowledgeWords = () => {
    if (knowledgeWords) {
        return knowledgeWords;
    }

    knowledgeWords = new Set();

    try {
        const list = JSON.parse(fs.readFileSync(KNOWLEDGE_PATH, "utf-8"));

        for (const item of Array.isArray(list) ? list : []) {
            for (const word of String(item?.name || "")
                .toLowerCase()
                .match(/[a-z]{3,}/g) || []) {
                knowledgeWords.add(word);
            }
        }
    } catch (error) {
        // Optional evidence: fine to continue without it.
    }

    return knowledgeWords;
};

// Common food words. Like the knowledge base, they are used only to settle
// the SPELLING of a word OCR damaged ("vatural" -> "natural"); they never
// add an ingredient the label does not print.
const COMMON_WORDS = new Set(
    (
        "natural flavour flavours flavouring flavor flavors flavoring artificial nature identical " +
        "sugar sugars salt iodised iodized oil oils vegetable palm palmolein edible refined unrefined " +
        "organic added roasted raw whole dried fresh powder powdered extract extracts essence paste " +
        "puree juice concentrate syrup solids milk skimmed cream butter ghee cheese curd whey lactose " +
        "casein cocoa chocolate dark white jaggery honey molasses glucose fructose dextrose maltodextrin " +
        "starch flour wheat maize corn rice oats oat barley millet ragi bajra jowar gram besan semolina " +
        "peanut peanuts nut nuts almond almonds cashew cashews hazelnut hazelnuts walnut walnuts " +
        "pistachio pistachios pecan pecans coconut sesame seeds seed flax chia sunflower soya soy " +
        "soybean lecithin emulsifier emulsifiers stabilizer stabiliser stabilizers thickener acidity " +
        "regulator regulators antioxidant antioxidants preservative preservatives colour colours color " +
        "colors colouring permitted raising agent agents humectant firming gelling glazing sweetener " +
        "sweeteners vitamin vitamins mineral minerals iron calcium zinc yeast spices spice condiments " +
        "pepper chilli chili turmeric cumin coriander cardamom cinnamon ginger garlic onion tomato " +
        "potato vanilla cheddar water protein fibre fiber acid citric ascorbic lactic malic tartaric " +
        "sodium bicarbonate carbonate phosphate benzoate sorbate nitrite sulphite sulfite baking soda " +
        "date dates raisin raisins fruit fruits apple mango banana orange lemon berry berries " +
        "gluten egg eggs fish prawn shrimp bran germ pulp granules granule flakes pieces bits " +
        "and with from contains may traces of the for"
    ).split(" ")
);

const INGREDIENT_STOP = new RegExp(
    [
        "\\ballerg\\w*",
        "\\binformation\\s*[:;]",
        "\\b[mn][aeo4][yv]\\s+c[o0a]\\w*",
        "\\bcontains?\\s*[:;]",
        "\\bcontains?\\s+(?:nuts?|milk|soy\\w*|peanuts?|wheat|eggs?|fish)\\b",
        "\\bstorage\\b",
        "\\bstore\\s+in\\b",
        "\\bdry\\s+place\\b",
        "\\brefrigerate\\b",
        "\\bnutrition\\w*",
        "\\bserving\\b",
        "\\bbest\\s+before\\b",
        "\\bmanufactured\\b",
        "\\bmarketed\\b",
        "\\bfssai\\b",
        "\\bnet\\s*(?:wt|weight)\\b",
        "\\bcustomer\\b",
        "\\bmrp\\b",
        "&\\s*usage",
    ].join("|"),
    "i"
);

const INGREDIENT_HEADING =
    /\b\w{0,4}gred[il1]?en?ts?\b\s*[:;.\-]?|\bingred\w*\s*[:;.\-]?/i;

// Region of an OCR text that holds the ingredient list.
const findIngredientRegion = (text) => {
    const heading = text.match(INGREDIENT_HEADING);
    let start;

    if (heading) {
        start = heading.index + heading[0].length;
    } else {
        // Heading unreadable: start at the first line with a "(93%)" group.
        const pct = text.match(/^.*\(\s*\d{1,2}(?:[.,]\d+)?\s*%\s*\).*$/m);

        if (!pct) {
            return "";
        }

        start = pct.index;
    }

    const rest = text.slice(start);
    const stopMatch = rest.match(INGREDIENT_STOP);
    let limit = Math.min(stopMatch ? stopMatch.index : rest.length, 1500);

    // "Allergen Information:" is often read as "auerge information:".
    // The stop word is "information"; the damaged word before it is cut too.
    if (stopMatch && /^information/i.test(stopMatch[0])) {
        const before = rest.slice(0, limit).replace(/\S+\s*$/, "");

        limit = before.length;
    }

    // A full stop outside brackets ends the list.
    let depth = 0;

    for (let i = 0; i < limit; i++) {
        const ch = rest[i];

        if (OPENERS.includes(ch)) depth++;
        else if (CLOSERS.includes(ch)) depth = Math.max(0, depth - 1);
        else if (
            ch === "." &&
            depth === 0 &&
            /[A-Za-z)\]%]/.test(rest[i - 1] || "") &&
            (i + 1 >= rest.length || /\s/.test(rest[i + 1]))
        ) {
            limit = i;
            break;
        }
    }

    return rest.slice(0, limit);
};

// Closers without an opener are dropped; openers without a closer are
// closed at the end. Square and curly brackets become round ones.
const normalizeBrackets = (text) => {
    const converted = text
        .replace(/[{[]/g, "(")
        .replace(/[}\]]/g, ")");

    let depth = 0;
    let out = "";

    for (const ch of converted) {
        if (ch === "(") {
            depth++;
            out += ch;
        } else if (ch === ")") {
            if (depth > 0) {
                depth--;
                out += ch;
            }
        } else {
            out += ch;
        }
    }

    return out + ")".repeat(depth);
};

const SHORT_WORDS = new Set(["of", "in", "or", "as", "to", "&"]);

const cleanRegion = (region) => {
    let text = region
        .replace(/[|¦_~]/g, " ")
        .replace(/[“”]/g, '"')
        .replace(/\s+/g, " ")
        .trim();

    text = normalizeBrackets(text);
    text = text.replace(/\)\s+\(/g, ")(").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");

    // OCR noise tokens: 1-2 characters with no digit, outside brackets
    // markers, such as "bg", "Hh", "a", "p".
    return text
        .split(" ")
        .filter((token) => {
            if (/[()%\d]/.test(token)) return true;

            const letters = token.replace(/[^A-Za-z&]/g, "");

            return letters.length >= 3 || SHORT_WORDS.has(letters.toLowerCase());
        })
        .join(" ");
};

// Splits on "," / ";" at bracket depth 0 (a comma between digits is a
// decimal comma, not a separator).
const splitTopLevel = (text) => {
    const parts = [];
    let depth = 0;
    let current = "";

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];

        if (ch === "(") depth++;
        else if (ch === ")") depth = Math.max(0, depth - 1);

        const separator =
            depth === 0 &&
            (ch === ";" ||
                (ch === "," &&
                    !(/\d/.test(text[i - 1] || "") && /\d/.test(text[i + 1] || ""))));

        if (separator) {
            parts.push(current);
            current = "";
        } else {
            current += ch;
        }
    }

    parts.push(current);

    return parts.map((part) => part.trim()).filter(Boolean);
};

// Balanced "(...)" groups at the start of `text` (optionally separated by
// spaces). Returns { groups: [content...], rest }.
const takeGroups = (text) => {
    const groups = [];
    let i = 0;

    while (i < text.length) {
        while (text[i] === " ") i++;

        if (text[i] !== "(") break;

        let depth = 0;
        let j = i;

        for (; j < text.length; j++) {
            if (text[j] === "(") depth++;
            else if (text[j] === ")") {
                depth--;

                if (depth === 0) break;
            }
        }

        groups.push(text.slice(i + 1, j));
        i = j + 1;
    }

    return { groups, rest: text.slice(i).trim() };
};

const PCT_ONLY = /^\s*(\d{1,3}(?:[.,]\d+)?)\s*%\s*$/;
const CODE_ONLY = /^\s*((?:INS|E)\s?-?\d{3,4}[a-z]?)\s*$/i;
const QUALIFIER_TEXT = /^\s*(?:from|as|source|contains?)\b/i;

// Functional classes: "Stabilizer (INS471, Salt)" stays ONE entry.
const ADDITIVE_CLASS =
    /^(?:emulsifiers?|stabili[sz]ers?|thickeners?|acidity\s+regulators?|antioxidants?|preservatives?|colou?rs?|colou?rings?|flavou?rs?|flavou?rings?|raising\s+agents?|humectants?|anti-?caking\s+agents?|firming\s+agents?|gelling\s+agents?|glazing\s+agents?|sweeteners?|flour\s+treatment\s+agents?|acidulants?)$/i;

const pctOf = (text) => {
    const m = String(text).match(PCT_ONLY);

    if (!m) return null;

    const value = Number(m[1].replace(",", "."));

    return value > 0 && value <= 100 ? `${m[1].replace(",", ".")}%` : null;
};

/**
 * "Peanut Butter (93%)(Peanuts (78%), Jaggery Powder (14%), ...)"
 * -> flat entries in label order:
 *    { name, pct, quals: [] }
 * Parents come before their children. A functional-class group keeps its
 * contents inside the entry ("Stabilizer (INS471, Salt)").
 */
const parseIngredientText = (text) => {
    const entries = [];

    const visit = (itemText) => {
        const trimmed = itemText.trim();

        if (!trimmed) return;

        const open = trimmed.indexOf("(");
        const name = (open === -1 ? trimmed : trimmed.slice(0, open)).trim();
        const { groups, rest } = open === -1 ? { groups: [], rest: "" } : takeGroups(trimmed.slice(open));

        const entry = { name, pct: null, quals: [] };
        const childLists = [];

        for (const group of groups) {
            const pct = pctOf(group);

            if (pct) {
                entry.pct = entry.pct || pct;
            } else if (CODE_ONLY.test(group) || QUALIFIER_TEXT.test(group)) {
                entry.quals.push(group.trim());
            } else if (/[A-Za-z]/.test(group)) {
                childLists.push(splitTopLevel(group));
            }
            // Anything else ("(794)", "(7°") is unreadable and dropped.
        }

        const children = childLists.flat();

        const isAdditive =
            ADDITIVE_CLASS.test(name) &&
            children.length > 0 &&
            children.every((child) => !/[()]/.test(child));

        if (isAdditive) {
            for (const child of children) {
                entry.quals.push(child.replace(/\s+/g, " ").trim());
            }

            entries.push(entry);
        } else {
            if (name) {
                entries.push(entry);
            }

            for (const child of children) {
                // Children that are only codes/percentages belong to the parent.
                if (CODE_ONLY.test(child)) {
                    entry.quals.push(child.trim());
                } else {
                    visit(child);
                }
            }
        }

        // Text after the groups (a missing comma): a new ingredient.
        if (rest) {
            for (const part of splitTopLevel(rest)) {
                visit(part);
            }
        }
    };

    for (const part of splitTopLevel(text)) {
        visit(part);
    }

    return entries;
};

const titleCase = (text) =>
    text
        .split(" ")
        .map((word) => {
            if (!word) return word;
            if (/\d/.test(word)) return word.toUpperCase();
            if (/^[A-Z]{2,3}$/.test(word)) return word;

            return word[0].toUpperCase() + word.slice(1).toLowerCase();
        })
        .join(" ");

const formatEntry = (entry) => {
    const parts = [titleCase(entry.name)];

    if (entry.pct) parts.push(`(${entry.pct})`);

    if (entry.quals.length) {
        parts.push(
            `(${entry.quals
                .map((q) => (CODE_ONLY.test(q) ? q.replace(/\s+/g, "").toUpperCase() : titleCase(q)))
                .join(", ")})`
        );
    }

    return parts.join(" ").replace(/\s+/g, " ").trim();
};

const entryKey = (entry) => lettersOnly(entry.name);

const sameIngredient = (a, b) => {
    const ka = entryKey(a);
    const kb = entryKey(b);

    if (!ka || !kb) return false;
    if (ka === kb) return true;

    return levenshtein(ka, kb) <= allowedDistance(Math.min(ka.length, kb.length));
};

const STOPWORDS = new Set(["and", "with", "from", "the", "for", "added", "contains"]);

// Shape check used ONLY when a single OCR reading exists (nothing to
// compare it with): letters only, a believable vowel ratio, no long
// consonant run.
const plausibleWord = (word) => {
    if (!/^[a-z]{3,}$/.test(word)) return false;

    const vowels = (word.match(/[aeiouy]/g) || []).length;
    const ratio = vowels / word.length;

    return ratio >= 0.2 && ratio <= 0.8 && !/[^aeiouy]{5,}/.test(word);
};

/**
 * Decides which spelling of an OCR word can be trusted.
 *
 *   regionTexts   the ingredient region of every OCR pass (cleaned)
 *   groqEntries   parsed Groq ingredients (a second reader of the same OCR)
 *
 * A word is accepted when
 *   - Groq or the knowledge base spells it AND an OCR region supports it
 *     (the Groq / knowledge spelling is used), or
 *   - 2+ OCR regions contain it (exactly or within OCR tolerance); the
 *     spelling that most regions share is used, and a tie means "unsure",
 *     or
 *   - there is only ONE OCR region and the word has a believable shape.
 * An unreadable word returns null and is never kept. Nothing is invented.
 */
const buildVocabulary = (regionTexts, groqEntries) => {
    const regionWords = regionTexts.map(
        (text) => new Set(text.toLowerCase().match(/[a-z]{3,}/g) || [])
    );

    const groqWords = new Set();

    for (const entry of groqEntries) {
        for (const word of `${entry.name} ${entry.quals.join(" ")}`
            .toLowerCase()
            .match(/[a-z]{3,}/g) || []) {
            groqWords.add(word);
        }
    }

    const knowledge = getKnowledgeWords();

    const nearIn = (set, word) => {
        if (set.has(word)) return word;

        const allowed = allowedDistance(word.length);

        if (!allowed) return null;

        let best = null;
        let bestDistance = allowed + 1;

        for (const candidate of set) {
            if (Math.abs(candidate.length - word.length) > allowed) continue;

            const distance = levenshtein(candidate, word);

            if (distance < bestDistance) {
                best = candidate;
                bestDistance = distance;
            }
        }

        return best;
    };

    const cache = new Map();

    const spell = (word) => {
        if (cache.has(word)) return cache.get(word);

        const variants = new Map();
        let support = 0;

        for (const set of regionWords) {
            const hit = nearIn(set, word);

            if (!hit) continue;

            support++;

            // Every near spelling in this region counts as one vote.
            const allowed = allowedDistance(word.length);

            for (const candidate of set) {
                if (
                    candidate === word ||
                    (allowed &&
                        Math.abs(candidate.length - word.length) <= allowed &&
                        levenshtein(candidate, word) <= allowed)
                ) {
                    variants.set(candidate, (variants.get(candidate) || 0) + 1);
                }
            }
        }

        const exactAuthority =
            groqWords.has(word) || knowledge.has(word) || COMMON_WORDS.has(word);

        // A near authority spelling corrects OCR damage ("javour" ->
        // "flavour"), but never turns a plural into a singular or back.
        const nearAuthority = (() => {
            if (exactAuthority) return null;

            const allowed = allowedDistance(word.length);

            if (!allowed) return null;

            let best = null;
            let bestDistance = allowed + 1;

            for (const set of [groqWords, knowledge, COMMON_WORDS]) {
                for (const candidate of set) {
                    if (candidate.length < 4) continue;
                    if (Math.abs(candidate.length - word.length) > allowed) continue;

                    const distance = levenshtein(candidate, word);

                    if (distance >= bestDistance) continue;
                    if (candidate + "s" === word || word + "s" === candidate) continue;
                    if (candidate + "es" === word || word + "es" === candidate) continue;

                    best = candidate;
                    bestDistance = distance;
                }
            }

            return best;
        })();

        let result = null;

        if (exactAuthority && support >= 1) {
            result = word;
        } else if (nearAuthority && support >= 1) {
            result = nearAuthority;
        } else if (support >= 2) {
            const ranked = [...variants.entries()].sort((a, b) => b[1] - a[1]);

            if (ranked.length === 1 || ranked[0][1] > ranked[1][1]) {
                result = ranked[0][0];
            }
        } else if (regionWords.length === 1 && plausibleWord(word)) {
            result = word;
        }

        cache.set(word, result);

        return result;
    };

    return { spell };
};

// Keeps only readable words of an entry. Returns null when nothing
// readable remains. The leading run of readable words is kept
// ("Peanut Butter eae frganuts" -> "Peanut Butter").
const repairEntry = (entry, vocabulary) => {
    const words = entry.name
        .split(" ")
        .map((word) => word.replace(/^[^A-Za-z&]+|[^A-Za-z&]+$/g, ""))
        .filter(Boolean);
    const kept = [];

    for (const word of words) {
        const plain = word.toLowerCase().replace(/[^a-z]/g, "");

        if (plain.length < 3) {
            if (SHORT_WORDS.has(plain)) {
                kept.push(word);
                continue;
            }

            // A one/two letter fragment ends the readable run.
            break;
        }

        if (STOPWORDS.has(plain)) {
            kept.push(plain);
            continue;
        }

        const spelled = vocabulary.spell(plain);

        if (!spelled) break;

        kept.push(spelled);
    }

    while (kept.length && SHORT_WORDS.has(kept[kept.length - 1].toLowerCase())) {
        kept.pop();
    }

    if (!kept.some((word) => word.length >= 3)) {
        return null;
    }

    const quals = [];

    for (const qual of entry.quals) {
        if (CODE_ONLY.test(qual)) {
            quals.push(qual);
            continue;
        }

        const plainWords = qual
            .split(" ")
            .map((word) => word.toLowerCase().replace(/[^a-z]/g, ""))
            .filter((word) => word.length >= 3);
        const spelled = plainWords.map((word) => vocabulary.spell(word));

        if (plainWords.length && spelled.every(Boolean)) {
            quals.push(spelled.join(" "));
        }
    }

    return { name: kept.join(" ").trim(), pct: entry.pct, quals };
};

// True when the words of `small` are a prefix or suffix of the words of
// `big` ("Flavour" inside "Natural Flavour").
const isEdgeFragment = (small, big) => {
    const a = small.name.toLowerCase().split(" ").filter(Boolean);
    const b = big.name.toLowerCase().split(" ").filter(Boolean);

    if (!a.length || a.length >= b.length) return false;

    const prefix = a.every((word, i) => b[i] === word);
    const suffix = a.every((word, i) => b[b.length - a.length + i] === word);

    return prefix || suffix;
};

const mergeEntryLists = (base, other, accept) => {
    const merged = base.map((entry) => ({ ...entry, quals: [...entry.quals] }));
    let last = -1;

    for (const entry of other) {
        const index = merged.findIndex((candidate) => sameIngredient(candidate, entry));

        if (index >= 0) {
            if (!merged[index].pct && entry.pct && accept(entry, true)) {
                merged[index].pct = entry.pct;
            }

            last = index;
            continue;
        }

        if (!accept(entry, false)) continue;

        // A fragment next to its fuller version is one ingredient read twice.
        const neighbours = [last, last + 1].filter(
            (i) => i >= 0 && i < merged.length
        );
        const smaller = neighbours.find((i) => isEdgeFragment(entry, merged[i]));

        if (smaller !== undefined) {
            last = smaller;
            continue;
        }

        const fragment = neighbours.find((i) => isEdgeFragment(merged[i], entry));

        if (fragment !== undefined) {
            merged[fragment] = {
                ...entry,
                pct: entry.pct || merged[fragment].pct,
                quals: [...entry.quals],
            };
            last = fragment;
            continue;
        }

        merged.splice(last + 1, 0, { ...entry, quals: [...entry.quals] });
        last += 1;
    }

    return merged;
};

/**
 * Deterministic ingredient list.
 * groqIngredients: strings as returned by extraction.service.js.
 * Returns { ingredients: [string], entries, source } or null when the OCR
 * text does not hold a readable list (the caller then keeps Groq's list).
 *
 * Order of trust: the OCR pass with the most readable entries is the base;
 * entries from other passes and from Groq are added only after the same
 * spelling check, and only at the place they occupy in the label order.
 */
const readIngredients = (texts, groqIngredients = []) => {
    const distinct = uniqueTexts(texts);

    const regions = distinct
        .map((text) => cleanRegion(findIngredientRegion(text)))
        .filter((region) => region.length >= 8);

    if (!regions.length) {
        return null;
    }

    const groqEntries = (Array.isArray(groqIngredients) ? groqIngredients : [])
        .filter((item) => typeof item === "string")
        .flatMap((item) => parseIngredientText(cleanRegion(item)));

    const vocabulary = buildVocabulary(regions, groqEntries);

    const perRegion = regions
        .map((region) =>
            parseIngredientText(region)
                .map((entry) => repairEntry(entry, vocabulary))
                .filter(Boolean)
        )
        .filter((list) => list.length > 0)
        .sort((a, b) => b.length - a.length);

    if (!perRegion.length || perRegion[0].length < 2) {
        return null;
    }

    const evidencedGroq = groqEntries
        .map((entry) => repairEntry(entry, vocabulary))
        .filter(Boolean);

    const pctEvidenced = (pct) =>
        distinct.some((text) =>
            new RegExp(
                `\\(?\\s*${pct.replace(".", "[.,]").replace("%", "\\s*%")}`
            ).test(text)
        );

    // Entries were already spell-checked by repairEntry; a percentage is
    // only copied from another reading when the OCR printed it.
    const accept = (entry, pctOnly) =>
        pctOnly ? Boolean(entry.pct) && pctEvidenced(entry.pct) : true;

    let merged = perRegion[0];

    for (const list of perRegion.slice(1)) {
        merged = mergeEntryLists(merged, list, accept);
    }

    merged = mergeEntryLists(merged, evidencedGroq, accept);

    merged = merged.map((entry) => ({
        ...entry,
        pct: entry.pct && pctEvidenced(entry.pct) ? entry.pct : null,
    }));

    return {
        ingredients: merged.map(formatEntry),
        entries: merged,
        source: "ocr",
    };
};

/* ------------------------------------------------------------------ */
/* Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * texts: every OCR pass text (primary text first).
 * groq:  the normalised Groq extraction (may be null).
 */
const readLabelFacts = ({ texts, groq = null }) => {
    const notes = [];

    const ingredientResult = readIngredients(
        texts,
        Array.isArray(groq?.ingredients) ? groq.ingredients : []
    );

    const statements = readAllergenStatements(texts);

    // Ingredient evidence: an allergen printed in the ingredient list is
    // confirmed. Only readable, evidenced entries are used.
    const ingredientAllergens = ingredientResult
        ? findAllergens(
              ingredientResult.entries
                  .map((entry) => [entry.name, ...entry.quals].join(" "))
                  .join(", ")
          )
        : [];

    let allergens = null;

    if (statements.anchors > 0 || ingredientAllergens.length > 0) {
        const confirmed = new Set([...statements.confirmed, ...ingredientAllergens]);

        allergens = {
            confirmed: orderAllergens([...confirmed]),
            may_contain: orderAllergens(
                statements.may_contain.filter((name) => !confirmed.has(name))
            ),
        };
    } else {
        notes.push("no allergen statement found in OCR text");
    }

    return {
        servingCandidates: collectServingCandidates(texts),
        servingsPerPack: readServingsPerPack(texts),
        packSize: readPackSize(texts),
        allergens,
        ingredients: ingredientResult ? ingredientResult.ingredients : null,
        notes,
    };
};

module.exports = {
    readLabelFacts,

    // Exported for tests and for nutrition-reconcile.service.js.
    collectServingCandidates,
    readServingsPerPack,
    readPackSize,
    readAllergenStatements,
    readIngredients,
    parseIngredientText,
    findIngredientRegion,
    cleanRegion,
    formatEntry,
};