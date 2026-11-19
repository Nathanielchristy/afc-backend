const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const User = require("../src/models/User");
const Otp = require("../src/models/Otp");
const Session = require("../src/models/Session");
const AuditLog = require("../src/models/AuditLog");

const {
    registerUser,
    verifyEmailOtp,
    resendVerificationOtp,
    loginUser,
    forgotPassword,
    verifyResetOtp,
    resetPassword,
    adminLoginUser,
    kitchenLoginUser
} = require("../src/controllers/authController");

const { protect, authorize } = require("../src/middleware/authMiddleware");
const verifyCsrf = require("../src/middleware/csrfMiddleware");
const { setAuthCookies, generateAccessToken } = require("../src/utils/authUtils");
const {
    getTestEmailQueue,
    clearTestEmailQueue
} = require("../src/services/emailService");

// Helper to create mock response object
function createMockRes() {
    const res = {
        statusCode: 200,
        body: null,
        cookies: {},
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(data) {
            this.body = data;
            return this;
        },
        cookie(name, val, options) {
            this.cookies[name] = { val, options };
            return this;
        }
    };
    return res;
}

// Helper to create mock request object
function createMockReq({ body = {}, cookies = {}, headers = {}, user = null, ip = "127.0.0.1", method = "POST" } = {}) {
    return {
        body,
        cookies,
        headers,
        user,
        ip,
        method
    };
}

