const crypto = require("crypto");

const verifyCsrf = (req, res, next) => {
    // Methods that change state
    const safeMethods = ["GET", "HEAD", "OPTIONS"];
    if (safeMethods.includes(req.method)) {
        return next();
    }

    // Enforce CSRF if any auth cookies are present (cookie-based session authentication)
    const hasAuthCookie = req.cookies && (
        req.cookies.access_token ||
        req.cookies.refresh_token ||
        req.cookies.kitchen_access_token ||
        req.cookies.kitchen_refresh_token
    );
    if (!hasAuthCookie) {
        return next();
    }

    const cookieCsrfToken = req.cookies["XSRF-TOKEN"];
    const headerCsrfToken = req.headers["x-csrf-token"] || req.headers["x-xsrf-token"];

    if (!cookieCsrfToken || !headerCsrfToken) {
        return res.status(403).json({
            success: false,
            message: "CSRF verification failed"
        });
    }

    // Constant-time comparison to prevent timing attacks
    const cookieBuf = Buffer.from(String(cookieCsrfToken));
    const headerBuf = Buffer.from(String(headerCsrfToken));

    if (cookieBuf.length !== headerBuf.length || !crypto.timingSafeEqual(cookieBuf, headerBuf)) {
        return res.status(403).json({
            success: false,
            message: "CSRF verification failed"
        });
    }

    next();
};

module.exports = verifyCsrf;
