require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");
const connectDB = require("../config/db");

/**
 * Migration Script: Explicit and safe handling of existing accounts for email verification.
 *
 * Rules:
 * 1. Admin and Kitchen staff accounts are automatically marked verified (isEmailVerified: true).
 * 2. Customer accounts without isEmailVerified set will default to isEmailVerified: false,
 *    unless explicitly passed `--verify-all-existing` flag by the system administrator.
 *
 * Usage:
 *   node src/scripts/migrateVerifiedUsers.js [--verify-all-existing] [--dry-run]
 */

const runMigration = async () => {
    const isDryRun = process.argv.includes("--dry-run");
    const verifyAllExisting = process.argv.includes("--verify-all-existing");

    console.log("==================================================");
    console.log("AFC Email Verification Migration Tool");
    console.log(`Mode: ${isDryRun ? "DRY RUN (no changes)" : "LIVE EXECUTION"}`);
    console.log(`Verify Existing Customers: ${verifyAllExisting ? "YES" : "NO (require verification)"}`);
    console.log("==================================================\n");

    try {
        await connectDB();

        // 1. Staff accounts (Admin & Kitchen)
        const staffFilter = {
            role: { $in: ["admin", "kitchen"] },
            $or: [{ isEmailVerified: { $exists: false } }, { isEmailVerified: false }]
        };

        const staffCount = await User.countDocuments(staffFilter);
        console.log(`Found ${staffCount} staff account(s) needing verification flag.`);

        if (!isDryRun && staffCount > 0) {
            const staffResult = await User.updateMany(staffFilter, {
                $set: { isEmailVerified: true }
            });
            console.log(`Updated ${staffResult.modifiedCount} staff account(s) to isEmailVerified = true.`);
        }

        // 2. Customer accounts
        const customerFilter = {
            role: "user",
            isEmailVerified: { $exists: false }
        };

        const customerCount = await User.countDocuments(customerFilter);
        console.log(`Found ${customerCount} customer account(s) missing isEmailVerified property.`);

        if (!isDryRun && customerCount > 0) {
            const customerVerifiedValue = verifyAllExisting;
            const customerResult = await User.updateMany(customerFilter, {
                $set: { isEmailVerified: customerVerifiedValue }
            });
            console.log(
                `Updated ${customerResult.modifiedCount} customer account(s) to isEmailVerified = ${customerVerifiedValue}.`
            );
        }

        // 3. Final summary
        const totalUsers = await User.countDocuments();
        const verifiedUsers = await User.countDocuments({ isEmailVerified: true });
        const unverifiedUsers = await User.countDocuments({ isEmailVerified: false });

        console.log("\nMigration Summary:");
        console.log(`Total accounts: ${totalUsers}`);
        console.log(`Verified accounts: ${verifiedUsers}`);
        console.log(`Unverified accounts: ${unverifiedUsers}`);
        console.log("\nMigration completed successfully.");

        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
};

runMigration();
