import mongoose from "mongoose";

const errorLogSchema = new mongoose.Schema({
    errorMessage: {
        type: String,
        required: true,
        index: true
    },
    errorType: {
        type: String,
        enum: ['Frontend', 'Backend', 'API', 'Database'],
        required: true,
        index: true
    },
    severity: {
        type: String,
        enum: ['Low', 'Medium', 'High', 'Critical'],
        default: 'Medium',
        index: true
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true
    },
    userEmail: {
        type: String,
        index: true
    },
    screenName: {
        type: String,
        index: true
    },
    fileName: String,
    lineNumber: Number,
    columnNumber: Number,
    stackTrace: {
        type: String,
        select: false // Only fetch when explicitly requested
    },
    apiEndpoint: String,
    httpStatusCode: Number,
    environment: {
        type: String,
        enum: ['Development', 'Staging', 'Production'],
        default: process.env.NODE_ENV || 'Development'
    },
    userAgent: String,
    resolved: {
        type: Boolean,
        default: false,
        index: true
    },
    resolvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    resolvedAt: Date
}, {
    timestamps: true
});

// Index for common queries
errorLogSchema.index({ timestamp: -1, severity: 1 });
errorLogSchema.index({ userId: 1, timestamp: -1 });
errorLogSchema.index({ resolved: 1, timestamp: -1 });

// Auto-delete logs older than 90 days
errorLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

const ErrorLog = mongoose.model("ErrorLog", errorLogSchema);

export default ErrorLog;
