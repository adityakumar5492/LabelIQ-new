const { z } = require("zod");

const blocklistSchema = z.object({
    ingredientName: z
        .string()
        .min(1, "Ingredient name is required")
        .max(255),

    reason: z
        .string()
        .max(255)
        .optional(),
});

module.exports = {
    blocklistSchema,
};