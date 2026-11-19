const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { getJwtSecret } = require("../utils/authUtils");

const protect = async (req, res, next) => {
    try {
        let token = null;

        const isKitchenRequest =
            (req.baseUrl && req.baseUrl.startsWith("/api/kitchen")) ||
            (req.originalUrl && req.originalUrl.startsWith("/api/kitchen")) ||
            req.headers["x-auth-role"] === "kitchen";

        // Check cookies based on route/role context
        if (isKitchenRequest) {
            // Kitchen endpoints and kitchen auth requests prioritize kitchen_access_token,
            // while allowing access_token as fallback for admin access
            if (req.cookies && req.cookies.kitchen_access_token) {
                token = req.cookies.kitchen_access_token;
            } else if (req.cookies && req.cookies.access_token) {
                token = req.cookies.access_token;
            }
        } else {
            // Customer and general endpoints require customer/admin access_token.
            // Kitchen tokens must not cross-contaminate customer carts, orders, or profile.
            if (req.cookies && req.cookies.access_token) {
                token = req.cookies.access_token;
            }
        }

        if (!token) {
            // Fallback to Bearer token
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith("Bearer ")) {
                token = authHeader.substring(7).trim();
            }
        }

        if (!token) {
            return res.status(401).json({
                success: false,
                message: "Authentication required"
            });
        }

        const decoded = jwt.verify(
            token,
            getJwtSecret(),
            {
                algorithms: ["HS256"],
                issuer: process.env.JWT_ISSUER || "afc-backend",
                audience: process.env.JWT_AUDIENCE || "afc-client"
            }
        );

        if (!decoded.userId) {
            return res.status(401).json({
                success: false,
                message: "Invalid authentication token"
            });
        }

        const user = await User.findById(decoded.userId);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "User no longer exists"
            });
        }

        if (user.isActive === false) {
            res.clearCookie("access_token");
            res.clearCookie("refresh_token");
            return res.status(401).json({
                success: false,
                message: "Account disabled"
            });
        }

        // Validate token version for session revocation on logout / password change
        const currentVersion = user.tokenVersion || 0;
        const tokenVersion = decoded.tokenVersion !== undefined ? decoded.tokenVersion : 0;
        if (tokenVersion !== currentVersion) {
            return res.status(401).json({
                success: false,
                message: "Session has been revoked. Please log in again."
            });
        }

        // Validate customer email verification status
        if (user.role === "user" && !user.isEmailVerified) {
            return res.status(403).json({
                success: false,
                message: "Email verification required. Please verify your email to access this resource.",
                requiresVerification: true
            });
        }

        req.user = user;
        next();

    } catch (error) {
        if (error.name === "TokenExpiredError") {
            return res.status(401).json({
                success: false,
                message: "Token expired"
            });
        }

        if (error.name === "JsonWebTokenError") {
            return res.status(401).json({
                success: false,
                message: "Invalid authentication token"
            });
        }

        console.error("Authentication error:", error);

        return res.status(500).json({
            success: false,
            message: "Authentication error"
        });
    }
};


const authorize = (...allowedRoles) => {
    return (req, res, next) => {

        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Authentication required"
            });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to perform this action"
            });
        }

        next();
    };
};


const requireVerified = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: "Authentication required"
        });
    }

    if (req.user.role === "user" && !req.user.isEmailVerified) {
        return res.status(403).json({
            success: false,
            message: "Email verification required",
            requiresVerification: true
        });
    }

    next();
};

module.exports = {
    protect,
    authorize,
    requireVerified
};