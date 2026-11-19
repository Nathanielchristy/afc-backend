const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },
        description: {
            type: String,
            trim: true
        },
        category: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Category",
            required: true,
            index: true
        },
        priceInPaise: {
            type: Number,
            required: true,
            min: 0
        },
        stock: {
            type: Number,
            default: 50,
            min: 0
        },
        sku: {
            type: String,
            uppercase: true,
            trim: true,
            sparse: true
        },
        image: {
            type: String,
            default: ""
        },
        images: {
            type: [String],
            default: []
        },
        isActive: {
            type: Boolean,
            default: true,
            index: true
        },
        featured: {
            type: Boolean,
            default: false
        },
        popular: {
            type: Boolean,
            default: false
        },
        spicy: {
            type: Boolean,
            default: false
        },
        isVeg: {
            type: Boolean,
            default: true
        },
        calories: {
            type: Number,
            min: 0
        },
        serves: {
            type: String
        },
        badge: {
            type: String
        },
        includes: {
            type: [String],
            default: []
        }
    },
    {
        timestamps: true,
        versionKey: false
    }
);

productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ name: 1 });

const Product = mongoose.models.Product || mongoose.model("Product", productSchema);

module.exports = Product;
