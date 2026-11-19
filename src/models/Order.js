const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema({
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    variant: { type: Object }, // Store snapshot
    addons: [Object], // Store snapshot
    name: { type: String, required: true },
    sku: { type: String },
    priceInPaise: { type: Number, required: true },
    quantity: { type: Number, required: true }
}, { _id: false });

const shippingAddressSchema = new mongoose.Schema({
    fullName: { type: String, trim: true },
    phone: { type: String, trim: true },
    addressLine1: { type: String, trim: true },
    addressLine2: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    postalCode: { type: String, trim: true },
    country: { type: String, trim: true }
}, { _id: false });

const orderSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    items: [orderItemSchema],
    totalAmountInPaise: { type: Number, required: true },
    orderType: { type: String, enum: ["pickup", "delivery"], default: "pickup" },
    pickupLocation: { type: String, default: "Noorul Islam College" },
    shippingAddress: shippingAddressSchema,
    status: {
        type: String,
        enum: ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"],
        default: "pending"
    },
    paymentStatus: {
        type: String,
        enum: ["pending", "paid", "failed", "refunded"],
        default: "pending"
    },
    // Cancellation metadata
    cancelledAt: { type: Date },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    cancellationReason: { type: String, trim: true, maxlength: 500 },
    cancellationSource: { type: String, enum: ["CUSTOMER", "ADMIN"] },
    cancellationOverrideReason: { type: String, trim: true, maxlength: 500 },
    stockRestored: { type: Boolean, default: false },
    // Refund workflow tracking
    refundStatus: {
        type: String,
        enum: ["none", "not_required", "refund_pending_review", "refunded", "refund_failed"],
        default: "none"
    }
}, { timestamps: true });

const Order = mongoose.models.Order || mongoose.model("Order", orderSchema);

module.exports = Order;
