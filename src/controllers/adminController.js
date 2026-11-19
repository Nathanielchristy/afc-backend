const Product = require("../models/Product");
const Category = require("../models/Category");
const Order = require("../models/Order");
const AuditLog = require("../models/AuditLog");
const User = require("../models/User");
const Session = require("../models/Session");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// Get Admin Summary Metrics
const getDashboardMetrics = async (req, res) => {
    try {
        const [
            totalProducts,
            lowStockProducts,
            outOfStockProducts,
            totalOrders,
            pendingOrders,
            processingOrders,
            deliveredOrders,
            cancelledOrders,
            revenueData,
            totalUsers
        ] = await Promise.all([
            Product.countDocuments({ isActive: true }),
            Product.countDocuments({ isActive: true, stock: { $gt: 0, $lte: 5 } }),
            Product.countDocuments({ isActive: true, stock: { $lte: 0 } }),
            Order.countDocuments({}),
            Order.countDocuments({ status: "pending" }),
            Order.countDocuments({ status: "processing" }),
            Order.countDocuments({ status: "delivered" }),
            Order.countDocuments({ status: "cancelled" }),
            Order.aggregate([
                { $match: { paymentStatus: "paid" } },
                { $group: { _id: null, totalRevenue: { $sum: "$totalAmountInPaise" } } }
            ]),
            User.countDocuments({ role: "user" })
        ]);

        const totalRevenueInPaise = revenueData.length > 0 ? revenueData[0].totalRevenue : 0;

        const recentOrders = await Order.find({})
            .sort({ createdAt: -1 })
            .limit(5)
            .populate("user", "name email")
            .lean();

        res.status(200).json({
            success: true,
            metrics: {
                totalProducts,
                lowStockProducts,
                outOfStockProducts,
                totalOrders,
                pendingOrders,
                processingOrders,
                deliveredOrders,
                cancelledOrders,
                totalRevenueInPaise,
                totalUsers
            },
            recentOrders
        });
    } catch (error) {
        console.error("Get dashboard metrics error:", error);
        res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};

const Variant = require("../models/new/Variant");

// Get Admin Product List (including inactive/archived)
const getAdminProducts = async (req, res) => {
    try {
        const page = Math.max(Number(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 500);
        const search = req.query.search ? req.query.search.trim() : "";
        const category = req.query.category;
        const statusFilter = req.query.status; // 'active', 'inactive', or 'all'

        const filter = {};

        if (statusFilter === "active") filter.isActive = true;
        else if (statusFilter === "inactive") filter.isActive = false;

        if (category && mongoose.isValidObjectId(category)) {
            filter.category = category;
        }

        if (search) {
            filter.name = { $regex: search, $options: "i" };
        }

        const skip = (page - 1) * limit;

        const [products, total, allVariants] = await Promise.all([
            Product.find(filter)
                .populate("category", "name slug")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Product.countDocuments(filter),
            Variant.find({}).lean()
        ]);

        const productsWithVariants = products.map(p => ({
            ...p,
            id: p._id.toString(),
            stock: p.stock !== undefined && p.stock !== null ? Math.max(0, Number(p.stock)) : 50,
            variants: allVariants.filter(v => v.product && v.product.toString() === p._id.toString())
        }));

        res.status(200).json({
            success: true,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            },
            products: productsWithVariants
        });
    } catch (error) {
        console.error("Get admin products error:", error);
        res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};

// Admin Update Product with Price Change Logging
const adminUpdateProduct = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid product ID"
            });
        }

        const existingProduct = await Product.findById(id);
        if (!existingProduct) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        const allowedUpdates = {};
        const changes = {};

        if (req.body.name !== undefined && req.body.name !== existingProduct.name) {
            allowedUpdates.name = req.body.name;
            changes.name = { before: existingProduct.name, after: req.body.name };
        }

        if (req.body.description !== undefined && req.body.description !== existingProduct.description) {
            allowedUpdates.description = req.body.description;
            changes.description = { before: existingProduct.description, after: req.body.description };
        }

        let isPriceChanged = false;
        if (req.body.priceInPaise !== undefined && req.body.priceInPaise !== existingProduct.priceInPaise) {
            allowedUpdates.priceInPaise = req.body.priceInPaise;
            changes.priceInPaise = { before: existingProduct.priceInPaise, after: req.body.priceInPaise };
            isPriceChanged = true;
        }

        if (req.body.stock !== undefined) {
            const parsedStock = Math.max(0, parseInt(req.body.stock, 10));
            const stockVal = isNaN(parsedStock) ? 0 : parsedStock;
            if (stockVal !== existingProduct.stock) {
                allowedUpdates.stock = stockVal;
                changes.stock = { before: existingProduct.stock, after: stockVal };
            }
        }

        if (req.body.sku !== undefined && req.body.sku !== existingProduct.sku) {
            allowedUpdates.sku = req.body.sku;
            changes.sku = { before: existingProduct.sku, after: req.body.sku };
        }

        if (req.body.category !== undefined && String(req.body.category) !== String(existingProduct.category)) {
            const category = await Category.findOne({ _id: req.body.category, isActive: true });
            if (!category) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid or inactive category"
                });
            }
            allowedUpdates.category = req.body.category;
            changes.category = { before: existingProduct.category, after: req.body.category };
        }

        if (req.body.images !== undefined) {
            allowedUpdates.images = req.body.images;
            if (Array.isArray(req.body.images) && req.body.images.length > 0) {
                allowedUpdates.image = req.body.images[0];
            }
            changes.images = { count: req.body.images.length };
        }

        if (req.body.isActive !== undefined && req.body.isActive !== existingProduct.isActive) {
            allowedUpdates.isActive = req.body.isActive;
            changes.isActive = { before: existingProduct.isActive, after: req.body.isActive };
        }

        const updatedProduct = await Product.findByIdAndUpdate(
            id,
            allowedUpdates,
            { new: true, runValidators: true }
        ).populate("category", "name slug");

        // Handle variants updates if provided in admin update
        if (req.body.variants !== undefined) {
            await Variant.deleteMany({ product: updatedProduct._id });
            if (Array.isArray(req.body.variants) && req.body.variants.length > 0) {
                for (const v of req.body.variants) {
                    await Variant.create({ ...v, product: updatedProduct._id });
                }
            }
            changes.variantsCount = req.body.variants.length;
        }

        const savedVariants = await Variant.find({ product: updatedProduct._id }).lean();
        const productResponse = {
            ...updatedProduct.toObject(),
            id: updatedProduct._id.toString(),
            stock: updatedProduct.stock !== undefined && updatedProduct.stock !== null ? Math.max(0, Number(updatedProduct.stock)) : 0,
            variants: savedVariants
        };

        // Record Audit Log
        await AuditLog.create({
            actor: req.user._id,
            actorEmail: req.user.email,
            action: isPriceChanged ? "PRODUCT_PRICE_CHANGE" : "PRODUCT_UPDATE",
            targetModel: "Product",
            targetRecord: updatedProduct.sku || String(updatedProduct._id),
            details: changes,
            ipAddress: req.ip
        }).catch(() => {});

        res.status(200).json({
            success: true,
            message: "Product updated successfully",
            product: productResponse
        });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "SKU already exists"
            });
        }
        console.error("Admin update product error:", error);
        res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};

