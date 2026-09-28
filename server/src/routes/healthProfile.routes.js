const express = require("express");

const {
    upsertProfile,
    getProfile,
} = require("../controllers/healthProfile.controller");

const authenticate = require("../middleware/auth");
const validate = require("../middleware/validate");
const { healthProfileSchema } = require("../validators/healthProfile.validator");

const router = express.Router();

router.get(
    "/",
    authenticate,
    getProfile
);

router.put(
    "/",
    authenticate,
    validate(healthProfileSchema),
    upsertProfile
);

module.exports = router;