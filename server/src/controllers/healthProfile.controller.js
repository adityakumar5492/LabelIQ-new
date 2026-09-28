const healthProfileService = require("../services/healthProfile.service");

const upsertProfile = async (req, res) => {
    try {
        const profile = await healthProfileService.createOrUpdateProfile({
            userId: req.user.userId,
            ...req.body,
        });

        return res.status(200).json({
            success: true,
            message: "Health profile saved successfully",
            data: profile,
        });
    } catch (error) {
        console.error("Health profile error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

const getProfile = async (req, res) => {
    try {
        const profile = await healthProfileService.getProfileByUserId(
            req.user.userId
        );

        return res.status(200).json({
            success: true,
            data: profile || null,
        });
    } catch (error) {
        console.error("Get health profile error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

module.exports = {
    upsertProfile,
    getProfile,
};