const express = require("express");

const {
    createBrand,
    getBrands,
    getBrandById,
} = require("../controllers/brand.controller");

const authenticate = require("../middleware/auth");
const validate = require("../middleware/validate");
const { brandSchema } = require("../validators/brand.validator");

const router = express.Router();

router.get(
    "/",
    authenticate,
    getBrands
);

router.get(
    "/:id",
    authenticate,
    getBrandById
);

router.post(
    "/",
    authenticate,
    validate(brandSchema),
    createBrand
);

module.exports = router;