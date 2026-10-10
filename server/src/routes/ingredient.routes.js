const express = require("express");

const {
    analyzeProductIngredients,
} = require("../controllers/ingredient.controller");

const protect = require("../middleware/auth.middleware");

const router = express.Router();

router.get(
    "/products/:productId",
    protect,
    analyzeProductIngredients
);

module.exports = router;