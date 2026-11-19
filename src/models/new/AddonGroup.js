const mongoose = require("mongoose");
const addonGroupSchema = new mongoose.Schema({
    name: { type: String, required: true },
    addons: [{ type: mongoose.Schema.Types.ObjectId, ref: "Addon" }],
    minSelection: { type: Number, default: 0 },
    maxSelection: { type: Number, default: 1 },
    isRequired: { type: Boolean, default: false }
});
module.exports = mongoose.model("AddonGroup", addonGroupSchema);