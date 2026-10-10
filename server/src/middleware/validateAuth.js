const validateRegister = (req, res, next) => {
    const { name, email, password } = req.body;

    const errors = [];

    if (!name || typeof name !== "string" || !name.trim()) {
        errors.push("Name is required");
    } else if (name.trim().length < 2) {
        errors.push("Name must be at least 2 characters");
    }

    if (!email || typeof email !== "string" || !email.trim()) {
        errors.push("Email is required");
    } else {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailRegex.test(email.trim())) {
            errors.push("Invalid email format");
        }
    }

    if (!password || typeof password !== "string") {
        errors.push("Password is required");
    } else if (password.length < 6) {
        errors.push("Password must be at least 6 characters");
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

const validateLogin = (req, res, next) => {
    const { email, password } = req.body;

    const errors = [];

    if (!email || typeof email !== "string" || !email.trim()) {
        errors.push("Email is required");
    }

    if (!password || typeof password !== "string") {
        errors.push("Password is required");
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

module.exports = {
    validateRegister,
    validateLogin,
};