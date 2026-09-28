const scanService = require("../services/scan.service");

const scanProduct = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "Food label image is required",
            });
        }

        const result = await scanService.analyzeImage(req.file);

        return res.status(200).json({
            success: true,
            message: "Image analyzed successfully",
            data: result,
        });
    } catch (error) {
        console.error("Scan product error:", error);

        if (error.response) {
            return res.status(502).json({
                success: false,
                message: "AI service failed",
                error: error.response.data?.detail || error.message,
            });
        }

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

module.exports = {
    scanProduct,
};