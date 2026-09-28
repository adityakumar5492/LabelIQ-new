const express = require("express");
const multer = require("multer");

const {
    scanProduct,
} = require("../controllers/scan.controller");

const authenticate = require("../middleware/auth");

const router = express.Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024,
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith("image/")) {
            cb(null, true);
        } else {
            cb(new Error("Only image files are allowed"));
        }
    },
});

router.post(
    "/",
    authenticate,
    upload.single("image"),
    scanProduct
);

module.exports = router;