const mongoose = require("mongoose");

const Order = require("../models/new/Order");
const Product = require("../models/Product");
const Payment = require("../models/Payment");
const AuditLog = require("../models/AuditLog");
const { createPineLabsRefund } = require("./pinelabsService");

/**
 * Customer cancellation is allowed only before the kitchen starts work.
 * Admin cancellation of an order already being fulfilled requires an
 * explicit override reason and is refused outright once the order is
 * delivered or already cancelled.
 */
const CANCELLATION_POLICY = {
    customer: ["pending", "confirmed"],
    admin: ["pending", "confirmed"],
    adminOverride: ["processing", "shipped"],
    terminal: ["delivered", "cancelled"]
};

const REFUND_PENDING_REVIEW = "refund_pending_review";

const isAdmin = (user) => user && user.role === "admin";

const decideEligibility = ({ order, actor, overrideReason }) => {
    if (order.status === "cancelled") {
        return { allowed: false, statusCode: 409, message: "This order has already been cancelled" };
    }

    if (order.status === "delivered") {
        return { allowed: false, statusCode: 400, message: "Delivered orders cannot be cancelled" };
    }

    const admin = isAdmin(actor);

    if (!admin) {
        return {
            allowed: false,
            statusCode: 403,
            message: "Customers are not permitted to cancel orders. Please contact an administrator."
        };
    }

    if (CANCELLATION_POLICY.admin.includes(order.status)) {
        return { allowed: true, override: false };
    }

    if (CANCELLATION_POLICY.adminOverride.includes(order.status)) {
        if (!overrideReason) {
            return {
                allowed: false,
                statusCode: 400,
                message: "This order is already being fulfilled. Cancelling it requires an override reason"
            };
        }
        return { allowed: true, override: true };
    }

    return { allowed: false, statusCode: 400, message: "This order cannot be cancelled" };
};

/**
 * Refund decision is derived entirely from server-side records. Client
 * supplied amounts are never consulted.
 *
 * - Unpaid orders (cash on delivery / payment never captured): no refund.
 * - A captured Pine Labs payment is refunded through the provider. Until the
 *   provider confirms it, the refund stays pending and is never reported as
 *   completed.
 * - Any other captured payment has no automated refund path and is flagged
 *   for manual review.
 */
const resolveRefund = async ({ order, session }) => {
    if (order.paymentStatus !== "paid") {
        return {
            refundStatus: "not_required",
            orderPaymentStatus: order.paymentStatus,
            payment: null
        };
    }

    const payment = await Payment.findOne({
        order: order._id,
        status: "paid"
    }).sort({ createdAt: -1 }).session(session);

    if (!payment) {
        return {
            refundStatus: REFUND_PENDING_REVIEW,
            orderPaymentStatus: order.paymentStatus,
            payment: null,
            failureReason: "Paid order has no captured payment record to refund"
        };
    }

    if (payment.provider !== "pinelabs" || !payment.providerPaymentId) {
        return {
            refundStatus: REFUND_PENDING_REVIEW,
            orderPaymentStatus: order.paymentStatus,
            payment,
            failureReason: "No automated refund is available for this payment provider"
        };
    }

    try {
        const refund = await createPineLabsRefund({
            providerPaymentId: payment.providerPaymentId,
            amountInPaise: payment.amountInPaise,
            receipt: `refund_${order._id}`
        });

        payment.status = "refunded";
        payment.refund = {
            amountInPaise: payment.amountInPaise,
            providerRefundId: refund.id,
            status: "processed",
            processedAt: new Date()
        };
        await payment.save({ session });

        return {
            refundStatus: "refunded",
            orderPaymentStatus: "refunded",
            payment
        };
    } catch (error) {
        payment.refund = {
            amountInPaise: payment.amountInPaise,
            status: "failed",
            failureReason: error.message
        };
        await payment.save({ session });

        return {
            refundStatus: "refund_failed",
            orderPaymentStatus: order.paymentStatus,
            payment,
            failureReason: error.message
        };
    }
};

