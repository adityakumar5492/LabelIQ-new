const { z } = require("zod");

const brandSchema = z.object({
    name: z
        .string()
        .min(1, "Brand name is required")
        .max(255),
});

module.exports = {
    brandSchema,
};