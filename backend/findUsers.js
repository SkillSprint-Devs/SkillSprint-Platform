import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import User from "./models/user.js";

async function findUsers() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const users = await User.find({}).limit(5).select("name email role");
        console.log("=== VALID USERS ===");
        users.forEach(u => console.log(`Email: ${u.email}, Role: ${u.role}`));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
findUsers();
