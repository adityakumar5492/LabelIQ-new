const express = require("express");

const { askRag } = require("../controllers/rag.controller");
const protect = require("../middleware/auth.middleware");

const router = express.Router();

router.post("/ask", protect, askRag);

module.exports = router;