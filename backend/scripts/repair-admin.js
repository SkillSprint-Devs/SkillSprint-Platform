import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/user.js';
import WalletService from '../utils/walletService.js';

dotenv.config();

/**
 * Script to REPAIR existing admin accounts
 * This will find any user with role: 'admin' and ensure:
 * 1. They have a valid bcrypt hashed password
 * 2. They have a wallet
 * 3. They have streak fields initialized
 * 4. They have a name (required by schema)
 */

async function repairAdmin() {
    try {
        // 1. Connect to MongoDB
        if (!process.env.MONGO_URI) {
            console.error('❌ MONGO_URI not found in .env');
            process.exit(1);
        }

        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        // 2. Configuration - UPDATE THIS IF NEEDED
        const TARGET_EMAIL = ''; // Leave empty to target all users with role "admin", or specify one
        const NEW_PASSWORD = 'Admin@123'; // The temporary password to set

        const query = { role: 'admin' };
        if (TARGET_EMAIL) {
            query.email = TARGET_EMAIL;
        }

        const admins = await User.find(query);

        if (admins.length === 0) {
            console.log('❌ No admin users found in the database matching the criteria.');
            process.exit(1);
        }

        console.log(`Found ${admins.length} admin account(s) to repair.`);

        const hashedPassword = await bcrypt.hash(NEW_PASSWORD, 10);

        for (const admin of admins) {
            console.log(`\nRepairing admin: ${admin.email}`);

            // Fix password_hash
            admin.password_hash = hashedPassword;

            // Fix missing name (Schema requires it)
            if (!admin.name) {
                admin.name = 'Admin User';
                console.log(`✅ Set default name for ${admin.email}`);
            }

            // Initialize streak fields
            admin.streakCount = admin.streakCount || 1;
            admin.longestStreak = admin.longestStreak || 1;
            admin.lastActiveDate = admin.lastActiveDate || new Date();
            admin.isActive = true;

            await admin.save();
            console.log(`✅ User fields updated.`);

            // Ensure Wallet exists
            try {
                const wallet = await WalletService.checkAndResetCredits(admin._id);
                if (!wallet) {
                    await WalletService.createWallet(admin._id);
                    console.log(`✅ Wallet created.`);
                } else {
                    console.log(`ℹ️ Wallet already exists.`);
                }
            } catch (wErr) {
                console.error(`❌ Error ensuring wallet: ${wErr.message}`);
            }
        }

        console.log('\n=========================================');
        console.log('REPAIR COMPLETE');
        console.log(`All admin accounts now have the password: ${NEW_PASSWORD}`);
        console.log('=========================================');

        await mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error('Fatal Error:', error);
        process.exit(1);
    }
}

repairAdmin();
