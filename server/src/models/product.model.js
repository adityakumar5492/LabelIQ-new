const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },

        brand: {
            type: String,
            trim: true,
        },

        barcode: {
            type: String,
            unique: true,
            sparse: true,
            trim: true,
        },

        category: {
            type: String,
            trim: true,
        },

        imageUrl: {
            type: String,
            trim: true,
        },

        servingSize: {
            value: {
                type: Number,
                min: 0,
            },

            unit: {
                type: String,
                enum: ["g", "ml", "piece"],
            },
        },

        packageSize: {
            value: {
                type: Number,
                min: 0,
            },

            unit: {
                type: String,
                enum: ["g", "kg", "ml", "l", "piece"],
            },
        },

        ingredients: [
            {
                name: {
                    type: String,
                    required: true,
                    trim: true,
                },

                normalizedName: {
                    type: String,
                    trim: true,
                },

                purpose: {
                    type: String,
                    trim: true,
                },
            },
        ],
        nutritionBasis: {
            type: String,
            enum: [
                "per-serving",
                "per-100g",
                "per-100ml",
                "per-piece",
            ],
            default: "per-serving",
        },

        nutrition: {
            calories: {
                type: Number,
                min: 0,
            },

            protein: {
                type: Number,
                min: 0,
            },

            carbohydrates: {
                type: Number,
                min: 0,
            },

            totalFat: {
                type: Number,
                min: 0,
            },

            saturatedFat: {
                type: Number,
                min: 0,
            },

            sugar: {
                type: Number,
                min: 0,
            },

            fiber: {
                type: Number,
                min: 0,
            },

            sodium: {
                type: Number,
                min: 0,
            },
        },

        allergens: [
            {
                type: String,
                trim: true,
            },
        ],

        dataSource: {
            type: String,
            enum: [
                "barcode",
                "photo",
                "manual",
                "combined",
            ],
            default: "manual",
        },
    },
    {
        timestamps: true,
    }
);

const Product = mongoose.model("Product", productSchema);

module.exports = Product;