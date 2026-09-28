const pool = require("../config/db");

const addIngredient = async ({ userId, ingredientName, reason }) => {
    const query = `
        INSERT INTO ingredient_blocklist (
            user_id,
            ingredient_name,
            reason
        )
        VALUES ($1, $2, $3)
        RETURNING *;
    `;

    const values = [userId, ingredientName, reason];

    const result = await pool.query(query, values);

    return result.rows[0];
};

const getUserBlocklist = async (userId) => {
    const query = `
        SELECT id, ingredient_name, reason, created_at
        FROM ingredient_blocklist
        WHERE user_id = $1
        ORDER BY created_at DESC;
    `;

    const result = await pool.query(query, [userId]);

    return result.rows;
};

const deleteIngredient = async (userId, id) => {
    const query = `
        DELETE FROM ingredient_blocklist
        WHERE id = $1 AND user_id = $2
        RETURNING *;
    `;

    const result = await pool.query(query, [id, userId]);

    return result.rows[0];
};

module.exports = {
    addIngredient,
    getUserBlocklist,
    deleteIngredient,
};