const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            minlength: 2,
            maxlength: 100
        },

        email: {
            type: String,
            unique: true,
            sparse: true,
            lowercase: true,
            trim: true,
            maxlength: 254
        },

        // Student-specific: Registration ID (e.g., 22UCS001) - kept for record, no longer used for login
        registrationId: {
            type: String,
            unique: true,
            sparse: true, // Allows multiple null values for non-student users
            trim: true,
            maxlength: 20
        },

        // Phone number for customer login (normalized to 10 digits, no country code)
        phone: {
            type: String,
            unique: true,
            sparse: true, // Allows null for admin/kitchen staff who don't use phone login
            trim: true,
            maxlength: 15
        },

        // Date of birth for initial password generation (stored as ISO string, not exposed)
        dob: {
            type: String, // Stored as "DD-MM-YYYY" format
            select: false // Never exposed in API responses
        },

        password: {
            type: String,
            required: true,
            minlength: 8,
            maxlength: 200,
            select: false
        },

        role: {
            type: String,
            enum: ["user", "admin", "kitchen"],
            default: "user"
        },

        isActive: {
            type: Boolean,
            default: true
        },

        isEmailVerified: {
            type: Boolean,
            default: false
        },

        mustChangePassword: {
            type: Boolean,
            default: false
        },

        tokenVersion: {
            type: Number,
            default: 0
        }
    },
    {
        timestamps: true,
        versionKey: false
    }
);

const User = mongoose.model("User", userSchema);

module.exports = User;
