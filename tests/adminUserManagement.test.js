const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../src/models/User");
const AuditLog = require("../src/models/AuditLog");
const Session = require("../src/models/Session");
const { getAdminUsers, adminCreateUser, adminUpdateUserStatus } = require("../src/controllers/adminController");
const { loginUser, adminLoginUser, kitchenLoginUser } = require("../src/controllers/authController");
const { protect, authorize } = require("../src/middleware/authMiddleware");
const authRoutes = require("../src/routes/authRoutes");
const { getJwtSecret, generateAccessToken } = require("../src/utils/authUtils");

// Helper to create mock response object
function createMockRes() {
    return {
        statusCode: 200,
        body: null,
        cookies: {},
        clearedCookies: [],
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
        },
        clearCookie(name, options) {
            this.clearedCookies.push({ name, options });
            delete this.cookies[name];
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

describe("AFC Admin-Managed Customer Accounts Suite", () => {
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
        await User.deleteMany({ email: { $regex: "@test-admin-mgmt\\.com$" } });
        await AuditLog.deleteMany({ actorEmail: { $regex: "@test-admin-mgmt\\.com$" } });
        await Session.deleteMany({});

        // Create Admin user
        adminUser = await User.create({
            name: "Test Admin",
            email: "admin@test-admin-mgmt.com",
            password: hashedPassword,
            role: "admin",
            isActive: true,
            isEmailVerified: true
        });

        // Create Customer user
        customerUser = await User.create({
            name: "Initial Customer",
            email: "customer@test-admin-mgmt.com",
            password: hashedPassword,
            role: "user",
            isActive: true,
            isEmailVerified: true
        });

        // Create Kitchen Staff user
        kitchenUser = await User.create({
            name: "Kitchen Staff",
            email: "kitchen@test-admin-mgmt.com",
            password: hashedPassword,
            role: "kitchen",
            isActive: true,
            isEmailVerified: true
        });
    });

    after(async () => {
        await User.deleteMany({ email: { $regex: "@test-admin-mgmt\\.com$" } });
        await AuditLog.deleteMany({ actorEmail: { $regex: "@test-admin-mgmt\\.com$" } });
        await Session.deleteMany({});
        await mongoose.disconnect();
    });

    /* =====================================================================
     * 1. Public Registration Disabled
     * ===================================================================== */
    it("1. Public registration endpoint rejects anonymous users with 403 Forbidden", async () => {
        // Find the /register route layer on authRoutes
        const registerRoute = authRoutes.stack.find(
            layer => layer.route && layer.route.path === "/register" && layer.route.methods.post
        );
        assert.ok(registerRoute, "Route /register must exist on authRoutes");

        // The route handler is the last in the route's stack
        const handler = registerRoute.route.stack[registerRoute.route.stack.length - 1].handle;
        const req = createMockReq({
            body: { name: "Public User", email: "public@test-admin-mgmt.com", password: "Password123!" }
        });
        const res = createMockRes();

        await handler(req, res);

        assert.equal(res.statusCode, 403);
        assert.equal(res.body.success, false);
        assert.match(res.body.message, /public registration is disabled/i);
    });

    /* =====================================================================
     * 2. Admin Create Customer Account
     * ===================================================================== */
    let createdCustomer;
    it("2. Authorized admin creates customer account without email/OTP verification", async () => {
        const req = createMockReq({
            body: {
                name: "Admin Created User",
                email: "admin-created@test-admin-mgmt.com",
                password: "SecurePassword123!"
            },
            user: adminUser
        });
        const res = createMockRes();

        await adminCreateUser(req, res);

        assert.equal(res.statusCode, 201);
        assert.equal(res.body.success, true);
        assert.ok(res.body.user);
        assert.equal(res.body.user.name, "Admin Created User");
        assert.equal(res.body.user.email, "admin-created@test-admin-mgmt.com");
        assert.equal(res.body.user.role, "user");
        assert.equal(res.body.user.isActive, true);
        assert.equal(res.body.user.isEmailVerified, true);
        // Password hash must never be returned in response
        assert.equal(res.body.user.password, undefined);

        // Verify in DB
        createdCustomer = await User.findOne({ email: "admin-created@test-admin-mgmt.com" }).select("+password");
        assert.ok(createdCustomer);
        assert.equal(createdCustomer.isEmailVerified, true);
        assert.equal(createdCustomer.isActive, true);
        assert.notEqual(createdCustomer.password, "SecurePassword123!");
        const match = await bcrypt.compare("SecurePassword123!", createdCustomer.password);
        assert.equal(match, true);
    });

    /* =====================================================================
     * 3. Duplicate Email Rejection
     * ===================================================================== */
    it("3. Reject duplicate email addresses when admin creates a user", async () => {
        const req = createMockReq({
            body: {
                name: "Duplicate User",
                email: "admin-created@test-admin-mgmt.com",
                password: "AnotherPassword123!"
            },
            user: adminUser
        });
        const res = createMockRes();

        await adminCreateUser(req, res);

        assert.equal(res.statusCode, 409);
        assert.equal(res.body.success, false);
        assert.match(res.body.message, /already exists/i);
    });

    /* =====================================================================
     * 4. RBAC - Non-Admin Access Prohibited
     * ===================================================================== */
    it("4. Non-admin users cannot access user management endpoints", async () => {
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

    /* =====================================================================
     * 5. Active Customer Login
     * ===================================================================== */
    it("5. Active customer created by admin can log in normally", async () => {
        const req = createMockReq({
            body: {
                email: "admin-created@test-admin-mgmt.com",
                password: "SecurePassword123!"
            }
        });
        const res = createMockRes();

        await loginUser(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.success, true);
        assert.ok(res.body.token);
        assert.equal(res.body.user.email, "admin-created@test-admin-mgmt.com");
    });

    /* =====================================================================
     * 6. Admin Disables Customer Account
     * ===================================================================== */
    it("6. Admin can disable a customer account and invalidate sessions", async () => {
        const req = createMockReq({
            params: { id: String(createdCustomer._id) },
            body: { isActive: false },
            user: adminUser
        });
        const res = createMockRes();

        await adminUpdateUserStatus(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.success, true);
        assert.equal(res.body.user.isActive, false);

        // Verify in DB
        const updatedUser = await User.findById(createdCustomer._id);
        assert.equal(updatedUser.isActive, false);
        assert.ok(updatedUser.tokenVersion > 0);
    });

    /* =====================================================================
     * 7. Disabled Customer Cannot Log In
     * ===================================================================== */
    it("7. Disabled customer cannot log in", async () => {
        const req = createMockReq({
            body: {
                email: "admin-created@test-admin-mgmt.com",
                password: "SecurePassword123!"
            }
        });
        const res = createMockRes();

        await loginUser(req, res);

        assert.equal(res.statusCode, 401);
        assert.equal(res.body.success, false);
        assert.match(res.body.message, /disabled/i);
    });

    /* =====================================================================
     * 8. Disabling Already Logged-In Customer Blocks Subsequent Requests
     * ===================================================================== */
    it("8. Disabling already logged-in customer blocks subsequent requests in protect middleware", async () => {
        // Customer was disabled in previous test. Generate a token that has user id:
        const token = generateAccessToken(createdCustomer);
        const req = createMockReq({
            headers: { authorization: `Bearer ${token}` }
        });
        const res = createMockRes();
        let nextCalled = false;

        await protect(req, res, () => {
            nextCalled = true;
        });

        assert.equal(nextCalled, false);
        assert.equal(res.statusCode, 401);
        assert.equal(res.body.success, false);
        assert.match(res.body.message, /account disabled/i);
    });

    /* =====================================================================
     * 9. Admin Re-enables Customer Account
     * ===================================================================== */
    it("9. Admin can re-enable a disabled customer account", async () => {
        const req = createMockReq({
            params: { id: String(createdCustomer._id) },
            body: { isActive: true },
            user: adminUser
        });
        const res = createMockRes();

        await adminUpdateUserStatus(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.success, true);
        assert.equal(res.body.user.isActive, true);

        // Verify user can log in again
        const loginReq = createMockReq({
            body: {
                email: "admin-created@test-admin-mgmt.com",
                password: "SecurePassword123!"
            }
        });
        const loginRes = createMockRes();

        await loginUser(loginReq, loginRes);

        assert.equal(loginRes.statusCode, 200);
        assert.equal(loginRes.body.success, true);
    });

    /* =====================================================================
     * 10. Admin Cannot Disable Self
     * ===================================================================== */
    it("10. Admin cannot disable their own account", async () => {
        const req = createMockReq({
            params: { id: String(adminUser._id) },
            body: { isActive: false },
            user: adminUser
        });
        const res = createMockRes();

        await adminUpdateUserStatus(req, res);

        assert.equal(res.statusCode, 400);
        assert.equal(res.body.success, false);
        assert.match(res.body.message, /cannot disable your own/i);
    });

    /* =====================================================================
     * 11. Existing Admin and Kitchen Authentication Still Works
     * ===================================================================== */
    it("11. Existing admin and kitchen authentication still works normally", async () => {
        // Admin login
        const adminReq = createMockReq({
            body: { email: "admin@test-admin-mgmt.com", password: testPassword }
        });
        const adminRes = createMockRes();
        await adminLoginUser(adminReq, adminRes);
        assert.equal(adminRes.statusCode, 200);
        assert.equal(adminRes.body.success, true);
        assert.equal(adminRes.body.user.role, "admin");

        // Kitchen login
        const kitchenReq = createMockReq({
            body: { email: "kitchen@test-admin-mgmt.com", password: testPassword }
        });
        const kitchenRes = createMockRes();
        await kitchenLoginUser(kitchenReq, kitchenRes);
        assert.equal(kitchenRes.statusCode, 200);
        assert.equal(kitchenRes.body.success, true);
        assert.equal(kitchenRes.body.user.role, "kitchen");
    });
});
