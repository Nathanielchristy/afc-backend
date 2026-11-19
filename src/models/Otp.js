const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },

        email: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
            index: true
        },

        otpHash: {
            type: String,
            required: true
        },

        purpose: {
            type: String,
            enum: ["email_verification", "password_reset"],
            required: true,
            index: true
        },

        attempts: {
            type: Number,
            default: 0
        },

        maxAttempts: {
            type: Number,
            default: 5
        },

        expiresAt: {
            type: Date,
            required: true,
            index: { expires: 0 } // MongoDB TTL index to auto-delete expired documents
        },

        lastSentAt: {
            type: Date,
            default: Date.now
        }
    },
    {
        timestamps: true,
        versionKey: false
    }
);

otpSchema.index({ user: 1, purpose: 1 });
otpSchema.index({ email: 1, purpose: 1 });

const Otp = mongoose.model("Otp", otpSchema);

module.exports = Otp;
