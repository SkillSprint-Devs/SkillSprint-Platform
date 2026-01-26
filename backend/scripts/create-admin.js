import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/user.js';

dotenv.config();

/**
 * Script to create or update an admin user with proper password hashing
 * Usage: node scripts/create-admin.js
 */

async function createAdmin() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        // Admin details
        const adminEmail = 'admin@skillsprint.com'; // Change this to your desired admin email
        const adminPassword = 'Admin@123'; // Change this to your desired password
        const adminName = 'Admin';

        // Check if admin already exists
        let admin = await User.findOne({ email: adminEmail });

        // Hash the password
        const hashedPassword = await bcrypt.hash(adminPassword, 10);

        if (admin) {
            // Update existing admin
            admin.password_hash = hashedPassword;
            admin.role = 'admin';
            admin.isActive = true;

            // Initialize streak fields if missing
            if (!admin.streakCount) admin.streakCount = 1;
            if (!admin.longestStreak) admin.longestStreak = 1;
            if (!admin.lastActiveDate) admin.lastActiveDate = new Date();

            await admin.save();
            console.log('✅ Admin user updated successfully!');
        } else {
            // Create new admin
            admin = new User({
                name: adminName,
                email: adminEmail,
                password_hash: hashedPassword,
                role: 'admin',
                isActive: true,
                streakCount: 1,
                longestStreak: 1,
                lastActiveDate: new Date(),
                profile_image: '',
            });

            await admin.save();
            console.log('✅ Admin user created successfully!');
        }

        console.log('\nAdmin Details:');
        console.log('Email:', adminEmail);
        console.log('Password:', adminPassword);
        console.log('Role:', admin.role);
        console.log('\n⚠️  IMPORTANT: Change the password after first login!');
        console.log('⚠️  Update the email and password in this script before running in production!');

        // Close connection
        await mongoose.connection.close();
        console.log('\nDatabase connection closed');
        process.exit(0);
    } catch (error) {
        console.error('Error creating admin:', error);
        process.exit(1);
    }
}

createAdmin();
