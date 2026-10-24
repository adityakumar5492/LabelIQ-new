require("dotenv").config();

const app = require("./app");
const pool = require("./config/db");
const connectMongoDB = require("./config/mongo");

const PORT = process.env.PORT || 5000;

const startServer = async () => {
    try {
        await pool.query("SELECT NOW()");
        console.log("PostgreSQL connected successfully");

        await connectMongoDB();

        app.listen(PORT, () => {
            console.log(`LabelIQ server running on port ${PORT}`);
        });

        // Load Tesseract (WASM + language data) in the background so the
        // first scan after a deploy / restart does not pay for it.
        // Failure is harmless: the first scan simply loads it itself.
        require("./ai/ocr/ocr.service")
            .warmUpOcr()
            .then(() => console.log("OCR engine warmed up"))
            .catch((error) =>
                console.error("OCR warm-up failed:", error.message)
            );

    } catch (error) {
        console.error("Database connection failed:", error.message);
        process.exit(1);
    }
};

startServer();