// Admin Quick Update Stock
const adminUpdateProductStock = async (req, res) => {
    try {
        const { id } = req.params;
        const { stock, delta } = req.body;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid product ID"
            });
        }

        const existingProduct = await Product.findById(id);
        if (!existingProduct) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        const currentStock = existingProduct.stock !== undefined && existingProduct.stock !== null ? existingProduct.stock : 0;
        let newStock;

        if (delta !== undefined) {
            const numDelta = parseInt(delta, 10);
            if (isNaN(numDelta)) {
                return res.status(400).json({ success: false, message: "Invalid stock delta value" });
            }
            newStock = Math.max(0, currentStock + numDelta);
        } else if (stock !== undefined) {
            const parsedStock = parseInt(stock, 10);
            if (isNaN(parsedStock) || parsedStock < 0) {
                return res.status(400).json({ success: false, message: "Stock must be a non-negative number" });
            }
            newStock = parsedStock;
        } else {
            return res.status(400).json({ success: false, message: "Stock value or delta is required" });
        }

        existingProduct.stock = newStock;
        await existingProduct.save();

        // Record Audit Log
        if (req.user) {
            await AuditLog.create({
                actor: req.user._id,
                actorEmail: req.user.email,
                action: "PRODUCT_STOCK_UPDATE",
                targetModel: "Product",
                targetRecord: existingProduct.sku || String(existingProduct._id),
                details: {
                    productName: existingProduct.name,
                    before: currentStock,
                    after: newStock
                },
                ipAddress: req.ip
            }).catch(() => {});
        }

        const variants = await Variant.find({ product: existingProduct._id }).lean();

        res.status(200).json({
            success: true,
            message: `Stock updated to ${newStock}`,
            product: {
                ...existingProduct.toObject(),
                id: existingProduct._id.toString(),
                stock: newStock,
                variants
            }
        });
    } catch (error) {
        console.error("Admin update product stock error:", error);
        res.status(500).json({
            success: false,
            message: "Server error updating stock"
        });
    }
};

