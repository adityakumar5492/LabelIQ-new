const validateProduct = (req, res, next) => {
    const { name, nutrition } = req.body;

    const errors = [];

    if (!name || typeof name !== "string" || !name.trim()) {
        errors.push("Product name is required");
    }

    if (nutrition) {
        const nutritionFields = [
            "calories",
            "protein",
            "carbohydrates",
            "totalFat",
            "saturatedFat",
            "sugar",
            "fiber",
            "sodium",
        ];

        for (const field of nutritionFields) {
            if (
                nutrition[field] !== undefined &&
                (typeof nutrition[field] !== "number" ||
                    nutrition[field] < 0)
            ) {
                errors.push(
                    `${field} must be a non-negative number`
                );
            }
        }
    }

    if (errors.length > 0) {
        return res.status(400).json({
            success: false,
            message: "Validation failed",
            errors,
        });
    }

    next();
};

module.exports = validateProduct;