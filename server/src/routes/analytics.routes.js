const express = require("express");

const {
    getAnalyticsSummary,
} = require("../controllers/analytics.controller");

const authenticate = require("../middleware/auth");

const router = express.Router();

// ============================================
// GET ANALYTICS SUMMARY (authenticated user only)
// ============================================

router.get("/summary", authenticate, getAnalyticsSummary);

module.exports = router;