// Admin Bulk Update Stock (Set All or Add to All)
const adminBulkUpdateStock = async (req, res) => {
    try {
        const { mode, value, category, status } = req.body;

        const parsedValue = parseInt(value, 10);
        if (isNaN(parsedValue)) {
            return res.status(400).json({
                success: false,
                message: "A valid numeric stock value is required"
            });
        }

        if (mode !== "set" && mode !== "add") {
            return res.status(400).json({
                success: false,
                message: "Mode must be 'set' or 'add'"
            });
        }

        const filter = {};
        if (category && mongoose.isValidObjectId(category)) {
            filter.category = category;
        }
        if (status === "active") filter.isActive = true;
        else if (status === "inactive") filter.isActive = false;

        let modifiedCount = 0;

        if (mode === "set") {
            const newStock = Math.max(0, parsedValue);
            const result = await Product.updateMany(filter, { $set: { stock: newStock } });
            modifiedCount = result.modifiedCount;
        } else {
            // Add mode: increment all matching products by value, but clamp to 0 if negative
            const products = await Product.find(filter).select("_id stock");
            if (products.length > 0) {
                const ops = products.map(p => {
                    const current = p.stock !== undefined && p.stock !== null ? p.stock : 0;
                    return {
                        updateOne: {
                            filter: { _id: p._id },
                            update: { $set: { stock: Math.max(0, current + parsedValue) } }
                        }
                    };
                });
                const result = await Product.bulkWrite(ops);
                modifiedCount = result.modifiedCount;
            }
        }

        // Record Audit Log
        if (req.user) {
            await AuditLog.create({
                actor: req.user._id,
                actorEmail: req.user.email,
                action: "BULK_STOCK_UPDATE",
                targetModel: "Product",
                targetRecord: "BULK",
                details: {
                    mode,
                    value: parsedValue,
                    category: category || "all",
                    status: status || "all",
                    modifiedCount
                },
                ipAddress: req.ip
            }).catch(() => {});
        }

        res.status(200).json({
            success: true,
            message: mode === "set"
                ? `Set stock to ${Math.max(0, parsedValue)} on ${modifiedCount} products`
                : `Added ${parsedValue} to stock on ${modifiedCount} products`,
            modifiedCount
        });
    } catch (error) {
        console.error("Admin bulk update stock error:", error);
        res.status(500).json({
            success: false,
            message: "Server error updating stock in bulk"
        });
    }
};

// Get Admin Orders List
const getAdminOrders = async (req, res) => {
    try {
        const page = Math.max(Number(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
        const status = req.query.status;
        const search = req.query.search ? req.query.search.trim() : "";

        const filter = {};
        if (status) filter.status = status;

        if (search) {
            if (mongoose.isValidObjectId(search)) {
                filter._id = search;
            } else {
                filter["shippingAddress.fullName"] = { $regex: search, $options: "i" };
            }
        }

        const skip = (page - 1) * limit;

        const [orders, total] = await Promise.all([
            Order.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate("user", "name email")
                .populate("cancelledBy", "name email role")
                .lean(),
            Order.countDocuments(filter)
        ]);

        res.status(200).json({
            success: true,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            },
            orders
        });
    } catch (error) {
        console.error("Get admin orders error:", error);
        res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};

// Get Audit Logs
const getAuditLogs = async (req, res) => {
    try {
        const page = Math.max(Number(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
        const skip = (page - 1) * limit;

        const [logs, total] = await Promise.all([
            AuditLog.find({})
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate("actor", "name email")
                .lean(),
            AuditLog.countDocuments({})
        ]);

        res.status(200).json({
            success: true,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            },
            logs
        });
    } catch (error) {
        console.error("Get audit logs error:", error);
        res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};

// Get Kitchen Staff Accounts (Admin only)
const getKitchenStaff = async (req, res) => {
    try {
        const staff = await User.find({ role: "kitchen" })
            .select("_id name email role isActive createdAt")
            .sort({ createdAt: -1 })
            .lean();

        res.status(200).json({
            success: true,
            staff
        });
    } catch (error) {
        console.error("Get kitchen staff error:", error);
        res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};

// Create / Provision Kitchen Staff Account (Admin only)
const createKitchenStaff = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "Name, email and password are required"
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 8 characters long"
            });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const existingUser = await User.findOne({ email: normalizedEmail });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "A user with this email already exists"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const kitchenUser = await User.create({
            name: name.trim(),
            email: normalizedEmail,
            password: hashedPassword,
            role: "kitchen",
            isActive: true
        });

        // Audit Log
        await AuditLog.create({
            actor: req.user._id,
            actorEmail: req.user.email,
            action: "KITCHEN_STAFF_CREATED",
            targetModel: "User",
            targetRecord: String(kitchenUser._id),
            details: { name: kitchenUser.name, email: kitchenUser.email, role: "kitchen" },
            ipAddress: req.ip
        }).catch(() => {});

        res.status(201).json({
            success: true,
            message: "Kitchen staff account created successfully",
            user: {
                id: kitchenUser._id,
                name: kitchenUser.name,
                email: kitchenUser.email,
                role: kitchenUser.role,
                isActive: kitchenUser.isActive
            }
        });
    } catch (error) {
        console.error("Create kitchen staff error:", error);
        res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};

// Get All Categories for Admin (includes disabled)
const getAllCategoriesAdmin = async (req, res) => {
    try {
        const search = req.query.search ? req.query.search.trim() : "";
        const statusFilter = req.query.status; // 'active', 'inactive', or undefined for all

        const filter = {};

        if (statusFilter === "active") {
            filter.isActive = true;
        } else if (statusFilter === "inactive") {
            filter.isActive = false;
        }
        // if statusFilter is undefined, return all categories

        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: "i" } },
                { slug: { $regex: search, $options: "i" } }
            ];
        }

        const categories = await Category.find(filter)
            .select("name slug description image isActive createdAt updatedAt")
            .sort({ name: 1 })
            .lean();

        // Get product counts for each category
        const categoryIds = categories.map(c => c._id);
        const productCounts = await Product.aggregate([
            { $match: { category: { $in: categoryIds } } },
            { $group: { _id: "$category", count: { $sum: 1 } } }
        ]);

        const countMap = new Map(productCounts.map(p => [p._id.toString(), p.count]));

        const categoriesWithCounts = categories.map(cat => ({
            ...cat,
            _id: cat._id.toString(),
            productCount: countMap.get(cat._id.toString()) || 0
        }));

        res.status(200).json({
            success: true,
            count: categoriesWithCounts.length,
            categories: categoriesWithCounts
        });
    } catch (error) {
        console.error("Get all categories admin error:", error);
        res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};

