const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const app = require("../src/app");
const User = require("../src/models/User");
const Session = require("../src/models/Session");
const AuditLog = require("../src/models/AuditLog");

/**
 * Isolated CookieJar to simulate distinct browser sessions.
 * Accurately parses Set-Cookie, expires cookies with Max-Age=0 or past expires,
 * and builds Cookie header for subsequent HTTP requests.
 */
class CookieJar {
    constructor() {
        this.cookies = new Map();
    }

    setFromHeaders(headers) {
        let setCookies = [];
        if (typeof headers.getSetCookie === "function") {
            setCookies = headers.getSetCookie();
        } else if (headers["set-cookie"]) {
            const raw = headers["set-cookie"];
            setCookies = Array.isArray(raw) ? raw : [raw];
        }

        for (const cookieStr of setCookies) {
            const parts = cookieStr.split(";");
            const firstPart = parts[0].trim();
            const eqIdx = firstPart.indexOf("=");
            if (eqIdx === -1) continue;
            const name = firstPart.slice(0, eqIdx).trim();
            const value = firstPart.slice(eqIdx + 1).trim();

            const isExpired = parts.some(p => {
                const lp = p.trim().toLowerCase();
                return lp.startsWith("max-age=0") ||
                    lp.startsWith("expires=thu, 01 jan 1970");
            });

            if (isExpired || value === "") {
                this.cookies.delete(name);
            } else {
                this.cookies.set(name, value);
            }
        }
    }

    getCookieHeader() {
        return Array.from(this.cookies.entries())
            .map(([name, val]) => `${name}=${val}`)
            .join("; ");
    }

    get(name) {
        return this.cookies.get(name);
    }

    clear() {
        this.cookies.clear();
    }
}

