const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },

        refreshTokenHash: {
            type: String,
            required: true,
            unique: true
        },

        ipAddress: {
            type: String
        },

        userAgent: {
            type: String
        },

        expiresAt: {
            type: Date,
            required: true,
            index: { expires: 0 } // TTL index in MongoDB
        }
    },
    {
        timestamps: true,
        versionKey: false
    }
);

const Session = mongoose.model("Session", sessionSchema);

module.exports = Session;
