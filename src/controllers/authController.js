const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Session = require("../models/Session");
const AuditLog = require("../models/AuditLog");
const Otp = require("../models/Otp");
const {
    generateAccessToken,
    hashToken,
    createSession,
    setAuthCookies,
    clearAuthCookies,
    setAdminAuthCookies,
    setKitchenAuthCookies,
    clearKitchenAuthCookies,
    ADMIN_REFRESH_TOKEN_MAX_AGE
} = require("../utils/authUtils");
const {
    OTP_EXPIRY_MS,
    RESEND_COOLDOWN_MS,
    MAX_OTP_ATTEMPTS,
    generateOtp,
    hashOtp,
    verifyOtpHash,
    maskEmail
} = require("../utils/otpUtils");
const {
    sendVerificationOtpEmail,
    sendPasswordResetOtpEmail
} = require("../services/emailService");

/**
 * 1. User Registration
 * Flow:
 * - Validate & normalize input
 * - Check if user already exists
 * - If verified user exists -> 409 Conflict
 * - If unverified user exists -> update details, issue fresh OTP
 * - If new user -> create user with isEmailVerified: false
 * - Generate & hash 6-digit OTP, send branded AFC email
 * - Do NOT issue access tokens before verification
 */
const registerUser = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "Name, email and password are required"
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 8 characters"
            });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const existingUser = await User.findOne({ email: normalizedEmail });

        let user;
        let isReRegistration = false;

        if (existingUser) {
            if (existingUser.isEmailVerified) {
                return res.status(409).json({
                    success: false,
                    message: "User with this email already exists"
                });
            }

            // Existing unverified account: safe re-registration flow
            const hashedPassword = await bcrypt.hash(password, 10);
            existingUser.name = name.trim();
            existingUser.password = hashedPassword;
            await existingUser.save();
            user = existingUser;
            isReRegistration = true;
        } else {
            const hashedPassword = await bcrypt.hash(password, 10);
            user = await User.create({
                name: name.trim(),
                email: normalizedEmail,
                password: hashedPassword,
                role: "user",
                isActive: true,
                isEmailVerified: false
            });
        }

        // Generate cryptographically secure 6-digit numeric OTP
        const otp = generateOtp();
        const otpHash = hashOtp(otp, user._id, "email_verification");
        const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

        // Atomic cleanup: invalidate any existing OTP for this user and purpose
        await Otp.deleteMany({ user: user._id, purpose: "email_verification" });

        // Store hashed OTP
        await Otp.create({
            user: user._id,
            email: normalizedEmail,
            otpHash,
            purpose: "email_verification",
            attempts: 0,
            maxAttempts: MAX_OTP_ATTEMPTS,
            expiresAt,
            lastSentAt: new Date()
        });

        // Attempt sending email
        try {
            await sendVerificationOtpEmail(normalizedEmail, otp, user.name);
        } catch (emailError) {
            console.error("Verification email delivery failed:", emailError.message);

            // Audit log the email failure without exposing credentials
            await AuditLog.create({
                actor: user._id,
                actorEmail: normalizedEmail,
                action: "EMAIL_DELIVERY_FAILED",
                details: { purpose: "email_verification" },
                ipAddress: req.ip
            }).catch(() => {});

            // Return safe response informing client that account was created but email delivery had an issue
            return res.status(503).json({
                success: false,
                message: "Account created, but verification email could not be sent. Please use the resend verification option.",
                requiresVerification: true,
                email: maskEmail(normalizedEmail),
                emailDeliveryFailed: true
            });
        }

        await AuditLog.create({
            actor: user._id,
            actorEmail: normalizedEmail,
            action: isReRegistration ? "USER_RE_REGISTRATION" : "USER_REGISTERED",
            ipAddress: req.ip
        }).catch(() => {});

        res.status(201).json({
            success: true,
            message: "Registration successful. Please verify your email with the 6-digit code sent to your inbox.",
            requiresVerification: true,
            email: maskEmail(normalizedEmail)
        });

    } catch (error) {
        console.error("Registration error:", error);
        res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};

