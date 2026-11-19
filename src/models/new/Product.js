const mongoose = require("mongoose");
const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
    priceInPaise: { type: Number, default: 0 },
    stock: { type: Number, default: 50, min: 0 },
    sku: { type: String, unique: true, sparse: true },
    image: { type: String, default: "" },
    images: [String],
    isActive: { type: Boolean, default: true },
    addonGroups: [{ type: mongoose.Schema.Types.ObjectId, ref: "AddonGroup" }]
});
module.exports = mongoose.models.Product || mongoose.model("Product", productSchema);
