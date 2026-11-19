const mongoose = require("mongoose");

const Cart = require("../models/new/Cart");
const Product = require("../models/Product");
const Variant = require("../models/new/Variant");
const Addon = require("../models/new/Addon");
const Order = require("../models/new/Order");
const Address = require("../models/Address");
const AuditLog = require("../models/AuditLog");
const Category = require("../models/Category");
const { cancelOrderAtomic } = require("../services/cancellationService");

const createOrder = async (req, res) => {
    const session = await mongoose.startSession();

    try {
        session.startTransaction();
        let address = null;
        if (req.body.addressId) {
            address = await Address.findOne({
                _id: req.body.addressId,
                user: req.user._id
            }).session(session);
        }

        const userId = req.user._id;

        // Reject any attempt to supply arbitrary coupons or frontend discounts
        if (req.body.couponCode || req.body.coupon) {
            await session.abortTransaction();
            return res.status(400).json({
                success: false,
                message: "No promotional discounts or coupon codes are currently active"
            });
        }

        if (req.body.discount !== undefined || req.body.discountInPaise !== undefined) {
            await session.abortTransaction();
            return res.status(400).json({
                success: false,
                message: "Arbitrary or frontend-supplied discounts are not accepted"
            });
        }

        const cart = await Cart.findOne({
            user: userId
        }).populate("items.product").populate("items.variant").populate("items.addons")
          .session(session);

        if (!cart || cart.items.length === 0) {
            await session.abortTransaction();

            return res.status(400).json({
                success: false,
                message: "Cart is empty"
            });
        }

        const orderItems = [];
        let totalAmountInPaise = 0;

        for (const cartItem of cart.items) {
            const prodId = cartItem.product._id || cartItem.product;
            const product = await Product.findOne({
                _id: prodId,
                isActive: true
            }).session(session);

            if (!product) {
                await session.abortTransaction();

                return res.status(400).json({
                    success: false,
                    message: "One or more products are no longer available"
                });
            }

            // Verify category is active
            if (product.category) {
                const category = await Category.findOne({
                    _id: product.category,
                    isActive: true
                }).session(session);

                if (!category) {
                    await session.abortTransaction();

                    return res.status(400).json({
                        success: false,
                        message: `Product "${product.name}" belongs to an unavailable category`
                    });
                }
            }

            let itemPriceInPaise = product.priceInPaise || 0;
            let itemName = product.name;
            let itemSku = product.sku || "AFC-ITEM";
            let variantId = null;

            if (cartItem.variant) {
                const varId = cartItem.variant._id || cartItem.variant;
                const variantDoc = await Variant.findOne({
                    _id: varId,
                    isActive: true
                }).session(session);

                if (variantDoc) {
                    itemPriceInPaise = variantDoc.priceInPaise;
                    itemName = `${product.name} (${variantDoc.name})`;
                    itemSku = variantDoc.sku;
                    variantId = variantDoc._id;
                }
            }

            if (product.stock !== undefined && product.stock < cartItem.quantity) {
                await session.abortTransaction();

                return res.status(400).json({
                    success: false,
                    message: `Insufficient stock for product: ${product.name}`
                });
            }

            const itemTotal = itemPriceInPaise * cartItem.quantity;
            totalAmountInPaise += itemTotal;

            orderItems.push({
                product: product._id,
                variant: variantId,
                name: itemName,
                sku: itemSku,
                priceInPaise: itemPriceInPaise,
                quantity: cartItem.quantity
            });
        }

        for (const cartItem of cart.items) {
            const prodId = cartItem.product._id || cartItem.product;
            const updatedProd = await Product.findOneAndUpdate(
                {
                    _id: prodId,
                    isActive: true
                },
                {
                    $inc: {
                        stock: -cartItem.quantity
                    }
                },
                {
                    new: true,
                    session,
                    setDefaultsOnInsert: true
                }
            );

            // Floor stock to 0 so product inventory is never negative
            if (updatedProd && updatedProd.stock < 0) {
                await Product.updateOne(
                    { _id: prodId },
                    { $set: { stock: 0 } },
                    { session }
                );
            }
        }

        const fullName = req.body.fullName || (address ? address.fullName : req.user.name || "Valued Customer");
        const phone = req.body.phone || (address ? address.phone : "N/A");

        // Automatically set paymentStatus to "paid" if payment method is online (upi/card) or cash on pickup is confirmed
        const initialPaymentStatus = req.body.paymentMethod && req.body.paymentMethod !== 'cod' ? 'paid' : 'pending';

        const [order] = await Order.create(
            [
                {
                    user: userId,
                    items: orderItems,
                    orderType: req.body.orderType || "pickup",
                    pickupLocation: req.body.pickupLocation || "Noorul Islam College",
                    shippingAddress: {
                        fullName,
                        phone,
                        addressLine1: address ? address.addressLine1 : "Noorul Islam College",
                        addressLine2: address ? address.addressLine2 : "Restaurant Pickup Counter",
                        city: address ? address.city : "Kumarakovil",
                        state: address ? address.state : "Tamil Nadu",
                        postalCode: address ? address.postalCode : "629180",
                        country: address ? address.country : "India"
                    },
                    totalAmountInPaise,
                    status: "pending",
                    paymentStatus: initialPaymentStatus
                }
            ],
            {
                session
            }
        );

        cart.items = [];

        await cart.save({
            session
        });

        await session.commitTransaction();

        return res.status(201).json({
            success: true,
            message: "Order created successfully",
            order
        });

    } catch (error) {
        await session.abortTransaction();

        console.error("Create order error:", error);

        return res.status(500).json({
            success: false,
            message: "Server error"
        });
    } finally {
        await session.endSession();
    }
};

