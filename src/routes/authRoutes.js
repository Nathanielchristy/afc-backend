const express = require("express");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");

const {
    registerUser,
    verifyEmailOtp,
    resendVerificationOtp,
    loginUser,
    forgotPassword,
    verifyResetOtp,
    resetPassword,
    adminLoginUser,
    kitchenLoginUser,
    refreshToken,
    logoutUser,
    changePassword
} = require("../controllers/authController");

const {
    protect,
    authorize
} = require("../middleware/authMiddleware");

const validate = require("../middleware/validateMiddleware");

const {
    registerSchema,
    loginSchema,
    adminLoginSchema,
    kitchenLoginSchema,
    verifyEmailOtpSchema,
    resendOtpSchema,
    forgotPasswordSchema,
    verifyResetOtpSchema,
    resetPasswordSchema,
    changePasswordSchema
} = require("../validators/authValidator");

const router = express.Router();

// General auth rate limiter
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === "test",
    message: {
        success: false,
        message: "Too many authentication attempts. Please try again later."
    }
});

// OTP verification rate limiter (strict anti-brute-force)
const otpVerifyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 15,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === "test",
    message: {
        success: false,
        message: "Too many verification attempts. Please wait before trying again."
    }
});

// OTP resend rate limiter (anti-spam / anti-cost)
const otpResendLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 6,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === "test",
    message: {
        success: false,
        message: "Too many OTP requests. Please wait a few minutes before requesting another code."
    }
});

// Token refresh limiter (separate from login — refresh is a normal background operation)
const refreshLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === "test",
    message: {
        success: false,
        message: "Too many refresh attempts. Please try again later."
    }
});

// Password reset limiter
const passwordResetLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 8,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === "test",
    message: {
        success: false,
        message: "Too many password reset attempts. Please try again later."
    }
});

/* ==================== Registration & Email Verification ==================== */

// Public registration is disabled: accounts must be created by an administrator
router.post(
    "/register",
    authLimiter,
    (req, res) => {
        return res.status(403).json({
            success: false,
            message: "Public registration is disabled. Customer accounts must be created by an administrator."
        });
    }
);

router.post(
    "/verify-email-otp",
    otpVerifyLimiter,
    validate(verifyEmailOtpSchema),
    verifyEmailOtp
);

// Convenient alias for verify email
router.post(
    "/verify-email",
    otpVerifyLimiter,
    validate(verifyEmailOtpSchema),
    verifyEmailOtp
);

router.post(
    "/resend-verification-otp",
    otpResendLimiter,
    validate(resendOtpSchema),
    resendVerificationOtp
);

// Convenient alias for resend OTP
router.post(
    "/resend-otp",
    otpResendLimiter,
    validate(resendOtpSchema),
    resendVerificationOtp
);

/* ==================== Password Reset ==================== */

router.post(
    "/forgot-password",
    passwordResetLimiter,
    validate(forgotPasswordSchema),
    forgotPassword
);

router.post(
    "/password-reset/request",
    passwordResetLimiter,
    validate(forgotPasswordSchema),
    forgotPassword
);

router.post(
    "/verify-reset-otp",
    otpVerifyLimiter,
    validate(verifyResetOtpSchema),
    verifyResetOtp
);

router.post(
    "/reset-password",
    passwordResetLimiter,
    validate(resetPasswordSchema),
    resetPassword
);

/* ==================== Authentication ==================== */

router.post(
    "/login",
    authLimiter,
    validate(loginSchema),
    loginUser
);

router.post(
    "/admin/login",
    authLimiter,
    validate(adminLoginSchema),
    adminLoginUser
);

router.post(
    "/kitchen/login",
    authLimiter,
    validate(kitchenLoginSchema),
    kitchenLoginUser
);

router.post(
    "/refresh",
    refreshLimiter,
    refreshToken
);

router.post(
    "/logout",
    logoutUser
);

router.patch(
    "/change-password",
    protect,
    validate(changePasswordSchema),
    changePassword
);

router.get("/csrf", (req, res) => {
    let csrfToken = req.cookies && req.cookies["XSRF-TOKEN"];
    if (!csrfToken) {
        csrfToken = crypto.randomBytes(32).toString("hex");
        const isProduction = process.env.NODE_ENV === "production";
        const sameSite = isProduction ? "none" : "lax";
        res.cookie("XSRF-TOKEN", csrfToken, {
            httpOnly: false,
            secure: isProduction,
            sameSite,
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: "/"
        });
    }
    res.status(200).json({
        success: true,
        csrfToken
    });
});

router.get("/me", protect, (req, res) => {
    res.status(200).json({
        success: true,
        user: {
            id: req.user._id,
            name: req.user.name,
            email: req.user.email,
            phone: req.user.phone,
            registrationId: req.user.registrationId,
            role: req.user.role,
            isEmailVerified: req.user.isEmailVerified,
            mustChangePassword: req.user.mustChangePassword
        }
    });
});

router.get(
    "/admin-test",
    protect,
    authorize("admin"),
    (req, res) => {
        res.json({
            success: true,
            message: "You have admin access"
        });
    }
);

module.exports = router;
