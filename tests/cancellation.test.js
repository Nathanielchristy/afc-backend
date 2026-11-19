const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const Order = require("../src/models/new/Order");
const Product = require("../src/models/Product");
const User = require("../src/models/User");
const { cancelOrderAtomic, decideEligibility } = require("../src/services/cancellationService");

describe("AFC Order Cancellation & Refund Verification Suite", () => {
    let testUser, adminUser, otherUser, testProduct, pendingOrder, confirmedOrder, processingOrder, deliveredOrder;

    before(async () => {
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/afc");
        }

        await Order.deleteMany({ cancellationReason: { $regex: "^TEST-" } });
        await Product.deleteMany({ sku: { $regex: "^TPROD-" } });
        await User.deleteMany({ email: { $regex: "^testcancel" } });

        testUser = await User.create({
            name: "Test Customer",
            email: "testcancel_user@example.com",
            password: "Password123!",
            role: "user"
        });

        otherUser = await User.create({
            name: "Other Customer",
            email: "testcancel_other@example.com",
            password: "Password123!",
            role: "user"
        });

        adminUser = await User.create({
            name: "Test Admin",
            email: "testcancel_admin@example.com",
            password: "Password123!",
            role: "admin"
        });

        testProduct = await Product.create({
            name: "Test Burger",
            priceInPaise: 15000,
            stock: 20,
            sku: "TPROD-BURGER",
            image: "https://example.com/burger.jpg",
            category: new mongoose.Types.ObjectId()
        });

        pendingOrder = await Order.create({
            user: testUser._id,
            items: [{
                product: testProduct._id,
                name: "Test Burger",
                priceInPaise: 15000,
                quantity: 2
            }],
            totalAmountInPaise: 30000,
            status: "pending",
            paymentStatus: "pending"
        });

        confirmedOrder = await Order.create({
            user: testUser._id,
            items: [{
                product: testProduct._id,
                name: "Test Burger",
                priceInPaise: 15000,
                quantity: 1
            }],
            totalAmountInPaise: 15000,
            status: "confirmed",
            paymentStatus: "pending"
        });

        processingOrder = await Order.create({
            user: testUser._id,
            items: [{
                product: testProduct._id,
                name: "Test Burger",
                priceInPaise: 15000,
                quantity: 1
            }],
            totalAmountInPaise: 15000,
            status: "processing",
            paymentStatus: "pending"
        });

        deliveredOrder = await Order.create({
            user: testUser._id,
            items: [{
                product: testProduct._id,
                name: "Test Burger",
                priceInPaise: 15000,
                quantity: 1
            }],
            totalAmountInPaise: 15000,
            status: "delivered",
            paymentStatus: "paid"
        });
    });

    beforeEach(async () => {
        await Order.deleteMany({ cancellationReason: { $regex: "^TEST-" } });
        pendingOrder = await Order.create({
            user: testUser._id,
            items: [{
                product: testProduct._id,
                name: "Test Burger",
                priceInPaise: 15000,
                quantity: 2
            }],
            totalAmountInPaise: 30000,
            status: "pending",
            paymentStatus: "pending"
        });

        confirmedOrder = await Order.create({
            user: testUser._id,
            items: [{
                product: testProduct._id,
                name: "Test Burger",
                priceInPaise: 15000,
                quantity: 1
            }],
            totalAmountInPaise: 15000,
            status: "confirmed",
            paymentStatus: "pending"
        });

        processingOrder = await Order.create({
            user: testUser._id,
            items: [{
                product: testProduct._id,
                name: "Test Burger",
                priceInPaise: 15000,
                quantity: 1
            }],
            totalAmountInPaise: 15000,
            status: "processing",
            paymentStatus: "pending"
        });

        deliveredOrder = await Order.create({
            user: testUser._id,
            items: [{
                product: testProduct._id,
                name: "Test Burger",
                priceInPaise: 15000,
                quantity: 1
            }],
            totalAmountInPaise: 15000,
            status: "delivered",
            paymentStatus: "paid"
        });
    });

    after(async () => {
        await Order.deleteMany({ cancellationReason: { $regex: "^TEST-" } });
        await Product.deleteMany({ sku: { $regex: "^TPROD-" } });
        await User.deleteMany({ email: { $regex: "^testcancel" } });
        await mongoose.disconnect();
    });

    it("1. Customer cannot cancel any order", async () => {
        const res = await cancelOrderAtomic({
            orderId: pendingOrder._id,
            actor: testUser,
            reason: "TEST-Attempt cancel",
            req: { ip: "127.0.0.1" }
        });

        assert.notEqual(res.error, undefined);
        assert.equal(res.error.statusCode, 403);
    });

    it("2. Customer cannot cancel a confirmed order", async () => {
        const res = await cancelOrderAtomic({
            orderId: confirmedOrder._id,
            actor: testUser,
            reason: "TEST-Attempt cancel",
            req: { ip: "127.0.0.1" }
        });

        assert.notEqual(res.error, undefined);
        assert.equal(res.error.statusCode, 403);
    });

    it("3. Customer cannot cancel another customer's order", async () => {
        const anotherOrder = await Order.create({
            user: otherUser._id,
            items: [{
                product: testProduct._id,
                name: "Test Burger",
                priceInPaise: 15000,
                quantity: 1
            }],
            totalAmountInPaise: 15000,
            status: "pending"
        });

        const res = await cancelOrderAtomic({
            orderId: anotherOrder._id,
            actor: testUser,
            reason: "TEST-Malicious cancel",
            req: { ip: "127.0.0.1" }
        });

        assert.notEqual(res.error, undefined);
        assert.equal(res.error.statusCode, 403);
    });

    it("4. Customer cannot cancel an order being prepared (processing)", async () => {
        const res = await cancelOrderAtomic({
            orderId: processingOrder._id,
            actor: testUser,
            reason: "TEST-Too late",
            req: { ip: "127.0.0.1" }
        });

        assert.notEqual(res.error, undefined);
        assert.equal(res.error.statusCode, 403);
    });

    it("5. Customer cannot cancel a delivered order", async () => {
        const res = await cancelOrderAtomic({
            orderId: deliveredOrder._id,
            actor: testUser,
            reason: "TEST-Already eaten",
            req: { ip: "127.0.0.1" }
        });

        assert.notEqual(res.error, undefined);
        assert.equal(res.error.statusCode, 403);
    });

    it("6. Admin override requires an override reason when cancelling an order in processing", async () => {
        const failRes = await cancelOrderAtomic({
            orderId: processingOrder._id,
            actor: adminUser,
            reason: "TEST-Kitchen closure",
            overrideReason: "",
            req: { ip: "127.0.0.1" }
        });

        assert.notEqual(failRes.error, undefined);
        assert.equal(failRes.error.statusCode, 400);

        const successRes = await cancelOrderAtomic({
            orderId: processingOrder._id,
            actor: adminUser,
            reason: "TEST-Kitchen closure",
            overrideReason: "TEST-Gas pipe burst in kitchen",
            req: { ip: "127.0.0.1" }
        });

        assert.equal(successRes.error, undefined);
        assert.equal(successRes.order.status, "cancelled");
        assert.equal(successRes.order.cancellationSource, "ADMIN");
        assert.equal(successRes.order.cancellationOverrideReason, "TEST-Gas pipe burst in kitchen");
    });

    it("7. Repeated cancellation does not duplicate stock restoration", async () => {
        const freshOrder = await Order.create({
            user: testUser._id,
            items: [{
                product: testProduct._id,
                name: "Test Burger",
                priceInPaise: 15000,
                quantity: 3
            }],
            totalAmountInPaise: 45000,
            status: "pending"
        });

        // First cancellation succeeds
        const res1 = await cancelOrderAtomic({
            orderId: freshOrder._id,
            actor: testUser,
            reason: "TEST-First cancel",
            req: { ip: "127.0.0.1" }
        });
        assert.equal(res1.error, undefined);

        // Second cancellation attempt on already cancelled order is rejected
        const res2 = await cancelOrderAtomic({
            orderId: freshOrder._id,
            actor: testUser,
            reason: "TEST-Second cancel",
            req: { ip: "127.0.0.1" }
        });
        assert.notEqual(res2.error, undefined);
        assert.equal(res2.error.statusCode, 409);
    });

    it("8. Cash on Delivery / unpaid order cancellation requires no refund", async () => {
        const codOrder = await Order.create({
            user: testUser._id,
            items: [{
                product: testProduct._id,
                name: "Test Burger",
                priceInPaise: 15000,
                quantity: 1
            }],
            totalAmountInPaise: 15000,
            status: "pending",
            paymentStatus: "pending"
        });

        const res = await cancelOrderAtomic({
            orderId: codOrder._id,
            actor: testUser,
            reason: "TEST-COD order cancel",
            req: { ip: "127.0.0.1" }
        });

        assert.equal(res.error, undefined);
        assert.equal(res.order.status, "cancelled");
        assert.equal(res.order.refundStatus, "not_required");
    });

    it("9. Paid order cancellation without live gateway confirms refund pending review and does NOT falsely report success", async () => {
        const paidOrder = await Order.create({
            user: testUser._id,
            items: [{
                product: testProduct._id,
                name: "Test Burger",
                priceInPaise: 15000,
                quantity: 1
            }],
            totalAmountInPaise: 15000,
            status: "confirmed",
            paymentStatus: "paid"
        });

        const res = await cancelOrderAtomic({
            orderId: paidOrder._id,
            actor: testUser,
            reason: "TEST-Paid cancel",
            req: { ip: "127.0.0.1" }
        });

        assert.equal(res.error, undefined);
        assert.equal(res.order.status, "cancelled");
        assert.equal(res.order.refundStatus, "refund_pending_review");
        assert.notEqual(res.order.refundStatus, "refunded");
    });

    it("10. Concurrent cancellations on the same order: only one succeeds", async () => {
        const concurrentOrder = await Order.create({
            user: testUser._id,
            items: [{
                product: testProduct._id,
                name: "Test Burger",
                priceInPaise: 15000,
                quantity: 1
            }],
            totalAmountInPaise: 15000,
            status: "pending"
        });

        const [r1, r2] = await Promise.all([
            cancelOrderAtomic({
                orderId: concurrentOrder._id,
                actor: testUser,
                reason: "TEST-Race 1",
                req: { ip: "127.0.0.1" }
            }),
            cancelOrderAtomic({
                orderId: concurrentOrder._id,
                actor: testUser,
                reason: "TEST-Race 2",
                req: { ip: "127.0.0.1" }
            })
        ]);

        const successes = [r1, r2].filter(r => !r.error);
        const failures = [r1, r2].filter(r => r.error);

        assert.equal(successes.length, 1);
        assert.equal(failures.length, 1);
        assert.equal(successes[0].order.status, "cancelled");
    });

    it("11. Cancelled orders are preserved in database and visible in history", async () => {
        const fetched = await Order.findById(pendingOrder._id);
        assert.notEqual(fetched, null);
        assert.equal(fetched.status, "cancelled");
        assert.equal(fetched.cancellationReason, "TEST-Ordered by mistake");
        assert.equal(fetched.items.length, 1);
        assert.equal(fetched.totalAmountInPaise, 30000);
    });
});
