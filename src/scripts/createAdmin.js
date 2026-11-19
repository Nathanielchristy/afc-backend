require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const connectDB = require("../config/db");

const createAdmin = async () => {
    const email = process.env.ADMIN_EMAIL || process.argv[2];
    const password = process.env.ADMIN_PASSWORD || process.argv[3];
    const name = process.env.ADMIN_NAME || process.argv[4] || "System Admin";

    if (!email || !password) {
        console.error("Error: ADMIN_EMAIL and ADMIN_PASSWORD environment variables or command-line arguments are required.");
        console.log("Usage: node src/scripts/createAdmin.js <email> <password> [name]");
        console.log("  OR set environment variables: ADMIN_EMAIL=... ADMIN_PASSWORD=... ADMIN_NAME=...");
        process.exit(1);
    }

    if (password.length < 8) {
        console.error("Error: Password must be at least 8 characters long.");
        process.exit(1);
    }

    try {
        await connectDB();

        const existingUser = await User.findOne({ email });

        if (existingUser) {
            if (existingUser.role === "admin") {
                console.log(`Admin account for ${email} already exists.`);
                process.exit(0);
            }

            const allowPromote = process.argv.includes("--promote");
            if (!allowPromote) {
                console.error(`Error: User with email ${email} exists as a customer. Pass --promote to explicitly upgrade to admin.`);
                process.exit(1);
            }

            existingUser.role = "admin";
            existingUser.isActive = true;
            existingUser.isEmailVerified = true;
            await existingUser.save();
            console.log(`User ${email} successfully promoted to Admin.`);
            process.exit(0);
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const adminUser = await User.create({
            name,
            email,
            password: hashedPassword,
            role: "admin",
            isActive: true,
            isEmailVerified: true
        });

        console.log(`Admin account created successfully for: ${adminUser.email} (ID: ${adminUser._id})`);
        process.exit(0);

    } catch (error) {
        console.error("Admin creation failed:", error.message);
        process.exit(1);
    }
};

createAdmin();