// Get Product Count for a Specific Category
const getCategoryWithProductCount = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid category ID"
            });
        }

        const category = await Category.findById(id)
            .select("name slug description image isActive createdAt updatedAt")
            .lean();

        if (!category) {
            return res.status(404).json({
                success: false,
                message: "Category not found"
            });
        }

        const productCount = await Product.countDocuments({ category: id });

        res.status(200).json({
            success: true,
            productCount,
            category: {
                ...category,
                _id: category._id.toString(),
                productCount
            }
        });
    } catch (error) {
        console.error("Get category product count error:", error);
        res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};

// Get Users / Customers List (Admin only)
const getAdminUsers = async (req, res) => {
    try {
        const page = Math.max(Number(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
        const skip = (page - 1) * limit;
        const search = req.query.search ? req.query.search.trim() : "";
        const verificationStatus = req.query.verificationStatus;
        const role = req.query.role || "user";

        const filter = {};
        if (role !== "all") {
            filter.role = role;
        }

        if (verificationStatus === "verified") {
            filter.isEmailVerified = true;
        } else if (verificationStatus === "unverified") {
            filter.isEmailVerified = false;
        }

        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
                { phone: { $regex: search, $options: "i" } }
            ];
        }

        const [users, total] = await Promise.all([
            User.find(filter)
                .select("_id name email phone role isEmailVerified isActive createdAt")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            User.countDocuments(filter)
        ]);

        res.status(200).json({
            success: true,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            },
            users
        });
    } catch (error) {
        console.error("Get admin users error:", error);
        res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};

// Manually update customer verification status (Admin only)
const adminUpdateUserVerification = async (req, res) => {
    try {
        const { id } = req.params;
        const { isEmailVerified = true } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid customer ID"
            });
        }

        const targetUser = await User.findById(id);
        if (!targetUser) {
            return res.status(404).json({
                success: false,
                message: "Customer not found"
            });
        }

        const previousStatus = targetUser.isEmailVerified;
        targetUser.isEmailVerified = Boolean(isEmailVerified);
        await targetUser.save();

        // Audit Log
        await AuditLog.create({
            actor: req.user._id,
            actorEmail: req.user.email,
            action: "USER_VERIFICATION_MANUALLY_UPDATED",
            targetModel: "User",
            targetRecord: String(targetUser._id),
            details: {
                targetUserId: String(targetUser._id),
                targetEmail: targetUser.email,
                targetName: targetUser.name,
                previousStatus,
                newStatus: targetUser.isEmailVerified
            },
            ipAddress: req.ip
        }).catch((err) => {
            console.error("Audit log error:", err);
        });

        res.status(200).json({
            success: true,
            message: `Customer email verification status updated to ${targetUser.isEmailVerified ? 'Verified' : 'Unverified'}`,
            user: {
                _id: targetUser._id,
                name: targetUser.name,
                email: targetUser.email,
                role: targetUser.role,
                isEmailVerified: targetUser.isEmailVerified,
                isActive: targetUser.isActive
            }
        });
    } catch (error) {
        console.error("Admin update user verification error:", error);
        res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};

// Strict calendar validation for DD-MM-YYYY format
const isValidDob = (dob) => {
    if (typeof dob !== "string") return false;
    const trimmed = dob.trim();
    const dobRegex = /^(\d{2})-(\d{2})-(\d{4})$/;
    const match = trimmed.match(dobRegex);
    if (!match) return false;

    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);

    if (month < 1 || month > 12) return false;
    const currentYear = new Date().getFullYear();
    if (year < 1920 || year > currentYear) return false;

    const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

    if (day < 1 || day > daysInMonth[month - 1]) return false;

    return true;
};

