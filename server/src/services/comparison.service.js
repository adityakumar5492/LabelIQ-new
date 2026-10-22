"use strict";

const pool = require("../config/db");
const { compareNutrition } = require("./nutrition.service");

const VALID_ID = /^\d+$/;

const badRequest = (message) => {
    const error = new Error(message);
    error.statusCode = 400;
    return error;
};

const parseScanId = (value, name) => {
    if (!VALID_ID.test(String(value || ""))) {
        throw badRequest(`${name} must be a valid scan id`);
    }

    return String(value);
};

const toNumber = (value) => {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    const number = Number(value);
    return Number.isFinite(number) ? number : null;
};

const parseServingSize = (value) => {
    if (!value || typeof value !== "string") {
        return null;
    }

    const normalized = value
        .trim()
        .toLowerCase()
        .replace(/,/g, ".");

    const match = normalized.match(
        /([0-9]+(?:\.[0-9]+)?)\s*(kg|g|ml|l|piece|pieces|pcs?)\b/
    );

    if (!match) {
        return null;
    }

    let numericValue = Number(match[1]);
    let unit = match[2];

    if (!Number.isFinite(numericValue) || numericValue <= 0) {
        return null;
    }

    if (unit === "kg") {
        numericValue *= 1000;
        unit = "g";
    }

    if (unit === "l") {
        numericValue *= 1000;
        unit = "ml";
    }

    if (unit === "pieces" || unit === "pcs" || unit === "pc") {
        unit = "piece";
    }

    return {
        value: numericValue,
        unit,
    };
};

const normalizeNutrition = (row) => ({
    calories: toNumber(row.calories),
    protein: toNumber(row.protein_g),
    carbohydrates: toNumber(row.carbohydrates_g),
    totalFat: toNumber(row.total_fat_g),
    saturatedFat: toNumber(row.saturated_fat_g),
    sugar: toNumber(row.total_sugars_g),
    fiber: toNumber(row.dietary_fiber_g),
    sodium: toNumber(row.sodium_mg),
});

const normalizeProduct = (row) => ({
    id: String(row.id),
    name: row.product_name || "Unnamed product",
    brand: row.brand_name || "Unknown brand",
    grade: row.safety_grade || null,
    score: toNumber(row.safety_score),
    hiddenSugarDetected: Boolean(row.hidden_sugar_detected),
    scanStatus: row.scan_status,
    scannedAt: row.scanned_at,
    declaredSugar: toNumber(row.declared_sugar),
    nutrition: normalizeNutrition(row),
    servingSize: row.serving_size || null,
    nutritionDetails: {
        servingSize: row.serving_size || null,
        calories: toNumber(row.calories),
        protein: toNumber(row.protein_g),
        carbohydrates: toNumber(row.carbohydrates_g),
        totalFat: toNumber(row.total_fat_g),
        saturatedFat: toNumber(row.saturated_fat_g),
        transFat: toNumber(row.trans_fat_g),
        fiber: toNumber(row.dietary_fiber_g),
        sugar: toNumber(row.total_sugars_g),
        addedSugar: toNumber(row.added_sugars_g),
        sodium: toNumber(row.sodium_mg),
    },
});

const determineSafetyWinner = (product1, product2) => {
    const score1 = product1.score;
    const score2 = product2.score;

    if (score1 === null || score2 === null) {
        return null;
    }

    const difference = Math.abs(score1 - score2);

    if (difference < 3) {
        return "tie";
    }

    return score1 > score2 ? "product1" : "product2";
};

const determineOverallWinner = (product1, product2, nutritionComparison) => {
    const safetyWinner = determineSafetyWinner(product1, product2);

    if (safetyWinner && safetyWinner !== "tie") {
        return safetyWinner;
    }

    if (safetyWinner === "tie") {
        return nutritionComparison?.winner || "tie";
    }

    return nutritionComparison?.winner || null;
};

