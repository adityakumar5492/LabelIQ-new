const express = require("express");

const {
    createProduct,
    getProducts,
    getProduct,
    deleteProduct,
} = require("../controllers/product.controller");

const authenticate = require("../middleware/auth");

const router = express.Router();

router.get(
    "/",
    authenticate,
    getProducts
);

router.get(
    "/:id",
    authenticate,
    getProduct
);

router.post(
    "/",
    authenticate,
    createProduct
);

router.delete(
    "/:id",
    authenticate,
    deleteProduct
);

module.exports = router;