const express = require("express");

const {
    getProfile,
    updatePreferences,
} = require("../controllers/user.controller");

const protect = require("../middleware/auth.middleware");

const router = express.Router();

router.get("/profile", protect, getProfile);

router.patch("/preferences",protect,updatePreferences
);

module.exports = router;