/**
 * 2. Verify Email OTP
 * Flow:
 * - Check user & active OTP
 * - Increment attempts atomically
 * - Invalidate if too many attempts
 * - Verify OTP hash (timing-safe)
 * - Mark user.isEmailVerified = true
 * - Invalidate OTP
 * - Establish session & return auth cookies/tokens
 */
const verifyEmailOtp = async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({
                success: false,
                message: "Email and verification code are required"
            });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const user = await User.findOne({ email: normalizedEmail });

        if (!user) {
            return res.status(400).json({
                success: false,
                message: "Invalid email or verification code"
            });
        }

        if (user.isEmailVerified) {
            return res.status(200).json({
                success: true,
                message: "Email is already verified. You can now log in.",
                alreadyVerified: true
            });
        }

        const otpRecord = await Otp.findOne({
            user: user._id,
            purpose: "email_verification"
        });

        if (!otpRecord) {
            return res.status(400).json({
                success: false,
                message: "Verification code has expired or is invalid. Please request a new one."
            });
        }

        // Check expiration
        if (otpRecord.expiresAt < new Date()) {
            await Otp.deleteOne({ _id: otpRecord._id });
            return res.status(400).json({
                success: false,
                message: "Verification code has expired. Please request a new code."
            });
        }

        // Check if maximum attempts reached before this request
        if (otpRecord.attempts >= otpRecord.maxAttempts) {
            await Otp.deleteOne({ _id: otpRecord._id });
            return res.status(429).json({
                success: false,
                message: "Maximum verification attempts exceeded. Code has been invalidated. Please request a new code."
            });
        }

        // Atomic attempt counter increment
        const updatedOtp = await Otp.findOneAndUpdate(
            {
                _id: otpRecord._id,
                attempts: { $lt: otpRecord.maxAttempts }
            },
            { $inc: { attempts: 1 } },
            { returnDocument: "after" }
        );

        if (!updatedOtp) {
            await Otp.deleteOne({ _id: otpRecord._id });
            return res.status(429).json({
                success: false,
                message: "Maximum verification attempts exceeded. Code has been invalidated. Please request a new code."
            });
        }

        // Timing-safe comparison of candidate OTP
        const isValid = verifyOtpHash(otp, user._id, "email_verification", otpRecord.otpHash);

        if (!isValid) {
            const remaining = otpRecord.maxAttempts - updatedOtp.attempts;
            if (remaining <= 0) {
                await Otp.deleteOne({ _id: otpRecord._id });
                return res.status(400).json({
                    success: false,
                    message: "Invalid verification code. Maximum attempts reached, please request a new code."
                });
            }
            return res.status(400).json({
                success: false,
                message: `Invalid verification code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
            });
        }

        // Successful verification: invalidate OTP immediately (single-use guarantee)
        await Otp.deleteOne({ _id: otpRecord._id });

        // Mark account verified
        user.isEmailVerified = true;
        await user.save();

        await AuditLog.create({
            actor: user._id,
            actorEmail: user.email,
            action: "EMAIL_VERIFIED_SUCCESS",
            ipAddress: req.ip
        }).catch(() => {});

        // Establish normal authenticated session
        const accessToken = generateAccessToken(user);
        const rawRefreshToken = await createSession(user, req);

        setAuthCookies(res, accessToken, rawRefreshToken);

        res.status(200).json({
            success: true,
            message: "Email verified successfully! Welcome to AFC.",
            token: accessToken,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                isEmailVerified: true
            }
        });

    } catch (error) {
        console.error("Email OTP verification error:", error);
        res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};

/**
 * 3. Resend Verification OTP
 * Flow:
 * - Find user
 * - Generic response if not found / already verified (reduces enumeration)
 * - Check resend cooldown (60 seconds)
 * - Invalidate old OTPs
 * - Generate & send new OTP
 */
const resendVerificationOtp = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: "Email is required"
            });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const user = await User.findOne({ email: normalizedEmail });

        // Generic safe response if user doesn't exist
        if (!user) {
            return res.status(200).json({
                success: true,
                message: "If an unverified account exists with this email, a new verification code has been sent."
            });
        }

        // If already verified, inform user
        if (user.isEmailVerified) {
            return res.status(200).json({
                success: true,
                message: "Your email is already verified. Please log in."
            });
        }

        // Enforce cooldown
        const existingOtp = await Otp.findOne({
            user: user._id,
            purpose: "email_verification"
        });

        if (existingOtp) {
            const timeSinceLastSent = Date.now() - existingOtp.lastSentAt.getTime();
            if (timeSinceLastSent < RESEND_COOLDOWN_MS) {
                const secondsToWait = Math.ceil((RESEND_COOLDOWN_MS - timeSinceLastSent) / 1000);
                return res.status(429).json({
                    success: false,
                    message: `Please wait ${secondsToWait} second${secondsToWait === 1 ? "" : "s"} before requesting a new code.`
                });
            }
        }

        // Invalidate old OTPs for this user and purpose
        await Otp.deleteMany({ user: user._id, purpose: "email_verification" });

        // Generate fresh OTP
        const otp = generateOtp();
        const otpHash = hashOtp(otp, user._id, "email_verification");
        const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

        await Otp.create({
            user: user._id,
            email: normalizedEmail,
            otpHash,
            purpose: "email_verification",
            attempts: 0,
            maxAttempts: MAX_OTP_ATTEMPTS,
            expiresAt,
            lastSentAt: new Date()
        });

        try {
            await sendVerificationOtpEmail(normalizedEmail, otp, user.name);
        } catch (emailError) {
            console.error("Resend verification email failed:", emailError.message);
            return res.status(503).json({
                success: false,
                message: "Failed to send verification email. Please try again shortly."
            });
        }

        res.status(200).json({
            success: true,
            message: "A new verification code has been sent to your email."
        });

    } catch (error) {
        console.error("Resend OTP error:", error);
        res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};

/**
 * 4. User Login
 * Note: Checks user.isEmailVerified for customers (role: "user").
 * Unverified users are rejected with 403 and cannot receive session cookies.
 */
const loginUser = async (req, res) => {
    try {
        const { phone, email, password } = req.body;

        if ((!phone && !email) || !password) {
            return res.status(400).json({
                success: false,
                message: "Phone number or email and password are required"
            });
        }

        let user;
        if (phone) {
            // Normalize phone number: strip non-digits, remove leading 0 or 91 country code
            let normalizedPhone = String(phone).replace(/\D/g, "");
            if (normalizedPhone.startsWith("91") && normalizedPhone.length > 10) {
                normalizedPhone = normalizedPhone.slice(2);
            }
            if (normalizedPhone.startsWith("0") && normalizedPhone.length > 10) {
                normalizedPhone = normalizedPhone.slice(1);
            }

            if (normalizedPhone.length !== 10) {
                return res.status(400).json({
                    success: false,
                    message: "Please enter a valid 10-digit phone number"
                });
            }

            user = await User.findOne({ phone: normalizedPhone }).select("+password");
        } else if (email) {
            const normalizedEmail = email.toLowerCase().trim();
            user = await User.findOne({ email: normalizedEmail }).select("+password");
        }

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid credentials"
            });
        }

        if (user.isActive === false) {
            clearAuthCookies(res);
            return res.status(401).json({
                success: false,
                message: "Your account has been disabled. Please contact an administrator."
            });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid phone number or password"
            });
        }

        // Prevent unverified customers from logging in or receiving access tokens
        if (user.role === "user" && !user.isEmailVerified) {
            return res.status(403).json({
                success: false,
                message: "Please verify your email before logging in. A verification code has been sent to your email.",
                requiresVerification: true,
                email: user.email ? maskEmail(user.email) : undefined
            });
        }

        const accessToken = generateAccessToken(user);
        const rawRefreshToken = await createSession(user, req);

        setAuthCookies(res, accessToken, rawRefreshToken);

        res.status(200).json({
            success: true,
            message: "Login successful",
            token: accessToken,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                registrationId: user.registrationId,
                role: user.role,
                isEmailVerified: user.isEmailVerified,
                mustChangePassword: user.mustChangePassword
            }
        });

    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};

/**
 * 5. Request Password Reset OTP
 */
const forgotPassword = async (req, res) => {
    try {
        const { phone, email } = req.body;

        if (!phone && !email) {
            return res.status(400).json({
                success: false,
                message: "Phone number or email is required"
            });
        }

        let user;
        if (phone) {
            let normalizedPhone = String(phone).replace(/\D/g, "");
            if (normalizedPhone.startsWith("91") && normalizedPhone.length > 10) {
                normalizedPhone = normalizedPhone.slice(2);
            }
            if (normalizedPhone.startsWith("0") && normalizedPhone.length > 10) {
                normalizedPhone = normalizedPhone.slice(1);
            }
            user = await User.findOne({ phone: normalizedPhone, isActive: true });
        } else if (email) {
            const normalizedEmail = email.toLowerCase().trim();
            user = await User.findOne({ email: normalizedEmail, isActive: true });
        }

        // Generic response to prevent account enumeration
        if (!user || !user.email) {
            return res.status(200).json({
                success: true,
                message: "If an account exists, a password reset code has been sent."
            });
        }

        const targetEmail = user.email;

        // Check resend cooldown
        const existingOtp = await Otp.findOne({
            user: user._id,
            purpose: "password_reset"
        });

        if (existingOtp) {
            const timeSinceLastSent = Date.now() - existingOtp.lastSentAt.getTime();
            if (timeSinceLastSent < RESEND_COOLDOWN_MS) {
                const secondsToWait = Math.ceil((RESEND_COOLDOWN_MS - timeSinceLastSent) / 1000);
                return res.status(429).json({
                    success: false,
                    message: `Please wait ${secondsToWait} second${secondsToWait === 1 ? "" : "s"} before requesting another reset code.`
                });
            }
        }

        await Otp.deleteMany({ user: user._id, purpose: "password_reset" });

        const otp = generateOtp();
        const otpHash = hashOtp(otp, user._id, "password_reset");
        const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

        await Otp.create({
            user: user._id,
            email: targetEmail,
            otpHash,
            purpose: "password_reset",
            attempts: 0,
            maxAttempts: MAX_OTP_ATTEMPTS,
            expiresAt,
            lastSentAt: new Date()
        });

        try {
            await sendPasswordResetOtpEmail(targetEmail, otp, user.name);
        } catch (emailError) {
            console.error("Password reset email delivery failed:", emailError.message);
            return res.status(503).json({
                success: false,
                message: "Failed to send reset email. Please try again shortly."
            });
        }

        res.status(200).json({
            success: true,
            message: "If an account exists with that email, a password reset code has been sent."
        });

    } catch (error) {
        console.error("Forgot password error:", error);
        res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};

/**
 * 6. Verify Password Reset OTP
 */
const verifyResetOtp = async (req, res) => {
    try {
        const { phone, email, otp } = req.body;

        if ((!phone && !email) || !otp) {
            return res.status(400).json({
                success: false,
                message: "Phone number or email and reset code are required"
            });
        }

        let user;
        if (phone) {
            let normalizedPhone = String(phone).replace(/\D/g, "");
            if (normalizedPhone.startsWith("91") && normalizedPhone.length > 10) {
                normalizedPhone = normalizedPhone.slice(2);
            }
            if (normalizedPhone.startsWith("0") && normalizedPhone.length > 10) {
                normalizedPhone = normalizedPhone.slice(1);
            }
            user = await User.findOne({ phone: normalizedPhone, isActive: true });
        } else if (email) {
            const normalizedEmail = email.toLowerCase().trim();
            user = await User.findOne({ email: normalizedEmail, isActive: true });
        }

        if (!user) {
            return res.status(400).json({
                success: false,
                message: "Invalid account or reset code"
            });
        }

        const otpRecord = await Otp.findOne({
            user: user._id,
            purpose: "password_reset"
        });

        if (!otpRecord) {
            return res.status(400).json({
                success: false,
                message: "Reset code has expired or is invalid. Please request a new one."
            });
        }

        if (otpRecord.expiresAt < new Date()) {
            await Otp.deleteOne({ _id: otpRecord._id });
            return res.status(400).json({
                success: false,
                message: "Reset code has expired. Please request a new code."
            });
        }

        if (otpRecord.attempts >= otpRecord.maxAttempts) {
            await Otp.deleteOne({ _id: otpRecord._id });
            return res.status(429).json({
                success: false,
                message: "Maximum verification attempts exceeded. Code has been invalidated. Please request a new code."
            });
        }

        const updatedOtp = await Otp.findOneAndUpdate(
            {
                _id: otpRecord._id,
                attempts: { $lt: otpRecord.maxAttempts }
            },
            { $inc: { attempts: 1 } },
            { returnDocument: "after" }
        );

        if (!updatedOtp) {
            await Otp.deleteOne({ _id: otpRecord._id });
            return res.status(429).json({
                success: false,
                message: "Maximum verification attempts exceeded. Code has been invalidated. Please request a new code."
            });
        }

        const isValid = verifyOtpHash(otp, user._id, "password_reset", otpRecord.otpHash);

        if (!isValid) {
            const remaining = otpRecord.maxAttempts - updatedOtp.attempts;
            if (remaining <= 0) {
                await Otp.deleteOne({ _id: otpRecord._id });
                return res.status(400).json({
                    success: false,
                    message: "Invalid reset code. Maximum attempts reached, please request a new code."
                });
            }
            return res.status(400).json({
                success: false,
                message: `Invalid reset code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
            });
        }

        res.status(200).json({
            success: true,
            message: "Reset code verified successfully. Please enter your new password."
        });

    } catch (error) {
        console.error("Verify reset OTP error:", error);
        res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};

