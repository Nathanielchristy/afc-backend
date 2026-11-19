const mongoose = require("mongoose");
const variantSchema = new mongoose.Schema({
    name: { type: String, required: true },
    sku: { type: String, required: true, unique: true },
    priceInPaise: { type: Number, required: true },
    product: { type: mongoose.Schema.Types.Mixed, required: true },
    isActive: { type: Boolean, default: true }
});
module.exports = mongoose.model("Variant", variantSchema);
