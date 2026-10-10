const express = require("express");

const {
    analyzeProductNutrition,
} = require("../controllers/nutrition.controller");

const protect = require("../middleware/auth.middleware");

const router = express.Router();

router.get(
    "/products/:productId",
    protect,
    analyzeProductNutrition
);

module.exports = router;