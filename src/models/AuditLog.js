const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
    {
        actor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: false // Nullable for failed logins where actor isn't authenticated yet
        },

        actorEmail: {
            type: String,
            trim: true
        },

        action: {
            type: String,
            required: true,
            trim: true
        },

        targetModel: {
            type: String,
            trim: true
        },

        targetRecord: {
            type: String,
            trim: true
        },

        details: {
            type: mongoose.Schema.Types.Mixed
        },

        ipAddress: {
            type: String,
            trim: true
        }
    },
    {
        timestamps: true,
        versionKey: false
    }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ action: 1 });
auditLogSchema.index({ actor: 1 });

const AuditLog = mongoose.model("AuditLog", auditLogSchema);

module.exports = AuditLog;
