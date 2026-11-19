const express = require("express");
const { protect, authorize } = require("../middleware/authMiddleware");
const validate = require("../middleware/validateMiddleware");

const {
    getKitchenOrders,
    getKitchenOrderById,
    updateKitchenOrderStatus
} = require("../controllers/kitchenController");

const {
    getAdminProducts,
    adminUpdateProductStock,
    adminBulkUpdateStock,
    adminUpdateProduct
} = require("../controllers/adminController");

const Category = require("../models/Category");

const {
    getKitchenOrdersSchema,
    kitchenOrderIdSchema,
    updateKitchenStatusSchema
} = require("../validators/kitchenValidator");

const router = express.Router();

// All kitchen endpoints require authenticated kitchen staff or admin
router.use(protect);
router.use(authorize("kitchen", "admin"));

router.get(
    "/orders",
    validate(getKitchenOrdersSchema),
    getKitchenOrders
);

router.get(
    "/orders/:id",
    validate(kitchenOrderIdSchema),
    getKitchenOrderById
);

router.patch(
    "/orders/:id/status",
    validate(updateKitchenStatusSchema),
    updateKitchenOrderStatus
);

// Kitchen Stock Management Routes (Reusing admin product stock management logic)
router.get("/products", getAdminProducts);
router.patch("/products/bulk-stock", adminBulkUpdateStock);
router.patch("/products/:id/stock", adminUpdateProductStock);
router.patch("/products/:id", adminUpdateProduct);

module.exports = router;
