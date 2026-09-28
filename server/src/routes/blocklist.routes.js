const express = require("express");

const {
    addIngredient,
    getBlocklist,
    removeIngredient,
} = require("../controllers/blocklist.controller");

const authenticate = require("../middleware/auth");
const validate = require("../middleware/validate");
const { blocklistSchema } = require("../validators/blocklist.validator");

const router = express.Router();

router.get(
    "/",
    authenticate,
    getBlocklist
);

router.post(
    "/",
    authenticate,
    validate(blocklistSchema),
    addIngredient
);

router.delete(
    "/:id",
    authenticate,
    removeIngredient
);

module.exports = router;