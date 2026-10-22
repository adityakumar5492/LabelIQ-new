"use strict";

const express = require("express");
const authenticate = require("../middleware/auth");
const {
    compareScans,
} = require("../controllers/comparison.controller");

const router = express.Router();

// GET /api/comparison?scan1=123&scan2=456
router.get(
    "/",
    authenticate,
    compareScans
);

module.exports = router;
