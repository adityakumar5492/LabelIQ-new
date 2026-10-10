const User = require("../models/user.model");

const getProfile = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id).select(
            "-password"
        );

        if (!user) {
            const error = new Error("User not found");
            error.statusCode = 404;
            throw error;
        }

        res.status(200).json({
            success: true,
            data: user,
        });
    } catch (error) {
        next(error);
    }
};

const updatePreferences = async (req, res, next) => {
    try {
        const {
            goal,
            dietaryPreference,
            allergens,
            ingredientsToAvoid,
        } = req.body;

        const user = await User.findById(req.user.id);

        if (!user) {
            const error = new Error("User not found");
            error.statusCode = 404;
            throw error;
        }

        if (goal !== undefined) {
            user.preferences.goal = goal;
        }

        if (dietaryPreference !== undefined) {
            user.preferences.dietaryPreference =
                dietaryPreference;
        }

        if (allergens !== undefined) {
            user.preferences.allergens = allergens;
        }

        if (ingredientsToAvoid !== undefined) {
            user.preferences.ingredientsToAvoid =
                ingredientsToAvoid;
        }

        await user.save();

        const updatedUser = await User.findById(
            req.user.id
        ).select("-password");

        res.status(200).json({
            success: true,
            message: "Preferences updated successfully",
            data: updatedUser.preferences,
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getProfile,
    updatePreferences,
};