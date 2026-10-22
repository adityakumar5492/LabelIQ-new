"use strict";

const comparisonService = require("../services/comparison.service");

const compareScans = async (req, res) => {
    try {
        const { scan1, scan2 } = req.query;

        const comparison = await comparisonService.getComparison(
            req.user.userId,
            scan1,
            scan2
        );

        return res.status(200).json({
            success: true,
            message: "Scans compared successfully",
            data: comparison,
        });
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message,
            });
        }

        console.error("Compare scans error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to compare scans",
        });
    }
};

module.exports = {
    compareScans,
};
