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

    } catch (error) {
        console.error("Database connection failed:", error.message);
        process.exit(1);
    }
};

startServer();