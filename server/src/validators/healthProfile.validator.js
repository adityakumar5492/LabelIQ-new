const { z } = require("zod");

// Dietary modes the rule engine supports ("none" = no dietary rules).
const DIETARY_MODE_VALUES = [
    "none",
    "vegan",
    "gluten-free",
    "keto",
    "type-2-diabetic",
];

// null means "no limit" (the form sends null for an empty field),
// so it must be accepted. Missing (undefined) means "leave as is".
const healthProfileSchema = z.object({
    calorieLimit: z
        .number()
        .int()
        .positive()
        .nullable()
        .optional(),

    maxSugarThreshold: z
        .number()
        .nonnegative()
        .nullable()
        .optional(),

    maxSodiumThreshold: z
        .number()
        .nonnegative()
        .nullable()
        .optional(),

    dietaryMode: z
        .enum(DIETARY_MODE_VALUES)
        .optional(),

    analysisStrictness: z
        .enum(["strict", "moderate"])
        .optional(),
});

module.exports = {
    healthProfileSchema,
    DIETARY_MODE_VALUES,
};