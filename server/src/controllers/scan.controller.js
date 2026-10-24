"use strict";

const scanService = require("../services/scan.service");
const historyService = require("../services/history.service");
const { createScanTimer } = require("../utils/scanTimer");

const MAX_PRODUCT_NAME_LENGTH = 255;

const scanProduct = async (req, res) => {
    const timer = createScanTimer();

    // If the browser gives up (timeout, closed tab, Retry) the scan must
    // stop: otherwise the abandoned scan keeps burning CPU and Groq quota
    // while the retried scan waits behind it.
    const abortController = new AbortController();

    res.on("close", () => {
        if (!res.writableEnded) {
            abortController.abort();
        }
    });

    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "Food label image is required",
            });
        }

        const result = await scanService.analyzeImage(
            req.file,
            req.user.userId,
            { signal: abortController.signal, timer }
        );

        return res.status(200).json({
            success: true,
            message: "Image analyzed and saved successfully",
            data: result,
        });
    } catch (error) {
        if (error?.code === "SCAN_ABORTED") {
            timer.log(`cancelled after ${timer.elapsed()} ms (client disconnected)`);

            return;
        }

        timer.log(`FAILED after ${timer.elapsed()} ms: ${error.message}`);
        console.error("Scan product error:", error);

        // 429 / 503 come from the AI provider (rate limit / unavailable);
        // everything else stays a plain 500 as before.
        const status =
            error?.statusCode === 429 || error?.statusCode === 503
                ? error.statusCode
                : 500;

        return res.status(status).json({
            success: false,
            message: error.message || "Failed to analyze image",
        });
    }
};

const getScanHistory = async (req, res) => {
    try {
        // Legacy call (no query params): unchanged response, still used
        // by the Dashboard.
        if (!historyService.hasHistoryQuery(req.query)) {
            const scans = await scanService.getScanHistory(
                req.user.userId
            );

            return res.status(200).json({
                success: true,
                message: "Scan history fetched successfully",
                data: scans,
            });
        }

        // Group 4: server-side search / filter / sort / pagination.
        // `data` stays an array, pagination + filters are added beside it.
        const history = await historyService.getPaginatedHistory(
            req.user.userId,
            req.query
        );

        return res.status(200).json({
            success: true,
            message: "Scan history fetched successfully",
            data: history.rows,
            pagination: history.pagination,
            filters: history.filters,
        });
    } catch (error) {
        if (error.statusCode === 400) {
            return res.status(400).json({
                success: false,
                message: error.message,
            });
        }

        console.error("Get scan history error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch scan history",
        });
    }
};

const getScanById = async (req, res) => {
    try {
        const scan = await scanService.getScanById(
            req.user.userId,
            req.params.id
        );

        if (!scan) {
            return res.status(404).json({
                success: false,
                message: "Scan not found",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Scan fetched successfully",
            data: scan,
        });
    } catch (error) {
        console.error("Get scan by ID error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch scan",
        });
    }
};

// Manual product name entry (used when the label name was
// not confidently extracted).
const updateProductName = async (req, res) => {
    try {
        const rawName = req.body?.productName;

        if (typeof rawName !== "string") {
            return res.status(400).json({
                success: false,
                message: "Product name is required",
            });
        }

        const productName = rawName.trim().replace(/\s+/g, " ");

        if (!productName) {
            return res.status(400).json({
                success: false,
                message: "Product name cannot be empty",
            });
        }

        if (productName.length > MAX_PRODUCT_NAME_LENGTH) {
            return res.status(400).json({
                success: false,
                message: `Product name must be at most ${MAX_PRODUCT_NAME_LENGTH} characters`,
            });
        }

        const updated = await scanService.updateProductName(
            req.user.userId,
            req.params.id,
            productName
        );

        if (!updated) {
            return res.status(404).json({
                success: false,
                message: "Scan not found",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Product name updated successfully",
            data: updated,
        });
    } catch (error) {
        console.error("Update product name error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to update product name",
        });
    }
};

module.exports = {
    scanProduct,
    getScanHistory,
    getScanById,
    updateProductName,
};