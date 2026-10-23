// server/src/ai/extraction/extraction.service.js
//
// Product / ingredient / allergen extraction (Groq) + deterministic
// validation of everything Groq returns.
//
// Principle: Groq proposes, OCR evidence decides.
//   - product name  : kept only when its words are found in OCR evidence
//   - allergens     : decided from "Contains:" / "May contain:" statements
//                     and the ingredient section, never from loose text
//   - ingredients   : cleaned deterministically (order, nesting, %, [from X]
//                     preserved; OCR noise and duplicate fragments removed)
//   - nutrition     : normalised only (the deterministic table parser and
//                     the merge live in nutrition.service.js / scan.service.js)

// The Groq client is created lazily so this module can be loaded (and
// unit-tested) without the SDK or an API key. Behaviour is otherwise the same.
let groqClient = null;

const getGroqClient = () => {
    if (!groqClient) {
        const Groq = require("groq-sdk");

        groqClient = new Groq({
            apiKey: process.env.GROQ_API_KEY,
        });
    }

    return groqClient;
};

// Test hook only.
const setGroqClientForTests = (client) => {
    groqClient = client;
};

// ============================================
// NORMALIZATION HELPERS
// Only clean values. Never invent or guess anything.
// ============================================

const NULL_LIKE_VALUES = new Set([
    "null",
    "none",
    "n/a",
    "na",
    "unknown",
    "not available",
    "not specified",
    "unspecified",
    "product name not available",
]);

// Returns a trimmed string, or null when empty / placeholder-like.
const cleanString = (value, maxLength = 255) => {
    if (typeof value !== "string") {
        return null;
    }

    const text = value.trim().replace(/\s+/g, " ");

    if (!text || NULL_LIKE_VALUES.has(text.toLowerCase())) {
        return null;
    }

    return text.slice(0, maxLength);
};

// Returns a positive finite number, or null.
const toPositiveNumberOrNull = (value) => {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    const number = Number(value);

    return Number.isFinite(number) && number > 0 ? number : null;
};

// Returns a finite number >= 0 (0 is allowed), or null.
// Strings are accepted ONLY when they are a plain number
// ("12.5"). "12 g" or "0.5 mg" are rejected, because a unit
// written by the model cannot be trusted to match the field.
const toNonNegativeNumberOrNull = (value) => {
    if (typeof value === "number") {
        return Number.isFinite(value) && value >= 0 ? value : null;
    }

    if (
        typeof value === "string" &&
        /^\d+(?:[.,]\d+)?$/.test(value.trim())
    ) {
        const number = Number(value.trim().replace(",", "."));

        return Number.isFinite(number) && number >= 0 ? number : null;
    }

    return null;
};

// Pack size = net content of the package (e.g. "Net Wt 200g").
// It is NOT the serving size.
const normalizePackSize = (packSize) => {
    const value = toPositiveNumberOrNull(packSize?.value);
    const unit = cleanString(packSize?.unit, 20);
    const raw = cleanString(packSize?.raw, 100);

    if (value === null && !raw) {
        return { value: null, unit: null, raw: null };
    }

    return {
        value,
        unit: value === null ? null : unit,
        raw,
    };
};

// ============================================
// OCR EVIDENCE
//
// ai-pipeline.service.js sends the primary OCR text plus every pass
// as "--- OCR PASS: <name> ---" blocks. All checks below work on the
// list of distinct OCR texts so that evidence from ANY pass counts.
// ============================================

const PASS_MARKER_SPLIT = /^---\s*OCR PASS:.*?---\s*$/im;

