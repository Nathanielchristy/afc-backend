const crypto = require("crypto");
const { getJwtSecret } = require("./authUtils");

const OTP_EXPIRY_MINUTES = 10;
const OTP_EXPIRY_MS = OTP_EXPIRY_MINUTES * 60 * 1000;
const RESEND_COOLDOWN_SECONDS = 60;
const RESEND_COOLDOWN_MS = RESEND_COOLDOWN_SECONDS * 1000;
const MAX_OTP_ATTEMPTS = 5;

/**
 * Generate a cryptographically secure 6-digit numeric OTP
 */
const generateOtp = () => {
    // Generates integer between 100000 and 999999 inclusive
    return crypto.randomInt(100000, 1000000).toString();
};

/**
 * Hash an OTP using HMAC-SHA256 with server secret + user context
 */
const hashOtp = (otp, userId, purpose) => {
    const secret = process.env.OTP_SECRET || getJwtSecret();
    return crypto
        .createHmac("sha256", secret)
        .update(`${otp}:${userId.toString()}:${purpose}`)
        .digest("hex");
};

/**
 * Verify OTP using timing-safe comparison
 */
const verifyOtpHash = (candidateOtp, userId, purpose, storedHash) => {
    if (!candidateOtp || !storedHash) return false;

    const candidateHash = hashOtp(candidateOtp, userId, purpose);
    const candidateBuf = Buffer.from(candidateHash, "hex");
    const storedBuf = Buffer.from(storedHash, "hex");

    if (candidateBuf.length !== storedBuf.length) {
        return false;
    }

    return crypto.timingSafeEqual(candidateBuf, storedBuf);
};

/**
 * Masks an email for safe display in UI/responses
 * e.g., "rahul.sharma@college.edu" -> "r***a@college.edu"
 */
const maskEmail = (email) => {
    if (!email || !email.includes("@")) return "";
    const [localPart, domain] = email.split("@");
    if (localPart.length <= 2) {
        return `${localPart[0]}***@${domain}`;
    }
    const firstChar = localPart[0];
    const lastChar = localPart[localPart.length - 1];
    return `${firstChar}***${lastChar}@${domain}`;
};

module.exports = {
    OTP_EXPIRY_MINUTES,
    OTP_EXPIRY_MS,
    RESEND_COOLDOWN_SECONDS,
    RESEND_COOLDOWN_MS,
    MAX_OTP_ATTEMPTS,
    generateOtp,
    hashOtp,
    verifyOtpHash,
    maskEmail
};
