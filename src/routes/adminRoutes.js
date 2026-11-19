const express = require("express");
const { protect, authorize } = require("../middleware/authMiddleware");
const {
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
    adminUpdateUserStatus,
    adminUpdateUser,
    adminResetCustomerPassword,
    adminBulkImportPreview,
    adminBulkImportConfirm
} = require("../controllers/adminController");
const Category = require("../models/Category");
const Product = require("../models/Product");

const { adminListPages, adminUpdatePage } = require("../controllers/siteContentController");

const router = express.Router();

// All routes require authenticated Admin
router.use(protect);
router.use(authorize("admin"));

router.get("/metrics", getDashboardMetrics);
router.get("/products", getAdminProducts);
router.patch("/products/bulk-stock", adminBulkUpdateStock);
router.patch("/products/:id/stock", adminUpdateProductStock);
router.patch("/products/:id", adminUpdateProduct);
router.get("/orders", getAdminOrders);
router.get("/audit-logs", getAuditLogs);
router.get("/kitchen-staff", getKitchenStaff);
router.post("/kitchen-staff", createKitchenStaff);

// Category Management Admin Routes
router.get("/categories", getAllCategoriesAdmin);
router.get("/categories/:id/product-count", getCategoryWithProductCount);

// Customer / User Management Admin Routes
router.get("/users", getAdminUsers);
router.post("/users", adminCreateUser);
router.post("/users/bulk-preview", adminBulkImportPreview);
router.post("/users/bulk-confirm", adminBulkImportConfirm);
router.patch("/users/:id", adminUpdateUser);
router.patch("/users/:id/status", adminUpdateUserStatus);
router.patch("/users/:id/reset-password", adminResetCustomerPassword);
router.patch("/users/:id/verification", adminUpdateUserVerification);
router.patch("/users/:id/verify-email", adminUpdateUserVerification);

// Site Content (policy pages) Admin Routes
router.get("/site-content", adminListPages);
router.patch("/site-content/:key", adminUpdatePage);

module.exports = router;
