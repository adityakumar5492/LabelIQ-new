const mongoose = require("mongoose");

const scanRawDataSchema = new mongoose.Schema(
    {
        scan_id: {
            type: String,
            required: true,
        },

        user_id: {
            type: String,
            required: true,
        },

        filename: {
            type: String,
            default: null,
        },

        ocr: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },

        ai_analysis: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },

        rag: {
            type: mongoose.Schema.Types.Mixed,
            default: {
                sources: [],
            },
        },

        ai_insights: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },

        created_at: {
            type: Date,
            default: Date.now,
        },
    },
    {
        collection: "scan_raw_data",
        versionKey: false,
    }
);

// Used when fetching raw data for a specific user's scan
scanRawDataSchema.index({
    scan_id: 1,
    user_id: 1,
});

const ScanRawData = mongoose.model(
    "ScanRawData",
    scanRawDataSchema
);

module.exports = ScanRawData;