// Create / Provision Customer or Student Account (Admin only)
const adminCreateUser = async (req, res) => {
    try {
        const { name, email, phone, dob, password } = req.body;

        if (!name || typeof name !== "string" || name.trim().length < 2 || name.trim().length > 100) {
            return res.status(400).json({
                success: false,
                message: "Name must be between 2 and 100 characters"
            });
        }

        // Student Account provisioning (Phone + DOB)
        if (phone || dob) {
            if (!phone) {
                return res.status(400).json({
                    success: false,
                    message: "Phone number is required for student accounts"
                });
            }

            // Normalize phone to 10 digits (remove any non-digit characters)
            const cleanPhone = String(phone).replace(/\D/g, '').slice(-10);
            if (cleanPhone.length !== 10) {
                return res.status(400).json({
                    success: false,
                    message: "Phone number must be exactly 10 digits"
                });
            }

            const existingByPhone = await User.findOne({ phone: cleanPhone });
            if (existingByPhone) {
                return res.status(409).json({
                    success: false,
                    message: "A user with this phone number already exists"
                });
            }

            let initialPassword = password || "Welcome@123";
            let cleanDob = null;
            if (dob) {
                cleanDob = String(dob).trim();
                if (!isValidDob(cleanDob)) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid DOB format. Expected DD-MM-YYYY (e.g., 15-08-2005)"
                    });
                }
            }

            if (!initialPassword || typeof initialPassword !== "string" || initialPassword.length < 6) {
                return res.status(400).json({
                    success: false,
                    message: "Password must be at least 6 characters"
                });
            }

            let userEmail = undefined;
            if (email) {
                const normalizedEmail = String(email).toLowerCase().trim();
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(normalizedEmail)) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid email format"
                    });
                }
                const existingByEmail = await User.findOne({ email: normalizedEmail });
                if (existingByEmail) {
                    return res.status(409).json({
                        success: false,
                        message: "A user with this email already exists"
                    });
                }
                userEmail = normalizedEmail;
            }

            const hashedPassword = await bcrypt.hash(initialPassword, 10);

            const newUser = await User.create({
                name: name.trim(),
                phone: cleanPhone,
                email: userEmail,
                dob: cleanDob,
                password: hashedPassword,
                role: "user",
                isActive: true,
                isEmailVerified: true
            });

            await AuditLog.create({
                actor: req.user._id,
                actorEmail: req.user.email,
                action: "STUDENT_CREATED_BY_ADMIN",
                targetModel: "User",
                targetRecord: String(newUser._id),
                details: { name: newUser.name, phone: newUser.phone, role: "user" },
                ipAddress: req.ip
            }).catch(() => {});

            return res.status(201).json({
                success: true,
                message: "Student account created successfully",
                user: {
                    _id: newUser._id,
                    name: newUser.name,
                    phone: newUser.phone,
                    email: newUser.email,
                    role: newUser.role,
                    isActive: newUser.isActive,
                    isEmailVerified: newUser.isEmailVerified,
                    createdAt: newUser.createdAt
                }
            });
        }

        // Standard / Legacy email-based customer creation
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password or Phone and DOB are required"
            });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const normalizedEmail = email.toLowerCase().trim();
        if (!emailRegex.test(normalizedEmail) || normalizedEmail.length > 254) {
            return res.status(400).json({
                success: false,
                message: "Invalid email format"
            });
        }

        if (typeof password !== "string" || password.length < 8) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 8 characters long"
            });
        }

        const existingUser = await User.findOne({ email: normalizedEmail });
        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "A user with this email already exists"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // Security: strictly assign role 'user' to prevent privilege escalation
        // Customer accounts created by admin do not require OTP / email verification
        const newUser = await User.create({
            name: name.trim(),
            email: normalizedEmail,
            password: hashedPassword,
            role: "user",
            isActive: true,
            isEmailVerified: true
        });

        // Audit Log
        await AuditLog.create({
            actor: req.user._id,
            actorEmail: req.user.email,
            action: "USER_CREATED_BY_ADMIN",
            targetModel: "User",
            targetRecord: String(newUser._id),
            details: { name: newUser.name, email: newUser.email, role: "user" },
            ipAddress: req.ip
        }).catch(() => {});

        res.status(201).json({
            success: true,
            message: "Customer account created successfully",
            user: {
                _id: newUser._id,
                name: newUser.name,
                email: newUser.email,
                role: newUser.role,
                isActive: newUser.isActive,
                isEmailVerified: newUser.isEmailVerified,
                createdAt: newUser.createdAt
            }
        });
    } catch (error) {
        console.error("Admin create user error:", error);
        res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};

