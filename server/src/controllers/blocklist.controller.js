const blocklistService = require("../services/blocklist.service");

const addIngredient = async (req, res) => {
    try {
        const { ingredientName, reason } = req.body;

        const ingredient = await blocklistService.addIngredient({
            userId: req.user.userId,
            ingredientName,
            reason,
        });

        return res.status(201).json({
            success: true,
            message: "Ingredient added to blocklist",
            data: ingredient,
        });
    } catch (error) {
        console.error("Add blocklist ingredient error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

const getBlocklist = async (req, res) => {
    try {
        const ingredients = await blocklistService.getUserBlocklist(
            req.user.userId
        );

        return res.status(200).json({
            success: true,
            data: ingredients,
        });
    } catch (error) {
        console.error("Get blocklist error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

const removeIngredient = async (req, res) => {
    try {
        const ingredient = await blocklistService.deleteIngredient(
            req.user.userId,
            req.params.id
        );

        if (!ingredient) {
            return res.status(404).json({
                success: false,
                message: "Ingredient not found",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Ingredient removed from blocklist",
            data: ingredient,
        });
    } catch (error) {
        console.error("Remove blocklist ingredient error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

module.exports = {
    addIngredient,
    getBlocklist,
    removeIngredient,
};