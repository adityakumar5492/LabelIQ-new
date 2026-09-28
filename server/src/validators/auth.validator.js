const { z } = require("zod");

const registerSchema = z.object({
    name: z
        .string()
        .min(2, "Name must be at least 2 characters")
        .max(100),

    email: z
        .string()
        .email("Invalid email address"),

    password: z
        .string()
        .min(6, "Password must be at least 6 characters")
        .max(100),
});

const loginSchema = z.object({
    email: z
        .string()
        .email("Invalid email address"),

    password: z
        .string()
        .min(6, "Password must be at least 6 characters")
        .max(100),
});

module.exports = {
    registerSchema,
    loginSchema,
};