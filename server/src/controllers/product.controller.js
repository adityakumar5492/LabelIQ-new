const productService = require("../services/product.service");

const createProduct = async (req, res) => {
    try {
        const {
            brandId,
            productName,
            imageUrl,
        } = req.body;

        const product = await productService.createProduct({
            userId: req.user.userId,
            brandId,
            productName,
            imageUrl,
        });

        return res.status(201).json({
            success: true,
            message: "Product created successfully",
            data: product,
        });
    } catch (error) {
        console.error("Create product error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

const getProducts = async (req, res) => {
    try {
        const products = await productService.getUserProducts(
            req.user.userId
        );

        return res.status(200).json({
            success: true,
            data: products,
        });
    } catch (error) {
        console.error("Get products error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

const getProduct = async (req, res) => {
    try {
        const product = await productService.getProductById(
            req.params.id,
            req.user.userId
        );

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found",
            });
        }

        return res.status(200).json({
            success: true,
            data: product,
        });
    } catch (error) {
        console.error("Get product error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

const deleteProduct = async (req, res) => {
    try {
        const product = await productService.deleteProduct(
            req.params.id,
            req.user.userId
        );

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Product deleted successfully",
            data: product,
        });
    } catch (error) {
        console.error("Delete product error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

module.exports = {
    createProduct,
    getProducts,
    getProduct,
    deleteProduct,
};