const squashKey = (text) =>
    String(text || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();

// Accepts a string (optionally containing pass markers) or an array of
// strings. Returns distinct, non-empty OCR texts.
const splitEvidence = (input) => {
    let parts = [];

    if (Array.isArray(input)) {
        parts = input.map((item) => String(item || ""));
    } else {
        parts = String(input || "").split(PASS_MARKER_SPLIT);
    }

    const seen = new Set();
    const texts = [];

    for (const part of parts) {
        const text = part.trim();

        if (!text) {
            continue;
        }

        const key = squashKey(text);

        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        texts.push(text);
    }

    return texts;
};

const levenshtein = (a, b) => {
    if (a === b) {
        return 0;
    }

    if (!a.length) {
        return b.length;
    }

    if (!b.length) {
        return a.length;
    }

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

// ============================================
// PRODUCT NAME VALIDATION
//
// Groq may "know" a product from its logo/brand even though the OCR never
// read the name. A name is accepted ONLY when every significant word of it
// is found (exactly, or with at most 1-2 OCR character errors) in some OCR
// pass. Otherwise null is returned: a correct null is better than a wrong
// product name.
// ============================================

const NAME_STOPWORDS = new Set([
    "the",
    "and",
    "of",
    "with",
    "for",
    "in",
    "a",
    "an",
    "by",
    "to",
]);

const NAME_REJECT_PATTERNS = [
    // Headings / statements, never a product name.
    /^(?:nutrition(?:al)?|ingredients?|allergens?|per\s+\d|serving|net\s+(?:wt|weight|qty|quantity|content)|best\s+before|manufactured|marketed|distributed|packed|store|storage|mrp|batch|contains?|may\s+contain)\b/i,
    // A pack size / quantity.
    /^\d+(?:[.,]\d+)?\s*(?:g|kg|mg|ml|l|oz|lb|kcal|pcs|pieces)\b/i,
    // Contact details.
    /@|https?:|www\./i,
];

const tokenizeWords = (text) =>
    String(text || "")
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .match(/[a-z0-9]+/g) || [];

const buildEvidenceIndex = (texts) => {
    const words = new Set();

    for (const text of texts) {
        for (const word of tokenizeWords(text)) {
            words.add(word);
        }
    }

    return {
        words,
        list: [...words],
        compact: texts
            .map((text) =>
                String(text).toLowerCase().replace(/[^a-z0-9]+/g, "")
            )
            .join("|"),
    };
};

const tokenInEvidence = (token, index) => {
    if (index.words.has(token)) {
        return true;
    }

    // Glued words ("TripleTreat") - long tokens only, to avoid
    // accidental substring matches.
    if (token.length >= 6 && index.compact.includes(token)) {
        return true;
    }

    // OCR character errors.
    const allowed = token.length >= 8 ? 2 : token.length >= 5 ? 1 : 0;

    if (allowed === 0) {
        return false;
    }

    return index.list.some(
        (word) =>
            Math.abs(word.length - token.length) <= allowed &&
            levenshtein(word, token) <= allowed
    );
};

// Returns { value, reason }. value is the cleaned name or null.
const validateProductName = (name, evidenceInput) => {
    const cleaned = cleanString(name, 120);

    if (!cleaned) {
        return { value: null, reason: "empty" };
    }

    if (cleaned.length > 80 || cleaned.split(/\s+/).length > 9) {
        return { value: null, reason: "too-long-to-be-a-name" };
    }

    if (NAME_REJECT_PATTERNS.some((pattern) => pattern.test(cleaned))) {
        return { value: null, reason: "not-a-product-name" };
    }

    const tokens = tokenizeWords(cleaned).filter(
        (token) =>
            !NAME_STOPWORDS.has(token) &&
            (token.length >= 3 || /\d/.test(token))
    );

    if (!tokens.length) {
        return { value: null, reason: "no-significant-words" };
    }

    const texts = splitEvidence(evidenceInput);

    if (!texts.length) {
        return { value: null, reason: "no-ocr-evidence" };
    }

    const index = buildEvidenceIndex(texts);

    // The whole name printed without spaces ("TripleTreat" for
    // "Triple Treat"), common in stylised logos.
    const glued = tokenizeWords(cleaned).join("");

    if (glued.length >= 8 && index.compact.includes(glued)) {
        return { value: cleaned, reason: "evidenced" };
    }

    const missing = tokens.filter((token) => !tokenInEvidence(token, index));

    if (missing.length) {
        return {
            value: null,
            reason: `not-in-ocr-evidence: ${missing.join(", ")}`,
        };
    }

    return { value: cleaned, reason: "evidenced" };
};

// ============================================
// NUTRITION / INGREDIENT NORMALIZATION
// ============================================

const NUTRITION_KEYS = [
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

const ALLOWED_BASES = new Set([
    "per-serving",
    "per-100g",
    "per-100ml",
    "per-piece",
]);

const normalizeNutritionBasis = (value) => {
    if (typeof value !== "string") {
        return null;
    }

    const text = value
        .trim()
        .toLowerCase()
        .replace(/[\s_]+/g, "-")
        .replace(/-+/g, "-");

    if (text === "per-portion") {
        return "per-serving";
    }

    if (text === "per-100-g") {
        return "per-100g";
    }

    if (text === "per-100-ml") {
        return "per-100ml";
    }

    return ALLOWED_BASES.has(text) ? text : null;
};

const normalizeServingSize = (servingSize) => {
    const value = toPositiveNumberOrNull(servingSize?.value);
    const unit = cleanString(servingSize?.unit, 10);

    if (value === null || !unit) {
        return { value: null, unit: null };
    }

    return {
        value,
        unit: unit.toLowerCase(),
    };
};

const normalizeNutrition = (nutrition) => {
    const source =
        nutrition &&
        typeof nutrition === "object" &&
        !Array.isArray(nutrition)
            ? nutrition
            : {};

    const result = {};

    for (const key of NUTRITION_KEYS) {
        result[key] = toNonNegativeNumberOrNull(source[key]);
    }

    return result;
};

// ============================================
// INGREDIENT CLEANING (deterministic)
//
// Preserves: label order, percentages, nested groups, (), [], {} and
// phrases such as "[from Milk]".
// Removes: OCR noise characters, unbalanced brackets, empty brackets,
// non-ingredient statements, and duplicate fragments produced by the
// multi-pass OCR (exact repeats, repeated blocks, and a bare fragment that
// sits next to its fuller version).
// Never invents or re-words an ingredient.
// ============================================

const OPENERS = "([{";
const CLOSERS = ")]}";
const BRACKET_PARTNER = { "(": ")", "[": "]", "{": "}" };

// Brackets are treated as interchangeable pairs, because OCR often reads
// "[Soya Lecithin)" or "(Soya Lecithin]". A closer without an opener is
// dropped; an opener without a closer is closed at the end of the text.
// No words are added or removed.
const balanceBrackets = (text) => {
    const stack = [];
    let out = "";

    for (const ch of text) {
        if (OPENERS.includes(ch)) {
            stack.push(ch);
            out += ch;
        } else if (CLOSERS.includes(ch)) {
            if (stack.length) {
                out += BRACKET_PARTNER[stack.pop()];
            }
        } else {
            out += ch;
        }
    }

    while (stack.length) {
        out += BRACKET_PARTNER[stack.pop()];
    }

    return out;
};

const hasBracket = (text) => /[([{]/.test(text);

// Splits on "," / ";" at bracket depth 0 only. A comma between two
// digits (a decimal comma such as 12,5%) is never a separator.
const splitTopLevel = (text) => {
    const parts = [];
    let depth = 0;
    let current = "";

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];

        if (OPENERS.includes(ch)) {
            depth++;
        } else if (CLOSERS.includes(ch)) {
            depth = Math.max(0, depth - 1);
        }

        const isSeparator =
            depth === 0 &&
            (ch === ";" ||
                (ch === "," &&
                    !(/\d/.test(text[i - 1] || "") && /\d/.test(text[i + 1] || ""))));

        if (isSeparator) {
            parts.push(current);
            current = "";
        } else {
            current += ch;
        }
    }

    parts.push(current);

    return parts;
};

const cleanIngredientText = (raw) => {
    let text = String(raw)
        .replace(/[\u200b-\u200d\ufeff]/g, "")
        // Stray OCR line/column marks (a "|" often stands in for "[").
        .replace(/[|¦]/g, " ")
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/\s+/g, " ")
        .trim();

    text = text.replace(/^ingredients?\s*[:\-]\s*/i, "");
    text = text.replace(/^[\s\-•*·.,:;]+/, "");

    text = balanceBrackets(text);

    text = text
        .replace(/([([{])\s+/g, "$1")
        .replace(/\s+([)\]}])/g, "$1")
        .replace(/\s+([,;:])/g, "$1")
        .replace(/,(?=[A-Za-z([{])/g, ", ")
        .replace(/(\d)\s+%/g, "$1%")
        .replace(/\s+/g, " ");

    let previous;

    do {
        previous = text;
        text = text.replace(/[([{]\s*[)\]}]/g, "");
    } while (text !== previous);

    return text.replace(/[\s.,;:\-]+$/, "").trim();
};

// Statements that are not ingredients but are sometimes returned as items.
const NON_INGREDIENT_ITEM =
    /^(?:may\s+contain|traces?\s+of|allergen|nutrition|best\s+before|store\b|storage|net\s+(?:wt|weight|qty|quantity)|manufactured|marketed|distributed|packed|contains?\s*:)/i;

const isUsableIngredient = (text) => {
    if (!/[A-Za-z]{2}/.test(text)) {
        return false;
    }

    if (NON_INGREDIENT_ITEM.test(text)) {
        return false;
    }

    // Mostly punctuation / noise.
    const alnum = (text.match(/[A-Za-z0-9]/g) || []).length;

    return alnum / text.length >= 0.5;
};

const ingredientKey = (text) =>
    text
        .toLowerCase()
        .replace(/[^a-z0-9%]+/g, " ")
        .trim();

const ingredientHeadKey = (text) =>
    ingredientKey(text.replace(/[([{].*$/, ""));

// True when `fragment` is a bare/partial copy of `full`:
//  - fragment has no brackets, full has brackets
//  - same first word
//  - every word of the fragment appears in `full`, in order
//  - the words of full's head (text before its first bracket) are all in
//    the fragment
// "Milk Chocolate"      vs "Milk Chocolate (Sugar, Cocoa Butter)"   -> true
// "Emulsifier Lecithin" vs "Emulsifier [Soya Lecithin]"             -> true
// "Sugar"               vs "Sugar Syrup (Liquid)"                   -> false
const isFragmentOf = (fragment, full) => {
    if (hasBracket(fragment) || !hasBracket(full)) {
        return false;
    }

    const fragTokens = ingredientKey(fragment).split(" ").filter(Boolean);
    const fullTokens = ingredientKey(full).split(" ").filter(Boolean);
    const headTokens = ingredientHeadKey(full).split(" ").filter(Boolean);

    if (
        !fragTokens.length ||
        fragTokens.length >= fullTokens.length ||
        fragTokens[0] !== fullTokens[0]
    ) {
        return false;
    }

    let position = 0;

    for (const token of fragTokens) {
        const found = fullTokens.indexOf(token, position);

        if (found === -1) {
            return false;
        }

        position = found + 1;
    }

    return headTokens.every((token) => fragTokens.includes(token));
};

const removeDuplicateFragments = (items) => {
    // A. Adjacent exact duplicates.
    let list = items.filter(
        (item, i) =>
            i === 0 || ingredientKey(item) !== ingredientKey(items[i - 1])
    );

    // B. A bare fragment next to its fuller version.
    list = list.filter(
        (item, i) =>
            !(
                (i > 0 && isFragmentOf(item, list[i - 1])) ||
                (i < list.length - 1 && isFragmentOf(item, list[i + 1]))
            )
    );

    // C. A block of 3+ consecutive items that repeats an earlier block in
    //    the same order (the whole list read twice). Runs of 1-2 items are
    //    kept: flattened nested groups legitimately repeat "Sugar, Milk
    //    Solids" etc.
    const keys = list.map(ingredientKey);
    const dropped = new Array(list.length).fill(false);

    for (let i = 1; i < list.length; ) {
        let bestLength = 0;

        for (let p = 0; p < i; p++) {
            let length = 0;

            while (
                i + length < list.length &&
                p + length < i &&
                keys[p + length] === keys[i + length]
            ) {
                length++;
            }

            bestLength = Math.max(bestLength, length);
        }

        if (bestLength >= 3) {
            for (let k = 0; k < bestLength; k++) {
                dropped[i + k] = true;
            }

            i += bestLength;
        } else {
            i++;
        }
    }

    list = list.filter((_, i) => !dropped[i]);

    // D. A repeated nested group (an item with brackets) is an OCR
    //    duplicate, not a second ingredient.
    const seenNested = new Set();

    return list.filter((item) => {
        if (!hasBracket(item)) {
            return true;
        }

        const key = ingredientKey(item);

        if (seenNested.has(key)) {
            return false;
        }

        seenNested.add(key);

        return true;
    });
};

// Keeps the label's original order.
// Accepts strings or { name } objects.
const normalizeIngredients = (ingredients) => {
    if (!Array.isArray(ingredients)) {
        return [];
    }

    const flat = [];

    for (const item of ingredients) {
        const rawName =
            typeof item === "string"
                ? item
                : item && typeof item.name === "string"
                ? item.name
                : null;

        if (rawName === null) {
            continue;
        }

        const cleaned = cleanIngredientText(rawName);

        if (!cleaned) {
            continue;
        }

        // A single item holding several top-level ingredients
        // ("Sugar, Salt") is split. Nested groups stay intact because
        // only depth-0 separators split.
        for (const part of splitTopLevel(cleaned)) {
            const name = cleanIngredientText(part);

            if (name && isUsableIngredient(name)) {
                flat.push(name.slice(0, 600));
            }
        }
    }

    return removeDuplicateFragments(flat);
};

const normalizeUncertainFields = (fields) => {
    if (!Array.isArray(fields)) {
        return [];
    }

    return fields
        .map((field) => cleanString(field, 100))
        .filter(Boolean);
};

// ============================================
// ALLERGEN DETECTION (deterministic, context-aware)
//
// Evidence, in order of strength:
//   1. "Contains: ..." / allergen statements          -> confirmed
//   2. the ingredient section                         -> confirmed
//   3. "May contain / traces of / manufactured in a
//      facility that handles ..." statements           -> may_contain only
//
// - Text outside those places (marketing copy, nutrition table) is NOT
//   evidence when an ingredient section exists.
// - "may contain" statements are removed BEFORE the other checks, so a
//   precautionary allergen can never become confirmed.
// - Wrapped statements (continued on the next OCR line) are joined.
// - "Lecithin" alone is NOT soya: "soya" must be printed. Evidence from
//   another OCR pass ("[Soya Lecithin]") counts.
// - "peanut free", "free from milk", "coconut milk" etc. are not allergens.
// ============================================

const ALLERGEN_ALIASES = {
    peanuts: ["peanut", "peanuts", "groundnut", "groundnuts"],

    milk: ["milk", "whey", "lactose", "casein", "caseinate", "buttermilk"],

    // "lecithin" is deliberately NOT an alias.
    soya: ["soya", "soy", "soybean", "soybeans", "soyabean"],

    nuts: [
        "nut",
        "nuts",
        "almond",
        "almonds",
        "hazelnut",
        "hazelnuts",
        "walnut",
        "walnuts",
        "cashew",
        "cashews",
        "pistachio",
        "pistachios",
        "pecan",
        "pecans",
    ],

    wheat: ["wheat"],

    barley: ["barley"],

    oats: ["oat", "oats"],

    sesame: ["sesame"],

    egg: ["egg", "eggs"],

    fish: ["fish"],

    crustaceans: [
        "crustacean",
        "crustaceans",
        "shrimp",
        "prawn",
        "prawns",
    ],

    celery: ["celery"],

    mustard: ["mustard"],

    sulphites: ["sulphite", "sulphites", "sulfite", "sulfites"],

    lupin: ["lupin", "lupine"],

    molluscs: ["mollusc", "molluscs", "mussel", "mussels", "clam", "clams"],
};

// Phrases that contain an alias word but are not that allergen.
const ALLERGEN_EXCLUDES = {
    milk: /\b(?:coconut|almond|soy|soya|oat|rice|cashew|hazelnut|nut)\s+milk\b/gi,
};

const NEGATED_BEFORE =
    /\b(?:free\s+(?:from|of)|without|no|non|nor|not\s+contain(?:s|ing)?)\s+(?:(?:added|any|artificial)\s+)?$/i;

const NEGATED_AFTER = /^[\s\-–]*free\b/i;

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const uniqueStrings = (values) => [
    ...new Set(
        values
            .filter(Boolean)
            .map((value) => String(value).trim())
    ),
];

const aliasesFor = (name) => ALLERGEN_ALIASES[name] || [name];

// True when `text` contains a (non-negated) alias of the allergen.
const hasAllergen = (text, name) => {
    if (!text) {
        return false;
    }

    const exclude = ALLERGEN_EXCLUDES[name];
    const source = exclude ? text.replace(exclude, " ") : text;

    for (const alias of aliasesFor(name)) {
        const pattern = new RegExp(
            `\\b${escapeRegex(alias).replace(/\s+/g, "\\s+")}\\b`,
            "gi"
        );

        let match;

        while ((match = pattern.exec(source)) !== null) {
            const before = source.slice(
                Math.max(0, match.index - 30),
                match.index
            );

            const after = source.slice(
                match.index + match[0].length,
                match.index + match[0].length + 8
            );

            if (NEGATED_BEFORE.test(before) || NEGATED_AFTER.test(after)) {
                continue;
            }

            return true;
        }
    }

    return false;
};

// Maps a model-supplied name ("soy", "peanut") to the canonical name.
const canonicalAllergen = (name) => {
    const text = String(name || "").trim().toLowerCase();

    if (!text) {
        return null;
    }

    if (ALLERGEN_ALIASES[text]) {
        return text;
    }

    for (const [canonical, aliases] of Object.entries(ALLERGEN_ALIASES)) {
        if (aliases.includes(text)) {
            return canonical;
        }
    }

    return text;
};

// Section keywords that end an ingredient list or a statement.
const SECTION_WORDS =
    "allergens?|allergy|nutrition(?:al)?|storage|store|keep|best\\s+before|use\\s+by|net\\s+(?:wt|weight|qty|quantity|contents?)|manufactured|marketed|distributed|packed|mfd|fssai|customer|consumer|serving|per\\s+100|energy|barcode";

const INGREDIENT_STOP_RE = new RegExp(
    `\\b(?:${SECTION_WORDS})\\b|\\bcontains?\\s*:`,
    "i"
);

const STATEMENT_STOP_RE = new RegExp(
    `\\b(?:${SECTION_WORDS}|ingredients?)\\b`,
    "i"
);

// "may contain" (also OCR "nay contain"), "traces of", and
// "manufactured in a facility that handles ...".
const MAY_TRIGGER =
    /\b[mn]a[yv]\s+(?:also\s+)?contain\b|\btraces?\s+of\b|\b(?:manufactured|produced|processed|packed|made)\s+(?:in|on)\s+[^.\n]{0,80}?\b(?:handles?|processes?|uses?)\b/gi;

// "Contains ..." but not "may contain", "does not contain", ...
const CONTAINS_TRIGGER =
    /(?<!\b(?:may|also|not|never|does|do)\s+)\bcontains?\b(?!\s+no\b)/gi;

const STATEMENT_MAX = 200;

// Length of the statement that starts at `from`: it ends at a sentence
// end, a blank line, a section keyword, or STATEMENT_MAX characters.
// A single line break does NOT end it (wrapped statements).
const statementLength = (text, from) => {
    const slice = text.slice(from, from + STATEMENT_MAX);

    const cuts = [
        slice.search(/\n\s*\n/),
        slice.search(/(?<!\d)\.(?=\s|$)/),
        slice.search(STATEMENT_STOP_RE),
    ].filter((position) => position >= 0);

    return cuts.length ? Math.min(...cuts) : slice.length;
};

const findStatements = (text, trigger) => {
    const pattern = new RegExp(trigger.source, trigger.flags);
    const found = [];

    let match;

    while ((match = pattern.exec(text)) !== null) {
        const afterTrigger = match.index + match[0].length;
        const end = afterTrigger + statementLength(text, afterTrigger);

        found.push({
            start: match.index,
            end,
            text: text.slice(match.index, end).replace(/\s+/g, " ").trim(),
        });

        pattern.lastIndex = Math.max(end, match.index + 1);
    }

    return found;
};

const removeRanges = (text, ranges) => {
    let out = "";
    let cursor = 0;

    for (const range of ranges) {
        if (range.start < cursor) {
            continue;
        }

        out += text.slice(cursor, range.start) + " ";
        cursor = range.end;
    }

    return out + text.slice(cursor);
};

// End of the ingredient list inside `section` (text after the
// "Ingredients:" heading). Periods inside brackets do not end it.
const findIngredientEnd = (section) => {
    const stop = section.search(INGREDIENT_STOP_RE);
    const limit = Math.min(stop === -1 ? section.length : stop, 1500);

    let depth = 0;

    for (let i = 0; i < limit; i++) {
        const ch = section[i];

        if (OPENERS.includes(ch)) {
            depth++;
        } else if (CLOSERS.includes(ch)) {
            depth = Math.max(0, depth - 1);
        } else if (
            ch === "." &&
            depth === 0 &&
            /[A-Za-z)\]%]/.test(section[i - 1] || "") &&
            (i + 1 >= section.length || /\s/.test(section[i + 1])) &&
            !/\b(?:min|max|approx|ca|etc)$/i.test(
                section.slice(Math.max(0, i - 6), i)
            )
        ) {
            return i;
        }
    }

    return limit;
};

const extractIngredientSection = (text) => {
    const heading = /\bingred[il1]en?ts?\b\s*[:;.\-]?/gi;

    let match;

    while ((match = heading.exec(text)) !== null) {
        const section = text.slice(match.index + match[0].length);
        const body = section
            .slice(0, findIngredientEnd(section))
            .replace(/\s+/g, " ")
            .trim();

        if (body.length >= 8) {
            return body;
        }
    }

    return "";
};

const analyzeEvidenceText = (text) => {
    const mayStatements = findStatements(text, MAY_TRIGGER);

    // Everything below works on text WITHOUT the may-contain statements.
    const rest = removeRanges(text, mayStatements);

    return {
        mayText: mayStatements.map((statement) => statement.text).join(" | "),
        containsText: findStatements(rest, CONTAINS_TRIGGER)
            .map((statement) => statement.text)
            .join(" | "),
        ingredientText: extractIngredientSection(rest),
        restText: rest,
    };
};

const orderAllergens = (names) => {
    const order = Object.keys(ALLERGEN_ALIASES);

    return uniqueStrings(names).sort((a, b) => {
        const ia = order.indexOf(a);
        const ib = order.indexOf(b);

        return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib);
    });
};

// Deterministic allergen detection over every OCR text.
const detectAllergens = (evidenceInput) => {
    const texts = splitEvidence(evidenceInput);
    const analyses = texts.map(analyzeEvidenceText);

    const sectionCount = analyses.filter(
        (analysis) => analysis.ingredientText.length >= 8
    ).length;

    // How many ingredient-section readings must agree before an allergen
    // that ALSO appears in a may-contain statement stays confirmed.
    const agreeNeeded = Math.max(1, Math.min(2, sectionCount));

    const confirmed = [];
    const mayContain = [];

    for (const name of Object.keys(ALLERGEN_ALIASES)) {
        const inMay = analyses.some((a) => hasAllergen(a.mayText, name));

        const inContains = analyses.some((a) =>
            hasAllergen(a.containsText, name)
        );

        const ingredientReadings = analyses.filter((a) =>
            hasAllergen(a.ingredientText, name)
        ).length;

        let isConfirmed = inContains || ingredientReadings > 0;

        // Confirmed only by a weak/single reading while a may-contain
        // statement names the same allergen: treat as may-contain.
        if (
            isConfirmed &&
            inMay &&
            !inContains &&
            ingredientReadings < agreeNeeded
        ) {
            isConfirmed = false;
        }

        if (isConfirmed) {
            confirmed.push(name);
        } else if (inMay) {
            mayContain.push(name);
        }
    }

    return {
        confirmed,
        may_contain: mayContain,
        hasIngredientSection: sectionCount > 0,
        analyses,
    };
};

// Combines deterministic detection with the model's allergen lists.
// The model can only ADD an allergen when OCR evidence supports it in the
// right place; it can never move an allergen into "confirmed" on the
// strength of a may-contain statement.
const normalizeAllergens = (value, evidenceInput = "") => {
    const detected = detectAllergens(evidenceInput);
    const analyses = detected.analyses;

    const source =
        value && typeof value === "object" && !Array.isArray(value)
            ? value
            : {};

    const cleanList = (items) =>
        Array.isArray(items)
            ? uniqueStrings(
                  items
                      .map((item) => cleanString(item, 80))
                      .filter(Boolean)
                      .map(canonicalAllergen)
              )
            : [];

    const confirmed = new Set(detected.confirmed);
    const mayContain = new Set(detected.may_contain);

    const inAnyMay = (name) =>
        analyses.some((a) => hasAllergen(a.mayText, name));

    // Model-confirmed: accepted only when the ingredient list could not be
    // located at all, the word is printed outside every may-contain
    // statement, and the allergen is not named in one.
    for (const name of cleanList(source.confirmed)) {
        if (confirmed.has(name) || mayContain.has(name)) {
            continue;
        }

        if (detected.hasIngredientSection || inAnyMay(name)) {
            continue;
        }

        if (analyses.some((a) => hasAllergen(a.restText, name))) {
            confirmed.add(name);
        }
    }

    // Model may-contain: accepted only with a may-contain statement.
    for (const name of cleanList(source.may_contain || source.mayContain)) {
        if (!confirmed.has(name) && inAnyMay(name)) {
            mayContain.add(name);
        }
    }

    return {
        confirmed: orderAllergens([...confirmed]),
        may_contain: orderAllergens(
            [...mayContain].filter((name) => !confirmed.has(name))
        ),
    };
};

// ============================================
// COMPLETE EXTRACTION NORMALIZATION
// ============================================

// evidenceInput: string (optionally with "--- OCR PASS ---" blocks) or an
// array of OCR texts.
const normalizeExtraction = (parsed, evidenceInput = "") => {
    if (
        !parsed ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
    ) {
        throw new Error(
            "Groq extraction response was not a JSON object"
        );
    }

    const texts = splitEvidence(evidenceInput);

    // scan.service.js prefers product_name over name, so a stray
    // product_name from the model must not bypass validation.
    const { product_name: legacyName, ...rest } = parsed;

    const candidateName =
        cleanString(parsed.name) || cleanString(legacyName);

    const nameCheck = validateProductName(candidateName, texts);

    const uncertainFields = normalizeUncertainFields(parsed.uncertainFields);

    if (candidateName && !nameCheck.value && !uncertainFields.includes("name")) {
        uncertainFields.push("name");
    }

    return {
        ...rest,

        name: nameCheck.value,

        brand: cleanString(parsed.brand),

        variant: cleanString(parsed.variant),

        allergens: normalizeAllergens(parsed.allergens, texts),

        packSize: normalizePackSize(parsed.packSize),

        servingsPerContainer: toPositiveNumberOrNull(
            parsed.servingsPerContainer
        ),

        servingSize: normalizeServingSize(parsed.servingSize),

        nutritionBasis: normalizeNutritionBasis(parsed.nutritionBasis),

        nutrition: normalizeNutrition(parsed.nutrition),

        ingredients: normalizeIngredients(parsed.ingredients),

        uncertainFields,
    };
};

// Models sometimes wrap JSON in ```json fences.
const stripJsonFences = (content) => {
    return String(content)
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "")
        .trim();
};

// ============================================
// GROQ EXTRACTION
// ============================================

async function extractProductInfo(
    ocrText,
    additionalOcrText = ""
) {
    if (!ocrText || !ocrText.trim()) {
        throw new Error("OCR text is required");
    }

    const prompt = `
You are a food-label data extraction system.

Your job is to extract structured product information from OCR text.

IMPORTANT:
The OCR may contain nutrition information in different formats, for example:
- per 100g
- per 100ml
- per serving
- per portion
- per piece
- multiple columns such as per 100g AND per serving

You MUST determine the nutrition basis from the actual OCR text.
Never assume that the nutrition basis is 100g.
Never assume that the serving size is a particular value.

GENERAL RULES:

1. Extract ONLY information explicitly present in the OCR text.
2. Do not invent missing information.
3. Do not guess unclear numbers.
4. Do not give health opinions.
5. Do not calculate a health score or grade.
6. Do not use % Daily Value / Reference Intake percentages as nutrient quantities.
7. If a nutrient cannot be confidently identified, return null.
8. Preserve ingredient order.
9. Preserve ingredient wording as accurately as possible.
10. Identify the nutrition columns before extracting nutrition values.
11. If multiple nutrition columns exist, select the column corresponding to the explicitly stated serving/portion size when that serving size is available.
12. If there is no serving/portion column, use the clearly identified available basis.
13. NEVER mix values from different nutrition columns.
14. If the label says "salt", extract it as salt-related information. Do NOT convert salt to sodium.
15. Do not assume salt and sodium are the same thing.
16. Do not calculate values from another column unless explicitly required by the available information.
17. The nutritionBasis must describe the actual column used for the extracted nutrition values.
18. If the nutrition table is ambiguous, return uncertain fields as null rather than guessing.
19. Nutrition values must be plain numbers only (for example 13.9), never text with units.
20. A nutrient that is not printed on the label must be null. Never return 0 for a nutrient that is not printed.

PRODUCT IDENTITY vs PACK INFORMATION:

Product identity fields are:
name, brand, variant.

Pack information fields are:
packSize, servingSize, servingsPerContainer.

Never mix these two groups.

name:
The product's own name exactly as printed on the pack.

For example:
"Choco Crunch Cereal"

Return null if the product name is not clearly printed in the OCR text.

Do NOT use:
- the brand alone
- a slogan
- a marketing claim
- manufacturer address
- an ingredient
- a nutrition heading

as the product name.

Do NOT infer a product name from ingredients or product category.

brand:
The brand or manufacturer name only when explicitly printed.
Otherwise null.

variant:
The flavour or variety only when explicitly printed.

Examples:
- Chocolate
- Salted
- Sugar Free

Otherwise null.

packSize:
The total net content of the package, only when explicitly printed.

Examples:
- Net Wt 200g
- Net Weight 1kg
- Net Content 500ml
- Net Qty 6 pieces
- 6 x 30g

For multipacks such as "6 x 30g":
set raw to the printed text
and set value and unit to null.

packSize is NOT the serving size.

Never copy the serving size into packSize.

Return value, unit and raw as null if no pack size is printed.

servingsPerContainer:
The number of servings in the pack, only when explicitly printed.

Examples:
- Servings per container: 8
- About 8 servings

Return the number only.

Do not calculate it from packSize and servingSize.

Return null if it is not printed.

NUTRITION BASIS EXAMPLES:

If the OCR says:

Per 100g | Per 30g
400 kcal | 120 kcal

and the serving/portion is 30g, use:

nutritionBasis = "per-serving"

calories = 120

NOT 400.

If the OCR says:

Per 100ml

use:

nutritionBasis = "per-100ml"

If only:

Per 100g

is available:

nutritionBasis = "per-100g"

If the label says:

Per serving

and no numeric serving size is available:

nutritionBasis = "per-serving"

If the label says:

Per portion

use:

nutritionBasis = "per-serving"

SERVING SIZE:

Extract an explicitly stated serving/portion size.

Examples:

Serving size: 32g
Portion size: 40ml
One bar: 25g

Do not calculate serving size.

INGREDIENTS:

Extract the ingredient list in the original order.

Do not merge unrelated ingredients.

Preserve nested ingredient declarations such as:
- parentheses
- [from ...]
- nested ingredient groups

Only normalize obvious OCR spacing.

Do not invent missing words.

ALLERGENS:

Identify allergens only when the OCR provides textual evidence.

Use both:
1. ingredient text
2. explicit allergen / contains statements
3. may-contain / traces statements
4. additional OCR passes

Keep confirmed allergens separate from may-contain allergens.

Never turn a may-contain allergen into a confirmed allergen.

Do not infer soya from the word "lecithin" alone.

Require supporting OCR evidence such as:
- soya
- soy
- soybean
- soya lecithin

Return canonical names such as:
- peanuts
- milk
- soya
- nuts
- wheat
- barley
- oats

Return ONLY valid JSON.

Use exactly this structure:

{
  "name": null,
  "brand": null,
  "variant": null,
  "category": null,

  "allergens": {
    "confirmed": [],
    "may_contain": []
  },

  "packSize": {
    "value": null,
    "unit": null,
    "raw": null
  },

  "servingSize": {
    "value": null,
    "unit": null
  },

  "servingsPerContainer": null,

  "nutritionBasis": null,

  "nutrition": {
    "calories": null,
    "protein": null,
    "carbohydrates": null,
    "totalFat": null,
    "saturatedFat": null,
    "sugar": null,
    "fiber": null,
    "sodium": null,
    "salt": null
  },

  "ingredients": [],

  "confidence": null,

  "uncertainFields": []
}

IMPORTANT ALLERGEN FIELD RULES:

allergens.confirmed:
Allergens supported by ingredient text or an explicit contains/allergen statement.

allergens.may_contain:
Allergens supported only by a may-contain / traces-of style statement.

Do not place the same allergen in both arrays.

IMPORTANT NUTRITION FIELD RULES:

calories:
Extract kcal/calories from the selected nutrition column.

protein:
Extract protein from the selected nutrition column.

carbohydrates:
Extract carbohydrate/carbs from the selected nutrition column.

totalFat:
Extract total fat/fat from the selected nutrition column.

saturatedFat:
Extract saturated fat from the selected nutrition column.

sugar:
Extract sugars/from which sugars from the selected nutrition column.

fiber:
Extract fibre/fiber only when explicitly present.

sodium:
Extract sodium ONLY when the label explicitly provides sodium.

If the label provides only salt:
return sodium as null.

salt:
Extract salt in grams ONLY when the label explicitly provides salt.

Do NOT convert salt to sodium.

Do NOT convert sodium to salt.

Do not confuse:
- salt with sodium
- energy kJ with calories
- %RI with grams
- per 100g values with serving values

OCR TEXT:

${ocrText}

ADDITIONAL OCR PASSES / VIEWS:

${additionalOcrText}
`;

    const completion =
        await getGroqClient().chat.completions.create({
            model: "openai/gpt-oss-20b",

            temperature: 0,

            max_completion_tokens: 4096,

            reasoning_effort: "low",

            messages: [
                {
                    role: "user",
                    content: prompt,
                },
            ],
        });

    const content =
        completion.choices?.[0]?.message?.content;

    if (!content) {
        console.log(
            "FULL GROQ RESPONSE:",
            JSON.stringify(
                completion,
                null,
                2
            )
        );

        throw new Error(
            "Groq returned an empty response"
        );
    }

    let parsed;

    try {
        parsed = JSON.parse(
            stripJsonFences(content)
        );
    } catch (error) {
        console.error(
            "Groq raw content:",
            content
        );

        throw new Error(
            "Failed to parse Groq extraction response"
        );
    }

    // Evidence = primary OCR text + every additional pass.
    return normalizeExtraction(parsed, [
        ocrText,
        ...splitEvidence(additionalOcrText),
    ]);
}

module.exports = {
    extractProductInfo,

    // Exported for offline tests.
    normalizeExtraction,
    normalizeAllergens,
    detectAllergens,
    normalizeIngredients,
    validateProductName,
    splitEvidence,
    setGroqClientForTests,
};