const getOrderById = async (req, res) => {
    try {
        const order = await Order.findOne({
            _id: req.params.id,
            user: req.user._id
        });

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        return res.status(200).json({
            success: true,
            order
        });

    } catch (error) {
        console.error("Get order error:", error);

        return res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};

const getMyOrders = async (req, res) => {
    try {
        const page = Math.max(Number(req.query.page) || 1, 1);
        const limit = Math.min(
            Math.max(Number(req.query.limit) || 10, 1),
            50
        );

        const skip = (page - 1) * limit;

        const [orders, total] = await Promise.all([
            Order.find({
                user: req.user._id
            })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate("cancelledBy", "name email role"),

            Order.countDocuments({
                user: req.user._id
            })
        ]);

        return res.status(200).json({
            success: true,
            orders,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error("Get my orders error:", error);

        return res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};

const cancelOrder = async (req, res) => {
    try {
        const { reason, overrideReason } = req.body || {};
        const result = await cancelOrderAtomic({
            orderId: req.params.id,
            actor: req.user,
            reason,
            overrideReason,
            req
        });

        if (result.error) {
            return res.status(result.error.statusCode).json({
                success: false,
                message: result.error.message
            });
        }

        return res.status(200).json({
            success: true,
            message: "Order cancelled successfully",
            order: result.order
        });

    } catch (error) {
        console.error("Cancel order error:", error);

        return res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};

const updateOrderStatus = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        const currentStatus = order.status;
        const newStatus = req.body.status;
        const newPaymentStatus = req.body.paymentStatus;

        if (newStatus === "cancelled") {
            return res.status(400).json({
                success: false,
                message: "Please use the cancellation action with a required cancellation reason"
            });
        }

        const allowedTransitions = {
            pending: ["confirmed"],
            confirmed: ["processing"],
            processing: ["shipped", "delivered"],
            shipped: ["delivered"],
            delivered: [],
            cancelled: []
        };

        if (newStatus && newStatus !== currentStatus) {
            if (
                !allowedTransitions[currentStatus] ||
                !allowedTransitions[currentStatus].includes(newStatus)
            ) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid order status transition from ${currentStatus} to ${newStatus}`
                });
            }
            order.status = newStatus;
        }

        if (newPaymentStatus) {
            order.paymentStatus = newPaymentStatus;
        }

        await order.save();

        if (req.user) {
            await AuditLog.create({
                actor: req.user._id,
                actorEmail: req.user.email,
                action: "ORDER_STATUS_UPDATE",
                targetModel: "Order",
                targetRecord: String(order._id),
                details: { status: { before: currentStatus, after: order.status }, paymentStatus: order.paymentStatus },
                ipAddress: req.ip
            }).catch(() => {});
        }

        return res.status(200).json({
            success: true,
            message: "Order status updated successfully",
            order
        });

    } catch (error) {
        console.error("Update order status error:", error);

        return res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};

module.exports = {
    createOrder,
    getOrderById,
    getMyOrders,
    cancelOrder,
    updateOrderStatus
};
