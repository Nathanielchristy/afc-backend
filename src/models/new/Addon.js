const mongoose = require("mongoose");
const addonSchema = new mongoose.Schema({
    name: { type: String, required: true },
    priceInPaise: { type: Number, required: true },
    isActive: { type: Boolean, default: true }
});
module.exports = mongoose.model("Addon", addonSchema);