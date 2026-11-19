const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const verifyCsrf = require("./middleware/csrfMiddleware");

const authRoutes = require("./routes/authRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const productRoutes = require("./routes/productRoutes");
const cartRoutes = require("./routes/cartRoutes");
const orderRoutes = require("./routes/orderRoutes");
const addressRoutes = require("./routes/addressRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const adminRoutes = require("./routes/adminRoutes");
const kitchenRoutes = require("./routes/kitchenRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const siteContentRoutes = require("./routes/siteContentRoutes");

const path = require("path");

const app = express();

// Security headers
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Serve static uploads
app.use("/uploads", express.static(path.join(__dirname, "../public/uploads")));

// Cookie Parser
app.use(cookieParser());

// CORS with credentials support - strictly trusted origins only
const allowedOrigins = [
    process.env.CLIENT_URL,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://192.168.56.1:5173",
    "http://192.168.0.101:5173"
].filter(Boolean);

app.use(
    cors({
        origin: function (origin, callback) {
            // allow requests with no origin (like mobile apps or curl)
            if (!origin) return callback(null, true);
            if (allowedOrigins.includes(origin)) {
                return callback(null, true);
            }
            return callback(new Error("CORS policy violation: unauthorized origin"), false);
        },
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token", "X-XSRF-Token"]
    })
);

// Request body size limit
app.use(express.json({ limit: "10kb" }));

// CSRF Verification middleware for cookie requests
app.use(verifyCsrf);

// General API rate limit
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many requests. Please try again later."
    }
});

app.use("/api", generalLimiter);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/addresses", addressRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/kitchen", kitchenRoutes);
app.use("/api/admin", uploadRoutes);
app.use("/api/site-content", siteContentRoutes);


// Health/root endpoint
app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "E-commerce API is running"
    });
});

module.exports = app;