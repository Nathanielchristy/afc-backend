const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const Session = require("../models/Session");

const ACCESS_TOKEN_MAX_AGE = 15 * 60 * 1000; // 15 mins
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
const ADMIN_REFRESH_TOKEN_MAX_AGE = 8 * 60 * 60 * 1000; // 8 hours for admin & kitchen

const ACCESS_COOKIE = "access_token";
const REFRESH_COOKIE = "refresh_token";
const KITCHEN_ACCESS_COOKIE = "kitchen_access_token";
const KITCHEN_REFRESH_COOKIE = "kitchen_refresh_token";
const CSRF_COOKIE = "XSRF-TOKEN";

const getJwtSecret = () => {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.trim() === "") {
        if (process.env.NODE_ENV === "production") {
            throw new Error("JWT_SECRET must be configured in production environment");
        }
        return "default_jwt_secret_key_change_in_production";
    }
    return secret;
};

const generateAccessToken = (user) => {
    return jwt.sign(
        {
            userId: user._id,
            role: user.role,
            tokenVersion: user.tokenVersion !== undefined ? user.tokenVersion : 0
        },
        getJwtSecret(),
        {
            algorithm: "HS256",
            expiresIn: "15m",
            issuer: process.env.JWT_ISSUER || "afc-backend",
            audience: process.env.JWT_AUDIENCE || "afc-client"
        }
    );
};

const hashToken = (token) => {
    return crypto.createHash("sha256").update(token).digest("hex");
};

const createSession = async (user, req, maxAge = REFRESH_TOKEN_MAX_AGE) => {
    const rawRefreshToken = crypto.randomBytes(32).toString("hex");
    const refreshTokenHash = hashToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + maxAge);

    await Session.create({
        user: user._id,
        refreshTokenHash,
        ipAddress: req.ip || (req.connection && req.connection.remoteAddress) || "127.0.0.1",
        userAgent: req.headers ? req.headers["user-agent"] : undefined,
        expiresAt
    });

    return rawRefreshToken;
};

const setAdminAuthCookies = (res, accessToken, rawRefreshToken) => {
    const isProduction = process.env.NODE_ENV === "production";

    res.cookie(ACCESS_COOKIE, accessToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
        maxAge: ACCESS_TOKEN_MAX_AGE,
        path: "/"
    });

    if (rawRefreshToken) {
        res.cookie(REFRESH_COOKIE, rawRefreshToken, {
            httpOnly: true,
            secure: isProduction,
            sameSite: "lax",
            maxAge: ADMIN_REFRESH_TOKEN_MAX_AGE,
            path: "/api/auth"
        });
    }

    const csrfToken = crypto.randomBytes(32).toString("hex");
    res.cookie(CSRF_COOKIE, csrfToken, {
        httpOnly: false,
        secure: isProduction,
        sameSite: "lax",
        maxAge: ADMIN_REFRESH_TOKEN_MAX_AGE,
        path: "/"
    });

    return csrfToken;
};

const setAuthCookies = (res, accessToken, rawRefreshToken) => {
    const isProduction = process.env.NODE_ENV === "production";

    // Access Token cookie
    res.cookie("access_token", accessToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
        maxAge: ACCESS_TOKEN_MAX_AGE,
        path: "/"
    });

    // Refresh Token cookie (only sent to auth endpoints)
    if (rawRefreshToken) {
        res.cookie("refresh_token", rawRefreshToken, {
            httpOnly: true,
            secure: isProduction,
            sameSite: "lax",
            maxAge: REFRESH_TOKEN_MAX_AGE,
            path: "/api/auth"
        });
    }

    // CSRF cookie (readable by JS to include in X-CSRF-Token header)
    const csrfToken = crypto.randomBytes(32).toString("hex");
    res.cookie("XSRF-TOKEN", csrfToken, {
        httpOnly: false,
        secure: isProduction,
        sameSite: "lax",
        maxAge: REFRESH_TOKEN_MAX_AGE,
        path: "/"
    });

    return csrfToken;
};

const clearAuthCookies = (res) => {
    const isProduction = process.env.NODE_ENV === "production";
    const clearOptions = {
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
        expires: new Date(0),
        maxAge: 0
    };

    res.cookie(ACCESS_COOKIE, "", { ...clearOptions, path: "/" });
    res.cookie(REFRESH_COOKIE, "", { ...clearOptions, path: "/api/auth" });
    res.cookie(CSRF_COOKIE, "", { ...clearOptions, httpOnly: false, path: "/" });
};

const setKitchenAuthCookies = (res, accessToken, rawRefreshToken) => {
    const isProduction = process.env.NODE_ENV === "production";

    // Kitchen Access Token cookie
    res.cookie(KITCHEN_ACCESS_COOKIE, accessToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
        maxAge: ACCESS_TOKEN_MAX_AGE,
        path: "/"
    });

    // Kitchen Refresh Token cookie (only sent to auth endpoints)
    if (rawRefreshToken) {
        res.cookie(KITCHEN_REFRESH_COOKIE, rawRefreshToken, {
            httpOnly: true,
            secure: isProduction,
            sameSite: "lax",
            maxAge: ADMIN_REFRESH_TOKEN_MAX_AGE,
            path: "/api/auth"
        });
    }

    // CSRF cookie (readable by JS to include in X-CSRF-Token header)
    const csrfToken = crypto.randomBytes(32).toString("hex");
    res.cookie(CSRF_COOKIE, csrfToken, {
        httpOnly: false,
        secure: isProduction,
        sameSite: "lax",
        maxAge: ADMIN_REFRESH_TOKEN_MAX_AGE,
        path: "/"
    });

    return csrfToken;
};

const clearKitchenAuthCookies = (res) => {
    const isProduction = process.env.NODE_ENV === "production";
    const clearOptions = {
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
        expires: new Date(0),
        maxAge: 0
    };

    res.cookie(KITCHEN_ACCESS_COOKIE, "", { ...clearOptions, path: "/" });
    res.cookie(KITCHEN_REFRESH_COOKIE, "", { ...clearOptions, path: "/api/auth" });
    res.cookie(CSRF_COOKIE, "", { ...clearOptions, httpOnly: false, path: "/" });
};

module.exports = {
    ACCESS_TOKEN_MAX_AGE,
    REFRESH_TOKEN_MAX_AGE,
    ADMIN_REFRESH_TOKEN_MAX_AGE,
    ACCESS_COOKIE,
    REFRESH_COOKIE,
    KITCHEN_ACCESS_COOKIE,
    KITCHEN_REFRESH_COOKIE,
    CSRF_COOKIE,
    getJwtSecret,
    generateAccessToken,
    hashToken,
    createSession,
    setAuthCookies,
    clearAuthCookies,
    setAdminAuthCookies,
    setKitchenAuthCookies,
    clearKitchenAuthCookies
};