/**
 * 7. Complete Password Reset
 */
const resetPassword = async (req, res) => {
    try {
        const { phone, email, otp, newPassword } = req.body;

        if ((!phone && !email) || !otp || !newPassword) {
            return res.status(400).json({
                success: false,
                message: "Phone number or email, reset code, and new password are required"
            });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 8 characters"
            });
        }

        let user;
        if (phone) {
            let normalizedPhone = String(phone).replace(/\D/g, "");
            if (normalizedPhone.startsWith("91") && normalizedPhone.length > 10) {
                normalizedPhone = normalizedPhone.slice(2);
            }
            if (normalizedPhone.startsWith("0") && normalizedPhone.length > 10) {
                normalizedPhone = normalizedPhone.slice(1);
            }
            user = await User.findOne({ phone: normalizedPhone, isActive: true });
        } else if (email) {
            const normalizedEmail = email.toLowerCase().trim();
            user = await User.findOne({ email: normalizedEmail, isActive: true });
        }

        if (!user) {
            return res.status(400).json({
                success: false,
                message: "Invalid account or reset code"
            });
        }

        const otpRecord = await Otp.findOne({
            user: user._id,
            purpose: "password_reset"
        });

        if (!otpRecord) {
            return res.status(400).json({
                success: false,
                message: "Reset code has expired or is invalid. Please request a new one."
            });
        }

        if (otpRecord.expiresAt < new Date()) {
            await Otp.deleteOne({ _id: otpRecord._id });
            return res.status(400).json({
                success: false,
                message: "Reset code has expired. Please request a new code."
            });
        }

        // Validate OTP
        const isValid = verifyOtpHash(otp, user._id, "password_reset", otpRecord.otpHash);

        if (!isValid) {
            return res.status(400).json({
                success: false,
                message: "Invalid reset code"
            });
        }

        // Invalidate OTP immediately
        await Otp.deleteOne({ _id: otpRecord._id });

        // Update user password and revoke all existing sessions
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedPassword;
        user.tokenVersion = (user.tokenVersion || 0) + 1;
        // Password reset via verified email also marks email verified if it wasn't
        user.isEmailVerified = true;
        await user.save();

        // Terminate all active sessions for this user across devices
        await Session.deleteMany({ user: user._id });

        // Clear any auth cookies if present on this client
        clearAuthCookies(res);

        await AuditLog.create({
            actor: user._id,
            actorEmail: user.email,
            action: "PASSWORD_RESET_SUCCESS",
            ipAddress: req.ip
        }).catch(() => {});

        res.status(200).json({
            success: true,
            message: "Password has been reset successfully. Please log in with your new password."
        });

    } catch (error) {
        console.error("Reset password error:", error);
        res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};