// Preview Bulk Import of Student Accounts (Admin only)
const adminBulkImportPreview = async (req, res) => {
    try {
        const records = req.body.records || req.body.rows;
        if (!Array.isArray(records) || records.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Records array is required and cannot be empty"
            });
        }

        if (records.length > 5000) {
            return res.status(400).json({
                success: false,
                message: "Maximum 5000 records allowed per batch"
            });
        }

        // Normalize phone numbers to 10 digits
        const rawPhones = records
            .map(r => {
                if (!r.phone) return null;
                return String(r.phone).replace(/\D/g, '').slice(-10);
            })
            .filter(Boolean);

        // Query existing phones in database
        const existingUsers = await User.find({
            phone: { $in: rawPhones }
        }).select("phone").lean();

        const existingPhoneSet = new Set(existingUsers.map(u => u.phone));
        const seenInBatchSet = new Set();

        const processedRows = [];
        let validCount = 0;
        let duplicateCount = 0;
        let invalidCount = 0;

        for (let i = 0; i < records.length; i++) {
            const row = records[i];
            const rowNumber = i + 1;
            const rawPhone = row.phone ? String(row.phone).replace(/\D/g, '').slice(-10) : "";
            const rawName = row.name !== undefined && row.name !== null ? String(row.name).trim() : "";
            const rawDob = row.dob !== undefined && row.dob !== null ? String(row.dob).trim() : "";
            const rawEmail = row.email !== undefined && row.email !== null ? String(row.email).trim().toLowerCase() : "";

            if (!rawPhone || rawPhone.length !== 10) {
                invalidCount++;
                processedRows.push({
                    rowNumber,
                    phone: "",
                    name: rawName,
                    status: "invalid",
                    reason: "Phone number is missing or invalid (must be 10 digits)"
                });
                continue;
            }

            if (!rawName || rawName.length < 2 || rawName.length > 100) {
                invalidCount++;
                processedRows.push({
                    rowNumber,
                    phone: rawPhone,
                    name: rawName,
                    status: "invalid",
                    reason: "Name must be between 2 and 100 characters"
                });
                continue;
            }

            if (!rawDob || !isValidDob(rawDob)) {
                invalidCount++;
                processedRows.push({
                    rowNumber,
                    phone: rawPhone,
                    name: rawName,
                    status: "invalid",
                    reason: "Invalid DOB format. Expected DD-MM-YYYY (e.g., 15-08-2005)"
                });
                continue;
            }

            if (rawEmail) {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(rawEmail)) {
                    invalidCount++;
                    processedRows.push({
                        rowNumber,
                        phone: rawPhone,
                        name: rawName,
                        status: "invalid",
                        reason: "Invalid email format"
                    });
                    continue;
                }
            }

            if (seenInBatchSet.has(rawPhone)) {
                duplicateCount++;
                processedRows.push({
                    rowNumber,
                    phone: rawPhone,
                    name: rawName,
                    status: "duplicate",
                    reason: "Duplicate phone number in batch"
                });
                continue;
            }
            seenInBatchSet.add(rawPhone);

            if (existingPhoneSet.has(rawPhone)) {
                duplicateCount++;
                processedRows.push({
                    rowNumber,
                    phone: rawPhone,
                    name: rawName,
                    status: "duplicate",
                    reason: "Phone number already exists in database (will be skipped)"
                });
                continue;
            }

            validCount++;
            processedRows.push({
                rowNumber,
                phone: rawPhone,
                name: rawName,
                status: "valid"
            });
        }

        res.status(200).json({
            success: true,
            summary: {
                total: records.length,
                valid: validCount,
                duplicate: duplicateCount,
                invalid: invalidCount
            },
            rows: processedRows
        });
    } catch (error) {
        console.error("Admin bulk import preview error:", error);
        res.status(500).json({
            success: false,
            message: "Server error during bulk preview"
        });
    }
};

