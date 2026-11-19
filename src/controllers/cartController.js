const mongoose = require("mongoose");
const Cart = require("../models/new/Cart");
const Product = require("../models/new/Product");
const Variant = require("../models/new/Variant");
const Addon = require("../models/new/Addon");
const Category = require("../models/Category");

const addCartItem = async (req, res) => {
    try {
        const userId = req.user._id;
        const { product, variant, addons, quantity } = req.body;

        const productDoc = await Product.findById(product);
        if (!productDoc || !productDoc.isActive) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        // Verify product category is active
        if (productDoc.category) {
            const categoryDoc = await Category.findById(productDoc.category);
            if (!categoryDoc || !categoryDoc.isActive) {
                return res.status(400).json({ success: false, message: "Product category is currently unavailable" });
            }
        }

        if (variant) {
            const variantDoc = await Variant.findById(variant);
            if (!variantDoc || variantDoc.product.toString() !== product.toString()) {
                return res.status(400).json({ success: false, message: "Invalid variant" });
            }
        }

        if (addons && addons.length > 0) {
            const addonDocs = await Addon.find({ _id: { $in: addons }, isActive: true });
            if (addonDocs.length !== addons.length) {
                return res.status(400).json({ success: false, message: "Invalid addons" });
            }
        }

        let cart = await Cart.findOne({ user: userId });
        if (!cart) {
            cart = await Cart.create({ user: userId, items: [{ product, variant, addons, quantity }] });
        } else {
            const existingItem = cart.items.find(item =>
                item.product.toString() === product.toString() &&
                ((!item.variant && !variant) || (item.variant?.toString() === variant?.toString())) &&
                JSON.stringify(item.addons?.sort()) === JSON.stringify(addons?.sort())
            );

            if (existingItem) {
                existingItem.quantity += quantity;
            } else {
                cart.items.push({ product, variant, addons, quantity });
            }
            await cart.save();
        }

        const populatedCart = await Cart.findOne({ user: userId })
            .populate("items.product")
            .populate("items.variant")
            .populate("items.addons");

        res.status(200).json({ success: true, message: "Added to cart", cart: populatedCart });
    } catch (error) {
        console.error("Add cart item error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

const getCart = async (req, res) => {
    try {
        let cart = await Cart.findOne({ user: req.user._id })
            .populate("items.product")
            .populate("items.variant")
            .populate("items.addons");

        if (!cart) {
            cart = await Cart.create({ user: req.user._id, items: [] });
        }
        res.status(200).json({ success: true, cart });
    } catch (error) {
        console.error("Get cart error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

const updateCartItem = async (req, res) => {
    try {
        const userId = req.user._id;
        const itemId = req.params.itemId;
        const { quantity, variant } = req.body;

        const cart = await Cart.findOne({ user: userId });
        if (!cart) {
            return res.status(404).json({ success: false, message: "Cart not found" });
        }

        const item = cart.items.id(itemId) || cart.items.find(i => i._id?.toString() === itemId || i.product.toString() === itemId || (variant && i.product.toString() === itemId && i.variant?.toString() === variant));
        if (!item) {
            return res.status(404).json({ success: false, message: "Cart item not found" });
        }

        if (quantity <= 0) {
            cart.items = cart.items.filter(i => (i._id ? i._id.toString() !== itemId : i.product.toString() !== itemId));
        } else {
            item.quantity = quantity;
        }

        await cart.save();
        const populatedCart = await Cart.findOne({ user: userId })
            .populate("items.product")
            .populate("items.variant")
            .populate("items.addons");

        res.status(200).json({ success: true, message: "Cart updated", cart: populatedCart });
    } catch (error) {
        console.error("Update cart item error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

const removeCartItem = async (req, res) => {
    try {
        const userId = req.user._id;
        const itemId = req.params.itemId;
        const variantId = req.query.variant;

        const cart = await Cart.findOne({ user: userId });
        if (!cart) {
            return res.status(404).json({ success: false, message: "Cart not found" });
        }

        cart.items = cart.items.filter(i => {
            const matchesProd = (i._id && i._id.toString() === itemId) || i.product.toString() === itemId;
            if (matchesProd && variantId) {
                return i.variant?.toString() !== variantId;
            }
            return !matchesProd;
        });
        await cart.save();

        const populatedCart = await Cart.findOne({ user: userId })
            .populate("items.product")
            .populate("items.variant")
            .populate("items.addons");

        res.status(200).json({ success: true, message: "Item removed from cart", cart: populatedCart });
    } catch (error) {
        console.error("Remove cart item error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

const clearCart = async (req, res) => {
    try {
        const userId = req.user._id;
        const cart = await Cart.findOne({ user: userId });
        if (cart) {
            cart.items = [];
            await cart.save();
        }
        res.status(200).json({ success: true, message: "Cart cleared" });
    } catch (error) {
        console.error("Clear cart error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

module.exports = { addCartItem, getCart, updateCartItem, removeCartItem, clearCart };
