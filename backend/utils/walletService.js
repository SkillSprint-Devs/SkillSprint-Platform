import Wallet from "../models/wallet.js";
import WalletTransaction from "../models/walletTransaction.js";
import mongoose from "mongoose";

class WalletService {
    /**
     * Initialize a new wallet for a user (called on signup)
     */
    async createWallet(userId) {
        const nextReset = new Date();
        nextReset.setDate(nextReset.getDate() + 7);

        const wallet = new Wallet({
            user_id: userId,
            available_credits: 330,
            weekly_limit: 330,
            last_reset_date: new Date(),
            next_reset_date: nextReset,
        });

        await wallet.save();

        // Log initial reset
        await this.logTransaction({
            wallet_id: wallet._id,
            user_id: userId,
            type: "weekly-reset",
            amount: 330,
            role: "system",
        });

        return wallet;
    }

    /**
     * Check and perform weekly reset if needed
     */
    async checkAndResetCredits(userId) {
        let wallet = await Wallet.findOne({ user_id: userId });
        if (!wallet) {
            wallet = await this.createWallet(userId);
        }

        const now = new Date();
        if (now >= wallet.next_reset_date) {
            const oldCredits = wallet.available_credits;

            wallet.available_credits = wallet.weekly_limit;
            wallet.last_reset_date = now;

            const nextReset = new Date();
            nextReset.setDate(nextReset.getDate() + 7);
            wallet.next_reset_date = nextReset;

            await wallet.save();

            // Log the reset
            await this.logTransaction({
                wallet_id: wallet._id,
                user_id: userId,
                type: "weekly-reset",
                amount: wallet.weekly_limit,
                role: "system",
                // Additional info for logs
                extra: {
                    creditsBeforeReset: oldCredits,
                    creditsAfterReset: wallet.weekly_limit
                }
            });
        }
        return wallet;
    }

    /**
     * Validate if user has enough credits
     */
    async hasEnoughCredits(userId, requiredMinutes) {
        const wallet = await this.checkAndResetCredits(userId);
        if (!wallet) return false;
        return wallet.available_credits >= requiredMinutes;
    }

    /**
     * Log a transaction
     */
    async logTransaction({ wallet_id, user_id, sessionId, sessionName, role, type, amount, durationMinutes, mentorName, extra }) {
        const transaction = new WalletTransaction({
            wallet_id,
            user_id,
            sessionId,
            sessionName,
            role,
            type,
            amount,
            durationMinutes,
            mentorName,
            timestamp: new Date(),
        });
        await transaction.save();
    }

    /**
     * Deduct credits from learner
     */
    async spendCredits(userId, sessionId, sessionName, durationMinutes, mentorName) {
        const wallet = await this.checkAndResetCredits(userId);
        if (!wallet) throw new Error("Wallet not found");

        const amountToDeduct = Math.floor(durationMinutes * 1.0); // 1:1 charge

        if (wallet.available_credits < amountToDeduct) {
            throw new Error("Insufficient credits");
        }

        wallet.available_credits -= amountToDeduct;
        await wallet.save();

        await this.logTransaction({
            wallet_id: wallet._id,
            user_id: userId,
            sessionId,
            sessionName,
            role: "learner",
            type: "session-spend",
            amount: amountToDeduct,
            durationMinutes,
            mentorName,
        });
    }

    /**
     * Add credits to mentor
     */
    async earnCredits(userId, sessionId, sessionName, durationMinutes) {
        const wallet = await this.checkAndResetCredits(userId);
        if (!wallet) throw new Error("Wallet not found");

        const amountToEarn = Math.floor(durationMinutes * 1.0); // 1:1 reward

        wallet.available_credits += amountToEarn;
        await wallet.save();

        await this.logTransaction({
            wallet_id: wallet._id,
            user_id: userId,
            sessionId,
            sessionName,
            role: "mentor",
            type: "session-earn",
            amount: amountToEarn,
            durationMinutes,
            mentorName: "Self", // Or lookup mentor name if needed
        });
    }

    /**
     * Get wallet summary for dashboard
     */
    async getWalletSummary(userId) {
        const wallet = await this.checkAndResetCredits(userId);
        if (!wallet) return { remaining_time: 0, earned: 0, spent: 0 };

        const transactions = await WalletTransaction.find({ user_id: userId });
        const earned = transactions
            .filter(t => t.type === "session-earn")
            .reduce((sum, t) => sum + t.amount, 0);
        const spent = transactions
            .filter(t => t.type === "session-spend")
            .reduce((sum, t) => sum + t.amount, 0);

        return {
            remaining_time: wallet.available_credits,
            earned,
            spent,
            next_reset: wallet.next_reset_date,
            limit: wallet.weekly_limit
        };
    }
}

export default new WalletService();
