"use strict";

const pool = require("../config/db");

// ============================================
// CONSTANTS
// ============================================

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const MAX_SEARCH_LENGTH = 100;

const VALID_GRADES = ["A", "B", "C", "D"];
const VALID_RANGES = ["today", "7d", "30d", "custom"];

// Whitelisted sort options. The key comes from the client, the SQL
// fragment is chosen here, so user input never reaches ORDER BY.
const SORT_OPTIONS = {
    newest: "ar.created_at DESC NULLS LAST, sp.id DESC",
    oldest: "ar.created_at ASC NULLS LAST, sp.id ASC",
    score_high: "sp.safety_score DESC NULLS LAST, sp.id DESC",
    score_low: "sp.safety_score ASC NULLS LAST, sp.id DESC",
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// ============================================
// HELPERS
// ============================================

const badRequest = (message) => {
    const error = new Error(message);
    error.statusCode = 400;
    return error;
};

const isRealDate = (value) => {
    if (!DATE_PATTERN.test(value)) {
        return false;
    }

    const parsed = new Date(`${value}T00:00:00Z`);

    return (
        !Number.isNaN(parsed.getTime()) &&
        parsed.toISOString().slice(0, 10) === value
    );
};

const parsePositiveInt = (value, name) => {
    if (!/^\d+$/.test(String(value))) {
        throw badRequest(`${name} must be a positive whole number`);
    }

    const number = Number(value);

    if (!Number.isSafeInteger(number) || number < 1) {
        throw badRequest(`${name} must be a positive whole number`);
    }

    return number;
};

// Escapes LIKE wildcards so the search term is matched literally.
const escapeLike = (text) => text.replace(/[\\%_]/g, "\\$&");

// True when the request carries any Group 4 query parameter. Without
// them the legacy (unpaginated) response is kept so existing callers
// such as the Dashboard keep working.
const hasHistoryQuery = (query = {}) =>
    ["page", "limit", "search", "grade", "range", "from", "to", "sort"].some(
        (key) => query[key] !== undefined
    );

// ============================================
// VALIDATE + NORMALIZE QUERY PARAMS
// ============================================

const parseHistoryQuery = (query = {}) => {
    const page =
        query.page === undefined
            ? DEFAULT_PAGE
            : parsePositiveInt(query.page, "page");

    const limit =
        query.limit === undefined
            ? DEFAULT_LIMIT
            : parsePositiveInt(query.limit, "limit");

    if (limit > MAX_LIMIT) {
        throw badRequest(`limit cannot be greater than ${MAX_LIMIT}`);
    }

    let search = "";

    if (query.search !== undefined) {
        if (typeof query.search !== "string") {
            throw badRequest("search must be text");
        }

        search = query.search.trim().replace(/\s+/g, " ");

        if (search.length > MAX_SEARCH_LENGTH) {
            throw badRequest(
                `search must be at most ${MAX_SEARCH_LENGTH} characters`
            );
        }
    }

    let grade = null;

    if (query.grade !== undefined && query.grade !== "" && query.grade !== "all") {
        grade = String(query.grade).trim().toUpperCase();

        if (!VALID_GRADES.includes(grade)) {
            throw badRequest("grade must be one of A, B, C or D");
        }
    }

    const sort =
        query.sort === undefined || query.sort === ""
            ? "newest"
            : String(query.sort);

    if (!Object.prototype.hasOwnProperty.call(SORT_OPTIONS, sort)) {
        throw badRequest(
            `sort must be one of ${Object.keys(SORT_OPTIONS).join(", ")}`
        );
    }

    let range = null;

    if (query.range !== undefined && query.range !== "" && query.range !== "all") {
        range = String(query.range);

        if (!VALID_RANGES.includes(range)) {
            throw badRequest("range must be one of today, 7d, 30d or custom");
        }
    }

    let from = null;
    let to = null;

    if (range === "custom") {
        from = query.from ? String(query.from) : null;
        to = query.to ? String(query.to) : null;

        if (!from && !to) {
            throw badRequest("custom range needs a from date, a to date, or both");
        }

        if (from && !isRealDate(from)) {
            throw badRequest("from must be a valid date (YYYY-MM-DD)");
        }

        if (to && !isRealDate(to)) {
            throw badRequest("to must be a valid date (YYYY-MM-DD)");
        }

        if (from && to && from > to) {
            throw badRequest("from date cannot be after to date");
        }
    }

    return { page, limit, search, grade, sort, range, from, to };
};

// ============================================
// BUILD WHERE CLAUSE (parameterized)
// ============================================

const buildWhere = (userId, filters) => {
    // Ownership always comes first and always uses the JWT user id.
    const conditions = ["sp.user_id = $1"];
    const params = [userId];

    const add = (sqlWithPlaceholder, value) => {
        params.push(value);
        conditions.push(sqlWithPlaceholder.replace("?", `$${params.length}`));
    };

    if (filters.search) {
        add(
            "sp.product_name ILIKE ? ESCAPE '\\'",
            `%${escapeLike(filters.search)}%`
        );
    }

    if (filters.grade) {
        add("sp.safety_grade = ?", filters.grade);
    }

    if (filters.range === "today") {
        conditions.push("ar.created_at >= date_trunc('day', NOW())");
    } else if (filters.range === "7d") {
        conditions.push("ar.created_at >= NOW() - INTERVAL '7 days'");
    } else if (filters.range === "30d") {
        conditions.push("ar.created_at >= NOW() - INTERVAL '30 days'");
    } else if (filters.range === "custom") {
        if (filters.from) {
            add("ar.created_at >= ?::date", filters.from);
        }

        if (filters.to) {
            add("ar.created_at < (?::date + INTERVAL '1 day')", filters.to);
        }
    }

    return {
        whereSql: conditions.join(" AND "),
        params,
    };
};

// ============================================
// GET PAGINATED HISTORY
// ============================================

const getPaginatedHistory = async (userId, rawQuery) => {
    const filters = parseHistoryQuery(rawQuery);

    const { whereSql, params } = buildWhere(userId, filters);

    const offset = (filters.page - 1) * filters.limit;

    const countQuery = `
        SELECT COUNT(*)::int AS total
        FROM scanned_products sp
        LEFT JOIN analysis_results ar
            ON ar.scan_id = sp.id
        WHERE ${whereSql};
    `;

    const limitIndex = params.length + 1;
    const offsetIndex = params.length + 2;

    // Same columns the legacy history returned, so the response
    // shape stays compatible with the existing frontend.
    const rowsQuery = `
        SELECT
            sp.id AS scan_id,
            sp.product_name,
            sp.safety_grade,
            sp.safety_score,
            sp.hidden_sugar_detected,
            sp.scan_status,

            ar.created_at AS created_at,
            ar.assessment,

            nd.serving_size,
            nd.calories,
            nd.protein_g,
            nd.carbohydrates_g,
            nd.total_fat_g,
            nd.saturated_fat_g,
            nd.dietary_fiber_g,
            nd.total_sugars_g,
            nd.added_sugars_g,
            nd.sodium_mg

        FROM scanned_products sp

        LEFT JOIN nutrition_details nd
            ON nd.scan_id = sp.id

        LEFT JOIN analysis_results ar
            ON ar.scan_id = sp.id

        WHERE ${whereSql}

        ORDER BY ${SORT_OPTIONS[filters.sort]}

        LIMIT $${limitIndex}
        OFFSET $${offsetIndex};
    `;

    const [countResult, rowsResult] = await Promise.all([
        pool.query(countQuery, params),
        pool.query(rowsQuery, [...params, filters.limit, offset]),
    ]);

    const total = countResult.rows[0]?.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / filters.limit));

    return {
        rows: rowsResult.rows,
        pagination: {
            page: filters.page,
            limit: filters.limit,
            total,
            totalPages,
            hasNext: filters.page < totalPages,
            hasPrev: filters.page > 1,
        },
        filters: {
            search: filters.search,
            grade: filters.grade,
            sort: filters.sort,
            range: filters.range,
            from: filters.from,
            to: filters.to,
        },
    };
};

module.exports = {
    hasHistoryQuery,
    getPaginatedHistory,
    parseHistoryQuery,
};