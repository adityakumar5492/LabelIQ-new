"use strict";

const analyticsService = require("../services/analytics.service");

const getAnalyticsSummary = async (req, res) => {
    try {
        const data = await analyticsService.getAnalyticsSummary(
            req.user.userId,
            req.query.days
        );

        return res.status(200).json({
            success: true,
            message: "Analytics fetched successfully",
            data,
        });
    } catch (error) {
        if (error.statusCode === 400) {
            return res.status(400).json({
                success: false,
                message: error.message,
            });
        }

        console.error("Get analytics summary error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch analytics",
        });
    }
};

module.exports = {
    getAnalyticsSummary,
};