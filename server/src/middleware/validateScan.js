const mongoose = require("mongoose");

const validateScan = (req, res, next) => {
    const {
        productId,
        inputType,
        assessment,
    } = req.body;

    const errors = [];

    if (!productId) {
        errors.push("Product ID is required");
    } else if (!mongoose.Types.ObjectId.isValid(productId)) {
        errors.push("Invalid product ID");
    }

    const validInputTypes = [
        "barcode",
        "photo",
        "manual",
    ];

    if (!inputType) {
        errors.push("Input type is required");
    } else if (!validInputTypes.includes(inputType)) {
        errors.push(
            "Input type must be barcode, photo, or manual"
        );
    }

    const validAssessments = [
        "everyday",
        "regular",
        "occasional",
        "insufficient-data",
    ];

    if (
        assessment !== undefined &&
        !validAssessments.includes(assessment)
    ) {
        errors.push("Invalid assessment");
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

module.exports = validateScan;