// Confirm Bulk Import of Student Accounts (Admin only)
const adminBulkImportConfirm = async (req, res) => {
    try {
        const records = req.body.records || req.body.rows;
        if (!Array.isArray(records) || records.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Records array is required and cannot be empty"
            });
        }

        if (records.length > 5000) {
            return res.status(400).json({
                success: false,
                message: "Maximum 5000 records allowed per batch"
            });
        }

        // Normalize phone numbers to 10 digits
        const rawPhones = records
            .map(r => {
                if (!r.phone) return null;
                return String(r.phone).replace(/\D/g, '').slice(-10);
            })
            .filter(Boolean);

        // Query existing phones in database
        const existingUsers = await User.find({
            phone: { $in: rawPhones }
        }).select("phone").lean();

        const existingPhoneSet = new Set(existingUsers.map(u => u.phone));
        const seenInBatchSet = new Set();

        const toInsert = [];
        let skippedDuplicatesCount = 0;
        let invalidCount = 0;

        for (let i = 0; i < records.length; i++) {
            const row = records[i];
            const rawPhone = row.phone ? String(row.phone).replace(/\D/g, '').slice(-10) : "";
            const rawName = row.name !== undefined && row.name !== null ? String(row.name).trim() : "";
            const rawDob = row.dob !== undefined && row.dob !== null ? String(row.dob).trim() : "";
            const rawEmail = row.email !== undefined && row.email !== null ? String(row.email).trim().toLowerCase() : "";

            if (!rawPhone || rawPhone.length !== 10 || !rawName || rawName.length < 2 || rawName.length > 100 || !rawDob || !isValidDob(rawDob)) {
                invalidCount++;
                continue;
            }

            if (seenInBatchSet.has(rawPhone) || existingPhoneSet.has(rawPhone)) {
                skippedDuplicatesCount++;
                continue;
            }
            seenInBatchSet.add(rawPhone);

            let userEmail = undefined;
            if (rawEmail) {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (emailRegex.test(rawEmail)) {
                    userEmail = rawEmail;
                }
            }

            // Initial password defaults to Welcome@123 or row password if provided
            const initialPassword = row.password ? String(row.password).trim() : "Welcome@123";
            const hashedPassword = await bcrypt.hash(initialPassword, 10);

            toInsert.push({
                name: rawName,
                phone: rawPhone,
                email: userEmail,
                dob: rawDob,
                password: hashedPassword,
                role: "user",
                isActive: true,
                isEmailVerified: true
            });
        }

        let importedCount = 0;
        if (toInsert.length > 0) {
            const inserted = await User.insertMany(toInsert, { ordered: false });
            importedCount = inserted.length;
        }

        // Audit Log
        await AuditLog.create({
            actor: req.user._id,
            actorEmail: req.user.email,
            action: "STUDENT_BULK_IMPORTED",
            targetModel: "User",
            targetRecord: "BULK_IMPORT",
            details: {
                totalSubmitted: records.length,
                importedCount,
                skippedDuplicatesCount,
                invalidCount
            },
            ipAddress: req.ip
        }).catch(() => {});

        res.status(200).json({
            success: true,
            message: `Successfully imported ${importedCount} student account(s). Skipped ${skippedDuplicatesCount} duplicate(s).`,
            importedCount,
            skippedDuplicatesCount,
            invalidCount
        });
    } catch (error) {
        console.error("Admin bulk import confirm error:", error);
        res.status(500).json({
            success: false,
            message: "Server error during bulk import"
        });
    }
};

// Toggle/Update Customer Account Status (Admin only)
const adminUpdateUserStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;

        if (typeof isActive !== "boolean") {
            return res.status(400).json({
                success: false,
                message: "isActive must be a boolean"
            });
        }

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid user ID"
            });
        }

        const targetUser = await User.findById(id);
        if (!targetUser) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        // Prevent admin from disabling their own account
        if (req.user && String(req.user._id) === String(targetUser._id)) {
            return res.status(400).json({
                success: false,
                message: "You cannot disable your own administrator account"
            });
        }

        // Protect last active administrator if target is an admin
        if (targetUser.role === "admin" && !isActive) {
            const activeAdminCount = await User.countDocuments({ role: "admin", isActive: true });
            if (activeAdminCount <= 1) {
                return res.status(400).json({
                    success: false,
                    message: "Cannot disable the last active administrator"
                });
            }
        }

        const previousStatus = targetUser.isActive;
        targetUser.isActive = isActive;

        if (!isActive) {
            // Invalidate existing sessions immediately:
            // 1. Increment tokenVersion so current JWT access tokens fail verification
            targetUser.tokenVersion = (targetUser.tokenVersion || 0) + 1;
            // 2. Remove all active sessions from Session collection
            await Session.deleteMany({ user: targetUser._id });
        }

        await targetUser.save();

        // Audit Log
        await AuditLog.create({
            actor: req.user._id,
            actorEmail: req.user.email,
            action: isActive ? "USER_STATUS_ENABLED" : "USER_STATUS_DISABLED",
            targetModel: "User",
            targetRecord: String(targetUser._id),
            details: {
                targetUserId: String(targetUser._id),
                targetEmail: targetUser.email,
                targetName: targetUser.name,
                previousStatus,
                newStatus: targetUser.isActive
            },
            ipAddress: req.ip
        }).catch((err) => {
            console.error("Audit log error:", err);
        });

        res.status(200).json({
            success: true,
            message: `User account has been ${isActive ? 'enabled' : 'disabled'} successfully`,
            user: {
                _id: targetUser._id,
                name: targetUser.name,
                email: targetUser.email,
                role: targetUser.role,
                isActive: targetUser.isActive,
                isEmailVerified: targetUser.isEmailVerified
            }
        });
    } catch (error) {
        console.error("Admin update user status error:", error);
        res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};

