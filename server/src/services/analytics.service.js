"use strict";

const pool = require("../config/db");

const ALLOWED_DAYS = [7, 30, 90];
const DEFAULT_DAYS = 30;
const TOP_LIMIT = 8;

const badRequest = (message) => {
    const error = new Error(message);
    error.statusCode = 400;
    return error;
};

const parseDays = (value) => {
    if (value === undefined || value === "") {
        return DEFAULT_DAYS;
    }

    const days = Number(value);

    if (!ALLOWED_DAYS.includes(days)) {
        throw badRequest(`days must be one of ${ALLOWED_DAYS.join(", ")}`);
    }

    return days;
};

// ============================================
// ANALYTICS SUMMARY
// Every query is scoped by:
// 1. Authenticated user
// 2. Selected analytics period
// ============================================

const getAnalyticsSummary = async (userId, rawDays) => {
    const days = parseDays(rawDays);

    // We use the same date boundary for every analytics query.
    //
    // Example:
    // days = 7
    // → today + previous 6 days
    // → total 7 calendar days
    const dateFilter = `
        sp.user_id = $1
        AND sp.created_at >= (CURRENT_DATE - ($2::int - 1))
    `;

    // ============================================
    // 1. OVERVIEW
    // ============================================

    const overviewQuery = `
        SELECT
            COUNT(*)::int AS total_scans,

            COUNT(sp.safety_score)::int AS scored_scans,

            ROUND(
                AVG(sp.safety_score)::numeric,
                1
            ) AS average_score,

            MAX(sp.safety_score) AS best_score,

            MIN(sp.safety_score) AS lowest_score,

            COUNT(*) FILTER (
                WHERE sp.hidden_sugar_detected = TRUE
            )::int AS hidden_sugar_scans,

            COUNT(*) FILTER (
                WHERE sp.safety_grade = 'A'
            )::int AS grade_a,

            COUNT(*) FILTER (
                WHERE sp.safety_grade = 'B'
            )::int AS grade_b,

            COUNT(*) FILTER (
                WHERE sp.safety_grade = 'C'
            )::int AS grade_c,

            COUNT(*) FILTER (
                WHERE sp.safety_grade = 'D'
            )::int AS grade_d

        FROM scanned_products sp

        WHERE ${dateFilter};
    `;

    // ============================================
    // 2. SCAN ACTIVITY PER DAY
    // Missing days are returned with 0 scans.
    // ============================================

    const activityQuery = `
        WITH day_series AS (
            SELECT generate_series(
                (
                    CURRENT_DATE - ($2::int - 1)
                )::timestamp,

                CURRENT_DATE::timestamp,

                INTERVAL '1 day'
            )::date AS day
        ),

        daily AS (
            SELECT
                ar.created_at::date AS day,

                COUNT(*)::int AS scans,

                ROUND(
                    AVG(sp.safety_score)::numeric,
                    1
                ) AS average_score

            FROM scanned_products sp

            JOIN analysis_results ar
                ON ar.scan_id = sp.id

            WHERE sp.user_id = $1
              AND ar.created_at >= (
                    CURRENT_DATE - ($2::int - 1)
              )

            GROUP BY ar.created_at::date
        )

        SELECT
            TO_CHAR(
                ds.day,
                'YYYY-MM-DD'
            ) AS date,

            COALESCE(
                d.scans,
                0
            )::int AS scans,

            d.average_score

        FROM day_series ds

        LEFT JOIN daily d
            ON d.day = ds.day

        ORDER BY ds.day ASC;
    `;

    // ============================================
    // 3. MOST FREQUENTLY FLAGGED INGREDIENTS
    // ============================================

    const ingredientsQuery = `
        SELECT
            i.name AS ingredient,

            COUNT(*)::int AS matches,

            COUNT(
                DISTINCT sp.id
            )::int AS scans

        FROM rule_matches rm

        JOIN analysis_results ar
            ON ar.id = rm.analysis_id

        JOIN scanned_products sp
            ON sp.id = ar.scan_id

        JOIN ingredients i
            ON i.id = rm.ingredient_id

        WHERE sp.user_id = $1
          AND sp.created_at >= (
                CURRENT_DATE - ($2::int - 1)
          )

        GROUP BY i.name

        ORDER BY
            matches DESC,
            i.name ASC

        LIMIT $3;
    `;

    // ============================================
    // 4. MOST FREQUENTLY TRIGGERED RULES
    // Includes nutrition rules that may not have
    // an ingredient attached.
    // ============================================

    const rulesQuery = `
        SELECT
            rm.rule_code,

            MAX(
                rm.rule_name
            ) AS rule_name,

            COUNT(*)::int AS matches,

            COUNT(
                DISTINCT sp.id
            )::int AS scans

        FROM rule_matches rm

        JOIN analysis_results ar
            ON ar.id = rm.analysis_id

        JOIN scanned_products sp
            ON sp.id = ar.scan_id

        WHERE sp.user_id = $1
          AND sp.created_at >= (
                CURRENT_DATE - ($2::int - 1)
          )

        GROUP BY rm.rule_code

        ORDER BY
            matches DESC,
            rm.rule_code ASC

        LIMIT $3;
    `;

    const [
        overview,
        activity,
        ingredients,
        rules,
    ] = await Promise.all([
        pool.query(
            overviewQuery,
            [userId, days]
        ),

        pool.query(
            activityQuery,
            [userId, days]
        ),

        pool.query(
            ingredientsQuery,
            [userId, days, TOP_LIMIT]
        ),

        pool.query(
            rulesQuery,
            [userId, days, TOP_LIMIT]
        ),
    ]);

    const o = overview.rows[0];

    return {
        totals: {
            totalScans: o.total_scans,

            scoredScans: o.scored_scans,

            averageScore:
                o.average_score === null
                    ? null
                    : Number(o.average_score),

            bestScore:
                o.best_score === null
                    ? null
                    : Number(o.best_score),

            lowestScore:
                o.lowest_score === null
                    ? null
                    : Number(o.lowest_score),

            hiddenSugarScans:
                o.hidden_sugar_scans,
        },

        gradeDistribution: [
            {
                grade: "A",
                count: o.grade_a,
            },
            {
                grade: "B",
                count: o.grade_b,
            },
            {
                grade: "C",
                count: o.grade_c,
            },
            {
                grade: "D",
                count: o.grade_d,
            },
        ],

        activity: {
            days,

            points: activity.rows.map(
                (row) => ({
                    date: row.date,

                    scans: row.scans,

                    averageScore:
                        row.average_score === null
                            ? null
                            : Number(
                                  row.average_score
                              ),
                })
            ),
        },

        topIngredients:
            ingredients.rows,

        topRules:
            rules.rows,
    };
};

module.exports = {
    getAnalyticsSummary,
};