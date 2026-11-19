const express = require("express");

const {
    createPayment,
    getPaymentById,
    verifyPayment,
    handleWebhook
} = require("../controllers/paymentController");

const { protect, authorize } = require("../middleware/authMiddleware");
const validate = require("../middleware/validateMiddleware");

const {
    createPaymentSchema,
    paymentIdSchema
} = require("../validators/paymentValidator");

const router = express.Router();

router.post(
    "/",
    protect,
    validate(createPaymentSchema),
    createPayment
);

router.post(
    "/verify",
    protect,
    verifyPayment
);

router.post(
    "/webhook",
    handleWebhook
);

router.get(
    "/:id",
    protect,
    validate(paymentIdSchema),
    getPaymentById
);

module.exports = router;