describe("AFC Kitchen Session Isolation & RBAC Regression Suite", () => {
    let server;
    let baseUrl;
    let kitchenUser;
    let customerUser;
    let adminUser;

    const testPassword = "Password123!";
    const kitchenEmail = "kitchen-station@afc-isolation-test.com";
    const customerEmail = "customer-user@afc-isolation-test.com";
    const adminEmail = "admin-user@afc-isolation-test.com";

    // Helper to send HTTP requests with a specific CookieJar
    async function makeRequest(path, { method = "GET", body = null, jar = null, headers = {} } = {}) {
        const reqHeaders = { ...headers };

        if (body && !reqHeaders["Content-Type"]) {
            reqHeaders["Content-Type"] = "application/json";
        }

        if (jar) {
            const cookieHeader = jar.getCookieHeader();
            if (cookieHeader) {
                reqHeaders["Cookie"] = cookieHeader;
            }
            const xsrf = jar.get("XSRF-TOKEN");
            if (xsrf && ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase())) {
                reqHeaders["X-CSRF-Token"] = xsrf;
            }
        }

        const url = `${baseUrl}${path}`;
        const fetchOptions = {
            method,
            headers: reqHeaders,
            body: body ? JSON.stringify(body) : undefined
        };

        const res = await fetch(url, fetchOptions);
        if (jar) {
            jar.setFromHeaders(res.headers);
        }

        let json = null;
        const text = await res.text();
        try {
            json = JSON.parse(text);
        } catch {
            json = { rawText: text };
        }

        return {
            status: res.status,
            body: json,
            headers: res.headers
        };
    }

    before(async () => {
        process.env.NODE_ENV = "test";
        process.env.JWT_SECRET = "afc_session_isolation_test_secret_key_12345";
        process.env.OTP_SECRET = "afc_session_isolation_otp_secret_key_12345";

        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/afc");
        }

        // Clean up previous test records
        await User.deleteMany({ email: { $regex: "@afc-isolation-test\\.com$" } });
        await AuditLog.deleteMany({ actorEmail: { $regex: "@afc-isolation-test\\.com$" } });
        await Session.deleteMany({});

        const hashedPassword = await bcrypt.hash(testPassword, 10);

        kitchenUser = await User.create({
            name: "Kitchen Test Station",
            email: kitchenEmail,
            password: hashedPassword,
            role: "kitchen",
            isActive: true,
            isEmailVerified: true
        });

        customerUser = await User.create({
            name: "Customer Test User",
            email: customerEmail,
            password: hashedPassword,
            role: "user",
            isActive: true,
            isEmailVerified: true
        });

        adminUser = await User.create({
            name: "Admin Test User",
            email: adminEmail,
            password: hashedPassword,
            role: "admin",
            isActive: true,
            isEmailVerified: true
        });

        // Start HTTP server on dynamic port
        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, resolve));
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
    });

    after(async () => {
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
        await User.deleteMany({ email: { $regex: "@afc-isolation-test\\.com$" } });
        await AuditLog.deleteMany({ actorEmail: { $regex: "@afc-isolation-test\\.com$" } });
        await Session.deleteMany({});
        await mongoose.disconnect();
    });

    it("1. Browser Session A logs in as kitchen and receives kitchen-scoped cookies", async () => {
        const jarA = new CookieJar();
        const res = await makeRequest("/api/auth/kitchen/login", {
            method: "POST",
            body: { email: kitchenEmail, password: testPassword },
            jar: jarA
        });

        assert.equal(res.status, 200);
        assert.equal(res.body.success, true);
        assert.equal(res.body.user.role, "kitchen");
        assert.equal(res.body.user.email, kitchenEmail);

        // Verify kitchen-scoped cookies were set
        assert.ok(jarA.get("kitchen_access_token"), "kitchen_access_token must be set");
        assert.ok(jarA.get("kitchen_refresh_token"), "kitchen_refresh_token must be set");
        assert.ok(jarA.get("XSRF-TOKEN"), "XSRF-TOKEN must be set");

        // Customer access_token must NOT be set by kitchen login
        assert.equal(jarA.get("access_token"), undefined);
        assert.equal(jarA.get("refresh_token"), undefined);
    });

    it("2. Independent Session B, with no kitchen credentials or cookies, receives 401 when calling protected kitchen endpoint", async () => {
        const jarB = new CookieJar(); // Completely clean cookie jar simulating an incognito or independent session

        const res = await makeRequest("/api/kitchen/orders", {
            method: "GET",
            jar: jarB
        });

        assert.equal(res.status, 401);
        assert.equal(res.body.success, false);
        assert.equal(res.body.message, "Authentication required");
    });

    it("3. Session A can access the protected kitchen endpoint after successful login", async () => {
        const jarA = new CookieJar();
        // Log in Session A
        await makeRequest("/api/auth/kitchen/login", {
            method: "POST",
            body: { email: kitchenEmail, password: testPassword },
            jar: jarA
        });

        // Request kitchen orders
        const res = await makeRequest("/api/kitchen/orders", {
            method: "GET",
            jar: jarA
        });

        assert.equal(res.status, 200);
        assert.equal(res.body.success, true);
        assert.ok(Array.isArray(res.body.orders));
        assert.ok(res.body.counts);
    });

    it("4. A non-kitchen customer token cannot access kitchen endpoints (receives 403 Forbidden)", async () => {
        const customerJar = new CookieJar();
        // Log in customer
        const loginRes = await makeRequest("/api/auth/login", {
            method: "POST",
            body: { email: customerEmail, password: testPassword },
            jar: customerJar
        });

        assert.equal(loginRes.status, 200);
        assert.ok(customerJar.get("access_token"), "Customer must receive access_token");
        assert.equal(customerJar.get("kitchen_access_token"), undefined, "Customer must NOT receive kitchen_access_token");

        // Customer attempts to access kitchen orders
        const res = await makeRequest("/api/kitchen/orders", {
            method: "GET",
            jar: customerJar
        });

        assert.equal(res.status, 403);
        assert.equal(res.body.success, false);
        assert.equal(res.body.message, "You do not have permission to perform this action");
    });

    it("5. Logout invalidates or clears the appropriate session without unexpectedly logging in or terminating another session", async () => {
        // Prepare Session A (Kitchen) and Session C (Customer)
        const jarA = new CookieJar();
        await makeRequest("/api/auth/kitchen/login", {
            method: "POST",
            body: { email: kitchenEmail, password: testPassword },
            jar: jarA
        });

        const jarC = new CookieJar();
        await makeRequest("/api/auth/login", {
            method: "POST",
            body: { email: customerEmail, password: testPassword },
            jar: jarC
        });

        // Verify Session A can access kitchen before logout
        const preLogout = await makeRequest("/api/kitchen/orders", { method: "GET", jar: jarA });
        assert.equal(preLogout.status, 200);

        // Session A logs out with kitchen context
        const logoutRes = await makeRequest("/api/auth/logout", {
            method: "POST",
            jar: jarA,
            headers: { "X-Auth-Role": "kitchen" }
        });

        assert.equal(logoutRes.status, 200);
        assert.equal(logoutRes.body.success, true);
        assert.equal(jarA.get("kitchen_access_token"), undefined, "kitchen_access_token must be cleared");

        // Session A now gets 401
        const postLogout = await makeRequest("/api/kitchen/orders", { method: "GET", jar: jarA });
        assert.equal(postLogout.status, 401);

        // Session C (customer) is still authenticated
        const customerMe = await makeRequest("/api/auth/me", { method: "GET", jar: jarC });
        assert.equal(customerMe.status, 200);
        assert.equal(customerMe.body.user.email, customerEmail);
    });

    it("6. Admin access continues to follow existing intended authorization rules (access_token can access kitchen)", async () => {
        const adminJar = new CookieJar();
        const loginRes = await makeRequest("/api/auth/admin/login", {
            method: "POST",
            body: { email: adminEmail, password: testPassword },
            jar: adminJar
        });

        assert.equal(loginRes.status, 200);
        assert.ok(adminJar.get("access_token"), "Admin must receive access_token");

        // Admin can access kitchen orders
        const res = await makeRequest("/api/kitchen/orders", {
            method: "GET",
            jar: adminJar
        });

        assert.equal(res.status, 200);
        assert.equal(res.body.success, true);
    });

    it("7. Kitchen tokens do not authenticate customer endpoints (/api/cart, /api/orders)", async () => {
        const jarA = new CookieJar();
        await makeRequest("/api/auth/kitchen/login", {
            method: "POST",
            body: { email: kitchenEmail, password: testPassword },
            jar: jarA
        });

        // Kitchen token calling customer orders endpoint
        const ordersRes = await makeRequest("/api/orders", {
            method: "GET",
            jar: jarA
        });

        assert.equal(ordersRes.status, 401);
        assert.equal(ordersRes.body.success, false);

        // Kitchen token calling customer cart endpoint
        const cartRes = await makeRequest("/api/cart", {
            method: "GET",
            jar: jarA
        });

        assert.equal(cartRes.status, 401);
        assert.equal(cartRes.body.success, false);
    });

    it("8. In the same browser jar, kitchen and customer credentials do not overwrite each other", async () => {
        const dualJar = new CookieJar();

        // 1. Log in as Customer
        await makeRequest("/api/auth/login", {
            method: "POST",
            body: { email: customerEmail, password: testPassword },
            jar: dualJar
        });
        assert.ok(dualJar.get("access_token"));

        // 2. Log in as Kitchen in the same jar
        await makeRequest("/api/auth/kitchen/login", {
            method: "POST",
            body: { email: kitchenEmail, password: testPassword },
            jar: dualJar
        });

        // Both credentials must co-exist peacefully without collision
        assert.ok(dualJar.get("access_token"), "Customer access_token must not be overwritten");
        assert.ok(dualJar.get("kitchen_access_token"), "Kitchen kitchen_access_token must be present");

        // Calling /api/kitchen/orders uses kitchen_access_token
        const kitchenRes = await makeRequest("/api/kitchen/orders", {
            method: "GET",
            jar: dualJar
        });
        assert.equal(kitchenRes.status, 200);

        // Calling /api/auth/me from customer storefront returns customer
        const customerProfile = await makeRequest("/api/auth/me", {
            method: "GET",
            jar: dualJar
        });
        assert.equal(customerProfile.status, 200);
        assert.equal(customerProfile.body.user.email, customerEmail);

        // Calling /api/auth/me from kitchen terminal (with X-Auth-Role: kitchen) returns kitchen staff
        const kitchenProfile = await makeRequest("/api/auth/me", {
            method: "GET",
            jar: dualJar,
            headers: { "X-Auth-Role": "kitchen" }
        });
        assert.equal(kitchenProfile.status, 200);
        assert.equal(kitchenProfile.body.user.email, kitchenEmail);
    });

    it("9. Kitchen refresh token rotation works independently via /api/auth/refresh", async () => {
        const jarA = new CookieJar();
        await makeRequest("/api/auth/kitchen/login", {
            method: "POST",
            body: { email: kitchenEmail, password: testPassword },
            jar: jarA
        });

        const initialKitchenAccess = jarA.get("kitchen_access_token");
        const initialKitchenRefresh = jarA.get("kitchen_refresh_token");

        // Trigger refresh
        const refreshRes = await makeRequest("/api/auth/refresh", {
            method: "POST",
            jar: jarA,
            headers: { "X-Auth-Role": "kitchen" }
        });

        assert.equal(refreshRes.status, 200);
        assert.equal(refreshRes.body.success, true);
        assert.equal(refreshRes.body.user.role, "kitchen");

        const rotatedKitchenAccess = jarA.get("kitchen_access_token");
        const rotatedKitchenRefresh = jarA.get("kitchen_refresh_token");

        assert.ok(rotatedKitchenAccess);
        assert.ok(rotatedKitchenRefresh);
        assert.notEqual(rotatedKitchenRefresh, initialKitchenRefresh, "Refresh token should rotate in database and cookie");

        // Orders endpoint remains accessible after rotation
        const ordersRes = await makeRequest("/api/kitchen/orders", {
            method: "GET",
            jar: jarA
        });
        assert.equal(ordersRes.status, 200);
    });
});
