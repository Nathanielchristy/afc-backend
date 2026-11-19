const mongoose = require("mongoose");
const Order = require("../models/Order");
const AuditLog = require("../models/AuditLog");

// Get Kitchen Orders with Live Status Summaries
const getKitchenOrders = async (req, res) => {
    try {
        const page = Math.max(Number(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
        const status = req.query.status;
        const search = req.query.search ? req.query.search.trim() : "";

        const filter = {};

        if (status === "active" || !status) {
            // By default kitchen needs actionable active orders
            filter.status = { $in: ["pending", "confirmed", "processing", "shipped"] };
        } else if (status !== "all") {
            filter.status = status;
        }

        if (search) {
            if (mongoose.isValidObjectId(search)) {
                filter._id = search;
            } else {
                filter["shippingAddress.fullName"] = { $regex: search, $options: "i" };
            }
        }

        const skip = (page - 1) * limit;

        const [orders, total, pendingCount, confirmedCount, processingCount, shippedCount] = await Promise.all([
            Order.find(filter)
                .select("_id items shippingAddress orderType pickupLocation totalAmountInPaise status paymentStatus createdAt updatedAt")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Order.countDocuments(filter),
            Order.countDocuments({ status: "pending" }),
            Order.countDocuments({ status: "confirmed" }),
            Order.countDocuments({ status: "processing" }),
            Order.countDocuments({ status: "shipped" })
        ]);

        res.status(200).json({
            success: true,
            counts: {
                pending: pendingCount,
                confirmed: confirmedCount,
                processing: processingCount,
                shipped: shippedCount,
                totalActive: pendingCount + confirmedCount + processingCount + shippedCount
            },
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            },
            orders
        });
    } catch (error) {
        console.error("Get kitchen orders error:", error);
        res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};

// Get Single Order Preparation Details
const getKitchenOrderById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid order ID"
            });
        }

        const order = await Order.findById(id)
            .select("_id items shippingAddress orderType pickupLocation totalAmountInPaise status paymentStatus createdAt updatedAt")
            .lean();

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        res.status(200).json({
            success: true,
            order
        });
    } catch (error) {
        console.error("Get kitchen order by id error:", error);
        res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};

// Update Order Preparation Status (Kitchen Authorized)
const updateKitchenOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const newStatus = req.body.status;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid order ID"
            });
        }

        const order = await Order.findById(id);

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        const currentStatus = order.status;

        // Idempotent: if already at the target status, return success
        if (currentStatus === newStatus) {
            return res.status(200).json({
                success: true,
                message: `Order is already ${newStatus}`,
                order
            });
        }

        // Strict order workflow transitions:
        // pending -> confirmed (Accepted)
        // confirmed -> processing (Preparing)
        // processing -> shipped (Ready for Pickup / Out for Delivery)
        // shipped -> delivered (Completed / Handed Over)
        const allowedTransitions = {
            pending: ["confirmed"],
            confirmed: ["processing"],
            processing: ["shipped"],
            shipped: ["delivered"]
        };

        if (
            !allowedTransitions[currentStatus] ||
            !allowedTransitions[currentStatus].includes(newStatus)
        ) {
            return res.status(400).json({
                success: false,
                message: `Invalid order status transition from ${currentStatus} to ${newStatus}`
            });
        }

        // Kitchen staff can ONLY update preparation status
        // Explicitly protect against changing payment status, totals, items, or customer details
        order.status = newStatus;

        await order.save();

        // Security & Operational Audit Log
        if (req.user) {
            await AuditLog.create({
                actor: req.user._id,
                actorEmail: req.user.email,
                action: "KITCHEN_ORDER_STATUS_UPDATE",
                targetModel: "Order",
                targetRecord: String(order._id),
                details: {
                    status: { before: currentStatus, after: newStatus },
                    orderType: order.orderType,
                    itemCount: order.items.length
                },
                ipAddress: req.ip
            }).catch(() => {});
        }

        return res.status(200).json({
            success: true,
            message: `Order status updated to ${newStatus}`,
            order
        });

    } catch (error) {
        console.error("Update kitchen order status error:", error);
        res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};

module.exports = {
    getKitchenOrders,
    getKitchenOrderById,
    updateKitchenOrderStatus
};
