require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const connectDB = require("../config/db");

const createKitchenStaff = async () => {
    const email = process.env.KITCHEN_EMAIL || process.argv[2];
    const password = process.env.KITCHEN_PASSWORD || process.argv[3];
    const name = process.env.KITCHEN_NAME || process.argv[4] || "Kitchen Station";

    if (!email || !password) {
        console.error("Error: KITCHEN_EMAIL and KITCHEN_PASSWORD environment variables or command-line arguments are required.");
        console.log("Usage: node src/scripts/createKitchenStaff.js <email> <password> [name]");
        console.log("  OR set environment variables: KITCHEN_EMAIL=... KITCHEN_PASSWORD=... KITCHEN_NAME=...");
        process.exit(1);
    }

    if (password.length < 8) {
        console.error("Error: Password must be at least 8 characters long.");
        process.exit(1);
    }

    try {
        await connectDB();

        const normalizedEmail = email.toLowerCase().trim();
        const existingUser = await User.findOne({ email: normalizedEmail });

        if (existingUser) {
            if (existingUser.role === "kitchen") {
                console.log(`Kitchen staff account for ${normalizedEmail} already exists.`);
                process.exit(0);
            }

            const allowPromote = process.argv.includes("--assign") || process.argv.includes("--promote");
            if (!allowPromote) {
                console.error(`Error: User with email ${normalizedEmail} already exists with role '${existingUser.role}'. Pass --assign to change role to kitchen.`);
                process.exit(1);
            }

            existingUser.role = "kitchen";
            existingUser.isActive = true;
            existingUser.isEmailVerified = true;
            await existingUser.save();
            console.log(`User ${normalizedEmail} successfully updated to role 'kitchen'.`);
            process.exit(0);
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const kitchenUser = await User.create({
            name,
            email: normalizedEmail,
            password: hashedPassword,
            role: "kitchen",
            isActive: true,
            isEmailVerified: true
        });

        console.log(`Kitchen staff account created successfully for: ${kitchenUser.email} (ID: ${kitchenUser._id})`);
        process.exit(0);

    } catch (error) {
        console.error("Kitchen staff creation failed:", error.message);
        process.exit(1);
    }
};

createKitchenStaff();
