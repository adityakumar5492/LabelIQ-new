const pool = require("../config/db");

const createOrUpdateProfile = async ({
    userId,
    calorieLimit,
    maxSugarThreshold,
    maxSodiumThreshold,
    dietaryMode,
    analysisStrictness,
}) => {
    const query = `
        INSERT INTO health_profiles (
            user_id,
            calorie_limit,
            max_sugar_threshold,
            max_sodium_threshold,
            dietary_mode,
            analysis_strictness
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (user_id)
        DO UPDATE SET
            calorie_limit = EXCLUDED.calorie_limit,
            max_sugar_threshold = EXCLUDED.max_sugar_threshold,
            max_sodium_threshold = EXCLUDED.max_sodium_threshold,
            dietary_mode = EXCLUDED.dietary_mode,
            analysis_strictness = EXCLUDED.analysis_strictness,
            updated_at = NOW()
        RETURNING *;
    `;

    const values = [
        userId,
        calorieLimit,
        maxSugarThreshold,
        maxSodiumThreshold,
        dietaryMode,
        analysisStrictness,
    ];

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