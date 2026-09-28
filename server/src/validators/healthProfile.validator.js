const { z } = require("zod");

const healthProfileSchema = z.object({
    calorieLimit: z
        .number()
        .int()
        .positive()
        .optional(),

    maxSugarThreshold: z
        .number()
        .nonnegative()
        .optional(),

    maxSodiumThreshold: z
        .number()
        .nonnegative()
        .optional(),

    dietaryMode: z
        .string()
        .max(50)
        .optional(),

    analysisStrictness: z
        .enum(["strict", "moderate"])
        .optional(),
});

module.exports = {
    healthProfileSchema,
};