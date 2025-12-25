import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import User from "./models/user.js";
import readline from "readline";

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function makeAdmin() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log("✅ Connected to MongoDB");

        // Prompt for email
        rl.question("Enter the email address of the user to make admin: ", async (email) => {
            if (!email) {
                console.log("❌ Email is required");
                process.exit(1);
            }

            const user = await User.findOne({ email: email.trim() });

            if (!user) {
                console.log(`❌ User with email "${email}" not found`);
                process.exit(1);
            }

            // Update role to admin
            user.role = "admin";
            await user.save();

            console.log(`✅ Success! User "${user.name}" (${user.email}) is now an admin`);
            console.log(`   Role: ${user.role}`);

            process.exit(0);
        });

    } catch (err) {
        console.error("❌ Error:", err.message);
        process.exit(1);
    }
}

makeAdmin();
