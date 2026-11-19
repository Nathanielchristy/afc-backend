const mongoose = require("mongoose");
const Order = require("../models/Order");
const Payment = require("../models/Payment");
const {
    createPineLabsOrder,
    verifyPineLabsWebhookSignature
} = require("../services/pinelabsService");

const allowedPaymentTransitions = {
    created: ["pending", "failed"],
    pending: ["paid", "failed"],
    paid: ["refunded"],
    failed: [],
    refunded: []
};

const canTransitionPayment = (currentStatus, newStatus) => {
    return (
        allowedPaymentTransitions[currentStatus] &&
        allowedPaymentTransitions[currentStatus].includes(newStatus)
    );
};

const updatePaymentStatus = async (
    paymentId,
    newStatus,
    extraFields = {}
) => {
    const session = await mongoose.startSession();

    try {
        session.startTransaction();

        const payment = await Payment.findById(paymentId).session(session);

        if (!payment) {
            throw new Error("Payment not found");
        }

        if (!canTransitionPayment(payment.status, newStatus)) {
            throw new Error(
                `Invalid payment status transition from ${payment.status} to ${newStatus}`
            );
        }

        const order = await Order.findById(payment.order).session(session);

        if (!order) {
            throw new Error("Order linked to payment not found");
        }

        if (payment.status !== order.paymentStatus) {
            throw new Error(
                `Payment and order payment status are inconsistent: payment=${payment.status}, order=${order.paymentStatus}`
            );
        }

        payment.status = newStatus;
        Object.assign(payment, extraFields);
        order.paymentStatus = newStatus;

        await payment.save({ session });
        await order.save({ session });

        await session.commitTransaction();

        return {
            payment,
            order
        };

    } catch (error) {
        await session.abortTransaction();
        throw error;

    } finally {
        await session.endSession();
    }
};

const markPaymentPending = async (paymentId, extraFields = {}) => {
    return updatePaymentStatus(paymentId, "pending", extraFields);
};

const markPaymentPaid = async (paymentId, extraFields = {}) => {
    return updatePaymentStatus(paymentId, "paid", extraFields);
};

const markPaymentFailed = async (paymentId, failureReason = null) => {
    const extraFields = {};
    if (failureReason) {
        extraFields.failureReason = failureReason;
    }
    return updatePaymentStatus(paymentId, "failed", extraFields);
};

const markPaymentRefunded = async (paymentId, extraFields = {}) => {
    return updatePaymentStatus(paymentId, "refunded", extraFields);
};

const createPayment = async (req, res) => {
    try {
        const order = await Order.findOne({
            _id: req.body.orderId,
            user: req.user._id
        });

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        if (order.status === "cancelled") {
            return res.status(400).json({
                success: false,
                message: "Cannot pay for a cancelled order"
            });
        }

        if (order.status !== "pending" &&
            order.status !== "confirmed" &&
            order.status !== "processing" &&
            order.status !== "shipped") {
            return res.status(400).json({
                success: false,
                message: "Order cannot accept payment in its current status"
            });
        }

        if (order.paymentStatus === "paid") {
            return res.status(400).json({
                success: false,
                message: "Order has already been paid"
            });
        }

        if (order.paymentStatus === "refunded") {
            return res.status(400).json({
                success: false,
                message: "Order payment has already been refunded"
            });
        }

        const existingPayment = await Payment.findOne({
            order: order._id,
            status: {
                $in: ["created", "pending", "paid"]
            }
        }).sort({
            createdAt: -1
        });

        if (existingPayment) {
            return res.status(200).json({
                success: true,
                message: "Existing payment found",
                payment: existingPayment,
                pineLabsOrder: {
                    id: existingPayment.providerOrderId,
                    amount: existingPayment.amountInPaise,
                    currency: existingPayment.currency,
                    status: existingPayment.status
                }
            });
        }

        const pineLabsOrder = await createPineLabsOrder({
            amountInPaise: order.totalAmountInPaise,
            currency: "INR",
            receipt: `order_${order._id}`,
            customer: {
                name: order.shippingAddress?.fullName || req.user.name,
                email: order.shippingAddress?.email || req.user.email,
                phone: order.shippingAddress?.phone || "9999999999"
            }
        });

        const payment = await Payment.create({
            order: order._id,
            user: req.user._id,
            amountInPaise: order.totalAmountInPaise,
            currency: "INR",
            provider: "pinelabs",
            providerOrderId: pineLabsOrder.id || pineLabsOrder.order_id,
            status: "created"
        });

        return res.status(201).json({
            success: true,
            message: "Payment created successfully with Pine Labs",
            payment,
            pineLabsOrder
        });

    } catch (error) {
        console.error("Create payment error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Server error during payment creation"
        });
    }
};

