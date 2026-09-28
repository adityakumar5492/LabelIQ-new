const pool = require("../config/db");

const createProduct = async ({
    userId,
    brandId,
    productName,
    imageUrl,
}) => {
    const query = `
        INSERT INTO scanned_products (
            user_id,
            brand_id,
            product_name,
            image_url
        )
        VALUES ($1, $2, $3, $4)
        RETURNING *;
    `;

    const values = [
        userId,
        brandId || null,
        productName || null,
        imageUrl || null,
    ];

    const result = await pool.query(query, values);

    return result.rows[0];
};

const getUserProducts = async (userId) => {
    const query = `
        SELECT
            sp.id,
            sp.product_name,
            sp.image_url,
            sp.safety_grade,
            sp.safety_score,
            sp.declared_sugar,
            sp.hidden_sugar_detected,
            sp.scan_status,
            sp.scanned_at,
            b.name AS brand_name
        FROM scanned_products sp
        LEFT JOIN brands b
            ON sp.brand_id = b.id
        WHERE sp.user_id = $1
        ORDER BY sp.scanned_at DESC;
    `;

    const result = await pool.query(query, [userId]);

    return result.rows;
};

const getProductById = async (productId, userId) => {
    const query = `
        SELECT
            sp.id,
            sp.product_name,
            sp.image_url,
            sp.safety_grade,
            sp.safety_score,
            sp.declared_sugar,
            sp.hidden_sugar_detected,
            sp.scan_status,
            sp.scanned_at,
            b.id AS brand_id,
            b.name AS brand_name
        FROM scanned_products sp
        LEFT JOIN brands b
            ON sp.brand_id = b.id
        WHERE sp.id = $1
          AND sp.user_id = $2;
    `;

    const result = await pool.query(query, [productId, userId]);

    return result.rows[0];
};

const deleteProduct = async (productId, userId) => {
    const query = `
        DELETE FROM scanned_products
        WHERE id = $1
          AND user_id = $2
        RETURNING *;
    `;

    const result = await pool.query(query, [productId, userId]);

    return result.rows[0];
};

module.exports = {
    createProduct,
    getUserProducts,
    getProductById,
    deleteProduct,
};