const scanService = require("../services/scan.service");

const scanProduct = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "Food label image is required",
            });
        }

        const result = await scanService.analyzeImage(
            req.file,
            req.user.userId
        );

        return res.status(200).json({
            success: true,
            message: "Image analyzed and saved successfully",
            data: result,
        });
    } catch (error) {
        console.error("Scan product error:", error);

        if (error.response) {
            return res.status(502).json({
                success: false,
                message: "AI service failed",
                error:
                    error.response.data?.detail ||
                    error.message,
            });
        }

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

const getScanHistory = async (req, res) => {
    try {
        const scans = await scanService.getScanHistory(
            req.user.userId
        );

        return res.status(200).json({
            success: true,
            message: "Scan history fetched successfully",
            data: scans,
        });
    } catch (error) {
        console.error(
            "Get scan history error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to fetch scan history",
        });
    }
};

const getScanById = async (req, res) => {
    try {
        const scan = await scanService.getScanById(
            req.user.userId,
            req.params.id
        );

        if (!scan) {
            return res.status(404).json({
                success: false,
                message: "Scan not found",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Scan fetched successfully",
            data: scan,
        });
    } catch (error) {
        console.error(
            "Get scan by ID error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Failed to fetch scan",
        });
    }
};

module.exports = {
    scanProduct,
    getScanHistory,
    getScanById,
};