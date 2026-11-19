const express = require("express");
const { protect, authorize } = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");
const Product = require("../models/Product");
const AuditLog = require("../models/AuditLog");
const path = require("path");
const fs = require("fs");

const router = express.Router();

// Admin image upload endpoint
router.post(
    "/upload-image",
    protect,
    authorize("admin"),
    upload.single("image"),
    async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: "No image file provided or invalid file format"
                });
            }

            // Generate relative URL path for the uploaded image
            const imageUrl = `/uploads/${req.file.filename}`;

            // Log upload audit
            await AuditLog.create({
                actor: req.user._id,
                actorEmail: req.user.email,
                action: "PRODUCT_IMAGE_UPLOAD",
                targetModel: "Product",
                targetRecord: req.file.filename,
                details: { filename: req.file.filename, size: req.file.size },
                ipAddress: req.ip
            }).catch(() => {});

            return res.status(200).json({
                success: true,
                message: "Image uploaded successfully",
                imageUrl
            });
        } catch (error) {
            console.error("Image upload error:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to upload image"
            });
        }
    }
);

// Cleanup image endpoint (deletes unreferenced or replaced local upload)
router.delete(
    "/delete-image",
    protect,
    authorize("admin"),
    async (req, res) => {
        try {
            const { imageUrl } = req.body;
            if (!imageUrl || !imageUrl.startsWith("/uploads/")) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid image URL"
                });
            }

            const filename = path.basename(imageUrl);
            const filePath = path.join(__dirname, "../public/uploads", filename);

            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }

            return res.status(200).json({
                success: true,
                message: "Image deleted successfully"
            });
        } catch (error) {
            console.error("Image delete error:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to delete image"
            });
        }
    }
);

module.exports = router;
