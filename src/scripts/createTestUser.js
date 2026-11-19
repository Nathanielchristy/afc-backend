require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const connectDB = require("../config/db");

const createUser = async () => {
    const role = process.argv[2] || "user";
    const email = process.argv[3] || (role === "admin" ? "admin@afc.com" : role === "kitchen" ? "kitchen@afc.com" : "user@afc.com");
    const password = process.argv[4] || "Password123!";
    const name = process.argv[5] || (role === "admin" ? "System Admin" : role === "kitchen" ? "Kitchen Staff" : "Regular Customer");

    if (password.length < 6) {
        console.error("Error: Password must be at least 6 characters long.");
        process.exit(1);
    }

    try {
        await connectDB();

        const normalizedEmail = email.toLowerCase().trim();
        const existingUser = await User.findOne({ email: normalizedEmail });

        if (existingUser) {
            existingUser.role = role;
            existingUser.isActive = true;
            existingUser.name = name;
            const hashedPassword = await bcrypt.hash(password, 10);
            existingUser.password = hashedPassword;
            await existingUser.save();
            console.log(`User ${normalizedEmail} updated/created as role '${role}' with password '${password}'.`);
            process.exit(0);
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await User.create({
            name,
            email: normalizedEmail,
            password: hashedPassword,
            role: role,
            isActive: true
        });

        console.log(`Account created successfully for: ${newUser.email} (Role: ${newUser.role}, Password: ${password})`);
        process.exit(0);

    } catch (error) {
        console.error("User creation failed:", error.message);
        process.exit(1);
    }
};

createUser();
