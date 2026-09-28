const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const authRoutes = require("./routes/auth.routes");
const healthProfileRoutes = require("./routes/healthProfile.routes");
const blocklistRoutes = require("./routes/blocklist.routes");
const brandRoutes = require("./routes/brand.routes");
const productRoutes = require("./routes/product.routes");
const scanRoutes = require("./routes/scan.routes");


const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(morgan("dev"));

app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        message: "LabelIQ API is running"
    });
});


app.use("/api/auth", authRoutes);
app.use("/api/health-profile", healthProfileRoutes);
app.use("/api/blocklist", blocklistRoutes);
app.use("/api/brands", brandRoutes);
app.use("/api/products", productRoutes);
app.use("/api/scan", scanRoutes);




module.exports = app;