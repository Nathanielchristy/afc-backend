const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const User = require("../src/models/User");
const AuditLog = require("../src/models/AuditLog");
const Session = require("../src/models/Session");
const { getAdminUsers, adminUpdateUserVerification } = require("../src/controllers/adminController");
const { loginUser } = require("../src/controllers/authController");
const { protect, authorize } = require("../src/middleware/authMiddleware");

// Helper to create mock response object
function createMockRes() {
    return {
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
}

// Helper to create mock request object
function createMockReq({ params = {}, query = {}, body = {}, user = null, ip = "127.0.0.1", headers = {}, cookies = {} } = {}) {
    return {
        params,
        query,
        body,
        user,
        ip,
        headers,
        cookies
    };
}

describe("AFC Admin Customer Email Verification Suite", () => {
    let adminUser;
    let customerUser;
    let kitchenUser;
    const testPassword = "Password123!";

    before(async () => {
        process.env.NODE_ENV = "test";
        process.env.JWT_SECRET = "afc_test_jwt_secret_key_1234567890";
        process.env.OTP_SECRET = "afc_test_otp_secret_key_1234567890";

        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/afc");
        }

        const hashedPassword = await bcrypt.hash(testPassword, 10);

        // Clean up previous test users
        await User.deleteMany({ email: { $regex: "@test-verify-admin\\.com$" } });
        await AuditLog.deleteMany({ actorEmail: "admin@test-verify-admin.com" });
        await Session.deleteMany({});

        // Create Admin user
        adminUser = await User.create({
            name: "Test Admin",
            email: "admin@test-verify-admin.com",
            password: hashedPassword,
            role: "admin",
            isActive: true,
            isEmailVerified: true
        });

        // Create Customer user (unverified)
        customerUser = await User.create({
            name: "Unverified Customer",
            email: "customer@test-verify-admin.com",
            password: hashedPassword,
            role: "user",
            isActive: true,
            isEmailVerified: false
        });

        // Create Kitchen Staff user
        kitchenUser = await User.create({
            name: "Kitchen Staff",
            email: "kitchen@test-verify-admin.com",
            password: hashedPassword,
            role: "kitchen",
            isActive: true,
            isEmailVerified: true
        });
    });

    after(async () => {
        await User.deleteMany({ email: { $regex: "@test-verify-admin\\.com$" } });
        await AuditLog.deleteMany({ actorEmail: "admin@test-verify-admin.com" });
        await Session.deleteMany({});
        await mongoose.disconnect();
    });

    it("1. getAdminUsers returns unverified customer with isEmailVerified: false", async () => {
        const req = createMockReq({
            query: { search: "customer@test-verify-admin.com" },
            user: adminUser
        });
        const res = createMockRes();

        await getAdminUsers(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.success, true);
        assert.ok(Array.isArray(res.body.users));
        assert.equal(res.body.users.length, 1);
        assert.equal(res.body.users[0].email, "customer@test-verify-admin.com");
        assert.equal(res.body.users[0].isEmailVerified, false);
    });

    it("2. Customer cannot log in while unverified (rejected with 403 requiresVerification)", async () => {
        const req = createMockReq({
            body: {
                email: "customer@test-verify-admin.com",
                password: testPassword
            }
        });
        const res = createMockRes();

        await loginUser(req, res);

        assert.equal(res.statusCode, 403);
        assert.equal(res.body.success, false);
        assert.equal(res.body.requiresVerification, true);
    });

    it("3. Authorized admin marks customer as verified via adminUpdateUserVerification", async () => {
        const req = createMockReq({
            params: { id: String(customerUser._id) },
            body: { isEmailVerified: true },
            user: adminUser
        });
        const res = createMockRes();

        await adminUpdateUserVerification(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.success, true);
        assert.equal(res.body.user.isEmailVerified, true);
        assert.equal(res.body.user.email, "customer@test-verify-admin.com");
    });

    it("4. The change is persisted in MongoDB", async () => {
        const reloadedUser = await User.findById(customerUser._id);
        assert.ok(reloadedUser);
        assert.equal(reloadedUser.isEmailVerified, true);
    });

    it("5. AuditLog records the admin manual verification action", async () => {
        const log = await AuditLog.findOne({
            targetRecord: String(customerUser._id),
            action: "USER_VERIFICATION_MANUALLY_UPDATED"
        });

        assert.ok(log, "AuditLog entry should exist");
        assert.equal(log.actorEmail, adminUser.email);
        assert.equal(log.targetModel, "User");
        assert.equal(log.details.previousStatus, false);
        assert.equal(log.details.newStatus, true);
    });

    it("6. Customer can now log in successfully through the existing login flow", async () => {
        const req = createMockReq({
            body: {
                email: "customer@test-verify-admin.com",
                password: testPassword
            }
        });
        const res = createMockRes();

        await loginUser(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.success, true);
        assert.ok(res.body.token);
        assert.equal(res.body.user.isEmailVerified, true);
    });

    it("7. getAdminUsers dashboard reflects Verified status", async () => {
        const req = createMockReq({
            query: { search: "customer@test-verify-admin.com" },
            user: adminUser
        });
        const res = createMockRes();

        await getAdminUsers(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.users.length, 1);
        assert.equal(res.body.users[0].isEmailVerified, true);
    });

    it("8. Non-admin customer cannot access admin endpoints (rejected with 403)", async () => {
        const middleware = authorize("admin");
        const req = createMockReq({ user: customerUser });
        const res = createMockRes();
        let nextCalled = false;

        middleware(req, res, () => {
            nextCalled = true;
        });

        assert.equal(nextCalled, false);
        assert.equal(res.statusCode, 403);
        assert.equal(res.body.success, false);
    });

    it("9. Kitchen staff cannot access admin endpoints (rejected with 403)", async () => {
        const middleware = authorize("admin");
        const req = createMockReq({ user: kitchenUser });
        const res = createMockRes();
        let nextCalled = false;

        middleware(req, res, () => {
            nextCalled = true;
        });

        assert.equal(nextCalled, false);
        assert.equal(res.statusCode, 403);
        assert.equal(res.body.success, false);
    });

    it("10. Unauthenticated request to protect middleware is rejected with 401", async () => {
        const req = createMockReq({});
        const res = createMockRes();
        let nextCalled = false;

        await protect(req, res, () => {
            nextCalled = true;
        });

        assert.equal(nextCalled, false);
        assert.equal(res.statusCode, 401);
        assert.equal(res.body.success, false);
    });

    it("11. Invalid MongoDB ObjectId is rejected with 400 Bad Request", async () => {
        const req = createMockReq({
            params: { id: "not-a-valid-id-123" },
            body: { isEmailVerified: true },
            user: adminUser
        });
        const res = createMockRes();

        await adminUpdateUserVerification(req, res);

        assert.equal(res.statusCode, 400);
        assert.equal(res.body.success, false);
        assert.equal(res.body.message, "Invalid customer ID");
    });

    it("12. Non-existent customer ID returns 404 Not Found", async () => {
        const nonExistentId = new mongoose.Types.ObjectId();
        const req = createMockReq({
            params: { id: String(nonExistentId) },
            body: { isEmailVerified: true },
            user: adminUser
        });
        const res = createMockRes();

        await adminUpdateUserVerification(req, res);

        assert.equal(res.statusCode, 404);
        assert.equal(res.body.success, false);
        assert.equal(res.body.message, "Customer not found");
    });
});