const adminLoginUser = async (req, res) => {
    const { email, password } = req.body;

    try {
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required"
            });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const user = await User.findOne({ email: normalizedEmail }).select("+password");

        // Generic error message to prevent account or role enumeration
        if (!user || user.role !== "admin" || user.isActive === false) {
            await AuditLog.create({
                actorEmail: normalizedEmail,
                action: "ADMIN_LOGIN_FAILED",
                details: { reason: "User not found, not admin, or disabled" },
                ipAddress: req.ip
            }).catch(() => {});

            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            await AuditLog.create({
                actor: user._id,
                actorEmail: normalizedEmail,
                action: "ADMIN_LOGIN_FAILED",
                details: { reason: "Invalid password" },
                ipAddress: req.ip
            }).catch(() => {});

            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        const accessToken = generateAccessToken(user);
        const rawRefreshToken = await createSession(user, req, ADMIN_REFRESH_TOKEN_MAX_AGE);

        setAdminAuthCookies(res, accessToken, rawRefreshToken);

        await AuditLog.create({
            actor: user._id,
            actorEmail: user.email,
            action: "ADMIN_LOGIN_SUCCESS",
            ipAddress: req.ip
        }).catch(() => {});

        res.status(200).json({
            success: true,
            message: "Admin authentication successful",
            token: accessToken,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error("Admin login error:", error);
        res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};

const kitchenLoginUser = async (req, res) => {
    const { email, password } = req.body;

    try {
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required"
            });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const user = await User.findOne({ email: normalizedEmail }).select("+password");

        // Generic error message to prevent account or role enumeration
        if (!user || user.role !== "kitchen" || user.isActive === false) {
            await AuditLog.create({
                actorEmail: normalizedEmail,
                action: "KITCHEN_LOGIN_FAILED",
                details: { reason: "User not found, not kitchen staff, or disabled" },
                ipAddress: req.ip
            }).catch(() => {});

            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            await AuditLog.create({
                actor: user._id,
                actorEmail: normalizedEmail,
                action: "KITCHEN_LOGIN_FAILED",
                details: { reason: "Invalid password" },
                ipAddress: req.ip
            }).catch(() => {});

            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        const accessToken = generateAccessToken(user);
        const rawRefreshToken = await createSession(user, req, ADMIN_REFRESH_TOKEN_MAX_AGE);

        setKitchenAuthCookies(res, accessToken, rawRefreshToken);

        await AuditLog.create({
            actor: user._id,
            actorEmail: user.email,
            action: "KITCHEN_LOGIN_SUCCESS",
            ipAddress: req.ip
        }).catch(() => {});

        res.status(200).json({
            success: true,
            message: "Kitchen authentication successful",
            token: accessToken,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error("Kitchen login error:", error);
        res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};

const refreshToken = async (req, res) => {
    try {
        const isKitchen = req.headers["x-auth-role"] === "kitchen" ||
            (req.cookies && req.cookies.kitchen_refresh_token && !req.cookies.refresh_token);

        const rawRefreshToken = isKitchen
            ? (req.cookies && req.cookies.kitchen_refresh_token)
            : (req.cookies && req.cookies.refresh_token);

        if (!rawRefreshToken) {
            if (isKitchen) {
                clearKitchenAuthCookies(res);
            } else {
                clearAuthCookies(res);
            }
            return res.status(401).json({
                success: false,
                message: "Refresh token missing"
            });
        }

        const refreshTokenHash = hashToken(rawRefreshToken);
        const session = await Session.findOne({ refreshTokenHash }).populate("user");

        if (!session || !session.user || session.user.isActive === false) {
            if (session) await Session.deleteOne({ _id: session._id });
            if (isKitchen) {
                clearKitchenAuthCookies(res);
            } else {
                clearAuthCookies(res);
            }
            return res.status(401).json({
                success: false,
                message: "Invalid or expired session"
            });
        }

        // If user is a customer, ensure email remains verified
        if (session.user.role === "user" && !session.user.isEmailVerified) {
            await Session.deleteOne({ _id: session._id });
            clearAuthCookies(res);
            return res.status(403).json({
                success: false,
                message: "Email verification required",
                requiresVerification: true
            });
        }

        // Rotate refresh token
        await Session.deleteOne({ _id: session._id });
        const newAccessToken = generateAccessToken(session.user);
        const newRawRefreshToken = await createSession(session.user, req);

        if (session.user.role === "kitchen" || isKitchen) {
            setKitchenAuthCookies(res, newAccessToken, newRawRefreshToken);
        } else {
            setAuthCookies(res, newAccessToken, newRawRefreshToken);
        }

        res.status(200).json({
            success: true,
            token: newAccessToken,
            user: {
                id: session.user._id,
                name: session.user.name,
                email: session.user.email,
                phone: session.user.phone,
                registrationId: session.user.registrationId,
                role: session.user.role,
                isEmailVerified: session.user.isEmailVerified,
                mustChangePassword: session.user.mustChangePassword
            }
        });

    } catch (error) {
        console.error("Refresh token error:", error);
        clearAuthCookies(res);
        clearKitchenAuthCookies(res);
        res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};

const logoutUser = async (req, res) => {
    try {
        const isKitchen = req.headers["x-auth-role"] === "kitchen" ||
            (req.cookies && req.cookies.kitchen_refresh_token && !req.cookies.refresh_token) ||
            (req.user && req.user.role === "kitchen");

        let userId = req.user ? req.user._id : null;
        const rawRefreshToken = isKitchen
            ? (req.cookies && req.cookies.kitchen_refresh_token)
            : (req.cookies && req.cookies.refresh_token);

        if (rawRefreshToken) {
            const refreshTokenHash = hashToken(rawRefreshToken);
            const session = await Session.findOne({ refreshTokenHash });
            if (session && session.user) {
                userId = session.user;
            }
            await Session.deleteOne({ refreshTokenHash }).catch(() => {});
        }

        if (!userId) {
            let token = isKitchen
                ? (req.cookies && req.cookies.kitchen_access_token)
                : (req.cookies && req.cookies.access_token);
            if (!token && isKitchen) {
                token = req.cookies && req.cookies.access_token;
            }
            if (!token) {
                token = (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")
                    ? req.headers.authorization.substring(7).trim()
                    : null);
            }
            if (token) {
                try {
                    const decoded = jwt.decode(token);
                    if (decoded && decoded.userId) {
                        userId = decoded.userId;
                    }
                } catch {}
            }
        }

        if (userId) {
            await Promise.all([
                User.findByIdAndUpdate(userId, { $inc: { tokenVersion: 1 } }).catch(() => {}),
                Session.deleteMany({ user: userId }).catch(() => {}),
                AuditLog.create({
                    actor: userId,
                    actorEmail: req.user ? req.user.email : "unknown",
                    action: "LOGOUT",
                    ipAddress: req.ip
                }).catch(() => {})
            ]);
        }

        if (isKitchen) {
            clearKitchenAuthCookies(res);
        } else {
            clearAuthCookies(res);
        }

        res.status(200).json({
            success: true,
            message: "Logged out successfully"
        });

    } catch (error) {
        console.error("Logout error:", error);
        clearAuthCookies(res);
        clearKitchenAuthCookies(res);
        res.status(200).json({
            success: true,
            message: "Logged out successfully"
        });
    }
};

const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user._id;

        const user = await User.findById(userId).select("+password");
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        if (!user.mustChangePassword) {
            if (!currentPassword) {
                return res.status(400).json({
                    success: false,
                    message: "Current password is required"
                });
            }
            const isMatch = await bcrypt.compare(currentPassword, user.password);
            if (!isMatch) {
                return res.status(401).json({
                    success: false,
                    message: "Incorrect current password"
                });
            }
        }

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        user.mustChangePassword = false;
        user.tokenVersion = (user.tokenVersion || 0) + 1;
        await user.save();

        await AuditLog.create({
            actor: user._id,
            actorEmail: user.email,
            action: "PASSWORD_CHANGED",
            ipAddress: req.ip
        }).catch(() => {});

        res.status(200).json({
            success: true,
            message: "Password changed successfully"
        });
    } catch (error) {
        console.error("Change password error:", error);
        res.status(500).json({
            success: false,
            message: "Server error while changing password"
        });
    }
};

module.exports = {
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
};
