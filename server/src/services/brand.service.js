const pool = require("../config/db");

const createBrand = async ({ name }) => {
    const query = `
        INSERT INTO brands (name)
        VALUES ($1)
        RETURNING *;
    `;

    const result = await pool.query(query, [name]);

    return result.rows[0];
};

const getBrands = async () => {
    const query = `
        SELECT *
        FROM brands
        ORDER BY name ASC;
    `;

    const result = await pool.query(query);

    return result.rows;
};

const getBrandById = async (id) => {
    const query = `
        SELECT *
        FROM brands
        WHERE id = $1;
    `;

    const result = await pool.query(query, [id]);

    return result.rows[0];
};

module.exports = {
    createBrand,
    getBrands,
    getBrandById,
};