describe("AFC Secure User Registration and Verification Suite", () => {
    before(async () => {
        // Ensure NODE_ENV is test
        process.env.NODE_ENV = "test";
        process.env.JWT_SECRET = "afc_test_jwt_secret_key_1234567890";
        process.env.OTP_SECRET = "afc_test_otp_secret_key_1234567890";

        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/afc");
        }

        // Clean up test data
        await User.deleteMany({ email: { $regex: "@test-afc\\.com$" } });
        await Otp.deleteMany({ email: { $regex: "@test-afc\\.com$" } });
        await Session.deleteMany({});
    });

    after(async () => {
        await User.deleteMany({ email: { $regex: "@test-afc\\.com$" } });
        await Otp.deleteMany({ email: { $regex: "@test-afc\\.com$" } });
        await Session.deleteMany({});
        await mongoose.disconnect();
    });

    beforeEach(() => {
        clearTestEmailQueue();
    });

    /* =====================================================================
     * 1. Successful registration
     * ===================================================================== */
    it("1. Successful registration creates unverified account, hashes password, and queues OTP email", async () => {
        const email = "scenario1@test-afc.com";
        const req = createMockReq({
            body: { name: "Scenario One", email, password: "Password123!" }
        });
        const res = createMockRes();

        await registerUser(req, res);

        assert.equal(res.statusCode, 201);
        assert.equal(res.body.success, true);
        assert.equal(res.body.requiresVerification, true);
        assert.ok(res.body.email.includes("***"));

        // Check user record
        const user = await User.findOne({ email });
        assert.ok(user, "User should be created in database");
        assert.equal(user.isEmailVerified, false, "Account must be unverified initially");
        assert.notEqual(user.password, "Password123!", "Password must be hashed");

        // Check OTP record in DB
        const otpRecord = await Otp.findOne({ user: user._id, purpose: "email_verification" });
        assert.ok(otpRecord, "OTP record must exist in DB");
        assert.notEqual(otpRecord.otpHash.length, 6, "OTP hash must not store plaintext code");
        assert.equal(otpRecord.attempts, 0);

        // Check email queued in test service
        const queue = getTestEmailQueue();
        assert.equal(queue.length, 1);
        assert.equal(queue[0].to, email);
        assert.ok(queue[0].text.includes("Your AFC email verification code is:"));
    });

    /* =====================================================================
     * 2. Correct OTP verification
     * ===================================================================== */
    it("2. Correct OTP verification marks account verified, sets auth cookies, and invalidates OTP", async () => {
        const email = "scenario2@test-afc.com";
        // 1. Register
        const regReq = createMockReq({
            body: { name: "Scenario Two", email, password: "Password123!" }
        });
        const regRes = createMockRes();
        await registerUser(regReq, regRes);

        // Retrieve the generated OTP from test email queue
        const queue = getTestEmailQueue();
        const emailBody = queue[queue.length - 1].text;
        const match = emailBody.match(/code is:\s*(\d{6})/);
        assert.ok(match, "OTP must be in email text");
        const otp = match[1];

        // 2. Verify OTP
        const verifyReq = createMockReq({
            body: { email, otp }
        });
        const verifyRes = createMockRes();
        await verifyEmailOtp(verifyReq, verifyRes);

        assert.equal(verifyRes.statusCode, 200);
        assert.equal(verifyRes.body.success, true);
        assert.equal(verifyRes.body.user.isEmailVerified, true);
        assert.ok(verifyRes.body.token, "Access token returned");

        // Verify cookies were attached
        assert.ok(verifyRes.cookies.access_token, "Access token cookie set");
        assert.equal(verifyRes.cookies.access_token.options.httpOnly, true);
        assert.ok(verifyRes.cookies.refresh_token, "Refresh token cookie set");
        assert.equal(verifyRes.cookies.refresh_token.options.httpOnly, true);
        assert.ok(verifyRes.cookies["XSRF-TOKEN"], "CSRF token cookie set");

        // Verify DB state
        const user = await User.findOne({ email });
        assert.equal(user.isEmailVerified, true);

        // Verify OTP is destroyed (single-use)
        const otpAfter = await Otp.findOne({ user: user._id, purpose: "email_verification" });
        assert.equal(otpAfter, null, "OTP must be deleted after successful use");
    });

    /* =====================================================================
     * 3. Incorrect OTP
     * ===================================================================== */
    it("3. Incorrect OTP rejects with 400, decrements remaining attempts, and leaves account unverified", async () => {
        const email = "scenario3@test-afc.com";
        await registerUser(
            createMockReq({ body: { name: "Scenario Three", email, password: "Password123!" } }),
            createMockRes()
        );

        const verifyReq = createMockReq({
            body: { email, otp: "000000" }
        });
        const verifyRes = createMockRes();
        await verifyEmailOtp(verifyReq, verifyRes);

        assert.equal(verifyRes.statusCode, 400);
        assert.equal(verifyRes.body.success, false);
        assert.ok(verifyRes.body.message.includes("attempts remaining"));

        const user = await User.findOne({ email });
        assert.equal(user.isEmailVerified, false);

        const otpRecord = await Otp.findOne({ user: user._id, purpose: "email_verification" });
        assert.equal(otpRecord.attempts, 1);
    });

    /* =====================================================================
     * 4. Expired OTP
     * ===================================================================== */
    it("4. Expired OTP is rejected and purged from database", async () => {
        const email = "scenario4@test-afc.com";
        await registerUser(
            createMockReq({ body: { name: "Scenario Four", email, password: "Password123!" } }),
            createMockRes()
        );

        const user = await User.findOne({ email });
        // Manually expire the OTP in DB
        await Otp.updateOne(
            { user: user._id, purpose: "email_verification" },
            { $set: { expiresAt: new Date(Date.now() - 1000) } }
        );

        const verifyReq = createMockReq({
            body: { email, otp: "123456" }
        });
        const verifyRes = createMockRes();
        await verifyEmailOtp(verifyReq, verifyRes);

        assert.equal(verifyRes.statusCode, 400);
        assert.ok(verifyRes.body.message.includes("expired"));

        const otpRecord = await Otp.findOne({ user: user._id, purpose: "email_verification" });
        assert.equal(otpRecord, null, "Expired OTP record must be removed");
    });

    /* =====================================================================
     * 5. Reuse of an already consumed OTP
     * ===================================================================== */
    it("5. Replaying or reusing an already consumed OTP is strictly rejected", async () => {
        const email = "scenario5@test-afc.com";
        await registerUser(
            createMockReq({ body: { name: "Scenario Five", email, password: "Password123!" } }),
            createMockRes()
        );

        const queue = getTestEmailQueue();
        const otp = queue[queue.length - 1].text.match(/code is:\s*(\d{6})/)[1];

        // First verification: success
        await verifyEmailOtp(createMockReq({ body: { email, otp } }), createMockRes());

        // Replay attempt with same OTP
        const replayRes = createMockRes();
        await verifyEmailOtp(createMockReq({ body: { email, otp } }), replayRes);

        // Account is already verified
        assert.equal(replayRes.statusCode, 200);
        assert.equal(replayRes.body.alreadyVerified, true);
    });

    /* =====================================================================
     * 6. Too many verification attempts
     * ===================================================================== */
    it("6. Exceeding maximum verification attempts invalidates the OTP", async () => {
        const email = "scenario6@test-afc.com";
        await registerUser(
            createMockReq({ body: { name: "Scenario Six", email, password: "Password123!" } }),
            createMockRes()
        );

        // Submit 5 incorrect attempts
        for (let i = 1; i <= 4; i++) {
            const res = createMockRes();
            await verifyEmailOtp(createMockReq({ body: { email, otp: "111111" } }), res);
            assert.equal(res.statusCode, 400);
        }

        // 5th attempt exhausts attempts and invalidates OTP
        const finalRes = createMockRes();
        await verifyEmailOtp(createMockReq({ body: { email, otp: "111111" } }), finalRes);
        assert.equal(finalRes.statusCode, 400);
        assert.ok(finalRes.body.message.includes("Maximum attempts reached"));

        const user = await User.findOne({ email });
        const otpRecord = await Otp.findOne({ user: user._id, purpose: "email_verification" });
        assert.equal(otpRecord, null, "Exhausted OTP must be deleted");
    });

    /* =====================================================================
     * 7. Resend behavior and cooldown
     * ===================================================================== */
    it("7. Resend enforces 60-second cooldown and supersedes previous OTP", async () => {
        const email = "scenario7@test-afc.com";
        await registerUser(
            createMockReq({ body: { name: "Scenario Seven", email, password: "Password123!" } }),
            createMockRes()
        );

        // Immediate resend -> 429 Too Many Requests due to cooldown
        const resend1Res = createMockRes();
        await resendVerificationOtp(createMockReq({ body: { email } }), resend1Res);
        assert.equal(resend1Res.statusCode, 429);
        assert.ok(resend1Res.body.message.includes("Please wait"));

        // Fast-forward lastSentAt past the 60s cooldown
        const user = await User.findOne({ email });
        await Otp.updateOne(
            { user: user._id, purpose: "email_verification" },
            { $set: { lastSentAt: new Date(Date.now() - 65 * 1000) } }
        );

        // Resend now succeeds
        const resend2Res = createMockRes();
        await resendVerificationOtp(createMockReq({ body: { email } }), resend2Res);
        assert.equal(resend2Res.statusCode, 200);
        assert.equal(resend2Res.body.success, true);

        // Exactly 1 active OTP must exist in DB for this user
        const otpCount = await Otp.countDocuments({ user: user._id, purpose: "email_verification" });
        assert.equal(otpCount, 1, "Only 1 active OTP must exist per account and purpose");
    });

    /* =====================================================================
     * 8. Email provider failure handling
     * ===================================================================== */
    it("8. Email provider failure creates account safely without marking it verified", async () => {
        const email = "scenario8@test-afc.com";

        // Temporarily set NODE_ENV to production without SMTP credentials to trigger failure
        const prevEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = "production";

        const regRes = createMockRes();
        await registerUser(
            createMockReq({ body: { name: "Scenario Eight", email, password: "Password123!" } }),
            regRes
        );

        process.env.NODE_ENV = prevEnv; // Restore

        assert.equal(regRes.statusCode, 503);
        assert.equal(regRes.body.requiresVerification, true);
        assert.equal(regRes.body.emailDeliveryFailed, true);

        const user = await User.findOne({ email });
        assert.ok(user, "User should still be created");
        assert.equal(user.isEmailVerified, false, "Must not be verified if email failed");

        // Fast forward cooldown to test safe resend workflow
        await Otp.updateOne(
            { user: user._id, purpose: "email_verification" },
            { $set: { lastSentAt: new Date(Date.now() - 65 * 1000) } }
        );

        // Now test safe resend in test mode works
        const resendRes = createMockRes();
        await resendVerificationOtp(createMockReq({ body: { email } }), resendRes);
        assert.equal(resendRes.statusCode, 200);
    });

    /* =====================================================================
     * 9. Duplicate registration
     * ===================================================================== */
    it("9. Duplicate registration on verified user returns 409; unverified user safely re-registers", async () => {
        const email = "scenario9@test-afc.com";

        // Step 1: Register unverified
        await registerUser(
            createMockReq({ body: { name: "Original Name", email, password: "Password123!" } }),
            createMockRes()
        );

        // Step 2: Re-register unverified user with new password and name -> succeeds, issues fresh OTP
        const reRegRes = createMockRes();
        await registerUser(
            createMockReq({ body: { name: "Updated Name", email, password: "NewPassword123!" } }),
            reRegRes
        );
        assert.equal(reRegRes.statusCode, 201);
        const user = await User.findOne({ email });
        assert.equal(user.name, "Updated Name");

        // Step 3: Verify user
        const queue = getTestEmailQueue();
        const otp = queue[queue.length - 1].text.match(/code is:\s*(\d{6})/)[1];
        await verifyEmailOtp(createMockReq({ body: { email, otp } }), createMockRes());

        // Step 4: Register duplicate for verified user -> 409 Conflict
        const conflictRes = createMockRes();
        await registerUser(
            createMockReq({ body: { name: "Conflict Attempt", email, password: "Password123!" } }),
            conflictRes
        );
        assert.equal(conflictRes.statusCode, 409);
        assert.equal(conflictRes.body.success, false);
    });

    /* =====================================================================
     * 10. Login before verification
     * ===================================================================== */
    it("10. Login before verification is rejected with 403 and returns no session tokens", async () => {
        const email = "scenario10@test-afc.com";
        await registerUser(
            createMockReq({ body: { name: "Scenario Ten", email, password: "Password123!" } }),
            createMockRes()
        );

        const loginReq = createMockReq({ body: { email, password: "Password123!" } });
        const loginRes = createMockRes();
        await loginUser(loginReq, loginRes);

        assert.equal(loginRes.statusCode, 403);
        assert.equal(loginRes.body.requiresVerification, true);
        assert.equal(loginRes.cookies.access_token, undefined, "Must NOT issue access token");
        assert.equal(loginRes.cookies.refresh_token, undefined, "Must NOT issue refresh token");
    });

    /* =====================================================================
     * 11. Access to protected endpoints before verification
     * ===================================================================== */
    it("11. Middleware protect blocks unverified customer accounts with 403", async () => {
        const email = "scenario11@test-afc.com";
        const user = await User.create({
            name: "Unverified Protected Test",
            email,
            password: await bcrypt.hash("Password123!", 10),
            role: "user",
            isActive: true,
            isEmailVerified: false
        });

        // Generate token
        const token = generateAccessToken(user);

        const req = createMockReq({
            cookies: { access_token: token }
        });
        const res = createMockRes();
        let nextCalled = false;

        await protect(req, res, () => {
            nextCalled = true;
        });

        assert.equal(nextCalled, false, "next() must not be called for unverified user");
        assert.equal(res.statusCode, 403);
        assert.equal(res.body.requiresVerification, true);
    });

    /* =====================================================================
     * 12. Successful login after verification
     * ===================================================================== */
    it("12. Verified user can log in successfully and receive tokens and cookies", async () => {
        const email = "scenario12@test-afc.com";
        await registerUser(
            createMockReq({ body: { name: "Scenario Twelve", email, password: "Password123!" } }),
            createMockRes()
        );

        const queue = getTestEmailQueue();
        const otp = queue[queue.length - 1].text.match(/code is:\s*(\d{6})/)[1];
        await verifyEmailOtp(createMockReq({ body: { email, otp } }), createMockRes());

        // Now log in
        const loginRes = createMockRes();
        await loginUser(createMockReq({ body: { email, password: "Password123!" } }), loginRes);

        assert.equal(loginRes.statusCode, 200);
        assert.equal(loginRes.body.success, true);
        assert.ok(loginRes.body.token, "Access token returned");
        assert.ok(loginRes.cookies.access_token, "Access cookie set");
        assert.ok(loginRes.cookies.refresh_token, "Refresh cookie set");
    });

    /* =====================================================================
     * 13. Password reset
     * ===================================================================== */
    it("13. Password reset flow: request OTP, verify OTP, and reset password with session revocation", async () => {
        const email = "scenario13@test-afc.com";
        const initialPassword = "OldPassword123!";
        const newPassword = "NewSecurePassword456!";

        // Create and verify user
        await registerUser(
            createMockReq({ body: { name: "Scenario Thirteen", email, password: initialPassword } }),
            createMockRes()
        );
        const queue1 = getTestEmailQueue();
        const regOtp = queue1[0].text.match(/code is:\s*(\d{6})/)[1];
        await verifyEmailOtp(createMockReq({ body: { email, otp: regOtp } }), createMockRes());

        // 1. Request password reset
        clearTestEmailQueue();
        const forgotRes = createMockRes();
        await forgotPassword(createMockReq({ body: { email } }), forgotRes);
        assert.equal(forgotRes.statusCode, 200);

        const queue2 = getTestEmailQueue();
        assert.equal(queue2.length, 1);
        const resetOtp = queue2[0].text.match(/code is:\s*(\d{6})/)[1];

        // 2. Verify reset OTP
        const verifyResetRes = createMockRes();
        await verifyResetOtp(createMockReq({ body: { email, otp: resetOtp } }), verifyResetRes);
        assert.equal(verifyResetRes.statusCode, 200);

        // 3. Complete password reset
        const resetRes = createMockRes();
        await resetPassword(createMockReq({ body: { email, otp: resetOtp, newPassword } }), resetRes);
        assert.equal(resetRes.statusCode, 200);

        // 4. Old password fails
        const oldLoginRes = createMockRes();
        await loginUser(createMockReq({ body: { email, password: initialPassword } }), oldLoginRes);
        assert.equal(oldLoginRes.statusCode, 401);

        // 5. New password succeeds
        const newLoginRes = createMockRes();
        await loginUser(createMockReq({ body: { email, password: newPassword } }), newLoginRes);
        assert.equal(newLoginRes.statusCode, 200);
    });

    /* =====================================================================
     * 14. Existing admin and kitchen login behavior
     * ===================================================================== */
    it("14. Admin and Kitchen logins function normally and are not blocked", async () => {
        const adminEmail = "admin_test@test-afc.com";
        const kitchenEmail = "kitchen_test@test-afc.com";
        const password = "StaffPassword123!";
        const hashedPassword = await bcrypt.hash(password, 10);

        await User.create({
            name: "Admin Staff",
            email: adminEmail,
            password: hashedPassword,
            role: "admin",
            isActive: true,
            isEmailVerified: true
        });

        await User.create({
            name: "Kitchen Staff",
            email: kitchenEmail,
            password: hashedPassword,
            role: "kitchen",
            isActive: true,
            isEmailVerified: true
        });

        // Test Admin Login
        const adminRes = createMockRes();
        await adminLoginUser(createMockReq({ body: { email: adminEmail, password } }), adminRes);
        assert.equal(adminRes.statusCode, 200);
        assert.equal(adminRes.body.user.role, "admin");

        // Test Kitchen Login
        const kitchenRes = createMockRes();
        await kitchenLoginUser(createMockReq({ body: { email: kitchenEmail, password } }), kitchenRes);
        assert.equal(kitchenRes.statusCode, 200);
        assert.equal(kitchenRes.body.user.role, "kitchen");
    });

    /* =====================================================================
     * 15. Cookie, CSRF, and authorization behavior
     * ===================================================================== */
    it("15. Cookie security, CSRF protection, and role authorization operate correctly", async () => {
        const res = createMockRes();
        setAuthCookies(res, "sample_access_token", "sample_refresh_token");

        // 1. Validate cookie configurations
        assert.equal(res.cookies.access_token.options.httpOnly, true);
        assert.equal(res.cookies.refresh_token.options.httpOnly, true);
        assert.equal(res.cookies.refresh_token.options.path, "/api/auth");
        assert.equal(res.cookies["XSRF-TOKEN"].options.httpOnly, false); // Client readable

        // 2. Validate CSRF middleware
        // Safe GET request passes without CSRF token
        let csrfGetPassed = false;
        verifyCsrf(createMockReq({ method: "GET" }), createMockRes(), () => {
            csrfGetPassed = true;
        });
        assert.equal(csrfGetPassed, true);

        // State-changing POST with auth cookies but missing header fails
        const csrfPostRes = createMockRes();
        let csrfPostPassed = false;
        verifyCsrf(
            createMockReq({
                method: "POST",
                cookies: { access_token: "token", "XSRF-TOKEN": "valid_token" },
                headers: {}
            }),
            csrfPostRes,
            () => {
                csrfPostPassed = true;
            }
        );
        assert.equal(csrfPostPassed, false);
        assert.equal(csrfPostRes.statusCode, 403);

        // State-changing POST with matching header succeeds
        let csrfPostValidPassed = false;
        verifyCsrf(
            createMockReq({
                method: "POST",
                cookies: { access_token: "token", "XSRF-TOKEN": "valid_token" },
                headers: { "x-csrf-token": "valid_token" }
            }),
            createMockRes(),
            () => {
                csrfPostValidPassed = true;
            }
        );
        assert.equal(csrfPostValidPassed, true);

        // 3. Role authorization checks
        const customerUser = { role: "user" };
        const adminUser = { role: "admin" };

        let authCustomerPassed = false;
        const authCustomerRes = createMockRes();
        authorize("admin")(createMockReq({ user: customerUser }), authCustomerRes, () => {
            authCustomerPassed = true;
        });
        assert.equal(authCustomerPassed, false);
        assert.equal(authCustomerRes.statusCode, 403);

        let authAdminPassed = false;
        authorize("admin")(createMockReq({ user: adminUser }), createMockRes(), () => {
            authAdminPassed = true;
        });
        assert.equal(authAdminPassed, true);
    });
});