// Admin Reset Customer Password to Default (Welcome@123)
const adminResetCustomerPassword = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid user ID"
            });
        }

        const targetUser = await User.findById(id);
        if (!targetUser) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        const defaultPassword = "Welcome@123";
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);

        targetUser.password = hashedPassword;
        targetUser.mustChangePassword = true;
        targetUser.tokenVersion = (targetUser.tokenVersion || 0) + 1;
        await targetUser.save();

        // Invalidate active sessions
        await Session.deleteMany({ user: targetUser._id });

        // Audit Log
        await AuditLog.create({
            actor: req.user._id,
            actorEmail: req.user.email,
            action: "USER_PASSWORD_RESET_BY_ADMIN",
            targetModel: "User",
            targetRecord: String(targetUser._id),
            details: {
                targetUserId: String(targetUser._id),
                targetEmail: targetUser.email,
                targetName: targetUser.name,
                targetPhone: targetUser.phone
            },
            ipAddress: req.ip
        }).catch((err) => {
            console.error("Audit log error:", err);
        });

        res.status(200).json({
            success: true,
            message: "Password reset to default (Welcome@123) successfully. User will be required to change password on next login.",
            user: {
                _id: targetUser._id,
                name: targetUser.name,
                email: targetUser.email,
                phone: targetUser.phone,
                role: targetUser.role,
                mustChangePassword: targetUser.mustChangePassword
            }
        });
    } catch (error) {
        console.error("Admin reset password error:", error);
        res.status(500).json({
            success: false,
            message: "Server error resetting password"
        });
    }
};

// Admin Update Customer / Student Data (Admin only)
const adminUpdateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, phone, dob } = req.body;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid customer ID"
            });
        }

        const targetUser = await User.findById(id);
        if (!targetUser) {
            return res.status(404).json({
                success: false,
                message: "Customer not found"
            });
        }

        if (name !== undefined) {
            const trimmedName = String(name).trim();
            if (trimmedName.length < 2 || trimmedName.length > 100) {
                return res.status(400).json({
                    success: false,
                    message: "Name must be between 2 and 100 characters"
                });
            }
            targetUser.name = trimmedName;
        }

        if (phone !== undefined) {
            const cleanPhone = String(phone).replace(/\D/g, '').slice(-10);
            if (cleanPhone.length !== 10) {
                return res.status(400).json({
                    success: false,
                    message: "Phone number must be exactly 10 digits"
                });
            }
            const existingByPhone = await User.findOne({ phone: cleanPhone, _id: { $ne: targetUser._id } });
            if (existingByPhone) {
                return res.status(409).json({
                    success: false,
                    message: "Another user with this phone number already exists"
                });
            }
            targetUser.phone = cleanPhone;
        }

        if (email !== undefined) {
            const normalizedEmail = email ? String(email).toLowerCase().trim() : null;
            if (normalizedEmail) {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(normalizedEmail)) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid email format"
                    });
                }
                const existingByEmail = await User.findOne({ email: normalizedEmail, _id: { $ne: targetUser._id } });
                if (existingByEmail) {
                    return res.status(409).json({
                        success: false,
                        message: "Another user with this email already exists"
                    });
                }
                targetUser.email = normalizedEmail;
            } else {
                targetUser.email = undefined;
            }
        }

        if (dob !== undefined) {
            if (dob) {
                const cleanDob = String(dob).trim();
                if (!isValidDob(cleanDob)) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid DOB format. Expected DD-MM-YYYY (e.g., 15-08-2005)"
                    });
                }
                targetUser.dob = cleanDob;
            } else {
                targetUser.dob = null;
            }
        }

        await targetUser.save();

        await AuditLog.create({
            actor: req.user._id,
            actorEmail: req.user.email,
            action: "USER_UPDATED_BY_ADMIN",
            targetModel: "User",
            targetRecord: String(targetUser._id),
            details: { name: targetUser.name, phone: targetUser.phone, email: targetUser.email },
            ipAddress: req.ip
        }).catch(() => {});

        res.status(200).json({
            success: true,
            message: "Customer account updated successfully",
            user: {
                _id: targetUser._id,
                name: targetUser.name,
                phone: targetUser.phone,
                email: targetUser.email,
                dob: targetUser.dob,
                role: targetUser.role,
                isActive: targetUser.isActive,
                isEmailVerified: targetUser.isEmailVerified,
                createdAt: targetUser.createdAt
            }
        });
    } catch (error) {
        console.error("Admin update user error:", error);
        res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};

module.exports = {
    getDashboardMetrics,
    getAdminProducts,
    adminUpdateProduct,
    adminUpdateProductStock,
    adminBulkUpdateStock,
    getAdminOrders,
    getAuditLogs,
    getKitchenStaff,
    createKitchenStaff,
    getAllCategoriesAdmin,
    getCategoryWithProductCount,
    getAdminUsers,
    adminUpdateUserVerification,
    adminCreateUser,
    adminUpdateUser,
    adminUpdateUserStatus,
    adminResetCustomerPassword,
    adminBulkImportPreview,
    adminBulkImportConfirm,
    isValidDob
};