const restoreStock = async ({ order, session }) => {
    for (const item of order.items) {
        const product = await Product.findByIdAndUpdate(
            item.product,
            { $inc: { stock: item.quantity } },
            { new: true, session }
        );

        if (!product) {
            const err = new Error(`Unable to restore stock for product ${item.product}`);
            err.statusCode = 409;
            throw err;
        }
    }
};

const writeAuditLog = ({ order, actor, source, req }) => {
    if (!actor) return Promise.resolve();

    return AuditLog.create({
        actor: actor._id,
        actorEmail: actor.email,
        action: "ORDER_CANCELLED",
        targetModel: "Order",
        targetRecord: String(order._id),
        details: {
            source,
            reason: order.cancellationReason,
            override: Boolean(order.cancellationOverrideReason),
            refundStatus: order.refundStatus,
            stockRestored: order.stockRestored
        },
        ipAddress: req.ip
    }).catch(() => {});
};

/**
 * Atomically cancels an order. The status flip is a conditional update, so a
 * concurrent kitchen status change or a repeated cancellation can never both
 * succeed: only the request that wins the transition restores stock and
 * starts a refund.
 */
const cancelOrderAtomic = async ({ orderId, actor, reason, overrideReason, req }) => {
    const session = await mongoose.startSession();

    try {
        session.startTransaction();

        const order = await Order.findById(orderId).session(session);

        if (!order) {
            await session.abortTransaction();
            return { error: { statusCode: 404, message: "Order not found" } };
        }

        const admin = isAdmin(actor);

        if (!admin && String(order.user) !== String(actor._id)) {
            await session.abortTransaction();
            return { error: { statusCode: 404, message: "Order not found" } };
        }

        const decision = decideEligibility({ order, actor, overrideReason });

        if (!decision.allowed) {
            await session.abortTransaction();
            return { error: { statusCode: decision.statusCode, message: decision.message } };
        }

        const source = admin ? "ADMIN" : "CUSTOMER";
        const now = new Date();

        // Claim the cancellation. A lost race leaves the document untouched.
        const claimed = await Order.findOneAndUpdate(
            { _id: order._id, status: order.status },
            {
                $set: {
                    status: "cancelled",
                    cancelledAt: now,
                    cancelledBy: actor._id,
                    cancellationReason: reason,
                    cancellationSource: source,
                    ...(decision.override ? { cancellationOverrideReason: overrideReason } : {})
                }
            },
            { new: true, session }
        );

        if (!claimed) {
            await session.abortTransaction();
            return {
                error: {
                    statusCode: 409,
                    message: "The order changed while it was being cancelled. Please refresh and try again"
                }
            };
        }

        await restoreStock({ order: claimed, session });
        claimed.stockRestored = true;

        const refund = await resolveRefund({ order: claimed, session });
        claimed.refundStatus = refund.refundStatus;
        claimed.paymentStatus = refund.orderPaymentStatus;
        await claimed.save({ session });

        await session.commitTransaction();

        await writeAuditLog({ order: claimed, actor, source, req });

        return { order: claimed };
    } catch (error) {
        await session.abortTransaction();

        if (error.code === 112 || (error.errorLabels && error.errorLabels.includes("TransientTransactionError"))) {
            return {
                error: {
                    statusCode: 409,
                    message: "A concurrent status update or cancellation occurred. Please refresh."
                }
            };
        }

        if (error.statusCode) {
            return { error: { statusCode: error.statusCode, message: error.message } };
        }

        console.error("Cancel order error:", error);
        return { error: { statusCode: 500, message: "Server error" } };
    } finally {
        await session.endSession();
    }
};

module.exports = {
    CANCELLATION_POLICY,
    REFUND_PENDING_REVIEW,
    decideEligibility,
    cancelOrderAtomic
};
