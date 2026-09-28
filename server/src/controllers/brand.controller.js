const brandService = require("../services/brand.service");

const createBrand = async (req, res) => {
    try {
        const { name } = req.body;

        const brand = await brandService.createBrand({ name });

        return res.status(201).json({
            success: true,
            message: "Brand created successfully",
            data: brand,
        });
    } catch (error) {
        console.error("Create brand error:", error);

        if (error.code === "23505") {
            return res.status(409).json({
                success: false,
                message: "Brand already exists",
            });
        }

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

const getBrands = async (req, res) => {
    try {
        const brands = await brandService.getBrands();

        return res.status(200).json({
            success: true,
            data: brands,
        });
    } catch (error) {
        console.error("Get brands error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

const getBrandById = async (req, res) => {
    try {
        const brand = await brandService.getBrandById(req.params.id);

        if (!brand) {
            return res.status(404).json({
                success: false,
                message: "Brand not found",
            });
        }

        return res.status(200).json({
            success: true,
            data: brand,
        });
    } catch (error) {
        console.error("Get brand error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

module.exports = {
    createBrand,
    getBrands,
    getBrandById,
};