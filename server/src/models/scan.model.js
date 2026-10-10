const mongoose = require("mongoose");

const scanSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            required: true,
        },

        inputType: {
            type: String,
            enum: [
                "barcode",
                "photo",
                "manual",
            ],
            required: true,
        },

        assessment: {
            type: String,
            enum: [
                "everyday",
                "regular",
                "occasional",
                "insufficient-data",
            ],
        },
    },
    {
        timestamps: true,
    }
);

const Scan = mongoose.model("Scan", scanSchema);

module.exports = Scan;