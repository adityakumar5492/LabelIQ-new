const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            minlength: 2,
            maxlength: 50,
        },

        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },

        password: {
            type: String,
            required: true,
            minlength: 6,
        },

        preferences: {
            goal: {
                type: String,
                enum: [
                    "general",
                    "low-sugar",
                    "low-sodium",
                    "high-protein",
                    "high-fiber",
                ],
                default: "general",
            },

            dietaryPreference: {
                type: String,
                enum: [
                    "none",
                    "vegetarian",
                    "vegan",
                ],
                default: "none",
            },

            allergens: [
                {
                    type: String,
                    trim: true,
                },
            ],

            ingredientsToAvoid: [
                {
                    type: String,
                    trim: true,
                },
            ],
        },
    },
    {
        timestamps: true,
    }
);

const User = mongoose.model("User", userSchema);

module.exports = User;