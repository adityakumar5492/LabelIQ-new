const pool = require("../config/db");

// API property -> health_profiles column.
// Column names come from this fixed list only (never from user input).
const PROFILE_FIELDS = [
    ["calorieLimit", "calorie_limit"],
    ["maxSugarThreshold", "max_sugar_threshold"],
    ["maxSodiumThreshold", "max_sodium_threshold"],
    ["dietaryMode", "dietary_mode"],
    ["analysisStrictness", "analysis_strictness"],
];

// Partial updates are safe:
//   - a property that is NOT sent (undefined) keeps its stored value
//     (before, it was overwritten with NULL, wiping the other limits
//     and the dietary mode);
//   - a property sent as null clears that value (e.g. "no sugar limit");
//   - a property that is not sent on first save uses the database
//     default instead of an explicit NULL.
const createOrUpdateProfile = async ({ userId, ...fields }) => {
    const columns = ["user_id"];
    const placeholders = ["$1"];
    const values = [userId];
    const updates = [];

    for (const [property, column] of PROFILE_FIELDS) {
        if (fields[property] === undefined) {
            continue;
        }

        values.push(fields[property]);
        columns.push(column);
        placeholders.push(`$${values.length}`);
        updates.push(`${column} = EXCLUDED.${column}`);
    }

    updates.push("updated_at = NOW()");

    const query = `
        INSERT INTO health_profiles (
            ${columns.join(",\n            ")}
        )
        VALUES (${placeholders.join(", ")})
        ON CONFLICT (user_id)
        DO UPDATE SET
            ${updates.join(",\n            ")}
        RETURNING *;
    `;

    const result = await pool.query(query, values);

    return result.rows[0];
};

const getProfileByUserId = async (userId) => {
    const query = `
        SELECT *
        FROM health_profiles
        WHERE user_id = $1;
    `;

    const result = await pool.query(query, [userId]);

    return result.rows[0];
};

module.exports = {
    createOrUpdateProfile,
    getProfileByUserId,
};