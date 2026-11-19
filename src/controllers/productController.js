const mongoose = require("mongoose");
const Product = require("../models/new/Product");
const Variant = require("../models/new/Variant");
const Category = require("../models/Category");

const createProduct = async (req, res) => {
    try {
        const { name, description, category, images, variants, addonGroups, priceInPaise, stock, sku } = req.body;

        // Verify category exists and is active
        if (category) {
            const existingCat = await Category.findOne({ _id: category, isActive: true });
            if (!existingCat) {
                return res.status(400).json({ success: false, message: "Invalid or inactive category" });
            }
        }

        const primaryImage = (images && images.length > 0) ? images[0] : (req.body.image || "https://example.com/placeholder.jpg");
        const product = await Product.create({
            name,
            description,
            category,
            images: images || [primaryImage],
            image: primaryImage,
            addonGroups,
            priceInPaise: priceInPaise !== undefined ? priceInPaise : 0,
            stock: stock !== undefined ? stock : 50,
            sku: sku || `AFC-${Date.now().toString().slice(-6)}`
        });
        if (variants && variants.length > 0) {
            for (const v of variants) {
                await Variant.create({ ...v, product: product._id });
            }
        }
        res.status(201).json({ success: true, product });
    } catch (error) {
        console.error("createProduct error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

const getProducts = async (req, res) => {
    try {
        // Fetch active categories first to exclude products from disabled categories
        const activeCategories = await Category.find({ isActive: true }).select("_id").lean();
        const activeCategoryIds = activeCategories.map(c => c._id);

        const products = await Product.find({
            isActive: true,
            category: { $in: activeCategoryIds }
        }).populate("category").lean();
        const variants = await Variant.find({ isActive: true }).lean();
        res.status(200).json({
            success: true,
            products: products.map(p => ({
                ...p,
                id: p._id.toString(),
                variants: variants.filter(v => v.product && v.product.toString() === p._id.toString())
            }))
        });
    } catch (error) {
        console.error("getProducts error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

const getProductById = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id).populate("category").lean();
        if (!product) return res.status(404).json({ success: false, message: "Product not found" });
        const variants = await Variant.find({ product: product._id, isActive: true }).lean();
        res.status(200).json({ success: true, product: { ...product, id: product._id.toString(), variants } });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
};

const updateProduct = async (req, res) => {
    try {
        const { name, description, category, images, variants, addonGroups, priceInPaise, stock, sku, isActive } = req.body;

        // Verify category if provided
        if (category) {
            const existingCat = await Category.findOne({ _id: category, isActive: true });
            if (!existingCat) {
                return res.status(400).json({ success: false, message: "Invalid or inactive category" });
            }
        }

        const updateData = { name, description, category, images, addonGroups };
        if (priceInPaise !== undefined) updateData.priceInPaise = priceInPaise;
        if (stock !== undefined) updateData.stock = stock;
        if (sku !== undefined) updateData.sku = sku;
        if (isActive !== undefined) updateData.isActive = isActive;

        const product = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true });
        if (!product) return res.status(404).json({ success: false, message: "Product not found" });

        // Handle variants updates if provided
        if (variants !== undefined) {
            await Variant.deleteMany({ product: product._id });
            if (variants && variants.length > 0) {
                for (const v of variants) {
                    await Variant.create({ ...v, product: product._id });
                }
            }
        }
        res.status(200).json({ success: true, product });
    } catch (error) {
        console.error("updateProduct error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

const deleteProduct = async (req, res) => {
    try {
        const product = await Product.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
        if (!product) return res.status(404).json({ success: false, message: "Product not found" });
        res.status(200).json({ success: true, message: "Product deactivated" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
};

module.exports = { createProduct, getProducts, getProductById, updateProduct, deleteProduct };
