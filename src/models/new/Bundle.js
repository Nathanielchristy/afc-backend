const mongoose = require("mongoose");
const bundleSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String },
    priceInPaise: { type: Number, required: true },
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
    isActive: { type: Boolean, default: true }
});
module.exports = mongoose.model("Bundle", bundleSchema);