const getComparison = async (userId, rawScan1, rawScan2) => {
    const scan1 = parseScanId(rawScan1, "scan1");
    const scan2 = parseScanId(rawScan2, "scan2");

    if (scan1 === scan2) {
        throw badRequest("Please select two different scans");
    }

    const scanQuery = `
        SELECT
            sp.id,
            sp.user_id,
            sp.product_name,
            sp.safety_grade,
            sp.safety_score,
            sp.declared_sugar,
            sp.hidden_sugar_detected,
            sp.scan_status,
            sp.scanned_at,

            b.name AS brand_name,

            nd.serving_size,
            nd.calories,
            nd.protein_g,
            nd.carbohydrates_g,
            nd.total_fat_g,
            nd.saturated_fat_g,
            nd.trans_fat_g,
            nd.dietary_fiber_g,
            nd.total_sugars_g,
            nd.added_sugars_g,
            nd.sodium_mg,

            ar.id AS analysis_id,
            ar.assessment,
            ar.goal_alignment,
            ar.confidence AS analysis_confidence

        FROM scanned_products sp

        LEFT JOIN brands b
            ON b.id = sp.brand_id

        LEFT JOIN nutrition_details nd
            ON nd.scan_id = sp.id

        LEFT JOIN analysis_results ar
            ON ar.scan_id = sp.id

        WHERE sp.user_id = $1
          AND sp.id = ANY($2::bigint[])
        ;
    `;

    const [scanResult, profileResult] = await Promise.all([
        pool.query(scanQuery, [userId, [scan1, scan2]]),
        pool.query(
            `
                SELECT
                    dietary_mode,
                    analysis_strictness,
                    calorie_limit,
                    max_sugar_threshold,
                    max_sodium_threshold
                FROM health_profiles
                WHERE user_id = $1
                LIMIT 1;
            `,
            [userId]
        ),
    ]);

    if (scanResult.rows.length !== 2) {
        const foundIds = new Set(
            scanResult.rows.map((row) => String(row.id))
        );

        const missing = [scan1, scan2].filter(
            (id) => !foundIds.has(String(id))
        );

        if (missing.length) {
            const error = new Error(
                "One or both selected scans were not found"
            );
            error.statusCode = 404;
            throw error;
        }
    }

    const rowsById = new Map(
        scanResult.rows.map((row) => [String(row.id), row])
    );

    const product1 = normalizeProduct(rowsById.get(scan1));
    const product2 = normalizeProduct(rowsById.get(scan2));

    // Load ingredients in label order for both scans.
    const ingredientsResult = await pool.query(
        `
            SELECT
                si.scan_id,
                i.id,
                i.name,
                si.ingredient_order,
                si.detected_by
            FROM scan_ingredients si
            JOIN ingredients i
                ON i.id = si.ingredient_id
            WHERE si.scan_id = ANY($1::bigint[])
            ORDER BY si.scan_id, si.ingredient_order ASC NULLS LAST, si.id ASC;
        `,
        [[scan1, scan2]]
    );

    // Rule matches are the authoritative source for flagged ingredients
    // and nutrition/personal rules. They are never generated by AI here.
    const ruleResult = await pool.query(
        `
            SELECT
                ar.scan_id,
                rm.id,
                rm.ingredient_id,
                rm.rule_code,
                rm.rule_name,
                rm.matched_value,
                rm.severity,
                rm.explanation,
                i.name AS ingredient_name
            FROM rule_matches rm
            JOIN analysis_results ar
                ON ar.id = rm.analysis_id
            LEFT JOIN ingredients i
                ON i.id = rm.ingredient_id
            WHERE ar.scan_id = ANY($1::bigint[])
            ORDER BY ar.scan_id, rm.id;
        `,
        [[scan1, scan2]]
    );

    const ingredientsByScan = {
        [scan1]: [],
        [scan2]: [],
    };

    for (const row of ingredientsResult.rows) {
        ingredientsByScan[String(row.scan_id)]?.push({
            id: String(row.id),
            name: row.name,
            order: row.ingredient_order,
            detectedBy: row.detected_by,
        });
    }

    const rulesByScan = {
        [scan1]: [],
        [scan2]: [],
    };

    for (const row of ruleResult.rows) {
        rulesByScan[String(row.scan_id)]?.push({
            id: String(row.id),
            ingredientId: row.ingredient_id
                ? String(row.ingredient_id)
                : null,
            ingredientName: row.ingredient_name || null,
            ruleCode: row.rule_code,
            ruleName: row.rule_name,
            matchedValue: row.matched_value,
            severity: row.severity,
            explanation: row.explanation,
        });
    }

    product1.ingredients = ingredientsByScan[scan1];
    product2.ingredients = ingredientsByScan[scan2];
    product1.rules = rulesByScan[scan1];
    product2.rules = rulesByScan[scan2];

    const profile = profileResult.rows[0] || null;

    // Existing deterministic nutrition comparison logic is reused rather
    // than creating a second scoring algorithm.
    const goal = profile?.max_sugar_threshold !== null &&
        profile?.max_sugar_threshold !== undefined
        ? "low-sugar"
        : profile?.max_sodium_threshold !== null &&
            profile?.max_sodium_threshold !== undefined
          ? "low-sodium"
          : "general";

    const nutritionComparison = compareNutrition({
        nutrition1: product1.nutrition,
        nutrition2: product2.nutrition,
        servingSize1: parseServingSize(product1.servingSize),
        servingSize2: parseServingSize(product2.servingSize),
        nutritionBasis1: "per-serving",
        nutritionBasis2: "per-serving",
        goal,
    });

    const safetyWinner = determineSafetyWinner(product1, product2);
    const overallWinner = determineOverallWinner(
        product1,
        product2,
        nutritionComparison
    );

    const overallMessage =
        overallWinner === "product1"
            ? `${product1.name} is the stronger overall choice based primarily on the LabelIQ safety score, with nutrition comparison used as supporting evidence.`
            : overallWinner === "product2"
              ? `${product2.name} is the stronger overall choice based primarily on the LabelIQ safety score, with nutrition comparison used as supporting evidence.`
              : overallWinner === "tie"
                ? "The products are very close overall. Review the metric-level differences before choosing."
                : "A clear overall winner could not be determined from the available data.";

    return {
        products: [product1, product2],

        profile: profile
            ? {
                  dietaryMode: profile.dietary_mode || null,
                  analysisStrictness:
                      profile.analysis_strictness || null,
                  calorieLimit: toNumber(profile.calorie_limit),
                  maxSugarThreshold: toNumber(
                      profile.max_sugar_threshold
                  ),
                  maxSodiumThreshold: toNumber(
                      profile.max_sodium_threshold
                  ),
              }
            : null,

        comparison: {
            winner: overallWinner,
            safetyWinner,
            nutritionWinner: nutritionComparison.winner,
            overallMessage,
            safetyScoreDifference:
                product1.score !== null && product2.score !== null
                    ? Number(
                          Math.abs(product1.score - product2.score).toFixed(2)
                      )
                    : null,
            nutrition: nutritionComparison,
        },
    };
};

module.exports = {
    getComparison,
};