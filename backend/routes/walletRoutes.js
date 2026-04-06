import express from "express";
import { verifyToken } from "../middleware/authMiddleware.js";
import WalletService from "../utils/walletService.js";
import Wallet from "../models/wallet.js";
import WalletTransaction from "../models/walletTransaction.js";

const router = express.Router();

/**
 * GET — Wallet Overview & History
 */
router.get("/overview", verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const summary = await WalletService.getWalletSummary(userId);

        const wallet = await Wallet.findOne({ user_id: userId });

        const history = await WalletTransaction.find({ user_id: userId })
            .populate({
                path: "sessionId",
                select: "sessionName invitedUserIds",
                populate: { path: "invitedUserIds", select: "name email" }
            })
            .sort({ timestamp: -1 });

        res.json({
            summary,
            wallet: {
                available_credits: wallet.available_credits,
                weekly_limit: wallet.weekly_limit,
                last_reset_date: wallet.last_reset_date,
                next_reset_date: wallet.next_reset_date
            },
            history
        });
    } catch (error) {
        console.error("Wallet overview error:", error);
        res.status(500).json({ message: "Server Error" });
    }
});

/**
 * POST — Trigger manual reset check (optional, usually system handles it)
 */
router.post("/check-reset", verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const wallet = await WalletService.checkAndResetCredits(userId);
        res.json({ message: "Reset check completed", wallet });
    } catch (error) {
        res.status(500).json({ message: "Reset check failed" });
    }
});

/**
 * DELETE — Clear full history for user
 */
router.delete("/history/clear", verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        await WalletTransaction.deleteMany({ user_id: userId });
        res.json({ message: "Wallet history cleared successfully", success: true });
    } catch (error) {
        console.error("Clear wallet history error:", error);
        res.status(500).json({ message: "Failed to clear history" });
    }
});

/**
 * DELETE — Delete a specific transaction
 */
router.delete("/history/:id", verifyToken, async (req, res) => {
    try {
        const transId = req.params.id;
        const userId = req.user.id;

        const transaction = await WalletTransaction.findById(transId);
        if (!transaction) return res.status(404).json({ message: "Transaction not found" });

        // Ownership check
        if (transaction.user_id.toString() !== userId) {
            return res.status(403).json({ message: "Not authorized to delete this transaction" });
        }

        await WalletTransaction.findByIdAndDelete(transId);
        res.json({ message: "Transaction deleted", success: true });
    } catch (error) {
        console.error("Delete transaction error:", error);
        res.status(500).json({ message: "Failed to delete transaction" });
    }
});

export default router;
