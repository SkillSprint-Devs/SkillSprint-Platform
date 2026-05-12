import mongoose from "mongoose";

/**
 * AdminAuditLog — Immutable record of every admin action.
 *
 * This is intentionally SEPARATE from ActivityLog (which tracks user
 * productivity hours). This schema captures security-relevant admin events.
 */
const adminAuditLogSchema = new mongoose.Schema(
    {
        // Who performed the action
        adminId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        adminEmail: {
            type: String,
            required: true,
            index: true,
        },

        // What was done
        action: {
            type: String,
            required: true,
            enum: [
                "ADMIN_LOGIN",
                "ADMIN_LOGOUT",
                "MAKE_ADMIN",          // Privilege escalation
                "REVOKE_ADMIN",        // Privilege removal
                "RESOLVE_ERROR",       // Error log resolved
                "DELETE_ERROR",        // Error log deleted
                "BULK_RESOLVE_ERRORS", // Bulk resolve
                "BULK_DELETE_ERRORS",  // Bulk delete
                "DEACTIVATE_USER",     // Banned a user
                "ACTIVATE_USER",       // Re-activated a user
                "VIEW_USER_DETAILS",   // Viewed a specific user's data
            ],
            index: true,
        },

        // What was affected (optional — depends on the action)
        targetUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        targetUserEmail: {
            type: String,
            default: null,
        },

        // Extra context for the action (free-form)
        details: {
            type: String,
            default: "",
        },

        // Request metadata for forensics
        ipAddress: {
            type: String,
            default: null,
        },
        userAgent: {
            type: String,
            default: null,
        },
    },
    {
        timestamps: true, // Provides createdAt & updatedAt
    }
);

// Compound indexes for common queries
adminAuditLogSchema.index({ adminId: 1, createdAt: -1 });
adminAuditLogSchema.index({ action: 1, createdAt: -1 });
adminAuditLogSchema.index({ targetUserId: 1, createdAt: -1 });

// Auto-delete logs older than 1 year (compliance retention window)
adminAuditLogSchema.index(
    { createdAt: 1 },
    { expireAfterSeconds: 365 * 24 * 60 * 60 }
);

const AdminAuditLog = mongoose.model("AdminAuditLog", adminAuditLogSchema);

export default AdminAuditLog;