const getPaymentById = async (req, res) => {
    try {
        const payment = await Payment.findOne({
            _id: req.params.id,
            user: req.user._id
        });

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: "Payment not found"
            });
        }

        return res.status(200).json({
            success: true,
            payment
        });

    } catch (error) {
        console.error("Get payment error:", error);
        return res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};

const verifyPayment = async (req, res) => {
    try {
        const { orderId, pineLabsPaymentId, pineLabsOrderId } = req.body;

        if (!orderId || !pineLabsOrderId) {
            return res.status(400).json({
                success: false,
                message: "Missing required payment verification parameters"
            });
        }

        const effectiveOrderId = pineLabsOrderId;
        const effectivePaymentId = pineLabsPaymentId || `pay_pl_${Date.now()}`;

        const order = await Order.findOne({
            _id: orderId,
            user: req.user._id
        });

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        const payment = await Payment.findOne({
            order: order._id,
            providerOrderId: effectiveOrderId
        });

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: "Payment record not found for this Pine Labs order"
            });
        }

        if (payment.status === "paid") {
            return res.status(200).json({
                success: true,
                message: "Payment already verified and paid",
                order,
                payment
            });
        }

        // Verify amount
        if (payment.amountInPaise !== order.totalAmountInPaise) {
            await markPaymentFailed(payment._id, "Amount mismatch during verification");
            return res.status(400).json({
                success: false,
                message: "Payment amount does not match order amount"
            });
        }

        // Mark payment paid & order confirmed/paid atomically
        const session = await mongoose.startSession();
        try {
            session.startTransaction();

            payment.status = "paid";
            payment.providerPaymentId = effectivePaymentId;
            await payment.save({ session });

            order.paymentStatus = "paid";
            if (order.status === "pending") {
                order.status = "confirmed";
            }
            await order.save({ session });

            await session.commitTransaction();
        } catch (txErr) {
            await session.abortTransaction();
            throw txErr;
        } finally {
            session.endSession();
        }

        return res.status(200).json({
            success: true,
            message: "Payment verified and order confirmed successfully with Pine Labs",
            order,
            payment
        });

    } catch (error) {
        console.error("Verify payment error:", error);
        return res.status(500).json({
            success: false,
            message: "Server error during payment verification"
        });
    }
};

const handleWebhook = async (req, res) => {
    try {
        const signature = req.headers["x-pinelabs-signature"] || req.headers["x-signature"];
        const rawBody = req.body;

        if (signature && !verifyPineLabsWebhookSignature({ rawBody, signature })) {
            return res.status(400).json({ success: false, message: "Invalid webhook signature" });
        }

        const event = req.body.event || req.body.status;
        const paymentEntity = req.body.payload?.payment?.entity || req.body;

        if ((event === "TRANSACTION_SUCCESS" || event === "PAYMENT_SUCCESS" || paymentEntity.status === "SUCCESS") && paymentEntity) {
            const providerOrderId = paymentEntity.order_id || paymentEntity.merchant_order_id;
            const providerPaymentId = paymentEntity.payment_id || paymentEntity.id;

            if (providerOrderId) {
                const payment = await Payment.findOne({ providerOrderId });
                if (payment && payment.status !== "paid") {
                    payment.status = "paid";
                    if (providerPaymentId) payment.providerPaymentId = providerPaymentId;
                    await payment.save();

                    const order = await Order.findById(payment.order);
                    if (order) {
                        order.paymentStatus = "paid";
                        if (order.status === "pending") {
                            order.status = "confirmed";
                        }
                        await order.save();
                    }
                }
            }
        }

        return res.status(200).json({ status: "ok" });
    } catch (error) {
        console.error("Webhook error:", error);
        return res.status(500).json({ success: false, message: "Webhook handler error" });
    }
};

module.exports = {
    createPayment,
    getPaymentById,
    verifyPayment,
    handleWebhook,
    markPaymentPending,
    markPaymentPaid,
    markPaymentFailed,
    markPaymentRefunded
};
